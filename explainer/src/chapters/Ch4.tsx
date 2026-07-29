import { useEffect, useMemo, useRef, useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"
import GomokuBoard from "../lib/board"
import { coordLabel, fmtPct } from "../lib/format"

/* ============================================================
 * 图 4-1:可单步的 MCTS 模拟器
 * 搜索引擎与 alphagomoku/mcts.py 同款(PUCT / negamax 回传 / 根噪声);
 * 评估器为教学替身(棋形打分,确定性),图注已声明。
 * ============================================================ */

const N = 9
const NN = N * N
const C_PUCT = 1.5
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const

/** Seeded PRNG so the demo is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randn(rand: () => number): number {
  let u = 0, v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Marsaglia–Tsang gamma sampler (for Dirichlet noise). */
function randGamma(shape: number, rand: () => number): number {
  if (shape < 1) return randGamma(shape + 1, rand) * Math.pow(rand(), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const x = randn(rand)
    let v = 1 + c * x
    if (v <= 0) continue
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

function dirichlet(alpha: number, k: number, rand: () => number): number[] {
  const g = Array.from({ length: k }, () => randGamma(alpha, rand))
  const s = g.reduce((a, b) => a + b, 0) || 1
  return g.map((x) => x / s)
}

/** Win scan: returns 1 / -1 if that color has five-in-a-row, else null. */
function winner(b: number[]): number | null {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = b[y * N + x]
      if (p === 0) continue
      for (const [dx, dy] of DIRS) {
        let c = 1
        for (let i = 1; i < 5; i++) {
          const xx = x + dx * i, yy = y + dy * i
          if (xx < 0 || xx >= N || yy < 0 || yy >= N || b[yy * N + xx] !== p) break
          c++
        }
        if (c >= 5) return p
      }
    }
  }
  return null
}

function outcome(b: number[]): number | null {
  const w = winner(b)
  if (w !== null) return w
  return b.every((v) => v !== 0) ? 0 : null
}

function legalMoves(b: number[]): number[] {
  if (outcome(b) !== null) return []
  const out: number[] = []
  for (let i = 0; i < NN; i++) if (b[i] === 0) out.push(i)
  return out
}

/** Longest run of `p` through (x,y) if a stone of p were placed there. */
function bestRun(b: number[], x: number, y: number, p: number): number {
  let best = 1
  for (const [dx, dy] of DIRS) {
    let c = 1
    for (const s of [1, -1]) {
      let xx = x + dx * s, yy = y + dy * s
      while (xx >= 0 && xx < N && yy >= 0 && yy < N && b[yy * N + xx] === p) {
        c++
        xx += dx * s
        yy += dy * s
      }
    }
    if (c > best) best = c
  }
  return best
}

/**
 * Teaching stand-in evaluator (教学示意, deterministic): candidates scored by
 * run potential of the side to move plus block urgency; value = tanh of the
 * shape-score gap. A real AlphaZero net replaces exactly this function.
 *
 * Run scores are CAPPED at 2: the winning move (run 5) then looks no better
 * to the evaluator than other decent points, so the search — not the prior —
 * is what discovers it. Early simulations spread broadly; once the win is
 * found, its unbeatable Q = +1 pulls all later visits in (that convergence
 * is the point of the demo).
 */
function evaluate(b: number[], player: number): { prior: Float32Array; value: number } {
  const score = new Float32Array(NN)
  let maxAtk = 1, maxDef = 1, sum = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x
      if (b[i] !== 0) continue
      const atk = bestRun(b, x, y, player)
      const def = bestRun(b, x, y, -player)
      if (atk > maxAtk) maxAtk = atk
      if (def > maxDef) maxDef = def
      let near = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const xx = x + dx, yy = y + dy
          if (xx >= 0 && xx < N && yy >= 0 && yy < N && b[yy * N + xx] !== 0) near++
        }
      }
      const ea = Math.min(atk, 2), ed = Math.min(def, 2)
      const s = Math.pow(5, ea) + 0.85 * Math.pow(5, ed) + 0.4 * near + 0.01
      score[i] = s
      sum += s
    }
  }
  const prior = new Float32Array(NN)
  if (sum > 0) for (let i = 0; i < NN; i++) prior[i] = score[i] / sum
  const value = Math.tanh(0.5 * (Math.min(maxAtk, 3.5) - Math.min(maxDef, 3.5)))
  return { prior, value }
}

