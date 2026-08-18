#!/usr/bin/env python
"""Dump expected engine outputs for the learn site's node tests.

Usage (from repo root): .venv/bin/python learn/scripts/dump_expected.py
Writes learn/tests/fixtures/expected.json — inputs, per-layer and end-to-end
expected outputs from the REAL model in eval mode.
"""
import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from alphagomoku.game import Game, dihedral_transform, encode  # noqa: E402
from alphagomoku.model import load_checkpoint  # noqa: E402

OUT = ROOT / "learn/tests/fixtures/expected.json"

# (n_moves, seed) — deterministic: moves chosen by seeded rng among legal moves
POSITIONS = [(0, 0), (5, 42), (20, 7), (70, 99)]
SYMS = [0, 1, 2, 5]


def build_input(n_moves: int, seed: int, k: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    g = Game(9, 5)
    while g.move_count < n_moves and g.outcome() is None:
        legal = g.legal_moves()
        g.play(int(rng.choice(np.flatnonzero(legal))))
    return dihedral_transform(encode(g), k).astype(np.float32)


def round_flat(t: torch.Tensor) -> list:
    return [[round(float(x), 6) for x in row.reshape(-1)] for row in t]


def main() -> None:
    net, _ = load_checkpoint(str(ROOT / "data/runs/demo/checkpoints/best.pt"))
    inputs = np.stack([build_input(n, s, k) for n, s in POSITIONS for k in SYMS])

    # manual forward replay (mirrors AlphaGomokuNet.forward; eval mode via load_checkpoint)
    per_layer: dict[str, list] = {}
    with torch.no_grad():
        x = torch.from_numpy(inputs)  # (16, 3, 9, 9) float32
        stem_out = net.stem(x)
        per_layer["stem_out"] = round_flat(stem_out)
        h = net.blocks(stem_out)
        per_layer["trunk_out"] = round_flat(h)
        pc = torch.relu(net.p_bn(net.p_conv(h)))
        per_layer["p_relu"] = round_flat(pc)
        logits = net.p_fc(pc.reshape(-1, 2 * 9 * 9))
        per_layer["logits"] = round_flat(logits)
        vc = torch.relu(net.v_bn(net.v_conv(h)))
        v1 = torch.relu(net.v_fc1(vc.reshape(-1, 81)))
        per_layer["v_hidden"] = round_flat(v1)
        value = torch.tanh(net.v_fc2(v1)).squeeze(-1)
        per_layer["value"] = [[round(float(v), 6) for v in value.tolist()]]

    payload = {
        "inputs": inputs.tolist(),
        "per_layer": per_layer,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"expected.json: {len(inputs)} inputs, {len(per_layer)} layers")


if __name__ == "__main__":
    main()
