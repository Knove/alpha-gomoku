"""Run-directory file contract. Single source of truth: PLAN.md §6.

Layout:
    <run>/config.json control.json status.json events.jsonl metrics.jsonl buffer.npz
    <run>/games/<iter:06d>/sp_<iter:06d>_<idx:03d>.json
    <run>/arena/<iter:06d>/ar_<iter:06d>_<idx:03d>.json
    <run>/checkpoints/{baseline,latest,best}.pt, iter_<iter:06d>.pt

The trainer process writes; the server process reads; both share this module.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path


class RunStorage:
    def __init__(self, run_dir: str | Path):
        self.root = Path(run_dir)
        for sub in ("", "games", "arena", "checkpoints"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ paths

    @property
    def config_path(self) -> Path:
        return self.root / "config.json"

    @property
    def control_path(self) -> Path:
        return self.root / "control.json"

    @property
    def status_path(self) -> Path:
        return self.root / "status.json"

    @property
    def events_path(self) -> Path:
        return self.root / "events.jsonl"

    @property
    def metrics_path(self) -> Path:
        return self.root / "metrics.jsonl"

    @property
    def buffer_path(self) -> Path:
        return self.root / "buffer.npz"

    def games_dir(self, kind: str, iteration: int) -> Path:
        assert kind in ("selfplay", "arena")
        base = self.root / ("games" if kind == "selfplay" else "arena")
        return base / f"{iteration:06d}"

    def game_path(self, kind: str, iteration: int, idx: int) -> Path:
        prefix = "sp" if kind == "selfplay" else "ar"
        return self.games_dir(kind, iteration) / f"{prefix}_{iteration:06d}_{idx:03d}.json"

    # id prefixes: sp = self-play, ar = arena vs best, ab = arena vs baseline
    _PREFIX_KIND = {"sp": "selfplay", "ar": "arena", "ab": "arena"}

    @staticmethod
    def game_id(kind: str, iteration: int, idx: int) -> str:
        prefix = "sp" if kind == "selfplay" else "ar"
        return f"{prefix}_{iteration:06d}_{idx:03d}"

    def checkpoint_path(self, name: str) -> Path:
        return self.root / "checkpoints" / f"{name}.pt"

    # ----------------------------------------------------------- small helpers

    @staticmethod
    def _read_json(path: Path) -> dict | None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    @staticmethod
    def _write_json_atomic(path: Path, data: dict) -> None:
        # unique tmp per process+thread: concurrent writers must not share it
        tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)

    # ------------------------------------------------------------ config/status

    def write_config(self, cfg_dict: dict) -> None:
        self._write_json_atomic(self.config_path, cfg_dict)

    def read_config(self) -> dict | None:
        return self._read_json(self.config_path)

    def write_status(self, status: dict) -> None:
        status = dict(status)
        status["heartbeat"] = time.time()
        self._write_json_atomic(self.status_path, status)

    def read_status(self) -> dict | None:
        return self._read_json(self.status_path)

    def write_control(self, command: str) -> None:
        assert command in ("run", "pause", "stop")
        self._write_json_atomic(self.control_path, {"command": command, "ts": time.time()})

    def read_control(self) -> str:
        data = self._read_json(self.control_path)
        return data.get("command", "run") if data else "run"

    # ------------------------------------------------------------------ events

    def append_event(self, type_: str, data: dict) -> None:
        line = json.dumps({"ts": time.time(), "type": type_, "data": data}, ensure_ascii=False)
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    @staticmethod
    def _tail_lines(path: Path, tail: int | None, chunk: int = 1 << 16) -> list[str]:
        """Last `tail` lines without reading the whole file (PLAN §6 files grow
        unboundedly). Reads backwards in 64KB chunks."""
        if not path.exists():
            return []
        if tail is None:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().splitlines()
        size = path.stat().st_size
        buf = b""
        with open(path, "rb") as f:
            pos = size
            while pos > 0 and buf.count(b"\n") <= tail:
                step = min(chunk, pos)
                pos -= step
                f.seek(pos)
                buf = f.read(step) + buf
        lines = buf.decode("utf-8", errors="replace").splitlines()
        return lines[-tail:]

    @staticmethod
    def _parse_lines(lines: list[str]) -> list[dict]:
        out = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # tolerate a torn last line while trainer is appending
        return out

    def read_events(self, tail: int | None = None) -> list[dict]:
        return self._parse_lines(self._tail_lines(self.events_path, tail))

    # ----------------------------------------------------------------- metrics

    def append_metrics(self, row: dict) -> None:
        with open(self.metrics_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def read_metrics(self, tail: int | None = None) -> list[dict]:
        return self._parse_lines(self._tail_lines(self.metrics_path, tail))

    # ------------------------------------------------------------------- games

    def write_game(self, kind: str, iteration: int, idx: int, record: dict) -> Path:
        # file name follows the record's own id (prefix encodes the match kind)
        path = self.games_dir(kind, iteration) / f"{record['id']}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        self._write_json_atomic(path, record)
        return path

    def read_game(self, game_id: str) -> dict | None:
        try:
            prefix, it_s, _idx_s = game_id.rsplit("_", 2)
            kind = self._PREFIX_KIND[prefix]
            path = self.games_dir(kind, int(it_s)) / f"{game_id}.json"
        except (ValueError, KeyError):
            return None
        return self._read_json(path)

    def list_games(self, kind: str | None = None, limit: int = 50,
                   cursor: str | None = None) -> tuple[list[dict], str | None]:
        """Game summaries, newest first. cursor = last game_id of previous page."""
        assert kind in (None, "selfplay", "arena")
        kinds = (kind,) if kind else ("selfplay", "arena")
        ids: list[str] = []
        for k in kinds:
            base = self.root / ("games" if k == "selfplay" else "arena")
            if not base.exists():
                continue
            for f in base.glob("*/*.json"):
                ids.append(f.stem)
        ids.sort(reverse=True)
        if cursor is not None:
            try:
                ids = ids[ids.index(cursor) + 1:]
            except ValueError:
                pass
        page, ids = ids[:limit], ids[limit:]
        summaries = []
        for gid in page:
            g = self.read_game(gid)
            if g is None:
                continue
            summaries.append({
                "id": g.get("id", gid),
                "kind": g.get("kind"),
                "iteration": g.get("iteration"),
                "result": g.get("result"),
                "moves": len(g.get("moves", [])),
                "created_at": g.get("created_at"),
                "meta": g.get("meta", {}),
            })
        next_cursor = page[-1] if ids and page else None
        return summaries, next_cursor

    # -------------------------------------------------------------- checkpoints

    def list_checkpoints(self) -> list[dict]:
        out = []
        for f in sorted(self.checkpoint_path("x").parent.glob("*.pt")):
            out.append({
                "name": f.stem,
                "size": f.stat().st_size,
                "mtime": f.stat().st_mtime,
            })
        return out
