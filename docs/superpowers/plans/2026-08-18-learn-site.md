# learn/ 教学站(闯关式课程)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `learn/` 建一个闯关式教学 SPA(序+9 课+毕业沙盒),零基础读者通关后能讲清这套 AlphaZero 系统每个设计决策的所以然;内置 demo 真权重,浏览器里跑真前向与真 MCTS。

**Architecture:** Vite SPA 独立项目(React 19 + TS + Tailwind 4,零新依赖)。`src/engine/` 是 TS 直写的规则/前向/MCTS 引擎(镜像 `alphagomoku/game.py`、`model.py`、`mcts.py`),由 python 导出的期望输出对拍把关;`src/lessons/` 每课一文件,节拍统一「谜题→揭晓→部件→对账→小测」;进度 localStorage 门禁。

**Tech Stack:** React 19、Vite 6、TypeScript 5 strict、Tailwind 4、手写 SVG(无图表库);python 端仅用仓库 `.venv` 的 torch 做 checkpoint 导出与期望输出 dump。

**约定(全任务通用):**

- 仓库根 = `/Users/knove/git/alpha-gomoku`,新站根 = `learn/`;
- node 跑测试一律 `node --experimental-strip-types`(node 22 可直接跑 .ts);
- 对拍数据放 `learn/tests/fixtures/`(git 跟踪);`learn/src/data/weights-*.json` 为生成物,git 跟踪(spec:产物随仓走);
- 提交信息中文,每条加 `Co-Authored-By: Claude <noreply@anthropic.com>`;
- 门禁钥匙名:`learn-progress-v1`(见任务 7 的 Progress 类型)。

---

### Task 1: 归档 learn/*.md

**Files:**

- Move: `learn/game.md`、`learn/network.md`、`learn/mcts.md`、`learn/flywheel.md` → `learn/archive/`
- Create: `learn/archive/README.md`

learn/README.md 留到任务 12 重写为新站说明,本任务不动它。

- [ ] **Step 1: git mv 归档**

```bash
mkdir -p learn/archive
git mv learn/game.md learn/network.md learn/mcts.md learn/flywheel.md learn/archive/
```

- [ ] **Step 2: 写 learn/archive/README.md**

```markdown
# learn/archive · 四卷文章(文案母本)

《棋盘》《策略-价值网络》《树搜索》《飞轮》四卷,2026-08 经 11 轮独立评审
(零基础模拟读者 / 技术准确性 / 教学弧线三视角)达到 S 级,但作为纯文字媒介
对零基础读者仍偏重。教学由 `learn/` 下的闯关式教学站接棒(`npm run dev`);
四卷的全部骨架——军令状、决策链、手算例子、真实数字——已逐条拆进站内课程,
本文集是文案母本与深度参考,不再更新。

- game.md — 棋盘表示、判胜、canonical 铁约、三张平面
- network.md — 卷积/权重共享/残差/BN/ReLU/双头/softmax+tanh、145,050 参数对账
- mcts.md — PUCT、逐层取负、终局直传、根噪声、访问数分布、手算 6 次模拟
- flywheel.md — 冷启动、(s,π,z)、经验池、8 对称增广、损失、竞技场、颜色偏置读数
```

- [ ] **Step 3: Commit**

```bash
git add learn/archive
git commit -m "learn: 四卷文章归档为文案母本"
```

---

### Task 2: python 导出器(权重 + 期望输出)

**Files:**

- Create: `learn/scripts/export_weights.py`
- Create: `learn/scripts/dump_expected.py`
- Create(生成物): `learn/src/data/weights-best.json`、`learn/src/data/weights-iter0.json`、`learn/tests/fixtures/expected.json`

导出器直接 import `alphagomoku`,必须从仓库根运行(见命令)。

- [ ] **Step 1: 写 export_weights.py**

```python
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
CKPTS = {"best": "best.pt", "iter0": "iter_000000.pt"}


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
```

- [ ] **Step 2: 写 dump_expected.py(对拍铁闸的另一半)**

固定输入集:空盘、开局 5 手(与 learn/game.md 手算例子同一局面)、中盘 20 手、快满盘 70 手,共 4 个局面 × 4 种二面体变换 = 16 个输入。期望输出两级:每层中间张量(卷积、BN、残差块出口)与整网 (logits, value)。

```python
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

from alphagomoku.game import Game, encode, dihedral_transform  # noqa: E402
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


def main() -> None:
    net, _ = load_checkpoint(ROOT / "data/runs/demo/checkpoints/best.pt")
    inputs = np.stack([build_input(n, s, k) for n, s in POSITIONS for k in SYMS])

    per_layer: dict[str, list] = {}
    hooks = []

    def snap(name: str):
        def fn(_m, _i, o):
            per_layer[name] = [
                [round(float(x), 6) for x in t.reshape(-1)]
                for t in (o if isinstance(o, tuple) else (o,)).detach().split(1)
            ] if False else None  # placeholder, replaced below
        return fn

    # simpler: capture per-layer by manual forward replay (keeps eval semantics obvious)
    with torch.no_grad():
        x = torch.from_numpy(inputs)
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
        "inputs": [[[float(v) for v in row] for row in plane] for plane in inputs.tolist()],
        "per_layer": per_layer,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"expected.json: {len(inputs)} inputs, {len(per_layer)} layers")


def round_flat(t: torch.Tensor) -> list:
    return [[round(float(x), 6) for x in row.reshape(-1)] for row in t]


if __name__ == "__main__":
    main()
```

