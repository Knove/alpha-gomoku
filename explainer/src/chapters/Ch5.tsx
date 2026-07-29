import { useMemo, useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"
import GomokuBoard from "../lib/board"
import { REAL } from "../data/real"
import { coordLabel, fmtPct } from "../lib/format"

/* ============================================================
 * 图 5-1:π 演变滑杆——各轮真实首手的访问分布
 * ============================================================ */

function PiEvolution() {
  const [idx, setIdx] = useState(REAL.firstMovePi.length - 1)
  const cur = REAL.firstMovePi[idx]
  const board = useMemo(() => new Array(81).fill(0), [])
  const spread = useMemo(() => cur.pi.filter((p) => p > 0.01).length, [cur])
  // 先四舍五入到分位再取符号:-0.0045 经 toFixed(2) 会渲染成 "-0.00",归一为 "0.00"
  const rootVal = Math.round(cur.value * 100) / 100
  const rootValText = `${rootVal > 0 ? "+" : ""}${(rootVal === 0 ? 0 : rootVal).toFixed(2)}`
  const fill = (idx / Math.max(1, REAL.firstMovePi.length - 1)) * 100

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 0 }}>
      <div style={{ padding: "1.1rem", borderRight: "1px solid var(--hairline)" }}>
        <GomokuBoard size={9} board={board} heat={cur.pi} />
        <div className="mini-label" style={{ marginTop: 8, textAlign: "center" }}>
          空局首手 · 第 {cur.iteration} 轮(真实)
        </div>
      </div>
      <div style={{ padding: "1.1rem 1.25rem" }}>
        <div className="mini-label" style={{ marginBottom: 8 }}>拖动看各轮</div>
        <input
          type="range"
          min={0}
          max={REAL.firstMovePi.length - 1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{ "--fill": `${fill}%` } as React.CSSProperties}
          aria-label="训练轮数"
        />
        <div className="flex justify-between mono" style={{ fontSize: "0.75rem", color: "var(--fg-faint)" }}>
          {REAL.firstMovePi.map((f) => (
            <span key={f.iteration}>#{f.iteration}</span>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginTop: 14 }}>
          <div className="card" style={{ padding: "0.6rem 0.9rem", boxShadow: "none" }}>
            <div className="mini-label">根估值</div>
            <div className="mono stat-big" style={{ fontSize: "1.3rem" }}>
              {rootValText}
            </div>
          </div>
          <div className="card" style={{ padding: "0.6rem 0.9rem", boxShadow: "none" }}>
            <div className="mini-label">π &gt; 1% 的点数</div>
            <div className="mono stat-big" style={{ fontSize: "1.3rem" }}>{spread}</div>
          </div>
        </div>
        <div className="mini-label" style={{ margin: "14px 0 8px" }}>访问数 TOP5</div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {cur.top.map((t) => (
            <div key={t.action} className="flex items-center" style={{ gap: 10 }}>
              <span className="chip" style={{ width: "3rem", textAlign: "center" }}>
                {coordLabel(t.x, t.y)}
              </span>
              <div className="prob-track">
                <div className="prob-fill" style={{ width: `${(t.prob / (cur.top[0]?.prob || 1)) * 100}%` }} />
              </div>
              <span className="mono" style={{ fontSize: "0.78rem", width: "4.5rem", textAlign: "right" }}>
                {fmtPct(t.prob, 1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 图 5-2:温度对照——τ=1 采样 vs τ→0 argmax
 * ============================================================ */

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

function sampleFrom(pi: number[], rand: () => number): number {
  // 烘焙的 π 四舍五入到 4 位小数,sum 可能 < 1(如实测 0.9984)。
  // 在 [0, sum) 内取 r,避免 fallthrough 落到 π=0 的动作上;
  // 浮点兜底也返回最后一个正概率点,而不是盲目取 pi.length-1。
  let total = 0
  for (let i = 0; i < pi.length; i++) total += pi[i]
  let r = rand() * (total > 0 ? total : 1)
  let last = 0
  for (let i = 0; i < pi.length; i++) {
    if (pi[i] > 0) last = i
    r -= pi[i]
    if (r <= 0) return i
  }
  return last
}

function TemperatureContrast() {
  // 第 3 轮真实首手:π 散布在 39 个点上(早期模型还没形成锐利偏好),
  // 正好用来对照采样与 argmax(评审前用 one-hot 高光手,左右两盘完全相同)
  const move = REAL.selfplayGame.moves[0]
  const samples = useMemo(() => {
    const rand = mulberry32(7)
    const counts = new Map<number, number>()
    for (let i = 0; i < 30; i++) {
      const a = sampleFrom(move.pi, rand)
      counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    return [...counts.entries()].map(([a, c]) => ({
      x: a % 9,
      y: Math.floor(a / 9),
      prob: c / 30,
    }))
  }, [move])
  const argmax = useMemo(() => {
    let bi = 0
    for (let i = 0; i < move.pi.length; i++) if (move.pi[i] > move.pi[bi]) bi = i
    return [{ x: bi % 9, y: Math.floor(bi / 9), prob: 1 }]
  }, [move])

  // 该手之前无任何落子,棋盘为空,采样点全部可渲染
  const board = useMemo(() => new Array(81).fill(0), [])

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 0 }}>
      <div style={{ padding: "1.1rem", borderRight: "1px solid var(--hairline)" }}>
        <GomokuBoard size={9} board={board} topMoves={samples} small />
        <div className="mini-label" style={{ marginTop: 8, textAlign: "center" }}>
          τ = 1:按 π 采样 30 次(探索)
        </div>
      </div>
      <div style={{ padding: "1.1rem" }}>
        <GomokuBoard size={9} board={board} topMoves={argmax} small />
        <div className="mini-label" style={{ marginTop: 8, textAlign: "center" }}>
          τ → 0:永远取 argmax(利用)
        </div>
      </div>
    </div>
  )
}

/* ====================================================== chapter */

export default function Ch5() {
  return (
    <section id="ch-5">
      <div className="prose-col">
        <ChapterHeader no="伍" eyebrow="SELF-PLAY" title="自己跟自己下,越下越强" />
      </div>

      <div className="prose-col prose">
        <Reveal>
          <p>
            飞轮烧的燃料是<strong>自我对弈</strong>:最新网络指导 MCTS,同时开好几盘棋,
            左右互搏。每一手在<strong>落子之前</strong>,系统记下三样东西——
            当前局面 s、搜索给出的访问分布 π、这手轮到谁下;
            一局终了,再按胜负给整局的每条记录补上结局 z:
            这方赢了记 +1,输了记 −1,和棋记 0。
          </p>
          <p>
            于是一条训练数据是三元组 <em>(s, π, z)</em>:
            「当时这个局面,深思后的答案是 π,这方最后的结局是 z。」
            注意 π 用的是<strong>搜索后的访问分布</strong>,而不是网络的原始输出——
            上一章已经看到,搜索的结论比裸网准,所以才配当老师。
          </p>
          <p>
            还有个分工:一局的前 10 手按 π <strong>采样</strong>落子(给冷门候选机会,探索;
            这个手数阈值可配,本页快照为 10),之后取 argmax(认真赢棋,利用)。
            没有前段探索,模型会困在早期偏见里原地打转。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <PiEvolution />
            <div className="figure-cap">
              <span className="cap-no">图 5-1</span>
              <span>
                π 演变滑杆(第 0 至 3 轮各自的真实空局首手)。拖动看分布的离散程度与估值变化;
                诚实地说,四轮只是启蒙,分布仍然很散——继续训练,它会逐渐收拢到少数几个要点。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="figure-col" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <div className="figure">
            <TemperatureContrast />
            <div className="figure-cap">
              <span className="cap-no">图 5-2</span>
              <span>
                温度对照(第 3 轮真实首手的 π,访问分布散布在 39 个点上)。左边按 τ=1
                采样 30 次,候选点四散(探索期);右边 τ→0 只剩最优手(利用期)。
                本页快照配置:开局 10 手用前者,之后切换成后者。
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
