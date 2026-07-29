"""PUCT Monte Carlo Tree Search with cross-game batched evaluation.

Protocol (driven by selfplay/arena/play):
    tree = SearchTree(game, cfg, add_noise=True, rng=rng)
    for _ in range(cfg.mcts_simulations):
        tree.select()                      # descend to a leaf (may need eval)
        if tree.needs_eval():
            policy, value = net(tree.leaf_input())   # batched across trees by caller
            tree.expand_and_backup(policy, value)
    pi = tree.root_pi(temperature=1.0)     # training target
    a  = tree.best_action()                # argmax visit count
    v  = tree.root_value()                 # mean backed-up value (display)
    tree.update_root(a)                    # reuse subtree for the next move

Contract: PLAN.md §4.3.
"""
from __future__ import annotations

import math

import numpy as np

from .config import Config
from .game import Game, encode


class _Node:
    __slots__ = ("prior", "children", "N", "W", "expanded")

    def __init__(self, num_actions: int):
        self.prior: np.ndarray | None = None  # (num_actions,) masked + normalized
        self.children: dict[int, "_Node"] = {}
        self.N = np.zeros(num_actions, dtype=np.float32)  # visit counts per action
        self.W = np.zeros(num_actions, dtype=np.float32)  # total value per action
        self.expanded = False


class SearchTree:
    def __init__(self, game: Game, cfg: Config, add_noise: bool = True,
                 rng: np.random.Generator | None = None):
        self.cfg = cfg
        self.rng = rng if rng is not None else np.random.default_rng()
        self.add_noise = add_noise
        self.root_game = game.clone()
        self.root = _Node(game.n * game.n)
        self._root_value_sum = 0.0
        self._root_value_count = 0
        # pending leaf state (set by select, consumed by expand_and_backup)
        self._pending_game: Game | None = None
        self._pending_path: list[tuple[_Node, int]] = []
        self._pending_leaf: _Node | None = None

    # ------------------------------------------------------------- selection

    def select(self) -> None:
        """Run one simulation: descend PUCT to a leaf.

        Terminal leaves are backed up immediately; otherwise the leaf is stashed
        as pending and must be resolved with expand_and_backup().
        """
        assert self._pending_game is None, "previous leaf not resolved"
        node = self.root
        game = self.root_game.clone()
        path: list[tuple[_Node, int]] = []
        while node.expanded:
            a = self._puct_select(node, game)
            path.append((node, a))
            child = node.children.get(a)
            if child is None:
                child = _Node(game.n * game.n)
                node.children[a] = child
            game.play(a)
            node = child
        out = game.outcome()
        if out is not None:
            if out == 0:
                v = 0.0
            else:
                v = 1.0 if out == game.current_player else -1.0
            self._backup(path, v)
            return
        self._pending_game = game
        self._pending_path = path
        self._pending_leaf = node

    def needs_eval(self) -> bool:
        return self._pending_game is not None

    @property
    def leaf_player(self) -> int:
        """Player to move at the pending leaf (1 or -1)."""
        assert self._pending_game is not None
        return self._pending_game.current_player

    def leaf_input(self) -> np.ndarray:
        """(3, N, N) canonical input planes for the pending leaf."""
        assert self._pending_game is not None
        return encode(self._pending_game)

    def _puct_select(self, node: _Node, game: Game) -> int:
        legal = game.legal_moves()
        N, W, P = node.N, node.W, node.prior
        assert P is not None
        sqrt_total = math.sqrt(float(N.sum()) + 1e-8)
        Q = np.divide(W, N, out=np.zeros_like(W), where=N > 0)
        U = self.cfg.c_puct * P * sqrt_total / (1.0 + N)
        score = Q + U
        score[legal == 0] = -np.inf
        return int(np.argmax(score))

    # ------------------------------------------------------------- expansion

    def expand_and_backup(self, policy: np.ndarray, value: float) -> None:
        """Expand the pending leaf with network prior and back up its value.

        value: from the perspective of the player to move at the leaf.
        """
        node = self._pending_leaf
        game = self._pending_game
        assert node is not None and game is not None
        legal = game.legal_moves()
        prior = policy.astype(np.float64) * legal
        s = prior.sum()
        prior = (prior / s) if s > 1e-8 else (legal / legal.sum()).astype(np.float64)
        node.prior = prior.astype(np.float32)
        node.expanded = True
        if node is self.root and self.add_noise:
            self._mix_noise(node, legal)
        self._backup(self._pending_path, float(value))
        self._pending_game = None
        self._pending_path = []
        self._pending_leaf = None

    def _mix_noise(self, node: _Node, legal: np.ndarray) -> None:
        eps = self.cfg.dirichlet_epsilon
        if eps <= 0:
            return
        idx = np.flatnonzero(legal)
        noise = self.rng.dirichlet(np.full(len(idx), self.cfg.dirichlet_alpha))
        mixed = (1.0 - eps) * node.prior
        mixed[idx] += eps * noise.astype(np.float32)
        node.prior = mixed

    def _backup(self, path: list[tuple[_Node, int]], v: float) -> None:
        for node, a in reversed(path):
            v = -v  # value flips perspective each ply
            node.N[a] += 1.0
            node.W[a] += v
        self._root_value_sum += v
        self._root_value_count += 1

    # ----------------------------------------------------------------- output

    def root_pi(self, temperature: float = 1.0) -> np.ndarray:
        """Visit-count distribution at the root (the training target)."""
        counts = self.root.N
        total = counts.sum()
        if total <= 0:
            legal = self.root_game.legal_moves()
            s = legal.sum()
            return legal / s if s > 0 else legal
        if temperature <= 1e-3:
            pi = np.zeros_like(counts)
            pi[self.best_action()] = 1.0
            return pi
        c = counts.astype(np.float64) ** (1.0 / temperature)
        return (c / c.sum()).astype(np.float32)

    def best_action(self) -> int:
        """Argmax visit count among LEGAL actions (all-zero counts fall back to
        the first legal move, mirroring root_pi's uniform-legal fallback)."""
        legal = self.root_game.legal_moves()
        if legal.sum() == 0:
            return 0
        masked = np.where(legal > 0, self.root.N, -np.inf)
        return int(np.argmax(masked))

    def root_value(self) -> float:
        """Mean value of the root position from the root player's perspective."""
        if self._root_value_count == 0:
            return 0.0
        return self._root_value_sum / self._root_value_count

    def top_actions(self, k: int = 5) -> list[dict]:
        """Top-k root actions by visit count: [{action, x, y, visits, prob}].

        Stable sort so ties break the same way as best_action() (np.argmax).
        """
        n = self.root_game.n
        order = np.argsort(-self.root.N, kind="stable")[:k]
        total = max(float(self.root.N.sum()), 1e-8)
        out = []
        for a in order:
            visits = int(self.root.N[a])
            if visits <= 0:
                continue
            y, x = divmod(int(a), n)
            out.append({
                "action": int(a), "x": x, "y": y,
                "visits": visits, "prob": visits / total,
            })
        return out

    def update_root(self, action: int) -> None:
        """Advance the root after a real move, keeping the searched subtree."""
        assert self._pending_game is None
        child = self.root.children.get(action)
        self.root_game.play(action)
        self.root = child if child is not None else _Node(self.root_game.n * self.root_game.n)
        self._root_value_sum = 0.0
        self._root_value_count = 0
        if self.root.expanded and self.add_noise:
            # fresh Dirichlet noise for the new search root (AlphaZero does this per move)
            self._mix_noise(self.root, self.root_game.legal_moves())