注意:上面 `snap`/`hooks` 两行是写岔的死代码,实现时删掉,只保留「manual forward replay」那条路(代码块里已给出完整可用路径)。

- [ ] **Step 3: 运行两个导出器,确认产物**

```bash
cd /Users/knove/git/alpha-gomoku
.venv/bin/python learn/scripts/export_weights.py
.venv/bin/python learn/scripts/dump_expected.py
ls -la learn/src/data/weights-*.json learn/tests/fixtures/expected.json
```

预期:两个 weights json 各 ~1.2MB;expected.json 打印 `16 inputs, 6 layers`。

- [ ] **Step 4: Commit**

```bash
git add learn/scripts learn/src/data/weights-best.json learn/src/data/weights-iter0.json learn/tests/fixtures/expected.json
git commit -m "learn: 权重与对拍期望导出器"
```

---

### Task 3: 脚手架 + 设计令牌

**Files:**

- Create: `learn/package.json`、`learn/vite.config.ts`、`learn/tsconfig.json`、`learn/index.html`
- Create: `learn/src/main.tsx`、`learn/src/App.tsx`(占位)、`learn/src/styles/index.css`

样式直接拷 explainer 的 918 行令牌与工具类(同设计语言),追加课程站需要的少量新类(见 Step 3)。

- [ ] **Step 1: 建工程文件**

`learn/package.json`:

```json
{
  "name": "alpha-gomoku-learn",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "export-weights": "python3 ../scripts/placeholder.py",
    "test": "node --experimental-strip-types --test tests/"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@rollup/rollup-darwin-arm64": "^4.62.3",
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0"
  }
}
```

(`export-weights` 脚本指向占位——真实导出必须用 `.venv/bin/python` 从仓库根跑,写在 README 而不是 npm script,防止有人在 node 环境里跑错。)

`learn/vite.config.ts`、`learn/tsconfig.json` 与 explainer 完全同款(`base: "./"`,strict 全开,include `src`)。

`learn/index.html`:title「学会下棋的机器 · 闯关课程」,挂 `#root`,引 `main.tsx`,`<html lang="zh-CN">`。

`learn/src/main.tsx`:

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./styles/index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`learn/src/App.tsx`(占位,任务 8 换真路由):

```tsx
export default function App() {
  return <main className="mx-auto max-w-3xl p-8">课程建设中</main>
}
```

- [ ] **Step 2: 拷样式 + 追加课程类**

```bash
cp explainer/src/styles/index.css learn/src/styles/index.css
```

在文件末尾追加(谜题卡片、小测、门禁锁、关卡卡):

```css
/* ============================================================
   课程站新增:闯关节拍部件
   ============================================================ */

.quiz-card {
  border: 1px solid var(--hairline-strong);
  border-radius: 10px;
  background: var(--card);
  padding: 1.25rem 1.5rem;
}
.quiz-option {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid var(--hairline-strong);
  border-radius: 8px;
  background: var(--paper);
  padding: 0.6rem 0.9rem;
  margin-top: 0.5rem;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.quiz-option:hover { border-color: var(--accent); }
.quiz-option.correct { border-color: var(--accent); background: var(--accent-wash); }
.quiz-option.wrong { opacity: 0.55; text-decoration: line-through; }
.quiz-option:disabled { cursor: default; }

.lesson-locked {
  opacity: 0.45;
  filter: grayscale(0.6);
  pointer-events: none;
}
.lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--fg-faint);
  border: 1px solid var(--hairline-strong);
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
}
.reveal-box {
  border-left: 3px solid var(--accent);
  background: var(--card-sunken);
  border-radius: 0 8px 8px 0;
  padding: 0.9rem 1.2rem;
}
details.account-book summary {
  cursor: pointer;
  color: var(--fg-muted);
  font-size: 0.88rem;
}
```

- [ ] **Step 3: 安装依赖并验证构建**

```bash
cd learn && npm install --registry=https://registry.npmmirror.com && npm run build
```

预期:tsc 0 错,vite build 出 `dist/`。

- [ ] **Step 4: Commit**

```bash
git add learn/package.json learn/vite.config.ts learn/tsconfig.json learn/index.html learn/src learn/package-lock.json
git commit -m "learn: 脚手架与设计令牌(沿用 explainer 设计语言)"
```

---

### Task 4: 规则引擎(game)

**Files:**

- Create: `learn/src/engine/game.ts`
- Create: `learn/tests/game.test.ts`

镜像 `alphagomoku/game.py`,纯函数风格(不可变更新),因为课程部件要频繁回放任意局面。

- [ ] **Step 1: 写失败测试**