/* ---------------------------------------------------------- engine */

interface EngNode {
  prior: Float32Array | null
  children: Map<number, EngNode>
  N: Float32Array
  W: Float32Array
  expanded: boolean
}

function newNode(): EngNode {
  return { prior: null, children: new Map(), N: new Float32Array(NN), W: new Float32Array(NN), expanded: false }
}

interface Engine {
  root: EngNode
  board: number[]
  player: number
  sims: number
  lastPath: number[]
  lastValue: number
  noise: boolean
  rand: () => number
}

function createEngine(board: number[], player: number, noise: boolean, seed: number): Engine {
  return { root: newNode(), board: board.slice(), player, sims: 0, lastPath: [], lastValue: 0, noise, rand: mulberry32(seed) }
}

function puctSelect(node: EngNode, b: number[]): number {
  const legal = legalMoves(b)
  let total = 0
  for (let i = 0; i < NN; i++) total += node.N[i]
  const sqrtTotal = Math.sqrt(total + 1e-8)
  let best = legal[0] ?? 0, bestScore = -Infinity
  for (const a of legal) {
    const q = node.N[a] > 0 ? node.W[a] / node.N[a] : 0
    const u = C_PUCT * (node.prior?.[a] ?? 0) * sqrtTotal / (1 + node.N[a])
    const s = q + u
    if (s > bestScore) {
      bestScore = s
      best = a
    }
  }
  return best
}

/** One full simulation: select -> expand -> negamax backup (mirrors mcts.py). */
function simulateOnce(e: Engine): void {
  const b = e.board.slice()
  let player = e.player
  let node = e.root
  const path: { node: EngNode; a: number }[] = []
  const actions: number[] = []

  while (node.expanded) {
    const a = puctSelect(node, b)
    path.push({ node, a })
    actions.push(a)
    let child = node.children.get(a)
    if (!child) {
      child = newNode()
      node.children.set(a, child)
    }
    b[a] = player
    player = -player
    node = child
  }

  let v: number
  const out = outcome(b)
  if (out !== null) {
    v = out === 0 ? 0 : out === player ? 1 : -1
  } else {
    const { prior, value } = evaluate(b, player)
    node.prior = prior
    node.expanded = true
    if (node === e.root && e.noise) {
      const legal = legalMoves(b)
      const d = dirichlet(0.3, legal.length, e.rand)
      const mixed = new Float32Array(NN)
      for (let i = 0; i < NN; i++) mixed[i] = 0.75 * prior[i]
      legal.forEach((a, i) => {
        mixed[a] += 0.25 * d[i]
      })
      node.prior = mixed
    }
    v = value
  }

  let vv = v
  for (let i = path.length - 1; i >= 0; i--) {
    vv = -vv
    const { node: nd, a } = path[i]
    nd.N[a] += 1
    nd.W[a] += vv
  }
  e.sims += 1
  e.lastPath = actions
  e.lastValue = v
}

/** Visit distribution at the root (the pi the search produces). */
function rootPi(e: Engine): number[] {
  const total = e.root.N.reduce((a, x) => a + x, 0)
  if (total <= 0) return new Array(NN).fill(0)
  return Array.from(e.root.N, (x) => x / total)
}

/* ------------------------------------------------------ preset game */

/** Black has an open three on row 4; (5,4) makes an open four, which forces a
 *  win within 3 plies — the terminal +1 must travel through depth ≥ 2, so the
 *  tree genuinely grows instead of collapsing onto a single instant-win edge. */
function presetBoard(): { board: number[]; player: number } {
  const b = new Array(NN).fill(0)
  const put = (x: number, y: number, p: number) => {
    b[y * N + x] = p
  }
  put(2, 4, 1); put(3, 4, 1); put(4, 4, 1) // black open three, row 4
  put(0, 4, -1)                            // stray white, far end
  put(2, 1, -1); put(3, 1, -1); put(4, 1, -1) // white three, row 1
  put(6, 2, 1)                             // stray black
  return { board: b, player: 1 }
}

/* ====================================================== tree view */

interface VNode {
  node: EngNode
  action: number
  depth: number
  x: number
  y: number
  parent: VNode | null
  collapsed: number
  onPath: boolean
}

const MAX_DEPTH = 6
const MAX_CHILDREN = 8
const MAX_VISIBLE = 360

