"""Trainer daemon CLI. Contract: PLAN.md §4.9.

    python -m alphagomoku.trainer --run data/runs/dev [--config configs/fast.json] [--max-iterations N]

The run directory's config.json is authoritative; --config only seeds it on
first start. Control (pause/stop) flows through control.json (PLAN §6).
"""
from __future__ import annotations

import argparse
import fcntl
import sys
from pathlib import Path

from .config import Config
from .pipeline import run
from .storage import RunStorage

_DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "configs" / "default.json"


def _acquire_run_lock(storage: RunStorage):
    """Exclusive flock on <run>/trainer.lock: a second trainer on the same run
    directory exits immediately instead of corrupting shared state."""
    fd = open(storage.root / "trainer.lock", "w")
    try:
        fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print(f"another trainer already holds {storage.root}/trainer.lock; exiting",
              file=sys.stderr)
        sys.exit(1)
    return fd  # keep the fd (and the lock) for the process lifetime


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="alphagomoku.trainer")
    p.add_argument("--run", required=True, help="run directory, e.g. data/runs/dev")
    p.add_argument("--config", default=None,
                   help="config JSON used only to initialize the run directory")
    p.add_argument("--max-iterations", type=int, default=None)
    args = p.parse_args(argv)

    storage = RunStorage(args.run)
    _lock = _acquire_run_lock(storage)
    if not storage.config_path.exists():
        cfg = Config.from_json(args.config or _DEFAULT_CONFIG)
        storage.write_config(cfg.to_dict())
    cfg = Config.from_json(storage.config_path)
    storage.write_control("run")
    run(cfg, storage, max_iterations=args.max_iterations)


if __name__ == "__main__":
    main()