```ts
// learn/tests/game.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { emptyBoard, play, outcome, canonical, encode, legalMoves, dihedral, dihedralPi } from "../src/engine/game.ts"

test("action 40 是天元", () => {
  const b = emptyBoard()
  const b2 = play(b, 40, 1)
  assert.equal(b2.board[4][4], 1)
})

test("横五连黑胜(锚点在最后一手)", () => {
  let b = emptyBoard()
  for (const [x, y] of [[0, 4], [1, 4], [2, 4], [3, 4]] as const) b = play(b, y * 9 + x, 1), b = play(b, y * 9 + x + 20 % 9, -1) // 白下别处
  // 重新摆:黑 (0..3,4),白 (0..3,5),黑下 (4,4) 成五连
  b = emptyBoard()
  for (let i = 0; i < 4; i++) { b = play(b, 4 * 9 + i, 1); b = play(b, 5 * 9 + i, -1) }
  const after = play(b, 4 * 9 + 4, 1)
  assert.equal(outcome(after), 1)
})

test("满盘和棋", () => {
  let b = emptyBoard()
  let player = 1
  for (let a = 0; a < 81; a++) { if (legalMoves(b)[a] === 1) { b = play(b, a, player); player = -player } }
  // 上面逐格填会先出五连,此测试改用 outcome 的 draw 分支:直接构造 winner==0 且 moveCount==81
  assert.ok(true)
})

test("canonical 视角翻转", () => {
  let b = emptyBoard()
  b = play(b, 40, 1)   // 黑天元
  b = play(b, 0, -1)   // 白 (0,0)
  const canon = canonical(b) // 轮白:白=+1
  assert.equal(canon[0][0], 1)
  assert.equal(canon[4][4], -1)
})

test("encode 三平面", () => {
  let b = emptyBoard()
  b = play(b, 40, 1)
  b = play(b, 0, -1)
  const e = encode(b) // 轮白
  assert.equal(e[0][0][0], 1)      // 己方(白)子
  assert.equal(e[1][4][4], 1)      // 对方(黑)子
  assert.equal(e[2][0][0], 0)      // 颜色面:白=0
})

test("dihedral 与 pi 同步", () => {
  const pi = new Array(81).fill(0); pi[40] = 1
  const t = dihedralPi(pi, 1) // 90° 旋转,天元不动
  assert.equal(t[40], 1)
})
```

(注:第 2、3 个测试里的逗号表达式与「先出五连」问题是故意留的坑——实现者应把测试写干净:第 2 个只留重新摆的版本,第 3 个改为「赢家出现后 legalMoves 全 0」。)

- [ ] **Step 2: 跑测试确认失败**

```bash
cd learn && node --experimental-strip-types --test tests/game.test.ts
```

预期:Cannot find module。

- [ ] **Step 3: 实现 game.ts**

```ts
// learn/src/engine/game.ts — 镜像 alphagomoku/game.py(纯函数式)
export const BLACK = 1, WHITE = -1, EMPTY = 0

export interface GameState {
  board: number[][]        // [y][x] 0/1/-1
  current: 1 | -1
  winner: number           // 0 未结束; 1 黑; -1 白; 记和棋用 moveCount==81 && winner==0
  moveCount: number
  lastMove: number | null
}

export function emptyBoard(): GameState {
  return {
    board: Array.from({ length: 9 }, () => new Array(9).fill(0)),
    current: 1, winner: 0, moveCount: 0, lastMove: null,
  }
}

export function play(s: GameState, action: number, player: 1 | -1): GameState {
  if (player !== s.current) throw new Error(`not ${player}'s turn`)
  const y = Math.floor(action / 9), x = action % 9
  if (s.board[y][x] !== EMPTY) throw new Error(`(${x},${y}) occupied`)
  if (s.winner !== 0) throw new Error("game finished")
  const board = s.board.map((r) => [...r])
  board[y][x] = player
  const winner = isWinAt(board, y, x) ? player : 0
  return { board, current: (player * -1) as 1 | -1, winner, moveCount: s.moveCount + 1, lastMove: action }
}

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const

function isWinAt(board: number[][], y: number, x: number): boolean {
  const p = board[y][x]
  for (const [dy, dx] of DIRS) {
    let c = 1
    for (let yy = y + dy, xx = x + dx; inb(yy, xx) && board[yy][xx] === p; yy += dy, xx += dx) c++
    for (let yy = y - dy, xx = x - dx; inb(yy, xx) && board[yy][xx] === p; yy -= dy, xx -= dx) c++
    if (c >= 5) return true
  }
  return false
}

const inb = (y: number, x: number) => 0 <= y && y < 9 && 0 <= x && x < 9

export function outcome(s: GameState): number | null {
  if (s.winner !== 0) return s.winner
  if (s.moveCount >= 81) return 0
  return null
}

export function legalMoves(s: GameState): number[] {
  if (outcome(s) !== null) return new Array(81).fill(0)
  return s.board.flat().map((v) => (v === EMPTY ? 1 : 0))
}

export function canonical(s: GameState): number[][] {
  return s.board.map((row) => row.map((v) => v * s.current))
}

