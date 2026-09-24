#!/usr/bin/env python
"""Generate or verify provenance for checked-in learn-site artifacts.

Verification always checks the derived artifacts that exist in a clean checkout.
The gitignored demo run is checked when present, but its absence is not an error.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[2]
LEARN = ROOT / "learn"
RUN = ROOT / "data/runs/demo"
OUT = LEARN / "src/data/provenance.json"
ARTIFACTS = (
    LEARN / "src/data/real.ts",
    LEARN / "src/data/weights-best.json",
    LEARN / "src/data/weights-untrained.json",
    LEARN / "tests/fixtures/expected.json",
    LEARN / "tests/fixtures/mcts-trace.json",
)
SOURCE_FILES = (
    RUN / "config.json",
    RUN / "checkpoints/best.pt",
    RUN / "checkpoints/baseline.pt",
    RUN / "metrics.jsonl",
    RUN / "events.jsonl",
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def checkpoint_info(path: Path) -> dict:
    info = {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
    try:
        blob = torch.load(path, map_location="cpu", weights_only=True)
        info["config"] = blob.get("config") or {}
        info["meta"] = blob.get("meta") or {}
    except Exception as exc:  # provenance remains useful for a corrupt source
        info["read_error"] = type(exc).__name__
    return info


def selected_game() -> Path | None:
    games = RUN / "games"
    if not games.is_dir():
        return None
    iterations = sorted(p for p in games.iterdir() if p.is_dir())
    if not iterations:
        return None
    files = sorted(iterations[-1].glob("*.json"))
    return files[0] if files else None


def build_manifest() -> dict:
    missing = [str(p.relative_to(ROOT)) for p in ARTIFACTS if not p.is_file()]
    if missing:
        raise FileNotFoundError(f"missing generated artifacts: {', '.join(missing)}")
    sources: list[dict] = []
    for path in SOURCE_FILES:
        if not path.is_file():
            continue
        if path.suffix == ".pt":
            sources.append(checkpoint_info(path))
        else:
            sources.append({"path": str(path.relative_to(ROOT)), "sha256": sha256(path)})
    game = selected_game()
    if game is not None:
        sources.append({"path": str(game.relative_to(ROOT)), "sha256": sha256(game)})
    return {
        "schema_version": 1,
        "source_commit": git_commit(),
        "source_run": "data/runs/demo",
        "source_run_required_for_regeneration": True,
        "sources": sources,
        "artifacts": [
            {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
            for path in ARTIFACTS
        ],
        "declared_adaptations": [
            "browser game is fixed to 9x9 while Python is configurable",
            "browser network uses five-decimal checkpoint weights and Float64 arithmetic",
            "browser MCTS evaluates one tree sequentially; production batches leaves across games",
            "deterministic MCTS parity injects fixture evaluations and disables root noise",
        ],
    }


def write_manifest() -> None:
    payload = build_manifest()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(payload['artifacts'])} artifacts)")


def verify_manifest() -> None:
    payload = json.loads(OUT.read_text(encoding="utf-8"))
    errors: list[str] = []
    for item in payload.get("artifacts", []):
        path = ROOT / item["path"]
        if not path.is_file():
            errors.append(f"missing artifact: {item['path']}")
        elif sha256(path) != item["sha256"]:
            errors.append(f"artifact hash mismatch: {item['path']}")
    checked_sources = 0
    for item in payload.get("sources", []):
        path = ROOT / item["path"]
        if not path.is_file():
            continue
        checked_sources += 1
        if sha256(path) != item["sha256"]:
            errors.append(f"source hash mismatch: {item['path']}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(
        f"verified {len(payload.get('artifacts', []))} artifacts; "
        f"{checked_sources} source-run files present"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("generate", "verify"))
    args = parser.parse_args()
    if args.mode == "generate":
        write_manifest()
    else:
        verify_manifest()


if __name__ == "__main__":
    main()