/** Tidy-ish layout: leaves spread left to right, parents centered above. */
function layoutTree(root: EngNode, lastPath: number[]): VNode[] {
  const out: VNode[] = []
  let leafCount = 0
  let truncated = false

  function kidsOf(node: EngNode): [number, EngNode][] {
    return [...node.children.entries()]
      .filter(([a, c]) => (node.N[a] ?? 0) > 0 || c.expanded)
      .sort((a, b) => (node.N[b[0]] ?? 0) - (node.N[a[0]] ?? 0))
  }

  function visit(node: EngNode, action: number, depth: number, parent: VNode | null, onPath: boolean): VNode {
    const v: VNode = { node, action, depth, x: 0, y: 40 + depth * 62, parent, collapsed: 0, onPath }
    if (out.length < MAX_VISIBLE) out.push(v)
    else truncated = true
    if (depth >= MAX_DEPTH) {
      v.collapsed = kidsOf(node).length
      v.x = 60 + leafCount++ * 74
      return v
    }
    const kids = kidsOf(node).slice(0, MAX_CHILDREN)
    const hidden = node.children.size - kids.length
    if (hidden > 0) v.collapsed = hidden
    if (kids.length === 0) {
      v.x = 60 + leafCount++ * 74
      return v
    }
    const childVs = kids.map(([a, c]) =>
      visit(c, a, depth + 1, v, onPath && lastPath[depth] === a))
    v.x = childVs.reduce((s, c) => s + c.x, 0) / childVs.length
    return v
  }

  visit(root, -1, 0, null, true)
  if (truncated && out.length > 0) out[out.length - 1].collapsed += 1
  return out
}

function TreeView({ engine, version }: { engine: Engine; version: number }) {
  const vnodes = useMemo(() => layoutTree(engine.root, engine.lastPath), [engine, version])
  const maxN = Math.max(1, ...engine.root.N)
  const width = Math.max(720, ...vnodes.map((v) => v.x + 70))
  const height = 40 + MAX_DEPTH * 62 + 46

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}
      role="img" aria-label="MCTS 搜索树">
      {vnodes.map((v, i) => {
        if (!v.parent) return null
        const share = v.parent.node.N[v.action] ?? 0
        const w = 1 + 4 * Math.min(1, share / Math.max(1, maxN))
        const onPath = v.onPath && v.depth <= engine.lastPath.length
        return (
          <line key={`e${i}`} x1={v.parent.x} y1={v.parent.y} x2={v.x} y2={v.y}
            style={{ stroke: onPath ? "var(--accent)" : "var(--hairline-strong)" }}
            strokeWidth={onPath ? w + 1 : w} opacity={onPath ? 0.95 : 0.55} />
        )
      })}
      {vnodes.map((v, i) => {
        const visits = v.parent ? v.parent.node.N[v.action] : engine.root.N.reduce((a, x) => a + x, 0)
        const r = v.parent ? 4 + 11 * Math.sqrt(visits / Math.max(1, maxN)) : 12
        const sideBlack = v.depth % 2 === 0 // root is black to move in the preset
        const q = visits > 0 && v.parent ? v.parent.node.W[v.action] / visits : 0
        return (
          <g key={`n${i}`}>
            <circle cx={v.x} cy={v.y} r={r}
              style={{
                fill: sideBlack ? "var(--stone-b)" : "var(--stone-w)",
                stroke: sideBlack ? "var(--fg-faint)" : "var(--fg-muted)",
              }}
              strokeWidth={1.2} />
            {v.action >= 0 && (
              <text x={v.x} y={v.y - r - 4} textAnchor="middle" fontSize={10}
                fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: "var(--fg-faint)" }}>
                {coordLabel(v.action % N, Math.floor(v.action / N))}
              </text>
            )}
            {visits > 0 && (
              <text x={v.x} y={v.y + 3} textAnchor="middle" fontSize={8.5}
                fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: sideBlack ? "var(--stone-w)" : "var(--stone-b)" }}>
                {visits}
              </text>
            )}
            {v.collapsed > 0 && (
              <text x={v.x} y={v.y + r + 12} textAnchor="middle" fontSize={9}
                fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: "var(--fg-faint)" }}>
                +{v.collapsed}
              </text>
            )}
            <title>
              {v.action >= 0 ? coordLabel(v.action % N, Math.floor(v.action / N)) : "根"}
              {`  N=${visits}  Q=${q.toFixed(3)}  P=${v.parent ? (v.parent.node.prior?.[v.action] ?? 0).toFixed(3) : "-"}`}
            </title>
          </g>
        )
      })}
    </svg>
  )
}

