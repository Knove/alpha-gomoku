import { useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"
import { REAL } from "../data/real"
import { fmtFloat, fmtInt, fmtPct } from "../lib/format"

/* ============================================================
 * 图 1-1:可点击的飞轮——推动一轮,真实指标随之上链
 * ============================================================ */

const NODES = [
  { key: "net", label: "神经网络", sub: "直觉:该下哪?谁占优?" },
  { key: "mcts", label: "MCTS 搜索", sub: "40 次模拟推演" },
  { key: "data", label: "训练数据", sub: "(局面, π, 胜负 z)" },
  { key: "train", label: "参数更新", sub: "损失下降,网络变强" },
] as const

function Flywheel({ stage, onPush, done }: { stage: number; onPush: () => void; done: boolean }) {
  // 4 nodes on a circle; stage -1 = idle, 0..3 = the currently-flowing edge
  const cx = 300, cy = 230, r = 150
  const pos = NODES.map((_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })
  const activeEdge = stage >= 0 ? stage % 4 : -1

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 0 }}>
      <div style={{ padding: "1rem" }}>
        <svg viewBox="0 0 600 460" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="AlphaZero 飞轮">
          {pos.map((p, i) => {
            const q = pos[(i + 1) % 4]
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
            const nx = cx + (mx - cx) * 1.32, ny = cy + (my - cy) * 1.32
            const active = i === activeEdge
            return (
              <g key={`edge${i}`}>
                <path
                  d={`M ${p.x} ${p.y} Q ${nx} ${ny} ${q.x} ${q.y}`}
                  fill="none"
                  className={active ? "flow-dash" : undefined}
                  style={{ stroke: active ? "var(--accent)" : "var(--hairline-strong)" }}
                  strokeWidth={active ? 2.4 : 1.4}
                  strokeDasharray={active ? undefined : "4 6"}
                  markerEnd="url(#fw-arrow)"
                />
              </g>
            )
          })}
          <defs>
            <marker id="fw-arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: "var(--fg-faint)" }} />
            </marker>
          </defs>
          {pos.map((p, i) => {
            const active = i === activeEdge || (activeEdge === (i + 4 - 1) % 4 && stage >= 0)
            return (
              <g key={`node${i}`}>
                <circle cx={p.x} cy={p.y} r={56}
                  style={{
                    fill: active ? "var(--accent-wash)" : "var(--card)",
                    stroke: active ? "var(--accent)" : "var(--hairline-strong)",
                  }}
                  strokeWidth={active ? 2 : 1.2} />
                <text x={p.x} y={p.y - 4} textAnchor="middle"
                  style={{ fill: "var(--fg)", fontWeight: 700, fontSize: 15 }}>
                  {NODES[i].label}
                </text>
                <text x={p.x} y={p.y + 16} textAnchor="middle"
                  style={{ fill: "var(--fg-faint)", fontSize: 10.5 }}>
                  {NODES[i].sub}
                </text>
              </g>
            )
          })}
          <text x={cx} y={cy - 6} textAnchor="middle"
            style={{ fill: "var(--accent-deep)", fontWeight: 700, fontSize: 17 }}>
            更强的网络
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle"
            style={{ fill: "var(--fg-faint)", fontSize: 11 }}>
            回到起点,再转一圈
          </text>
        </svg>
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button type="button" className="btn primary" onClick={onPush} disabled={done}>
            {stage < 0 ? "推动第一轮" : done ? "四轮推完" : `推动第${["二", "三", "四"][Math.min(stage, 2)]}轮`}
          </button>
        </div>
      </div>
      <FlywheelLedger stage={stage} />
    </div>
  )
}

