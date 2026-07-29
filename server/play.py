"""Human-vs-AI and AI-self-play sessions. Contract: PLAN.md §5 (/api/play/*).

Sessions live in the server process. Each AI move runs a single SearchTree
(``add_noise=False``, PLAN §4.3) for ``simulations`` rounds of
select/predict/expand and plays the argmax-visit action. Checkpoints are
cached by name and reloaded automatically when the file mtime changes (the
trainer overwrites ``latest.pt``/``best.pt`` in place, PLAN §6).
"""
from __future__ import annotations

import re
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from fastapi import HTTPException

from alphagomoku.config import Config
from alphagomoku.game import Game
from alphagomoku.mcts import SearchTree
from alphagomoku.model import Predictor, load_checkpoint, pick_device
from alphagomoku.storage import RunStorage

# PLAN §6 checkpoint names: best / latest / baseline / iter_<iter:06d>.
_CHECKPOINT_RE = re.compile(r"^(best|latest|baseline|iter_\d{6})$")

# Resource caps (long-lived server): sessions and cached predictors are bounded.
_MAX_SESSIONS = 64
_MAX_PREDICTOR_CACHE = 8


@dataclass
class Session:
    """One play session. human_color: 1 = black, -1 = white, 0 = AI self-play."""

    sid: str
    game: Game
    human_color: int
    checkpoint: str
    simulations: int
    moves: list[dict] = field(default_factory=list)
    created: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)
    ai_top: list[dict] = field(default_factory=list)  # top-k of the last AI move
    value: float = 0.0  # root value of the last AI move (side-to-move view)


