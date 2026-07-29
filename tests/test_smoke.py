"""End-to-end smoke: two full iterations produce the PLAN §6 artifacts."""
import json

import pytest

from alphagomoku.config import Config
from alphagomoku.pipeline import run
from alphagomoku.storage import RunStorage


@pytest.fixture()
def smoke_cfg():
    return Config.from_json("configs/smoke.json")


def test_two_iterations(smoke_cfg, tmp_path):
    storage = RunStorage(tmp_path / "run")
    storage.write_config(smoke_cfg.to_dict())
    run(smoke_cfg, storage, max_iterations=2)

    # status
    status = storage.read_status()
    assert status is not None
    assert status["state"] == "stopped"
    assert "heartbeat" in status

    # metrics: exactly 2 rows with required fields
    rows = storage.read_metrics()
    assert len(rows) == 2
    for i, row in enumerate(rows):
        assert row["iteration"] == i
        for k in ("loss", "policy_loss", "value_loss", "games", "samples",
                      "buffer", "arena_vs_best", "arena_vs_baseline", "best_iteration"):
            assert k in row
        assert row["loss"] is not None  # smoke min_buffer=8 is reached in iter 0

    # checkpoints
    for name in ("baseline", "latest", "best"):
        assert storage.checkpoint_path(name).exists(), name
    assert storage.checkpoint_path("iter_000000").exists()  # keep every 1

    # games: self-play + arena written and readable
    games, _ = storage.list_games(limit=50)
    kinds = {g["kind"] for g in games}
    assert "selfplay" in kinds and "arena" in kinds
    g0 = storage.read_game(games[0]["id"])
    assert g0 is not None
    for k in ("id", "kind", "iteration", "board_size", "result", "moves", "meta"):
        assert k in g0
    mv = g0["moves"][0]
    for k in ("n", "x", "y", "player", "value", "pi", "top"):
        assert k in mv
    assert len(mv["pi"]) == smoke_cfg.board_size ** 2

    # events stream
    types = {e["type"] for e in storage.read_events()}
    assert {"iteration_start", "game_progress", "game_end",
            "train_end", "arena_end"} <= types

    # buffer snapshot
    assert storage.buffer_path.exists()

    # resume: a second run continues from iteration 2
    run(smoke_cfg, storage, max_iterations=3)
    rows = storage.read_metrics()
    assert rows[-1]["iteration"] == 2


def test_control_stop_before_start(smoke_cfg, tmp_path):
    storage = RunStorage(tmp_path / "run2")
    storage.write_config(smoke_cfg.to_dict())
    storage.write_control("stop")
    run(smoke_cfg, storage, max_iterations=10)
    assert storage.read_metrics() == []
    assert storage.read_status()["state"] == "stopped"


def test_trainer_cli(tmp_path):
    from alphagomoku.trainer import main
    main(["--run", str(tmp_path / "cli"), "--config", "configs/smoke.json",
          "--max-iterations", "1"])
    storage = RunStorage(tmp_path / "cli")
    assert json.loads(storage.config_path.read_text())["board_size"] == 6
    assert len(storage.read_metrics()) == 1