/* -------------------------------------------------- simulator widget */

interface SimControls {
  step: (k: number) => void
  reset: () => void
  running: boolean
  setRunning: (r: boolean) => void
  noise: boolean
  toggleNoise: () => void
}

function useMctsEngine(): { engine: Engine; version: number } & SimControls {
  const preset = useMemo(presetBoard, [])
  const engineRef = useRef<Engine>(createEngine(preset.board, preset.player, true, 42))
  const [version, setVersion] = useState(0)
  const [running, setRunning] = useState(false)
  const [noise, setNoise] = useState(true)
  const engine = engineRef.current

  const step = (k: number) => {
    for (let i = 0; i < k; i++) simulateOnce(engine)
    setVersion((v) => v + 1)
  }

  const resetWith = (withNoise: boolean) => {
    engineRef.current = createEngine(preset.board, preset.player, withNoise, 42)
    setVersion((v) => v + 1)
  }

  useEffect(() => {
    if (!running) return
    // 自动步进是内容推进而非装饰动画,不受 prefers-reduced-motion 约束
    const t = window.setInterval(() => {
      simulateOnce(engine)
      setVersion((v) => v + 1)
    }, 110)
    return () => window.clearInterval(t)
  }, [running, engine])

  return {
    engine,
    version,
    step,
    reset: () => { setRunning(false); resetWith(noise) },
    running,
    setRunning,
    noise,
    toggleNoise: () => {
      const nn = !noise
      setNoise(nn)
      setRunning(false)
      resetWith(nn)
    },
  }
}