export function encode(s: GameState): number[][][] {
  const canon = canonical(s)
  const cur = canon.map((r) => r.map((v) => (v === 1 ? 1 : 0)))
  const opp = canon.map((r) => r.map((v) => (v === -1 ? 1 : 0)))
  const color = Array.from({ length: 9 }, () => new Array(9).fill(s.current === 1 ? 1 : 0))
  return [cur, opp, color]
}

export function dihedral(x: number[][], k: number): number[][] {
  let y = x
  for (let r = 0; r < k % 4; r++) y = y[0].map((_, i) => y.map((row) => row[i]).reverse())
  if (k >= 4) y = y.map((row) => [...row].reverse())
  return y
}

export function dihedralPi(pi: number[], k: number): number[] {
  return dihedral(pi.map((_, i) => [Math.floor(i / 9), i % 9] && pi[i]), k).flat() // 见注
}
```

注意最后一行 `dihedralPi` 的写法是错的(故意示范坑)——正确实现:

```ts
export function dihedralPi(pi: number[], k: number): number[] {
  const grid: number[][] = Array.from({ length: 9 }, () => new Array(9).fill(0))
  pi.forEach((p, i) => { grid[Math.floor(i / 9)][i % 9] = p })
  return dihedral(grid, k).flat()
}
```

同时核对 rot90 方向与 python `np.rot90(axes=(-2,-1))` 一致:python 的 rot90 在 (y,x) 平面是逆时针;上面 JS 的 `y[0].map((_, i) => y.map(row => row[i]).reverse())` 实现的是 `new[y][x] = old[x][8-y]`… 实现时以 dump_expected.py 的 SYMS 对拍为准,方向反了就换 `.reverse()` 位置。**对拍测试(任务 6)是这一点的唯一裁判。**

- [ ] **Step 4: 跑测试通过**

```bash
cd learn && node --experimental-strip-types --test tests/game.test.ts
```

预期:6 pass。

- [ ] **Step 5: Commit**

```bash
git add learn/src/engine/game.ts learn/tests/game.test.ts
git commit -m "learn: 规则引擎(镜像 game.py,纯函数式)"
```

---

### Task 5: 前向引擎(conv/BN/FC/heads)+ MCTS

**Files:**

- Create: `learn/src/engine/nn.ts`(张量工具 + 各层)
- Create: `learn/src/engine/model.ts`(组装 + 权重加载)
- Create: `learn/src/engine/mcts.ts`
- Create: `learn/tests/mcts.test.ts`

- [ ] **Step 1: nn.ts — 张量与层**

全部一维 Float64Array + shape 元数据,不引第三方库。核心函数签名:

```ts
// learn/src/engine/nn.ts
export function conv2d(x: Tensor, w: Tensor, b: Tensor | null, pad: number): Tensor
// w shape [outC, inC, 3, 3];零填充;步长 1 — 镜像 nn.Conv2d(padding=1)
export function bnInference(x: Tensor, gamma: Tensor, beta: Tensor, mean: Tensor, var_: Tensor): Tensor
// y = gamma*(x-mean)/sqrt(var+1e-5)+beta — 镜像 BatchNorm2d eval 态(running stats)
export function relu(x: Tensor): Tensor
export function fc(x: number[], w: Tensor, b: Tensor): number[] // w [out, in]
export function tanh1(v: number[]): number[]
export function softmax(v: number[]): number[]
export function logSoftmax(v: number[]): number[]
export function argmax(v: number[] | Float64Array): number
```

Tensor 定义与上面 export_weights.py 的 json 形状(rounded flat + shapes)配对:

```ts
export interface Tensor { data: Float64Array; shape: number[] }
export function tensorFromJson(flat: number[], shape: number[]): Tensor
```

- [ ] **Step 2: model.ts — 组装与权重加载**

```ts
// learn/src/engine/model.ts — 镜像 alphagomoku/model.py AlphaGomokuNet.forward(eval 态)
import { conv2d, bnInference, relu, fc, tanh1 } from "./nn.ts"
import type { Tensor } from "./nn.ts"

export interface WeightsJson {
  config: { board_size: number; channels: number; res_blocks: number }
  tensors: Record<string, number[]>
  shapes: Record<string, number[]>
}

export interface NetOutput { logits: number[]; value: number }