class PlayManager:
    """Owns all sessions and the checkpoint -> Predictor cache.

    ``get_config`` supplies the effective training config (c_puct, win_len);
    it is re-read per AI move so a config change takes effect without restart.
    Endpoints calling these methods run in the threadpool (sync ``def``), so
    every mutation of a session is guarded by its per-session lock.
    """

    def __init__(
        self,
        storage: RunStorage,
        get_config: Callable[[], Config] | None = None,
        device: str = "auto",
    ):
        self.storage = storage
        self._get_config = get_config or (lambda: Config())
        self.device = pick_device(device)
        self._cache: "OrderedDict[str, tuple[float, Predictor]]" = OrderedDict()
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        self._rng = np.random.default_rng()

    # ------------------------------------------------------------ checkpoints

    def get_predictor(self, name: str) -> Predictor:
        """Load (or fetch from cache) the predictor for a checkpoint name."""
        if not _CHECKPOINT_RE.match(name):
            raise HTTPException(400, f"invalid checkpoint name: {name!r}")
        path = self.storage.checkpoint_path(name)
        if not path.exists():
            raise HTTPException(404, f"checkpoint not found: {name}")
        mtime = path.stat().st_mtime
        with self._lock:
            cached = self._cache.get(name)
            if cached is not None and cached[0] == mtime:
                self._cache.move_to_end(name)
                return cached[1]
        net, _meta = load_checkpoint(str(path), self.device)
        pred = Predictor(net, self.device)
        with self._lock:
            self._cache[name] = (mtime, pred)
            self._cache.move_to_end(name)
            while len(self._cache) > _MAX_PREDICTOR_CACHE:  # LRU evict
                self._cache.popitem(last=False)
        return pred

    # -------------------------------------------------------------- sessions

    def _new_game(self, pred: Predictor) -> Game:
        """Board size always follows the checkpoint; win_len follows config."""
        cfg = self._get_config()
        n = pred.net.n
        win_len = min(max(cfg.win_len, 3), n)
        return Game(n, win_len)

    def create(self, human_color: int, checkpoint: str, simulations: int) -> tuple[Session, dict | None]:
        """New session. With human_color=-1 the AI (black) moves first."""
        if human_color not in (1, -1, 0):
            raise HTTPException(400, "human_color must be 1 (black), -1 (white) or 0 (AI self-play)")
        if simulations < 1:
            raise HTTPException(400, "simulations must be >= 1")
        pred = self.get_predictor(checkpoint)
        session = Session(
            sid=uuid.uuid4().hex[:12],
            game=self._new_game(pred),
            human_color=human_color,
            checkpoint=checkpoint,
            simulations=int(simulations),
        )
        ai = self._ai_move(session) if human_color == -1 else None
        with self._lock:
            if len(self._sessions) >= _MAX_SESSIONS:
                oldest = min(self._sessions.values(), key=lambda s: s.created)
                del self._sessions[oldest.sid]
            self._sessions[session.sid] = session
        return session, ai

    def get(self, sid: str) -> Session:
        with self._lock:
            session = self._sessions.get(sid)
        if session is None:
            raise HTTPException(404, f"unknown session: {sid}")
        return session

    # ------------------------------------------------------------------ moves

    def _record(self, session: Session, x: int, y: int, value: float | None = None) -> None:
        rec = {
            "n": session.game.move_count,
            "x": x,
            "y": y,
            "player": session.game.current_player,
        }
        if value is not None:
            rec["value"] = value
        session.moves.append(rec)

    def _ai_move(self, session: Session) -> dict | None:
        """One MCTS move for the side to play. None if the game is over."""
        game = session.game
        if game.outcome() is not None:
            return None
        cfg = self._get_config()
        pred = self.get_predictor(session.checkpoint)
        tree = SearchTree(game, cfg, add_noise=False, rng=self._rng)
        for _ in range(session.simulations):
            tree.select()
            if tree.needs_eval():
                policy, value = pred.predict(tree.leaf_input()[None, ...])
                tree.expand_and_backup(policy[0], float(value[0]))
        action = tree.best_action()
        top = tree.top_actions(5)
        value = tree.root_value()
        y, x = divmod(action, game.n)
        self._record(session, x, y, value=value)
        game.play(action)
        session.ai_top = top
        session.value = value
        return {"action": action, "x": x, "y": y, "top": top, "value": value}

    def human_move(self, sid: str, x: int, y: int) -> tuple[Session, dict | None]:
        """Validate + play the human move, then let the AI reply (unless terminal)."""
        session = self.get(sid)
        with session.lock:
            game = session.game
            if session.human_color == 0:
                raise HTTPException(400, "AI self-play session; use step instead")
            if game.outcome() is not None:
                raise HTTPException(400, "game is already finished")
            n = game.n
            if not (0 <= x < n and 0 <= y < n):
                raise HTTPException(400, f"move ({x}, {y}) is off the {n}x{n} board")
            if game.current_player != session.human_color:
                raise HTTPException(400, "not the human's turn")
            if game.legal_moves()[y * n + x] != 1.0:
                raise HTTPException(400, f"square ({x}, {y}) is occupied")
            self._record(session, x, y)
            game.play(y * n + x)
            ai = self._ai_move(session) if game.outcome() is None else None
            return session, ai

    def step(self, sid: str) -> tuple[Session, dict | None]:
        """Advance an AI self-play session by one move (idempotent at terminal)."""
        session = self.get(sid)
        with session.lock:
            if session.human_color != 0:
                raise HTTPException(400, "step is only valid for AI self-play sessions")
            ai = self._ai_move(session)
            return session, ai


# ------------------------------------------------------------------- snapshots


def snapshot(session: Session) -> dict:
    """Session snapshot (PLAN §5 GET /api/play/{sid}). ``board`` is 2D [y][x]."""
    game = session.game
    n = game.n
    last = game.last_move
    outcome = game.outcome()
    return {
        "sid": session.sid,
        "board_size": n,
        "board": game.board.tolist(),
        "moves": list(session.moves),
        "move_count": game.move_count,
        "current_player": game.current_player,
        "result": outcome,
        "outcome": outcome,  # alias consumed by the web client
        "human_color": session.human_color,
        "checkpoint": session.checkpoint,
        "simulations": session.simulations,
        "last_move": ({"x": last % n, "y": last // n} if last is not None else None),
        "ai_top": session.ai_top,
        "value": session.value,
        "created": session.created,
    }


def session_response(session: Session, ai: dict | None) -> dict:
    """Snapshot + the AI move just played and its search stats (new/move/step)."""
    resp = snapshot(session)
    resp["ai_move"] = ai
    resp["ai_stats"] = {"top": ai["top"], "value": ai["value"]} if ai else None
    return resp