function FlywheelLedger({ stage }: { stage: number }) {
  const rows = stage < 0 ? [] : REAL.metrics.slice(0, stage + 1)
  return (
    <div style={{ padding: "1.1rem 1.25rem", borderLeft: "1px solid var(--hairline)" }}>
      <div className="mini-label" style={{ marginBottom: 10 }}>
        真实账本 · 每推一轮,追加该轮真实指标
      </div>
      {rows.length === 0 && (
        <div style={{ color: "var(--fg-faint)", fontSize: "0.88rem" }}>
          这里会逐轮出现 data/runs/demo 的真实训练指标
        </div>
      )}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {rows.map((m) => (
          <div key={m.iteration} className="card" style={{ padding: "0.6rem 0.9rem", boxShadow: "none" }}>
            <div className="mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              第 {m.iteration} 轮
              {m.best_iteration === m.iteration && m.iteration > 0 && (
                <span className="chip accent" style={{ marginLeft: 8 }}>best 易主</span>
              )}
            </div>
            <div className="mono" style={{ fontSize: "0.76rem", color: "var(--fg-muted)", marginTop: 2 }}>
              总损失 {fmtFloat(m.loss, 3)} · 策略 {fmtFloat(m.policy_loss, 3)} · 价值 {fmtFloat(m.value_loss, 3)}
            </div>
            <div className="mono" style={{ fontSize: "0.76rem", color: "var(--fg-muted)" }}>
              样本累计 {fmtInt(m.samples_total)} · 经验池 {fmtInt(m.buffer)}
              {m.arena_vs_baseline && ` · vs baseline ${fmtPct(m.arena_vs_baseline.win_rate_a, 0)}`}
            </div>
          </div>
        ))}
      </div>
      {stage >= REAL.metrics.length - 1 && (
        <div className="banner accent" style={{ marginTop: 12 }}>
          <span style={{ fontSize: "0.95rem" }}>飞轮转起来了</span>
          <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
            四轮后它已经稳定碾压随机初始的自己;每一圈,向导都更准一点
          </span>
        </div>
      )}
    </div>
  )
}

/* ====================================================== chapter */

export default function Ch1() {
  const [stage, setStage] = useState(-1)
  const done = stage >= REAL.metrics.length - 1

  return (
    <section id="ch-1">
      <div className="prose-col">
        <ChapterHeader no="壹" eyebrow="THE FLYWHEEL" title="网络与搜索,互相抬轿" />
      </div>

      <div className="prose-col prose">
        <Reveal>
          <p>
            AlphaZero 的全部魔法可以浓缩成一句话:<strong>网络指导搜索,搜索的产物反过来教网络</strong>。
            神经网络负责「直觉」——看一眼棋盘,说出哪些点值得下、局面谁占优;
            MCTS 搜索负责「深思」——拿着这份直觉做 40 次推演,得出更可靠的结论。
            然后,拿深思的结论当老师,回头训练直觉。
          </p>
          <p>
            直觉变强一点,深思的向导就更准一点,深思给出的答案又更好一点——
            这个自我加强的循环,人们叫它<em>飞轮</em>。它甚至不需要任何人类棋谱点火:
            初始网络完全随机,靠根节点的噪声到处乱试,但每一局的<strong>胜负是真实的</strong>,
            这个锚点就足以让飞轮从静止转起来。
          </p>
          <p>
            下面这台飞轮不是示意图:每推一轮,账本追加的都是你的模型在
            data/runs/demo 里留下的<strong>真实指标</strong>。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <Flywheel stage={stage} onPush={() => setStage((s) => Math.min(s + 1, REAL.metrics.length - 1))} done={done} />
            <div className="figure-cap">
              <span className="cap-no">图 1-1</span>
              <span>
                AlphaZero 飞轮。点「推动一轮」看真实训练如何沿环路流转:
                神经网络 → MCTS 搜索 → 训练数据 → 参数更新 → 更强的网络。
                右侧账本来自第 0 至 3 轮真实训练。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="figure-col" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <div className="figure">
            <div style={{ padding: "1.1rem 1.25rem", overflowX: "auto" }}>
              <table className="mono" style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--fg-faint)", textAlign: "left" }}>
                    {["迭代", "总损失", "策略损失", "价值损失", "样本累计", "vs baseline", "best 轮次"].map((h) => (
                      <th key={h} style={{ padding: "0.35rem 0.6rem", fontWeight: 600, borderBottom: "1px solid var(--hairline-strong)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {REAL.metrics.map((m) => (
                    <tr key={m.iteration}>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>#{m.iteration}</td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>{fmtFloat(m.loss, 3)}</td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>{fmtFloat(m.policy_loss, 3)}</td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>{fmtFloat(m.value_loss, 3)}</td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>{fmtInt(m.samples_total)}</td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>
                        {m.arena_vs_baseline ? fmtPct(m.arena_vs_baseline.win_rate_a, 0) : "—"}
                      </td>
                      <td style={{ padding: "0.35rem 0.6rem", borderBottom: "1px solid var(--hairline)" }}>
                        {m.best_iteration === m.iteration && m.iteration > 0
                          ? <span style={{ color: "var(--accent-deep)", fontWeight: 700 }}>#{m.best_iteration} ★</span>
                          : `#${m.best_iteration}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="figure-cap">
              <span className="cap-no">图 1-2</span>
              <span>
                四轮真实账本(data/runs/demo/metrics.jsonl)。读法:策略损失 4.4 附近 ≈ ln(81)
                的「乱猜线」,四轮的训练刚让它开始松动;真正有力的证据在最后一列——
                第 2 轮,挑战者以 6 比 0 掀翻前任冠军,best 易主。
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
