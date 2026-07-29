"""Experience replay buffer (preallocated ring buffer). Contract: PLAN.md §4.6."""
from __future__ import annotations

from pathlib import Path

import numpy as np


class ReplayBuffer:
    """Stores (canonical_board int8 (n,n), pi float32 (n*n), player int8, z int8)."""

    def __init__(self, capacity: int, board_size: int):
        self.capacity = capacity
        self.n = board_size
        self.boards = np.zeros((capacity, board_size, board_size), dtype=np.int8)
        self.pis = np.zeros((capacity, board_size * board_size), dtype=np.float32)
        self.players = np.zeros(capacity, dtype=np.int8)
        self.zs = np.zeros(capacity, dtype=np.int8)
        self.size = 0
        self.pos = 0

    def __len__(self) -> int:
        return self.size

    def add_many(self, samples) -> None:
        for canon, pi, player, z in samples:
            self.boards[self.pos] = canon
            self.pis[self.pos] = pi
            self.players[self.pos] = player
            self.zs[self.pos] = z
            self.pos = (self.pos + 1) % self.capacity
            self.size = min(self.size + 1, self.capacity)

    def sample(self, batch_size: int, rng: np.random.Generator):
        """Uniform with replacement -> (inputs (B,3,n,n), pis (B,n*n), zs (B,))."""
        assert self.size > 0, "cannot sample from an empty buffer"
        idx = rng.integers(0, self.size, size=batch_size)
        b = self.boards[idx].astype(np.float32)
        cur = b == 1.0
        opp = b == -1.0
        color = np.where(self.players[idx] == 1, 1.0, 0.0).astype(np.float32)
        color = np.broadcast_to(color[:, None, None], cur.shape)
        inputs = np.stack([cur, opp, color], axis=1).astype(np.float32)
        return inputs, self.pis[idx].copy(), self.zs[idx].copy()

    def save(self, path: str | Path) -> None:
        np.savez_compressed(
            path,
            n=np.int64(self.n),
            size=np.int64(self.size),
            pos=np.int64(self.pos),
            boards=self.boards,
            pis=self.pis,
            players=self.players,
            zs=self.zs,
        )

    def load(self, path: str | Path) -> None:
        data = np.load(path)
        n = int(data["n"])
        if n != self.n:
            raise ValueError(f"buffer board_size mismatch: file {n} vs config {self.n}")
        boards, pis = data["boards"], data["pis"]
        players, zs = data["players"], data["zs"]
        stored_cap = boards.shape[0]
        size = min(int(data["size"]), stored_cap)
        pos = int(data["pos"])
        # chronological order (oldest first): ring-aware
        if size < stored_cap:
            order = np.arange(size)
        else:
            order = np.concatenate([np.arange(pos, stored_cap), np.arange(0, pos)])
        # keep the most recent samples that fit the (possibly resized) capacity
        keep = min(size, self.capacity)
        order = order[-keep:]
        self.boards = np.zeros((self.capacity, n, n), dtype=np.int8)
        self.pis = np.zeros((self.capacity, n * n), dtype=np.float32)
        self.players = np.zeros(self.capacity, dtype=np.int8)
        self.zs = np.zeros(self.capacity, dtype=np.int8)
        self.boards[:keep] = boards[order]
        self.pis[:keep] = pis[order]
        self.players[:keep] = players[order]
        self.zs[:keep] = zs[order]
        self.size = keep
        self.pos = keep % self.capacity