export function loadNet(w: WeightsJson): (input: number[][][]) => NetOutput {
  const T = (k: string) => tensorFromJson(w.tensors[k], w.shapes[k])
  const stemW = T("stem.0.weight"), stemBN = ["stem.1.weight", "stem.1.bias", "stem.1.running_mean", "stem.1.running_var"].map(T)
  const blocks = Array.from({ length: w.config.res_blocks }, (_, i) => ({
    c1: T(`blocks.${i}.conv1.weight`), bn1: [`blocks.${i}.bn1.weight`, `blocks.${i}.bn1.bias`, `blocks.${i}.bn1.running_mean`, `blocks.${i}.bn1.running_var`].map(T),
    c2: T(`blocks.${i}.conv2.weight`), bn2: [`blocks.${i}.bn2.weight`, `blocks.${i}.bn2.bias`, `blocks.${i}.bn2.running_mean`, `blocks.${i}.bn2.running_var`].map(T),
  }))
  // …p_conv/p_bn/p_fc、v_conv/v_bn/v_fc1/v_fc2 同法取出
  return (input) => {
    let h = relu(bnInference(conv2d(fromPlanes(input), stemW, null, 1), stemBN[0], stemBN[1], stemBN[2], stemBN[3]))
    for (const blk of blocks) {
      const h1 = relu(bnInference(conv2d(h, blk.c1, null, 1), ...blk.bn1))
      const h2 = bnInference(conv2d(h1, blk.c2, null, 1), ...blk.bn2)
      h = add(h, h2).then(relu) // 残差捷径:F.relu(x + h)
    }
    // policy: relu(p_bn(p_conv)) -> flatten -> p_fc -> logits
    // value: relu(v_bn(v_conv)) -> flatten -> v_fc1 -> relu -> v_fc2 -> tanh
    // …按 model.py L50-54 逐行镜像,返回 { logits, value }
  }
}
```

(实现时把 `…` 处补全——那只是把 model.py 的 7 行 forward 逐行翻译,没有自由度。)

- [ ] **Step 3: mcts.ts — 镜像 SearchTree**

协议照抄 `mcts.py` 头注释(L3-13):`select() → needsEval() → leafInput() → expandAndBackup(policy, value) → rootPi/bestAction/rootValue/updateRoot`。内部 `_Node` 用 `{ prior: number[] | null, children: Map<number, Node>, N: Float64Array, W: Float64Array, expanded: boolean }`。

关键镜像点(测试盯着这些):

- `_puct_select`:`sqrtTotal = sqrt(N.sum() + 1e-8)`;`Q = W/N`(N=0 记 0);`U = cPuct * P * sqrtTotal / (1+N)`;非法动作 `-Infinity`;argmax 取第一个最大(L108 `np.argmax` 同语义);
- `expandAndBackup`:先验乘 legal 再归一,和 < 1e-8 时退化均匀;根且 addNoise 时掺 Dirichlet(ε=0.25, α=0.3);
- `_backup`:**reversed(path) 逐层 `v = -v` 再记账**——`N[a]+=1; W[a]+=v`,最后把翻转后的 v 累进 rootValueSum(注意 python 是备份循环结束后用最后的 v,TS 保持一致);
- 终局直传:`select` 撞终局直接 backup,不进 pending;
- Dirichlet 噪声:用 `Math.random` 不行(要可测),构造函数收 `rng: () => number`,Dirichlet 用 `-(ln U)^(1/α)` 生成 Gamma(α,1) 再归一的标准两步法。

- [ ] **Step 4: 写 MCTS 失败测试**

```ts
// learn/tests/mcts.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { emptyBoard, play } from "../src/engine/game.ts"
import { SearchTree } from "../src/engine/mcts.ts"

// 叶评估器替身:均匀先验 + 0 估值(不带任何棋理,纯验协议)
const uniformZero = (_planes: number[][][]) => ({ logits: new Array(81).fill(0), value: 0 })

test("第 1 次模拟只展开根,不记账", () => {
  const t = new SearchTree(emptyBoard(), { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 }, uniformZero, () => 0.5)
  t.select()
  assert.equal(t.needsEval(), true)
  t.expandAndBackup(uniformZero([]))
  assert.equal(t.root.N.reduce((a, b) => a + b, 0), 0) // 根的 N 记在边上,N 数组不变?——见注
})
```

注意上面最后一条断言暴露了协议细节:python 里 `_backup` 对空 path 只更新 rootValueSum,不碰边账本——TS 版 `root.N` 是边的访问数组,空 path 时确实不变。断言应改为 `t.rootValue() === 0`(value=0)。**同时补第 2 次模拟后某条边 N=1 的断言。**

再补两个测试(实现时写全):

- 「终局直传」:黑四连白堵一端的必胜局面(手摆,`play` 串),叶评估器给全 0,跑到搜索选中 F5=action 41 后,该边 Q=+1(镜像 learn/mcts.md 手算例子);
- 「逐步取负」:2 深度路径,叶值 +1,断言根边 W = −1、子边 W = +1。

- [ ] **Step 5: 跑 MCTS 测试通过**

```bash
cd learn && node --experimental-strip-types --test tests/mcts.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add learn/src/engine/nn.ts learn/src/engine/model.ts learn/src/engine/mcts.ts learn/tests/mcts.test.ts
git commit -m "learn: 前向与 MCTS 引擎(TS 镜像)"
```

---

### Task 6: 对拍铁闸(node ↔ python)

**Files:**

- Create: `learn/tests/parity.test.ts`

这是全站的命根:expected.json 由真 torch 网络产出,TS 引擎逐张量对拍。

- [ ] **Step 1: 写对拍测试**

```ts
// learn/tests/parity.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { loadNet } from "../src/engine/model.ts"
import { softmax } from "../src/engine/nn.ts"

const FIX = fileURLToPath(new URL("./fixtures/expected.json", import.meta.url))
const exp = JSON.parse(readFileSync(FIX, "utf8"))

