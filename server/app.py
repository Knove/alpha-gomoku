"""FastAPI server: REST + WebSocket + static hosting + trainer process control.

Contract: PLAN.md §5 (REST/WS), §6 (run-directory files). The trainer process
writes the run directory; this server reads it and manages the trainer
subprocess (start spawns ``python -m alphagomoku.trainer --run <run_dir>``;
pause/resume/stop go through control.json).

CLI: python -m server.app --run data/runs/dev [--port 8000] [--config configs/default.json]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import threading
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Literal

import torch
import uvicorn
from fastapi import Body, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from alphagomoku.config import Config
from alphagomoku.storage import RunStorage

from .play import PlayManager, session_response, snapshot
from .tail import EventTail

REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIST = REPO_ROOT / "web" / "dist"
HEARTBEAT_MAX_AGE = 10.0  # seconds; PLAN §5 trainer_alive semantics
STOP_TIMEOUT = 10.0  # seconds to wait for a graceful stop before terminate()


# --------------------------------------------------------------------- models


class ControlBody(BaseModel):
    action: Literal["start", "pause", "resume", "stop"]


class PlayNewBody(BaseModel):
    human_color: Literal[1, -1, 0] = 1
    checkpoint: str = "best"
    simulations: int = Field(default=200, ge=1, le=5_000)


class PlayMoveBody(BaseModel):
    x: int
    y: int


# ------------------------------------------------------------------- WS hub


class WSHub:
    """Connected /ws clients with fan-out; per-connection locks serialize sends."""

    def __init__(self) -> None:
        self._conns: dict[WebSocket, asyncio.Lock] = {}

    def add(self, ws: WebSocket) -> None:
        self._conns[ws] = asyncio.Lock()

    def discard(self, ws: WebSocket) -> None:
        self._conns.pop(ws, None)

    async def send(self, ws: WebSocket, msg: dict) -> None:
        lock = self._conns.get(ws)
        if lock is None:
            return
        async with lock:
            # per-send timeout: one stalled client must not block the others
            await asyncio.wait_for(ws.send_json(msg), timeout=2.0)

    async def broadcast(self, msg: dict) -> None:
        results = await asyncio.gather(
            *(self.send(ws, msg) for ws in list(self._conns)),
            return_exceptions=True,
        )
        for ws, res in zip(list(self._conns), results):
            if isinstance(res, Exception):
                self.discard(ws)  # broken/stalled pipe: drop, client will reconnect


# ------------------------------------------------------------- SPA static


class SPAStaticFiles(StaticFiles):
    """StaticFiles + SPA fallback: unknown non-/api paths serve index.html."""

    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api"):
                return await super().get_response("index.html", scope)
            raise


# -------------------------------------------------------------------- factory


def create_app(run_dir: str, config_path: str | None = None, spawn=None) -> FastAPI:
    """Build the app around a run directory.

    ``spawn`` is injectable for tests; it must accept ``(cmd: list, cwd: str)``
    and return a subprocess.Popen-like object (poll/pid/terminate).
    """
    storage = RunStorage(run_dir)
    spawn_fn = spawn if spawn is not None else subprocess.Popen
    state: dict = {"trainer_proc": None}
    start_lock = threading.Lock()  # serialize alive-check + spawn (TOCTOU)

    # --------------------------------------------------------- status helpers

    def trainer_alive() -> bool:
        """Alive = our subprocess runs, or a fresh heartbeat with a live state.

        A trainer that just stopped leaves a fresh heartbeat behind; requiring
        state in (running, paused) avoids a ~10s false-positive window.
        """
        proc = state["trainer_proc"]
        if proc is not None and proc.poll() is None:
            return True
        status = storage.read_status() or {}
        hb = status.get("heartbeat")
        fresh = isinstance(hb, (int, float)) and (time.time() - hb) < HEARTBEAT_MAX_AGE
        return fresh and status.get("state") in ("running", "paused")

    def build_status() -> dict:
        status = dict(storage.read_status() or {"state": "idle"})
        proc = state["trainer_proc"]
        proc_alive = proc is not None and proc.poll() is None
        status["trainer_alive"] = trainer_alive()
        status["pid"] = proc.pid if proc_alive else None
        status["control"] = storage.read_control()
        status["run_dir"] = str(storage.root)
        status["config"] = storage.read_config()
        return status

    def effective_config_dict() -> dict | None:
        """What the next start would use: run-dir config.json, else --config."""
        cfg = storage.read_config()
        if cfg is not None:
            return cfg
        if config_path is not None:
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, json.JSONDecodeError):
                return None
        return None

    def config_for_play() -> Config:
        data = effective_config_dict()
        if data is None:
            return Config()
        try:
            return Config.from_dict(data)
        except (TypeError, ValueError):
            return Config()

    play = PlayManager(storage, get_config=config_for_play, device="auto")
    hub = WSHub()
    event_tail = EventTail(
        storage.events_path,
        status_provider=build_status,
        broadcast=hub.broadcast,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(event_tail.run())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Alpha-Gomoku", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------ REST

    @app.get("/api/status")
    def get_status() -> dict:
        return build_status()

    @app.post("/api/control")
    def post_control(body: ControlBody) -> dict:
        if body.action == "start":
            with start_lock:  # alive-check + spawn must be atomic
                if trainer_alive():
                    raise HTTPException(409, "trainer is already running")
                if storage.read_config() is None:
                    # effective config: copy --config into the run dir, else defaults
                    data = None
                    if config_path is not None:
                        try:
                            with open(config_path, "r", encoding="utf-8") as f:
                                data = json.load(f)
                        except (OSError, json.JSONDecodeError) as exc:
                            raise HTTPException(400, f"cannot load config {config_path}: {exc}")
                    cfg_dict = data if data is not None else Config().to_dict()
                    try:
                        cfg = Config.from_dict(cfg_dict)
                        cfg.validate()
                    except (AssertionError, TypeError, ValueError) as exc:
                        raise HTTPException(400, f"invalid config: {exc}")
                    storage.write_config(cfg.to_dict())
                storage.write_control("run")
                cmd = [sys.executable, "-m", "alphagomoku.trainer", "--run", str(storage.root)]
                state["trainer_proc"] = spawn_fn(cmd, cwd=str(REPO_ROOT))
        elif body.action == "pause":
            storage.write_control("pause")
        elif body.action == "resume":
            storage.write_control("run")
        else:  # stop
            storage.write_control("stop")
            proc = state["trainer_proc"]
            if proc is not None and proc.poll() is None:
                deadline = time.monotonic() + STOP_TIMEOUT
                while time.monotonic() < deadline and proc.poll() is None:
                    time.sleep(0.1)
                if proc.poll() is None:
                    proc.terminate()
        return build_status()

    @app.get("/api/metrics")
    def get_metrics(tail: int = Query(default=200, ge=1, le=10_000)) -> list[dict]:
        return storage.read_metrics(tail=tail)

    @app.get("/api/games")
    def get_games(
        kind: Literal["selfplay", "arena"] | None = None,
        limit: int = Query(default=50, ge=1, le=500),
        cursor: str | None = None,
    ) -> dict:
        games, next_cursor = storage.list_games(kind=kind, limit=limit, cursor=cursor)
        return {"games": games, "next_cursor": next_cursor}

    @app.get("/api/games/{game_id}")
    def get_game(game_id: str) -> dict:
        game = storage.read_game(game_id)
        if game is None:
            raise HTTPException(404, f"unknown game: {game_id}")
        return game

    ckpt_meta_cache: dict[str, tuple[float, dict]] = {}  # name -> (mtime, meta)

    @app.get("/api/checkpoints")
    def get_checkpoints() -> list[dict]:
        out = []
        for info in storage.list_checkpoints():
            cached = ckpt_meta_cache.get(info["name"])
            if cached is not None and cached[0] == info["mtime"]:
                meta = cached[1]
            else:
                meta = {}
                try:  # tolerate a mid-write / corrupt file
                    blob = torch.load(
                        storage.checkpoint_path(info["name"]),
                        map_location="cpu",
                        weights_only=True,
                    )
                    meta = blob.get("meta") or {}
                except Exception:
                    pass
                ckpt_meta_cache[info["name"]] = (info["mtime"], meta)
            out.append({**info, "meta": meta})
        return out

    @app.get("/api/config")
    def get_config() -> dict | None:
        return effective_config_dict()

    @app.put("/api/config")
    def put_config(payload: dict = Body(...)) -> dict:
        if trainer_alive():
            raise HTTPException(409, "cannot change config while the trainer is running")
        try:
            cfg = Config.from_dict(payload)
            cfg.validate()
        except (AssertionError, TypeError, ValueError) as exc:
            raise HTTPException(400, f"invalid config: {exc}")
        storage.write_config(cfg.to_dict())
        return cfg.to_dict()

    # ------------------------------------------------------------- play (§5)

    @app.post("/api/play/new")
    def play_new(body: PlayNewBody) -> dict:
        session, ai = play.create(body.human_color, body.checkpoint, body.simulations)
        return session_response(session, ai)

    @app.post("/api/play/{sid}/move")
    def play_move(sid: str, body: PlayMoveBody) -> dict:
        session, ai = play.human_move(sid, body.x, body.y)
        return session_response(session, ai)

    @app.post("/api/play/{sid}/step")
    def play_step(sid: str) -> dict:
        session, ai = play.step(sid)
        return session_response(session, ai)

    @app.get("/api/play/{sid}")
    def play_get(sid: str) -> dict:
        session = play.get(sid)
        with session.lock:  # consistent snapshot, not mid-move
            return snapshot(session)

    # --------------------------------------------------------------- WebSocket

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        await websocket.accept()
        hub.add(websocket)
        try:
            # replay backlog (PLAN §5: last 50 events) + current status
            await hub.send(websocket, {"type": "history", "events": storage.read_events(tail=50)})
            await hub.send(websocket, {"type": "status", "status": build_status()})
            while True:
                await websocket.receive_text()  # client never talks; detects disconnect
        except WebSocketDisconnect:
            pass
        finally:
            hub.discard(websocket)

    # ------------------------------------------------------------------ static

    if WEB_DIST.is_dir():  # API routes above take precedence over the mount
        app.mount("/", SPAStaticFiles(directory=str(WEB_DIST), html=True), name="spa")

    return app


# ------------------------------------------------------------------------ CLI


def main() -> None:
    parser = argparse.ArgumentParser(description="Alpha-Gomoku server (PLAN.md §5)")
    parser.add_argument("--run", required=True, help="run directory, e.g. data/runs/dev")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="bind host; 127.0.0.1 by default since /api/control is unauthenticated"
        " (pass 0.0.0.0 only on a trusted network)",
    )
    parser.add_argument(
        "--config",
        default=None,
        help="seed config JSON, copied into the run directory on first start",
    )
    args = parser.parse_args()
    app = create_app(args.run, config_path=args.config)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
