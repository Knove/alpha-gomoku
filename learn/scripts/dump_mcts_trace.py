#!/usr/bin/env python
"""Export a deterministic Python MCTS trace for the learn TS parity test.

The fixture deliberately disables root noise and uses a small deterministic
policy/value function. It checks the search state machine and bookkeeping, not
NumPy-versus-JavaScript random-number equivalence or model-forward parity.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from alphagomoku.config import Config  # noqa: E402
from alphagomoku.game import Game  # noqa: E402
from alphagomoku.mcts import SearchTree  # noqa: E402

OUT = ROOT / "learn/tests/fixtures/mcts-trace.json"
INITIAL_MOVES = [40, 30, 41, 31, 49, 39]
SIMULATIONS = 12


def logits_for(planes: np.ndarray) -> np.ndarray:
    """One constant policy across positions; legality is applied by SearchTree."""
    return np.asarray([
        (((a * 37) % 101) - 50) / 17.0
        for a in range(planes.shape[-1] ** 2)
    ], dtype=np.float64)


def softmax(logits: np.ndarray) -> np.ndarray:
    e = np.exp(logits - logits.max())
    return e / e.sum()


def value_for(planes: np.ndarray) -> float:
    own = float(planes[0].sum())
    opp = float(planes[1].sum())
    color = float(planes[2, 0, 0])
    return math.tanh((own - opp) * 0.19 + (color - 0.5) * 0.11)


def signature(planes: np.ndarray) -> dict:
    flat = planes.reshape(-1).astype(np.int8)
    return {
        "plane_sums": [int(p.sum()) for p in planes],
        "weighted_sum": int(sum((i + 1) * int(v) for i, v in enumerate(flat))),
        "sha256": hashlib.sha256(flat.tobytes()).hexdigest(),
    }


def rounded(values, digits: int = 9) -> list:
    return [round(float(v), digits) for v in values]


def root_snapshot(tree: SearchTree) -> dict:
    counts = tree.root.N
    total = int(round(float(counts.sum())))
    return {
        "N": [int(round(float(v))) for v in counts],
        "W": rounded(tree.root.W),
        "prior": rounded(tree.root.prior) if tree.root.prior is not None else None,
        "root_visit_total": total,
        "root_value": round(tree.root_value(), 9),
        "pi": rounded(tree.root_pi(1.0)),
        "best_action": tree.best_action(),
    }


def main() -> None:
    cfg = Config(
        board_size=9,
        win_len=5,
        c_puct=1.5,
        dirichlet_epsilon=0.0,
        dirichlet_alpha=0.3,
    )
    game = Game(cfg.board_size, cfg.win_len)
    for action in INITIAL_MOVES:
        game.play(action)
    tree = SearchTree(game, cfg, add_noise=False, rng=np.random.default_rng(0))
    simulations = []
    for index in range(SIMULATIONS):
        tree.select()
        if not tree.needs_eval():
            raise RuntimeError("fixture unexpectedly reached a terminal leaf")
        path = [int(a) for _, a in tree._pending_path]
        planes = tree.leaf_input()
        logits = logits_for(planes)
        policy = softmax(logits)
        value = value_for(planes)
        leaf = {
            "path": path,
            "signature": signature(planes),
            "logits": rounded(logits, 12),
            "value": round(value, 12),
        }
        tree.expand_and_backup(policy, value)
        simulations.append({
            "index": index + 1,
            "leaf": leaf,
            "root": root_snapshot(tree),
        })

    payload = {
        "schema_version": 1,
        "purpose": "Python-to-TypeScript deterministic MCTS contract parity",
        "adaptations": [
            "root Dirichlet noise disabled",
            "constant policy/value fixture evaluator replaces the trained network",
            "policy is softmax(logits) in Python and logits are softmaxed inside TS SearchTree",
        ],
        "board_size": cfg.board_size,
        "win_len": cfg.win_len,
        "initial_moves": INITIAL_MOVES,
        "config": {
            "c_puct": cfg.c_puct,
            "dirichlet_epsilon": 0.0,
            "dirichlet_alpha": cfg.dirichlet_alpha,
        },
        "simulations": simulations,
        "final": root_snapshot(tree),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({SIMULATIONS} simulations)")


if __name__ == "__main__":
    main()