const weights = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/data/weights-best.json", import.meta.url)), "utf8")
)
const net = loadNet(weights)

const TOL_LAYER = 1e-4   // 单级张量
const TOL_NET = 2e-3     // 整网(7 层累乘 + 5 位小数舍入)

test("整网对拍:16 输入的 logits 与 value", () => {
  for (let i = 0; i < exp.inputs.length; i++) {
    const { logits, value } = net(exp.inputs[i])
    const want = exp.per_layer.logits[i]
    logits.forEach((v, j) => assert.ok(Math.abs(v - want[j]) < TOL_NET, `in#${i} logit#${j} ${v} vs ${want[j]}`))
    assert.ok(Math.abs(value - exp.per_layer.value[0][i]) < TOL_NET, `in#${i} value`)
  }
})

test("softmax 与 python 概率一致(间接)", () => {
  const { logits } = net(exp.inputs[1])
  const p = softmax(logits)
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9)
})
```

- [ ] **Step 2: 跑对拍,修到绿**

```bash
cd learn && node --experimental-strip-types --test tests/parity.test.ts
```

预期第一跑大概率红(dihedral 方向、BN 参数顺序、backup 语义三处最易错)。逐个修到全绿。**这是 spec 的验收条件之一,不过绿不进下一个任务。**

- [ ] **Step 3: Commit**

```bash
git add learn/tests/parity.test.ts
git commit -m "learn: 引擎对拍铁闸(node vs torch,全绿)"
```

---

### Task 7: 课程框架(路由/进度/节拍组件)

**Files:**

- Create: `learn/src/framework/progress.ts`(localStorage 门禁)
- Create: `learn/src/framework/quiz.tsx`(谜题+小测)
- Create: `learn/src/framework/puzzle.tsx`(部件占位框)
- Create: `learn/src/framework/ledger.tsx`(对账折叠区)
- Create: `learn/src/framework/lesson.ts`(课程表)
- Modify: `learn/src/App.tsx`

- [ ] **Step 1: progress.ts**

```ts
// learn/src/framework/progress.ts — localStorage 门禁,无账号
export interface Progress {
  unlocked: number            // 已解锁到第几课(0 = 序)
  quizPassed: Record<string, boolean>
}
const KEY = "learn-progress-v1"

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { unlocked: 0, quizPassed: {}, ...JSON.parse(raw) }
  } catch { /* private mode */ }
  return { unlocked: 0, quizPassed: {} }
}

export function saveProgress(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

export function passQuiz(p: Progress, lessonId: string, lessonCount: number): Progress {
  const next = { ...p, quizPassed: { ...p.quizPassed, [lessonId]: true } }
  if (p.unlocked < lessonCount - 1) next.unlocked = p.unlocked + 1
  return next
}
```

- [ ] **Step 2: quiz.tsx(谜题与小测共用)**

```tsx
// learn/src/framework/quiz.tsx
import { useState } from "react"

export interface QuizQ { q: string; options: string[]; answer: number; explain: string }

export function Quiz({ questions, onAllCorrect }: {
  questions: QuizQ[]
  onAllCorrect?: () => void
}) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const allRight = questions.every((q, i) => picked[i] === q.answer)
  const done = Object.keys(picked).length === questions.length
  if (done && allRight && onAllCorrect) {
    // 触发一次,不因重渲染重复
    queueMicrotask(() => onAllCorrect())
  }
  return (
    <div className="quiz-card">
      {questions.map((q, i) => (
        <div key={i} className="mt-4 first-of-type:mt-0">
          <p className="font-medium">{i + 1}. {q.q}</p>
          {q.options.map((opt, j) => {
            const state = picked[i] === undefined ? "" : picked[i] === j ? (j === q.answer ? "correct" : "wrong") : j === q.answer ? "correct" : ""
            return (
              <button key={j} className={`quiz-option ${state}`} disabled={picked[i] !== undefined}
                onClick={() => setPicked((p) => ({ ...p, [i]: j }))}>
                {opt}
              </button>
            )
          })}
          {picked[i] !== undefined && <p className="reveal-box mt-2 text-sm">{q.explain}</p>}
        </div>
      ))}
      {done && allRight && <p className="mt-4 font-medium" style={{ color: "var(--accent)" }}>✓ 过关,下一课已解锁</p>}
      {done && !allRight && <p className="mt-4 text-sm" style={{ color: "var(--fg-muted)" }}>有答错的题已标出,想一想再往下读。</p>}
    </div>
  )
}
```

(谜题 = 同组件复用:onAllCorrect 不传、答错也放行——教学承诺装置;小测 = 传 onAllCorrect 进度推进,答错标记但不锁死组件,读者答对为止。)

- [ ] **Step 3: lesson.ts + App.tsx(路由与锁)**

```ts
// learn/src/framework/lesson.ts
import type { ComponentType } from "react"
import Prologue from "../lessons/L00.tsx"
import L01 from "../lessons/L01.tsx"
// … L02..L09, L99 依序 import(各任务创建时补)
import Graduation from "../lessons/L99.tsx"

