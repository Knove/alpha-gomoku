#!/usr/bin/env python
"""重新生成本目录下的训练链基准输出。

生成命令(在仓库根目录执行):
    .venv/bin/python learn/fixtures/redesign/make_baseline.py

脚本以固定随机种子 42、演示配置 configs/fast.json、最大轮数 1,
在系统临时目录中完整运行一遍训练链,再把小体积输出拷回本目录。
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from alphagomoku.trainer import main as trainer_main  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent
HEAD_MOVES = 5


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ag-baseline-") as tmp:
        run_dir = Path(tmp) / "run"
        trainer_main(["--run", str(run_dir),
                      "--config", str(ROOT / "configs" / "fast.json"),
                      "--max-iterations", "1"])

        shutil.copyfile(run_dir / "metrics.jsonl", OUT_DIR / "metrics.jsonl")
        shutil.copyfile(run_dir / "status.json", OUT_DIR / "status.json")

        game = json.loads(
            (run_dir / "games" / "000000" / "sp_000000_000.json").read_text(encoding="utf-8"))
        header = {k: v for k, v in game.items() if k != "moves"}
        header["moves_total"] = len(game["moves"])
        header["moves_kept"] = HEAD_MOVES
        lines = [json.dumps(header, ensure_ascii=False)]
        lines += [json.dumps(m, ensure_ascii=False) for m in game["moves"][:HEAD_MOVES]]
        (OUT_DIR / "game-head.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("基准输出已写入:", OUT_DIR)


if __name__ == "__main__":
    main()
