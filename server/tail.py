"""Watch events.jsonl and broadcast new lines + status heartbeats over WS.

Contract: PLAN.md §5 (WebSocket /ws) and §6 (events.jsonl append-only file).
The trainer appends; this tail reads incrementally by byte offset and pushes
{"type": "events", "events": [...]} plus periodic {"type": "status", ...}.
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Awaitable, Callable


class EventTail:
    """Incrementally reads events.jsonl by byte offset.

    Every ``interval`` seconds, newly appended complete lines are parsed and
    broadcast. Every ``status_interval`` seconds a status snapshot (from
    ``status_provider``) is broadcast. A partially written last line is left
    for the next poll (the trainer writes line-wise, but the file may be read
    mid-flush).
    """

    def __init__(
        self,
        events_path: Path,
        status_provider: Callable[[], dict],
        broadcast: Callable[[dict], Awaitable[None]],
        interval: float = 0.5,
        status_interval: float = 2.0,
    ):
        self.events_path = Path(events_path)
        self.status_provider = status_provider
        self.broadcast = broadcast
        self.interval = interval
        self.status_interval = status_interval

    def _read_new(self, offset: int) -> tuple[list[dict], int]:
        """Parse complete lines appended since ``offset``.

        Returns (events, new_offset). Tolerates a torn trailing line by only
        consuming up to the last newline, and a truncated/rotated file by
        restarting from 0.
        """
        try:
            size = self.events_path.stat().st_size
        except OSError:
            return [], 0
        if size < offset:  # file was truncated or rotated
            offset = 0
        if size == offset:
            return [], offset
        with open(self.events_path, "rb") as f:
            f.seek(offset)
            chunk = f.read(size - offset)
        last_nl = chunk.rfind(b"\n")
        if last_nl < 0:
            return [], offset
        complete = chunk[: last_nl + 1]
        events: list[dict] = []
        for line in complete.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events, offset + last_nl + 1

    async def run(self) -> None:
        """Poll loop. Starts at end-of-file: history is replayed on WS connect."""
        try:
            offset = self.events_path.stat().st_size
        except OSError:
            offset = 0
        last_status = 0.0
        while True:
            try:
                events, offset = self._read_new(offset)
                if events:
                    await self.broadcast({"type": "events", "events": events})
                now = time.monotonic()
                if now - last_status >= self.status_interval:
                    last_status = now
                    await self.broadcast({"type": "status", "status": self.status_provider()})
            except asyncio.CancelledError:
                raise
            except Exception:
                pass  # never let the tail die on a transient read/parse error
            await asyncio.sleep(self.interval)