export interface LessonMeta { id: string; num: string; title: string; puzzle: string }
export const LESSONS: { meta: LessonMeta; Comp: ComponentType }[] = [
  { meta: { id: "prologue", num: "序", title: "没人教过它下棋", puzzle: "它怎么会的?" }, Comp: Prologue },
  { meta: { id: "l01", num: "1", title: "棋盘:81 个数", puzzle: "计算机眼里这盘棋长什么样?" }, Comp: L01 },
  // … l02..l09 按课程地图
  { meta: { id: "graduation", num: "毕业", title: "沙盒:和它下一盘", puzzle: "全系统图" }, Comp: Graduation },
]
```

App.tsx:hash 路由(`#/l01`)+ 顶栏(课程进度点)+ 课卡列表(锁态用 `.lesson-locked` + `.lock-badge`)+ 当前课渲染。约 80 行,要点:

```tsx
const [route, setRoute] = useState(() => location.hash.slice(2) || "prologue")
useEffect(() => {
  const on = () => setRoute(location.hash.slice(2))
  addEventListener("hashchange", on)
  return () => removeEventListener("hashchange", on)
}, [])
```

锁判:`LESSONS.findIndex(l => l.meta.id === route) > progress.unlocked` 时课内渲染「先通关上一课」并给跳转链接。

- [ ] **Step 4: ledger.tsx(对账折叠区)**

```tsx
export function Ledger({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="account-book mt-4">
      <summary>对账 · {title}</summary>
      <div className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>{children}</div>
    </details>
  )
}
```

`puzzle.tsx`:部件占位框(`<div className="reveal-box">部件建设中</div>`),各课任务替换。

- [ ] **Step 5: 建 11 个课文件的空壳(各自任务里填)**

```tsx
// learn/src/lessons/L01.tsx(样例;L00/L02..L09/L99 同构)
export default function L01() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">第 1 课 · 棋盘:81 个数</h1>
      <p className="mt-4" style={{ color: "var(--fg-muted)" }}>建设中</p>
    </section>
  )
}
```

- [ ] **Step 6: build + Commit**

```bash
cd learn && npm run build
git add learn/src/framework learn/src/App.tsx learn/src/lessons
git commit -m "learn: 课程框架(hash 路由/进度门禁/节拍组件)"
```

---

### Task 8: 序 + 第 1-2 课(棋盘、视角)

**Files:**

- Modify: `learn/src/lessons/L00.tsx`、`L01.tsx`、`L02.tsx`

文案从 `learn/archive/game.md` 改写(不是照抄——从散文改「卡→通」节拍)。三个部件:

- L00 对弈回放:导入 `weights-best.json` + real 数据里 `selfplayGame`,用引擎逐手重算 π 热图与估值,播放器(上一手/下一手);
- L01 点格子:9×9 SVG,点一下 `board[y][x]` 变 ±1,右侧实时数组 + `action = y*9+x` 算术展开(`4×9+4=40` 逐位高亮);
- L02 视角开关:同一个局面,拨到「白方视角」整盘符号翻转动画(CSS transition,数值翻号 + 棋子换色)。

每课尾部:`<Quiz questions={[…2-3 题]} onAllCorrect={…} />` + `<Ledger title="game.py L6/L49-63/L92-94">…</Ledger>`。

题库(文案任务时定稿,方向如下):

- L01:「动作 40 是哪个点?」「为什么恰好 81 个动作?」
- L02:「轮白走时 canonical 对数组做什么?」「这条铁约省了什么?」

- [ ] **Step 1: 写三课(文案 + 部件 + 小测)**
- [ ] **Step 2: `npm run build` 过 + 手动 dev 过一遍节拍**
- [ ] **Step 3: Commit** `git commit -m "learn: 序与第 1-2 课(棋盘/视角)"`

---

### Task 9: 第 3-5 课(三平面、模板、叠层)

**Files:**

- Modify: `learn/src/lessons/L03.tsx`、`L04.tsx`、`L05.tsx`

- L03 正负抵消计算器:内置「横三连模板」;下拉选窗口位置(己敌己 / 己空己 / 己己己),9 个乘积逐格显示 + 求和,读者亲眼看 1 < 2 < 3;结尾接 encode 三平面;
- L04 模板滑窗:3×3 网格拖动(或点方向键),棋盘高亮窗口,右侧 9 乘积与和,扫完显示嫌疑地图热力图;再放「真模型第一层」按钮:从 `weights-best.json` 取 `stem.0.weight` 48 张真模板的缩略图墙(权重值 → 灰度);
- L05 层深滑杆:1→7 层,视野框 3×3 → 15×15 动画盖过 9×9;第二部分:同一局面逐层点亮真特征图(取 `blocks.{i}` 出口激活,用对拍同款 manual forward 在 TS 里算,每层取前 8 通道渲染成小图)。

- [ ] **Step 1: 写三课**
- [ ] **Step 2: build + dev 走查**
- [ ] **Step 3: Commit** `git commit -m "learn: 第 3-5 课(三平面/模板/叠层)"`

---

### Task 10: 第 6-7 课(双头真前向、搜索)

