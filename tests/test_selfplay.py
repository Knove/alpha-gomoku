"""Self-play tests: record structure, z consistency, JSON safety."""
import json

import numpy as np

from alphagomoku.config import Config
from alphagomoku.model import AlphaGomokuNet, Predictor
from alphagomoku.selfplay import play_games, strip_samples


def tiny_cfg(**kw):
    base = dict(board_size=6, win_len=4, mcts_simulations=8, temp_threshold=4,
                parallel_games=2, dirichlet_epsilon=0.25)
    base.update(kw)
    return Config.from_dict(base)


def make_predictor(cfg):
    net = AlphaGomokuNet(cfg.board_size, 16, 2)
    return Predictor(net, "cpu")


def test_play_games_records_valid():
    cfg = tiny_cfg()
    pred = make_predictor(cfg)
    rng = np.random.default_rng(0)
    records = play_games(pred, cfg, 2, iteration=0, rng=rng)
    assert len(records) == 2
    for rec in records:
        # record JSON-safe after stripping samples
        json.dumps(strip_samples(rec))
        assert rec["result"] in (-1, 0, 1)
        assert rec["id"].startswith("sp_000000_")
        assert rec["first_player"] == 1
        samples = rec["samples"]
        assert len(samples) == len(rec["moves"]) == rec["moves"][-1]["n"] + 1
        for (canon, pi, player, z), mv in zip(samples, rec["moves"]):
            assert canon.shape == (6, 6)
            assert pi.shape == (36,)
            assert abs(float(pi.sum()) - 1.0) < 1e-4
            assert player == mv["player"]
            # z from this player's perspective vs the game result
            r = rec["result"]
            expected = 0 if r == 0 else (1 if player == r else -1)
            assert int(z) == expected
        # moves are legal and ordered
        board = np.zeros(36, dtype=np.int8)
        for mv in rec["moves"]:
            a = mv["y"] * 6 + mv["x"]
            assert board[a] == 0
            board[a] = mv["player"]
            assert abs(float(np.sum(mv["pi"])) - 1.0) < 1e-3
            assert mv["n"] == rec["moves"].index(mv)


def test_progress_and_game_end_callbacks():
    cfg = tiny_cfg()
    pred = make_predictor(cfg)
    rng = np.random.default_rng(1)
    progress, ended = [], []
    records = play_games(
        pred, cfg, 1, iteration=3, rng=rng,
        on_progress=lambda *args: progress.append(args),
        on_game_end=lambda rec: ended.append(rec["id"]),
    )
    assert len(records) == 1
    assert ended == [records[0]["id"]]
    assert len(progress) == len(records[0]["moves"])
    slot, it, gid, game, move_rec = progress[-1]
    assert it == 3 and gid == records[0]["id"]
    assert game.move_count == len(records[0]["moves"])


def test_temperature_sampling_vs_argmax():
    """With temp_threshold=0 every move is argmax (pi peak equals chosen move's
    visit-rank only loosely, but chosen action must have max visit count)."""
    cfg = tiny_cfg(temp_threshold=0)
    pred = make_predictor(cfg)
    rng = np.random.default_rng(2)
    records = play_games(pred, cfg, 1, iteration=0, rng=rng)
    for rec in records:
        for mv in rec["moves"]:
            chosen = mv["y"] * 6 + mv["x"]
            top_visits = mv["top"][0]
            assert top_visits["action"] == chosen  # argmax visits was played