function MctsSim({ engine, version, step, reset, running, setRunning, noise, toggleNoise }: {
  engine: Engine
  version: number
} & SimControls) {

  const pi = rootPi(engine)
  const top: { a: number; n: number }[] = []
  for (let i = 0; i < NN; i++) if (engine.root.N[i] > 0) top.push({ a: i, n: engine.root.N[i] })
  top.sort((x, y) => y.n - x.n)
  const top6 = top.slice(0, 6)
  const totalVisits = engine.root.N.reduce((a, x) => a + x, 0)
  const best = top[0]
  const pathText = engine.lastPath
    .slice(0, 8)
    .map((a) => coordLabel(a % N, Math.floor(a / N)))
    .join(" → ")

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center" style={{ gap: "0.6rem", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hairline)" }}>
        <button type="button" className="btn primary" onClick={() => step(1)}>单步 ×1</button>
        <button type="button" className="btn" onClick={() => step(10)}>单步 ×10</button>
        <button
          type="button"
          className="btn"
          disabled={engine.sims >= 200}
          onClick={() => step(Math.max(0, 200 - engine.sims))}
        >
          跑到 200
        </button>
        <button
          type="button"
          className={`btn${running ? " active" : ""}`}
          onClick={() => setRunning(!running)}
        >
          {running ? "暂停" : "自动"}
        </button>
        <button type="button" className="btn" onClick={reset}>
          重置
        </button>
        <span className="mini-label" style={{ marginLeft: "auto" }}>
          根噪声
        </span>
        <button
          type="button"
          className={`btn${noise ? " active" : ""}`}
          onClick={toggleNoise}
          aria-label={`根噪声:${noise ? "开" : "关"}`}
          title="切换后搜索树重建"
        >
          {noise ? "开" : "关"}
        </button>
        <span className="chip mono">模拟 {engine.sims} 次</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 0 }}>
        {/* board */}
        <div style={{ padding: "1.1rem", borderRight: "1px solid var(--hairline)" }}>
          <GomokuBoard
            size={N}
            board={engine.board}
            heat={engine.sims >= 4 ? pi : undefined}
            topMoves={
              top6.slice(0, 5).map((t) => ({
                x: t.a % N,
                y: Math.floor(t.a / N),
                prob: totalVisits > 0 ? t.n / totalVisits : 0,
              }))
            }
            ghostPlayer={1}
          />
          <div className="mini-label" style={{ marginTop: 8, textAlign: "center" }}>
            黑先 · F5(5,4) 一落成四,杀棋已定
          </div>
        </div>
        {/* tree */}
        <div style={{ padding: "0.6rem", overflowX: "auto" }}>
          <TreeView engine={engine} version={version} />
        </div>
      </div>

      {/* readout strip */}
      <div style={{ padding: "0.9rem 1.25rem", borderTop: "1px solid var(--hairline)" }}>
        <div className="mono" style={{ fontSize: "0.8rem", color: "var(--fg-muted)", marginBottom: 10 }}>
          {engine.sims === 0
            ? "点「单步」跑一次完整模拟:选择 → 展开 → 回传"
            : `第 ${engine.sims} 次模拟:路径 ${pathText || "(根)"} · 叶估值 ${engine.lastValue >= 0 ? "+" : ""}${(engine.lastValue === 0 ? 0 : engine.lastValue).toFixed(3)}`}
        </div>
        <div className="flex flex-col" style={{ gap: 5 }}>
          {top6.map((t) => (
            <div key={t.a} className="flex items-center" style={{ gap: 10 }}>
              <span className="chip" style={{ width: "3rem", textAlign: "center" }}>
                {coordLabel(t.a % N, Math.floor(t.a / N))}
              </span>
              <div className="prob-track">
                <div className="prob-fill" style={{ width: `${(t.n / Math.max(1, top6[0]?.n ?? 1)) * 100}%` }} />
              </div>
              <span className="mono" style={{ fontSize: "0.78rem", width: "6.5rem", textAlign: "right" }}>
                {t.n} 次 · {fmtPct(totalVisits > 0 ? t.n / totalVisits : 0, 1)}
              </span>
            </div>
          ))}
          {top6.length === 0 && (
            <div style={{ fontSize: "0.82rem", color: "var(--fg-faint)" }}>根访问数条形会随模拟生长</div>
          )}
        </div>
        {engine.sims >= 50 && best && (
          <div className="banner accent" style={{ marginTop: 12 }}>
            <span>
              50 次模拟后:访问数收敛到 {coordLabel(best.a % N, Math.floor(best.a / N))}
              (占比 {fmtPct(best.n / Math.max(1, totalVisits), 0)})
            </span>
            <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
              搜索找到了那条制胜线;棋盘上朱砂热力就是 π
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------- Q+U anatomy */

function QUAnatomy({ engine, version }: { engine: Engine; version: number }) {
  void version
  const top: { a: number; n: number; w: number; p: number }[] = []
  for (let i = 0; i < NN; i++) {
    if (engine.root.N[i] > 0) {
      top.push({ a: i, n: engine.root.N[i], w: engine.root.W[i], p: engine.root.prior?.[i] ?? 0 })
    }
  }
  top.sort((x, y) => y.n - x.n)
  const top3 = top.slice(0, 3)
  if (engine.sims < 10 || top.length === 0) {
    return (
      <div style={{ padding: "1.5rem", color: "var(--fg-faint)", fontSize: "0.9rem" }}>
        先在上面跑至少 10 次模拟,这里会解剖根节点前三名候选的 Q 与 U。
      </div>
    )
  }
  const total = engine.root.N.reduce((a, x) => a + x, 0)
  const sqrtTotal = Math.sqrt(total)
  const rows = top3.map((t) => {
    const q = t.w / t.n
    const u = C_PUCT * t.p * sqrtTotal / (1 + t.n)
    return { ...t, q, u }
  })
  const maxAbs = Math.max(0.6, ...rows.map((r) => Math.abs(r.q) + r.u))

  return (
    <div style={{ padding: "1.1rem 1.25rem" }}>
      <div className="flex flex-col" style={{ gap: 14 }}>
        {rows.map((r) => (
          <div key={r.a}>
            <div className="flex items-baseline" style={{ gap: 8, marginBottom: 4 }}>
              <span className="chip">{coordLabel(r.a % N, Math.floor(r.a / N))}</span>
              <span className="mono" style={{ fontSize: "0.78rem", color: "var(--fg-muted)" }}>
                Q={r.q >= 0 ? "+" : ""}{r.q.toFixed(3)} · U={r.u.toFixed(3)} · N={r.n}
              </span>
            </div>
            <div style={{ display: "flex", height: 14, borderRadius: 5, overflow: "hidden", border: "1px solid var(--hairline)" }}>
              <div style={{ width: `${(Math.abs(r.q) / maxAbs) * 100}%`, background: r.q >= 0 ? "var(--fg)" : "var(--accent)", opacity: 0.85 }}
                title={`Q(利用)= ${r.q.toFixed(3)}`} />
              <div style={{ width: `${(r.u / maxAbs) * 100}%`, background: "var(--accent)", opacity: 0.35 }}
                title={`U(探索)= ${r.u.toFixed(3)}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mini-label" style={{ marginTop: 12 }}>
        深色 = Q(这手历史上表现多好) · 浅红 = U(还没看够的加成);模拟越多,U 越小,结论越交给 Q
      </div>
    </div>
  )
}

/* ====================================================== chapter */

export default function Ch4() {
  const sim = useMctsEngine()
  return (
    <section id="ch-4">
      <div className="prose-col">
        <ChapterHeader no="肆" eyebrow="MONTE CARLO TREE SEARCH" title="思考引擎:四十次模拟推演" />
      </div>

      <div className="prose-col prose">
        <Reveal>
          <p>
            回到英雄区那手棋:网络只看了一眼,凭什么最后的选择比它的直觉好?
            答案是<strong>蒙特卡洛树搜索(MCTS)</strong>——「蒙特卡洛」取的是
            「用大量随机试验来估计」的意思;它对当前局面做 40 次
            「如果下这、对面下那、我再下……」的模拟推演,统计哪一手在推演里最靠谱。
            网络在这个过程中只扮演两个角色:给每个候选点一个<em>先验概率</em>(先往哪看),
            给每个推演到的叶子局面一个<em>估值</em>(这局面谁占优)。
          </p>
          <p>
            一次模拟分四步。<strong>选择</strong>:从根出发,每层挑一个分数最高的动作往下走,直到一个没见过的新局面;
            <strong>展开</strong>:问一次网络,记下它的先验与估值;<strong>回传</strong>:把估值沿来路逐层<strong>取负</strong>地记进每条边——
            我方大优,对对手就是大劣,所以每爬一层符号翻一次;<strong>重复</strong>几十次(生成本页数据的运行是 40 次)。
            选择的公式只有一行,却同时照顾了「表现好」和「看得少」:
          </p>
        </Reveal>
        <Reveal>
          <div className="formula">
            score(a) = <span className="hl">Q(a)</span> + c · P(a) · √ΣN / (1 + N(a))
            <br />
            <span style={{ fontSize: "0.82rem", color: "var(--fg-muted)" }}>
              <span className="hl">Q = 历史平均价值(利用)</span> · 后一项 =
              U,探索加成:先验 P 越大、访问 N 越少,越值得再看一眼
            </span>
          </div>
        </Reveal>
        <Reveal>
          <p>
            几十次模拟后,根节点的<strong>访问数分布</strong>就是答案:越靠谱的动作被反复访问。
            这个分布通常比网络的原始输出准得多——因为它掺了几十步推演的真相——
            所以它才有资格反过来当网络的老师(下一章的主角)。
          </p>
        </Reveal>
        <Reveal>
          <div className="misconception">
            <div className="m-title">诚实声明</div>
            下面这台模拟器的<strong>搜索引擎</strong>(PUCT、逐层取负回传、终局直传、根 Dirichlet
            噪声)与 alphagomoku/mcts.py 完全同款,每一个数字都是真算出来的;
            但给叶子打分的「评估器」是<strong>教学替身</strong>(按棋形规则打分),
            真正的系统里站在那里的是训练出来的神经网络。
          </div>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <MctsSim {...sim} />
            <div className="figure-cap">
              <span className="cap-no">图 4-1</span>
              <span>
                可单步的 MCTS 模拟器。黑先,F5 一子落成开放四,白棋两端无法兼顾——点「单步」看搜索如何一次模拟一次模拟地发现这条制胜线;
                开/关根噪声对比探索的差异。树图节点数字是该手的访问次数,朱砂路径是最近一次模拟的选择。
                评估器为教学示意,搜索机制与 alphagomoku/mcts.py 一致。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="prose-col prose" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <p>
            注意看根访问数条形的生长:最初几个候选点平分秋色(探索项 U 在起作用),
            随着模拟次数增加,某一手的历史价值 Q 开始说话,访问数迅速向它集中——
            这就是<strong>收敛</strong>。下面这张图把根前三名候选的 Q 与 U 拆开给你看。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <QUAnatomy engine={sim.engine} version={sim.version} />
            <div className="figure-cap">
              <span className="cap-no">图 4-2</span>
              <span>
                Q + U 解剖:同一批候选,探索加成 U 随模拟次数衰减(分母 1+N 增大),
                最终结论交给历史价值 Q。与上面的模拟器共享同一棵搜索树。
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