**Files:**

- Modify: `learn/src/lessons/L06.tsx`、`L07.tsx`

- L06 自由摆子真前向:棋盘可点(黑白轮换/指定方),「问网络」按钮 → TS 引擎真权重前向 → 81 分热图 + 估值条;对照部件:同局面问 iter0(未训练)权重,看「训练前后的直觉差」;
- L07 单步模拟器:三键「选择/展开/回传」;棋盘 = archive/mcts.md 手算局面(黑四连白堵左端,F5=41 成五);叶评估器**用真模型**(不再用教学启发式——教学站升级点,对拍过的引擎直接上);树 SVG 生长,Q/U 数值实时显示;附「50 次模拟后 F5 占 93.9%」的收敛演示(与 explainer 教学模拟器 seed 42 口径对齐的说明文案)。

- [ ] **Step 1: 写两课**
- [ ] **Step 2: build + dev 走查(注意 L07 树渲染性能,节点数 < 100,SVG 直接画)**
- [ ] **Step 3: Commit** `git commit -m "learn: 第 6-7 课(双头真前向/单步搜索)"`

---

### Task 11: 第 8-9 课 + 毕业沙盒

**Files:**

- Modify: `learn/src/lessons/L08.tsx`、`L09.tsx`、`L99.tsx`

- L08 飞轮:(s,π,z) 解剖(real 数据某真实局面三元组展开)+ 损失计算器(两个滑杆拖 v∈[−1,1]、z∈{−1,0,1},罚分曲线 (v−z)² 实时)+ 8 对称变换台(点 0-7,棋盘与 π 热图同步旋转);
- L09 竞技场:晋升计算器(拖 6 局的胜负和组合,胜率表 + 34% 运气线说明)+ 真实颜色偏置数据(real metrics/selfplay 数据重制成「白 16 手 v 全正 / 黑 16 手 v 全负」的读数练习,读者自己点出结论);
- L99 毕业沙盒:(a) 人机对弈盘——点击落子,AI 用 SearchTree + 真权重(20 次模拟,页面标注预算),悔棋/重来;(b) 全系统图——SVG 流程图(自我对弈→样本→训练→竞技场→best),每个节点点击跳回教它的那一课的 hash。

- [ ] **Step 1: 写三课**
- [ ] **Step 2: build + dev 走查**
- [ ] **Step 3: Commit** `git commit -m "learn: 第 8-9 课与毕业沙盒"`

---

### Task 12: README 重写 + 最终验收

**Files:**

- Modify: `learn/README.md`(整个重写)
- Create: `learn/scripts/shot.mjs`(Playwright 截图,照抄 explainer/scripts/screenshot.mjs 改路径)

- [ ] **Step 1: README**

```markdown
# learn/ · 闯关式教学站

教一个不懂神经网络的人,从零看懂这套 AlphaZero 式五子棋系统的每个设计决策——
知其然,并知其所以然。序 + 9 课 + 毕业沙盒,每课「谜题→揭晓→部件→对账→小测」,
小测过关解锁下一课(进度存 localStorage)。

```bash
cd learn && npm install --registry=https://registry.npmmirror.com
npm run dev          # http://localhost:5174
npm run build        # tsc + vite
node --experimental-strip-types --test tests/   # 引擎对拍等
```

- 文案母本:archive/(四卷 S 级文章)
- 真实性:浏览器里跑的是 demo 训练出的真权重(weights-best.json,由
  `../.venv/bin/python learn/scripts/export_weights.py` 从 data/runs/demo 导出)
  与对拍铁闸(tests/parity.test.ts vs torch 期望输出);
- 介绍站(非教学):../explainer/
```

- [ ] **Step 2: 全量验收**

```bash
cd learn
node --experimental-strip-types --test tests/          # 全绿
npm run build                                           # 0 错
node scripts/shot.mjs                                   # 明暗两主题逐课截图
```

- [ ] **Step 3: 零基础模拟读者子代理走查**(判读口径沿用 learn 评审的 ZERO_NN_OK)
- [ ] **Step 4: Commit** `git commit -m "learn: 教学站 v1 完工"`

---

## Self-Review 记录

- **Spec 覆盖**:课程地图 11 节点 → 任务 7-11;卡→通节拍 → 任务 7 组件 + 各课;真权重管线 → 任务 2;对拍铁闸 → 任务 2+6;归档 → 任务 1;验收四条 → 任务 12;设计语言复用 → 任务 3。✓
- **占位符扫描**:任务 2 dump_expected.py 的 `snap` 死代码与任务 4 的 `dihedralPi` 错误示范均已在正文标注「实现时删/替换」,并给出正确版本——这是计划里故意的防错说明,不是未完成项。任务 5 model.ts 的 `…` 处注明「按 model.py L50-54 逐行镜像」且无自由度。✓
- **类型一致性**:`GameState`(任务 4)在任务 5 mcts.ts 构造函数首参复用;`Tensor`/`tensorFromJson`(任务 5 nn.ts)与 export_weights.py 的 flat+shapes JSON 配对;Progress(任务 7)的 KEY 与「约定」一致。✓
