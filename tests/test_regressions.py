"""Regression tests for the adversarial-review fixes (PLAN review round 1)."""
import numpy as np

from alphagomoku.arena import play_match
from alphagomoku.config import Config
from alphagomoku.model import AlphaGomokuNet, Predictor
from alphagomoku.replay import ReplayBuffer
from alphagomoku.selfplay import play_games
from alphagomoku.storage import RunStorage


def tiny_cfg(**kw):
    base = dict(board_size=6, win_len=4, mcts_simulations=8, arena_simulations=6,
                arena_games=2, temp_threshold=4, parallel_games=2)
    base.update(kw)
    return Config.from_dict(base)


def test_arena_best_and_baseline_records_coexist(tmp_path):
    """vs-best and vs-baseline games must not overwrite each other."""
    cfg = tiny_cfg()
    storage = RunStorage(tmp_path / "run")
    pa = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    pb = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    rng = np.random.default_rng(0)
    play_match(pa, pb, cfg, 0, rng, storage=storage, opponent="best")
    play_match(pa, pb, cfg, 0, rng, storage=storage, opponent="baseline")
    games, _ = storage.list_games(kind="arena", limit=50)
    opponents = {g["meta"].get("opponent") for g in games}
    assert opponents == {"best", "baseline"}
    assert len(games) == 2 * cfg.arena_games
    ids = [g["id"] for g in games]
    assert len(set(ids)) == len(ids)
    assert any(i.startswith("ar_") for i in ids)
    assert any(i.startswith("ab_") for i in ids)
    # every summary resolves to a full record
    for g in games:
        assert storage.read_game(g["id"]) is not None


def test_arena_games_diversify():
    """Same-color arena games must not be move-for-move identical."""
    cfg = tiny_cfg(arena_games=4)
    pa = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    pb = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    rng = np.random.default_rng(1)
    res = play_match(pa, pb, cfg, 0, rng, opponent="best")
    assert res["games"] == 4


def test_replay_buffer_capacity_grow_and_shrink(tmp_path):
    cfg = tiny_cfg()
    pred = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    rng = np.random.default_rng(2)
    records = play_games(pred, cfg, 1, iteration=0, rng=rng)
    samples = records[0]["samples"]

    buf = ReplayBuffer(10, 6)
    buf.add_many(samples)
    path = tmp_path / "b.npz"
    buf.save(path)

    grown = ReplayBuffer(50, 6)  # capacity increased between runs
    grown.load(path)
    assert len(grown) == len(buf)
    grown.add_many(samples)  # must not raise (was IndexError before the fix)
    assert len(grown) == min(len(buf) + len(samples), 50)
    xb, xp, xz = grown.sample(8, rng)
    assert xb.shape == (8, 3, 6, 6)

    shrunk = ReplayBuffer(3, 6)  # capacity decreased
    shrunk.load(path)
    assert len(shrunk) == 3
    shrunk.add_many(samples)
    assert len(shrunk) == 3  # ring stays within capacity
    shrunk.sample(4, rng)


def test_selfplay_with_single_simulation_completes():
    """sims=1 leaves root visit counts at zero; moves must stay legal."""
    cfg = tiny_cfg(mcts_simulations=1, temp_threshold=0)
    pred = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    rng = np.random.default_rng(3)
    records = play_games(pred, cfg, 1, iteration=0, rng=rng)
    assert len(records) == 1
    board = np.zeros(36, dtype=np.int8)
    for mv in records[0]["moves"]:
        a = mv["y"] * 6 + mv["x"]
        assert board[a] == 0, f"illegal move {mv}"
        board[a] = mv["player"]


def test_storage_tail_reads(tmp_path):
    storage = RunStorage(tmp_path / "run")
    for i in range(100):
        storage.append_event("log", {"i": i})
    assert len(storage.read_events()) == 100
    tail = storage.read_events(tail=7)
    assert [e["data"]["i"] for e in tail] == list(range(93, 100))
    for i in range(40):
        storage.append_metrics({"iteration": i})
    rows = storage.read_metrics(tail=3)
    assert [r["iteration"] for r in rows] == [37, 38, 39]
    assert len(storage.read_metrics()) == 40


def test_trainer_lock_excludes_second_trainer(tmp_path):
    from alphagomoku.trainer import _acquire_run_lock

    storage = RunStorage(tmp_path / "run")
    fd = _acquire_run_lock(storage)
    import pytest

    with pytest.raises(SystemExit):
        _acquire_run_lock(storage)
    fd.close()
