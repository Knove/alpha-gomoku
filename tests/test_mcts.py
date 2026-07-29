"""MCTS tests: visit conservation, terminal backup, killer-move selection."""
import numpy as np

from alphagomoku.config import Config
from alphagomoku.game import Game
from alphagomoku.mcts import SearchTree


def tiny_cfg(**kw):
    base = dict(board_size=9, win_len=5, mcts_simulations=50, dirichlet_epsilon=0.0)
    base.update(kw)
    return Config.from_dict(base)


class StubEvaluator:
    """Uniform policy, constant value — mimics a fresh random net."""

    def __init__(self, value=0.0):
        self.value = value
        self.calls = 0

    def __call__(self, inputs: np.ndarray):
        b = inputs.shape[0]
        n = inputs.shape[-1]
        self.calls += b
        return np.full((b, n * n), 1.0 / (n * n), dtype=np.float32), np.full(b, self.value, dtype=np.float32)


def run_search(tree, evaluator, simulations):
    for _ in range(simulations):
        tree.select()
        if tree.needs_eval():
            p, v = evaluator(tree.leaf_input()[None])
            tree.expand_and_backup(p[0], float(v[0]))


def test_visit_count_conservation():
    cfg = tiny_cfg()
    g = Game(9, 5)
    tree = SearchTree(g, cfg, add_noise=False, rng=np.random.default_rng(0))
    ev = StubEvaluator()
    run_search(tree, ev, 50)
    # the first simulation expands the root itself and adds no child visit
    assert tree.root.N.sum() == 49
    pi = tree.root_pi()
    assert abs(float(pi.sum()) - 1.0) < 1e-5
    legal = g.legal_moves()
    assert np.all(pi[legal == 0] == 0)


def test_noise_only_at_root():
    cfg = tiny_cfg(dirichlet_epsilon=0.5)
    g = Game(9, 5)
    tree = SearchTree(g, cfg, add_noise=True, rng=np.random.default_rng(1))
    ev = StubEvaluator()
    tree.select()
    p, v = ev(tree.leaf_input()[None])
    tree.expand_and_backup(p[0], float(v[0]))
    # prior mixed with dirichlet noise -> not uniform anymore
    assert not np.allclose(tree.root.prior, 1.0 / 81)
    # legal mask still respected
    assert tree.root.prior.sum() > 0.99


def test_terminal_backup_signs():
    """Position where the side to move can win in one: value must back up as good."""
    cfg = tiny_cfg()
    g = Game(9, 5)
    # black has four in a row at y=0 x=0..3, can win at x=4 (action 4)
    for a in [0, 18, 1, 19, 2, 20, 3, 21]:
        g.play(a)
    # black to move; if black plays 4, black wins -> leaf (white to move) is lost for white
    tree = SearchTree(g, cfg, add_noise=False, rng=np.random.default_rng(2))
    ev = StubEvaluator(value=0.0)
    run_search(tree, ev, 100)
    # the winning move must dominate visit counts
    assert tree.best_action() == 4
    # and root value should be strongly positive for black
    assert tree.root_value() > 0.5


def test_backup_alternates_signs():
    """Negamax backup: value flips perspective every ply up the path."""
    from alphagomoku.mcts import _Node

    cfg = tiny_cfg()
    g = Game(9, 5)
    tree = SearchTree(g, cfg, add_noise=False)
    n1, n2, n3 = _Node(81), _Node(81), _Node(81)
    tree._backup([(n1, 5), (n2, 7), (n3, 9)], 1.0)  # leaf worth +1 for leaf's player
    assert n3.W[9] == -1.0  # leaf's parent is the opponent
    assert n2.W[7] == 1.0
    assert n1.W[5] == -1.0
    assert tree.root_value() == -1.0  # root player is losing


def test_search_prefers_safe_move_with_guided_prior():
    """With a network prior that sees the threat (like a trained net), PUCT follows it."""
    cfg = tiny_cfg()
    g = Game(9, 5)
    # white threatens to win at action 13; black to move
    for a in [0, 9, 2, 10, 4, 11, 6, 12]:
        g.play(a)

    class GuidedEvaluator:
        def __call__(self, inputs):
            b, _, n, _ = inputs.shape
            p = np.full((b, n * n), 0.001, dtype=np.float32)
            p[:, 13] = 0.9  # net believes (4,1) is the critical point
            return p, np.zeros(b, dtype=np.float32)

    tree = SearchTree(g, cfg, add_noise=False, rng=np.random.default_rng(3))
    run_search(tree, GuidedEvaluator(), 60)
    assert tree.best_action() == 13  # black blocks the immediate threat


def test_argmax_temperature_and_update_root():
    cfg = tiny_cfg()
    g = Game(9, 5)
    tree = SearchTree(g, cfg, add_noise=False, rng=np.random.default_rng(4))
    ev = StubEvaluator()
    run_search(tree, ev, 30)
    pi_cold = tree.root_pi(temperature=0.0)
    assert pi_cold.sum() == 1.0
    assert pi_cold[tree.best_action()] == 1.0
    a = tree.best_action()
    tree.update_root(a)
    assert tree.root_game.move_count == 1
    assert tree.root_game.board.reshape(-1)[a] == 1
    # search continues to work after re-rooting
    run_search(tree, ev, 20)
    assert tree.root.N.sum() == 20
