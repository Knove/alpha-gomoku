"""Training configuration. Single source of truth: PLAN.md §4.1."""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict, fields
from pathlib import Path


@dataclass
class Config:
    board_size: int = 9
    win_len: int = 5
    # network
    net_channels: int = 64
    net_res_blocks: int = 4
    # MCTS
    mcts_simulations: int = 100
    c_puct: float = 1.5
    dirichlet_alpha: float = 0.3
    dirichlet_epsilon: float = 0.25
    temp_threshold: int = 12
    # self-play
    games_per_iteration: int = 24
    parallel_games: int = 8
    # training
    batch_size: int = 128
    train_steps: int = 30
    lr: float = 0.01
    weight_decay: float = 1e-4
    buffer_size: int = 100_000
    min_buffer: int = 512
    # arena
    arena_enabled: bool = True
    arena_every: int = 2
    arena_games: int = 10
    arena_simulations: int = 50
    promote_threshold: float = 0.55
    # runtime
    device: str = "auto"  # auto | mps | cpu | cuda
    seed: int = 42
    keep_checkpoint_every: int = 10

    @classmethod
    def from_dict(cls, d: dict) -> "Config":
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in known})

    @classmethod
    def from_json(cls, path: str | Path) -> "Config":
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self, path: str | Path) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)

    def validate(self) -> None:
        assert self.board_size >= 5, "board_size must be >= 5"
        assert 3 <= self.win_len <= self.board_size, "win_len out of range"
        assert self.net_channels >= 8 and self.net_res_blocks >= 1
        assert self.mcts_simulations >= 1
        assert self.games_per_iteration >= 1 and self.parallel_games >= 1
        assert self.batch_size >= 1 and self.train_steps >= 1
        assert 0.0 <= self.promote_threshold <= 1.0
