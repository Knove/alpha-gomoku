"""Server contract tests: REST + WS + trainer control against a fake run dir.

Contract: PLAN.md §5 (REST/WS), §6 (run-directory files), §8 (test_server).
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from alphagomoku.config import Config
from alphagomoku.model import AlphaGomokuNet, save_checkpoint
from alphagomoku.storage import RunStorage
from server.app import REPO_ROOT, create_app

WEB_DIST = Path(__file__).resolve().parents[1] / "web" / "dist"


@pytest.fixture()
def run(tmp_path):
    return tmp_path / "run"


def storage_of(run_dir) -> RunStorage:
    return RunStorage(str(run_dir))


def make_client(run_dir, **kwargs) -> TestClient:
    return TestClient(create_app(str(run_dir), **kwargs))


def save_tiny_checkpoint(storage: RunStorage, name: str = "best", board_size: int = 9) -> None:
    """9x9 / 16ch / 2 res-blocks random net, small enough for CPU/MPS tests."""
    net = AlphaGomokuNet(board_size, 16, 2)
    cfg = Config(board_size=board_size, win_len=5, net_channels=16, net_res_blocks=2)
    save_checkpoint(net, cfg.to_dict(), str(storage.checkpoint_path(name)), meta={"iteration": 3})


def fake_game_record(gid: str, kind: str, iteration: int, result: int) -> dict:
    return {
        "id": gid,
        "kind": kind,
        "iteration": iteration,
        "board_size": 9,
        "win_len": 5,
        "created_at": 1753344000.0,
        "result": result,
        "first_player": 1,
        "meta": {"opponent": None, "black": "iter12", "white": "iter12"},
        "moves": [
            {
                "n": 0,
                "x": 4,
                "y": 4,
                "player": 1,
                "value": 0.031,
                "pi": [0.0] * 81,
                "top": [{"action": 40, "prob": 0.61, "visits": 61}],
            }
        ],
    }


class FakeProc:
    """Popen stand-in: exits once control.json says "stop" (or terminate())."""

    def __init__(self, storage: RunStorage):
        self.pid = 4242
        self._storage = storage
        self.terminated = False

    def poll(self):
        if self.terminated or self._storage.read_control() == "stop":
            return 0
        return None

    def terminate(self):
        self.terminated = True

    def wait(self, timeout=None):
        return 0


# -------------------------------------------------------------------- status


def test_status_idle_on_empty_run(run):
    client = make_client(run)
    r = client.get("/api/status")
    assert r.status_code == 200
    s = r.json()
    assert s["state"] == "idle"
    assert s["trainer_alive"] is False
    assert s["pid"] is None
    assert s["run_dir"] == str(run)
    assert s["config"] is None


def test_status_trainer_alive_from_heartbeat(run):
    storage = storage_of(run)
    storage.write_status({"state": "running", "iteration": 3, "games_done": 7})
    client = make_client(run)
    s = client.get("/api/status").json()
    assert s["state"] == "running"
    assert s["iteration"] == 3
    assert s["trainer_alive"] is True  # fresh heartbeat, no subprocess needed
    # stale heartbeat -> not alive
    storage._write_json_atomic(
        storage.status_path, {"state": "stopped", "heartbeat": time.time() - 60}
    )
    s2 = client.get("/api/status").json()
    assert s2["trainer_alive"] is False


# -------------------------------------------------------------------- config


def test_config_roundtrip_and_validation(run):
    client = make_client(run)
    assert client.get("/api/config").json() is None

    cfg = Config(board_size=9, mcts_simulations=40).to_dict()
    r = client.put("/api/config", json=cfg)
    assert r.status_code == 200
    assert r.json() == cfg
    assert client.get("/api/config").json() == cfg  # persisted in the run dir

    bad = Config().to_dict()
    bad["board_size"] = 3  # violates validate(): board_size >= 5
    r2 = client.put("/api/config", json=bad)
    assert r2.status_code in (400, 422)
    assert client.get("/api/config").json() == cfg  # untouched

    r3 = client.put("/api/config", json=[1, 2, 3])  # not an object
    assert r3.status_code == 422


# --------------------------------------------------------------------- games


def test_games_list_detail_and_pagination(run):
    storage = storage_of(run)
    storage.write_game("selfplay", 12, 3, fake_game_record("sp_000012_003", "selfplay", 12, 1))
    storage.write_game("selfplay", 5, 1, fake_game_record("sp_000005_001", "selfplay", 5, -1))
    storage.write_game("arena", 12, 0, fake_game_record("ar_000012_000", "arena", 12, 0))
    client = make_client(run)

    r = client.get("/api/games")
    assert r.status_code == 200
    body = r.json()
    ids = [g["id"] for g in body["games"]]
    assert ids == ["sp_000012_003", "sp_000005_001", "ar_000012_000"]  # newest first
    assert body["next_cursor"] is None
    summary = body["games"][0]
    assert summary["kind"] == "selfplay"
    assert summary["iteration"] == 12
    assert summary["result"] == 1
    assert summary["moves"] == 1

    r = client.get("/api/games", params={"kind": "arena"})
    assert [g["id"] for g in r.json()["games"]] == ["ar_000012_000"]

    # cursor pagination: page 1 -> next_cursor -> page 2
    r = client.get("/api/games", params={"limit": 2})
    body1 = r.json()
    assert [g["id"] for g in body1["games"]] == ["sp_000012_003", "sp_000005_001"]
    assert body1["next_cursor"] == "sp_000005_001"
    r = client.get("/api/games", params={"limit": 2, "cursor": body1["next_cursor"]})
    body2 = r.json()
    assert [g["id"] for g in body2["games"]] == ["ar_000012_000"]
    assert body2["next_cursor"] is None

    r = client.get("/api/games/sp_000012_003")
    assert r.status_code == 200
    detail = r.json()
    assert detail["id"] == "sp_000012_003"
    assert detail["moves"][0]["top"][0]["action"] == 40

    assert client.get("/api/games/sp_999999_999").status_code == 404
    assert client.get("/api/games/not-a-game-id").status_code == 404


# -------------------------------------------------------------------- metrics


def test_metrics_tail(run):
    storage = storage_of(run)
    storage.append_metrics({"iteration": 0, "loss": 1.0})
    storage.append_metrics({"iteration": 1, "loss": 0.5})
    client = make_client(run)
    rows = client.get("/api/metrics").json()
    assert [r["iteration"] for r in rows] == [0, 1]
    rows = client.get("/api/metrics", params={"tail": 1}).json()
    assert [r["iteration"] for r in rows] == [1]


# ---------------------------------------------------------------- checkpoints


def test_checkpoints_listing_with_meta(run):
    storage = storage_of(run)
    save_tiny_checkpoint(storage, "best")
    client = make_client(run)
    r = client.get("/api/checkpoints")
    assert r.status_code == 200
    items = r.json()
    assert [c["name"] for c in items] == ["best"]
    assert items[0]["size"] > 0
    assert items[0]["meta"]["iteration"] == 3


# ---------------------------------------------------------------------- play


def test_play_human_black_move_and_ai_reply(run):
    storage = storage_of(run)
    save_tiny_checkpoint(storage, "best")
    client = make_client(run)

    r = client.post("/api/play/new", json={"human_color": 1, "checkpoint": "best", "simulations": 8})
    assert r.status_code == 200
    s = r.json()
    sid = s["sid"]
    assert s["move_count"] == 0
    assert s["current_player"] == 1
    assert s["human_color"] == 1
    assert s["board_size"] == 9

    r = client.post(f"/api/play/{sid}/move", json={"x": 4, "y": 4})
    assert r.status_code == 200
    s = r.json()
    assert s["move_count"] == 2
    board = s["board"]  # 2D [y][x]
    assert board[4][4] == 1  # human black stone
    ai = s["ai_move"]
    assert ai is not None
    assert (ai["x"], ai["y"]) != (4, 4)
    assert board[ai["y"]][ai["x"]] == -1  # AI answered as white, legal square
    assert ai["action"] == ai["y"] * 9 + ai["x"]
    assert s["ai_stats"]["top"] and s["ai_stats"]["top"][0]["visits"] > 0
    assert s["current_player"] == 1  # back to the human
    assert s["result"] is None

    # illegal moves -> 400
    assert client.post(f"/api/play/{sid}/move", json={"x": 4, "y": 4}).status_code == 400  # occupied
    assert client.post(f"/api/play/{sid}/move", json={"x": 9, "y": 0}).status_code == 400  # off board

    # snapshot endpoint
    snap = client.get(f"/api/play/{sid}").json()
    assert snap["move_count"] == 2
    assert len(snap["moves"]) == 2
    assert snap["checkpoint"] == "best"
    assert snap["simulations"] == 8

    # unknown session ids -> 404
    assert client.get("/api/play/nope").status_code == 404
    assert client.post("/api/play/nope/move", json={"x": 0, "y": 0}).status_code == 404
    assert client.post("/api/play/nope/step").status_code == 404


def test_play_human_white_ai_moves_first(run):
    storage = storage_of(run)
    save_tiny_checkpoint(storage, "best")
    client = make_client(run)

    r = client.post("/api/play/new", json={"human_color": -1, "checkpoint": "best", "simulations": 8})
    assert r.status_code == 200
    s = r.json()
    assert s["move_count"] == 1  # AI (black) already played
    assert s["ai_move"] is not None
    board = s["board"]
    stones = [(x, y) for y, row in enumerate(board) for x, v in enumerate(row) if v != 0]
    assert len(stones) == 1
    assert board[stones[0][1]][stones[0][0]] == 1
    assert s["current_player"] == -1  # human (white) to move

    hx, hy = (0, 0) if stones[0] != (0, 0) else (1, 1)
    r = client.post(f"/api/play/{s['sid']}/move", json={"x": hx, "y": hy})
    assert r.status_code == 200
    assert r.json()["move_count"] == 3


def test_play_ai_selfplay_step(run):
    storage = storage_of(run)
    save_tiny_checkpoint(storage, "best")
    client = make_client(run)

    r = client.post("/api/play/new", json={"human_color": 0, "checkpoint": "best", "simulations": 8})
    assert r.status_code == 200
    sid = r.json()["sid"]
    assert r.json()["move_count"] == 0

    r = client.post(f"/api/play/{sid}/step")
    assert r.status_code == 200
    assert r.json()["move_count"] == 1
    assert r.json()["ai_move"] is not None
    r = client.post(f"/api/play/{sid}/step")
    assert r.json()["move_count"] == 2

    # human move is rejected on a self-play session
    assert client.post(f"/api/play/{sid}/move", json={"x": 0, "y": 0}).status_code == 400
    # step is rejected on a human session
    r = client.post("/api/play/new", json={"human_color": 1, "checkpoint": "best", "simulations": 8})
    sid2 = r.json()["sid"]
    assert client.post(f"/api/play/{sid2}/step").status_code == 400


def test_play_checkpoint_errors(run):
    storage_of(run)  # create the run dir without any checkpoint
    client = make_client(run)
    r = client.post("/api/play/new", json={"human_color": 1, "checkpoint": "latest", "simulations": 8})
    assert r.status_code == 404
    r = client.post("/api/play/new", json={"human_color": 1, "checkpoint": "../escape", "simulations": 8})
    assert r.status_code == 400


# -------------------------------------------------------------------- control


def test_control_lifecycle(run, tmp_path):
    procs = []

    def fake_spawn(cmd, cwd=None):
        proc = FakeProc(storage_of(run))
        procs.append((cmd, cwd, proc))
        return proc

    seed_cfg = tmp_path / "seed.json"
    Config(board_size=9, mcts_simulations=33).to_json(seed_cfg)
    client = make_client(run, config_path=str(seed_cfg), spawn=fake_spawn)

    r = client.post("/api/control", json={"action": "start"})
    assert r.status_code == 200
    s = r.json()
    assert s["trainer_alive"] is True
    assert s["pid"] == 4242
    assert s["config"]["mcts_simulations"] == 33  # --config copied into the run dir
    assert storage_of(run).read_control() == "run"
    cmd, cwd, _ = procs[0]
    assert cmd[1:4] == ["-m", "alphagomoku.trainer", "--run"]
    assert cmd[4] == str(run)
    assert cwd == str(REPO_ROOT)

    # already alive -> 409
    assert client.post("/api/control", json={"action": "start"}).status_code == 409

    # pause / resume only touch control.json
    assert client.post("/api/control", json={"action": "pause"}).status_code == 200
    assert storage_of(run).read_control() == "pause"
    assert client.post("/api/control", json={"action": "resume"}).status_code == 200
    assert storage_of(run).read_control() == "run"

    # config is locked while the trainer is alive
    assert client.put("/api/config", json=Config().to_dict()).status_code == 409

    # stop: control.json says stop, the fake trainer exits, status reflects it
    r = client.post("/api/control", json={"action": "stop"})
    assert r.status_code == 200
    assert storage_of(run).read_control() == "stop"
    s = r.json()
    assert s["trainer_alive"] is False
    assert s["pid"] is None

    assert client.post("/api/control", json={"action": "bogus"}).status_code == 422


def test_control_start_without_config_writes_defaults(run):
    client = make_client(run, spawn=lambda cmd, cwd=None: FakeProc(storage_of(run)))
    s = client.post("/api/control", json={"action": "start"}).json()
    assert s["trainer_alive"] is True
    assert s["config"] == Config().to_dict()


# ------------------------------------------------------------------------ WS


def test_ws_replays_history_and_status(run):
    storage = storage_of(run)
    storage.append_event("log", {"level": "info", "message": "hello"})
    storage.append_event("iteration_start", {"iteration": 1})
    app = create_app(str(run))
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "history"
            assert [e["type"] for e in msg["events"]] == ["log", "iteration_start"]
            msg = ws.receive_json()
            assert msg["type"] == "status"
            assert msg["status"]["state"] == "idle"
            assert msg["status"]["trainer_alive"] is False


def test_ws_broadcasts_new_events(run):
    storage = storage_of(run)
    app = create_app(str(run))
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            assert ws.receive_json()["type"] == "history"
            assert ws.receive_json()["type"] == "status"
            storage.append_event("iteration_start", {"iteration": 9})
            deadline = time.monotonic() + 5.0
            seen = None
            while time.monotonic() < deadline:
                msg = ws.receive_json()
                if msg["type"] == "events":
                    seen = msg
                    break
            assert seen is not None
            assert [e["type"] for e in seen["events"]] == ["iteration_start"]
            assert seen["events"][0]["data"]["iteration"] == 9


# --------------------------------------------------------------------- static


@pytest.mark.skipif(not WEB_DIST.is_dir(), reason="web/dist not built")
def test_static_hosting_and_spa_fallback(run):
    client = make_client(run)
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    # SPA fallback for unknown non-/api paths
    r = client.get("/some/deep/route")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    # API routes still win over the mount
    assert client.get("/api/status").status_code == 200
    # unknown /api paths stay JSON 404s
    r = client.get("/api/definitely-not-a-route")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")
