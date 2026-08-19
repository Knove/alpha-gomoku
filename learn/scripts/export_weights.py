#!/usr/bin/env python
"""Export demo checkpoints to JSON for the learn site's TS engine.

Usage (from repo root): .venv/bin/python learn/scripts/export_weights.py
Writes learn/src/data/weights-{tag}.json — one file per checkpoint.
Weights are rounded to 5 decimals (spec); sizes: ~0.6MB raw -> ~1.2MB JSON each.
"""
import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

OUT = ROOT / "learn/src/data"

# tag -> checkpoint path (relative to data/runs/demo)
# untrained = baseline.pt: random init frozen BEFORE any training (iter_000000.pt
# already contains 20 SGD steps, i.e. round 0 has run — not "untrained").
CKPTS = {"best": "best.pt", "untrained": "baseline.pt"}


def export(tag: str, rel: str) -> None:
    ckpt = torch.load(
        ROOT / "data/runs/demo/checkpoints" / rel, map_location="cpu", weights_only=True
    )
    payload = {
        "config": ckpt["config"],  # {board_size, channels, res_blocks}
        "tensors": {
            k: [round(float(x), 5) for x in v.reshape(-1)]
            for k, v in ckpt["state_dict"].items()
        },
        "shapes": {k: list(v.shape) for k, v in ckpt["state_dict"].items()},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"weights-{tag}.json").write_text(
        json.dumps(payload, separators=(",", ":")), encoding="utf-8"
    )
    print(f"weights-{tag}.json: {len(payload['tensors'])} tensors")


if __name__ == "__main__":
    for tag, rel in CKPTS.items():
        export(tag, rel)
