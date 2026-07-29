import { useMemo, useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"
import GomokuBoard from "../lib/board"
import { REAL } from "../data/real"
import { coordLabel, fmtPct, resultText } from "../lib/format"

/* ============================================================
 * 图 7-1:晋升时间线(真实竞技场战报)
 * ============================================================ */

function ArenaTimeline() {
  return (
    <div style={{ padding: "1.2rem 1.25rem", overflowX: "auto" }}>
      <div style={{ display: "flex", gap: "1rem", minWidth: 640 }}>
        {REAL.metrics.map((m) => {
          const promoted = m.best_iteration === m.iteration && m.iteration > 0
          const firstCrown = m.iteration === 0 && m.best_iteration === 0
          return (
            <div key={m.iteration} style={{ flex: 1, minWidth: 150 }}>
              <div className="mono" style={{ fontSize: "0.78rem", color: "var(--fg-faint)", marginBottom: 8 }}>
                第 {m.iteration} 轮
              </div>
              <div
                className="card"
                style={{
                  padding: "0.75rem 0.9rem",
                  boxShadow: "none",
                  borderColor: promoted ? "var(--accent)" : undefined,
                  background: promoted ? "var(--accent-wash)" : undefined,
                }}
              >
                {firstCrown && (
                  <div className="mono" style={{ fontSize: "0.8rem", color: "var(--accent-deep)", fontWeight: 700 }}>
                    首任冠军加冕
                  </div>
                )}
                {promoted && (
                  <div className="mono" style={{ fontSize: "0.8rem", color: "var(--accent-deep)", fontWeight: 700 }}>
                    best 易主
                  </div>
                )}
                {m.arena_vs_best ? (
                  <div style={{ marginTop: 4 }}>
                    <div className="mini-label">vs best(晋升赛)</div>
                    <div className="mono" style={{ fontSize: "0.82rem" }}>
                      {fmtPct(m.arena_vs_best.win_rate_a, 0)}
                      <span style={{ color: "var(--fg-faint)" }}>
                        {` · ${m.arena_vs_best.wins_a}胜 ${m.arena_vs_best.wins_b}负 ${m.arena_vs_best.draws}和`}
                      </span>
                    </div>
                  </div>
                ) : (
                  !firstCrown && <div className="mini-label" style={{ marginTop: 4 }}>本轮未评</div>
                )}
                {m.arena_vs_baseline && (
                  <div style={{ marginTop: 6 }}>
                    <div className="mini-label">vs baseline(锚点)</div>
                    <div className="mono" style={{ fontSize: "0.82rem" }}>
                      {fmtPct(m.arena_vs_baseline.win_rate_a, 0)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ position: "relative", height: 2, background: "var(--hairline-strong)", margin: "14px 4px 0" }} />
    </div>
  )
}

/* ============================================================
 * 图 7-2:真实竞技对局回放(第 2 轮挑战者 vs 前冠军)
 * ============================================================ */

function ArenaReplay() {
  const game = REAL.arenaGame
  const [step, setStep] = useState(game?.moves.length ?? 0)
  const n = game?.board_size ?? 9

  const board = useMemo(() => {
    const b = new Array(n * n).fill(0)
    if (!game) return b
    for (let i = 0; i < step && i < game.moves.length; i++) {
      const m = game.moves[i]
      b[m.y * n + m.x] = m.player
    }
    return b
  }, [game, step, n])

  const trend = useMemo(() => {
    if (!game) return []
    return game.moves.map((m) => (m.player === 1 ? m.value : -m.value))
  }, [game])

  if (!game) {
    return <div style={{ padding: "1.5rem", color: "var(--fg-faint)" }}>暂无竞技场对局数据</div>
  }

  const current = step > 0 ? game.moves[step - 1] : null
  const fill = game.moves.length ? (step / game.moves.length) * 100 : 0
  const blackIsChallenger = game.meta.black === "challenger"
  const challengerWon =
    game.result !== 0 && (game.result === 1) === blackIsChallenger

  // value trend mini chart (black perspective), hand-drawn SVG
  const W = 560, H = 120, PX = 14, PY = 12
  const px = (i: number) => PX + (i / Math.max(1, trend.length - 1)) * (W - 2 * PX)
  const py = (v: number) => PY + ((1 - v) / 2) * (H - 2 * PY)
  const path = trend.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ")

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: "0.6rem", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hairline)" }}>
        <span className="chip accent">第 {game.iteration} 轮 · 晋升赛</span>
        <span className="chip mono">{game.meta.black ?? "?"}(黑) vs {game.meta.white ?? "?"}(白)</span>
        <span className="mini-label" style={{ marginLeft: "auto" }}>{game.id}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 0 }}>
        <div style={{ padding: "1.1rem", borderRight: "1px solid var(--hairline)" }}>
          <GomokuBoard
            size={n}
            board={board}
            lastMove={current ? { x: current.x, y: current.y } : null}
          />
          <div style={{ marginTop: 12 }}>
            <input
              type="range"
              min={0}
              max={game.moves.length}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
              aria-label="手数"
            />
            <div className="flex justify-between items-baseline mono" style={{ fontSize: "0.8rem" }}>
              <span>第 {step} / {game.moves.length} 手</span>
              <span style={{ color: "var(--fg-faint)" }}>
                {current ? `${current.player === 1 ? "黑" : "白"} ${coordLabel(current.x, current.y)}` : "初始局面"}
              </span>
            </div>
          </div>
        </div>
        <div style={{ padding: "1.1rem 1.25rem" }}>
          {step >= game.moves.length && (
            <div className={`banner${challengerWon ? " accent" : ""}`} style={{ marginBottom: 14 }}>
              <span>{resultText(game.result)}</span>
              <span style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                {challengerWon ? "挑战者掀翻前冠军,best 易主" : "前冠军守擂成功"}
              </span>
            </div>
          )}
          <div className="mini-label" style={{ marginBottom: 8 }}>整局估值走势(黑方视角)</div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="估值走势">
            <line x1={PX} y1={py(0)} x2={W - PX} y2={py(0)} style={{ stroke: "var(--hairline-strong)" }} strokeDasharray="3 5" />
            <path d={path} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.8} />
            {trend.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r={i === step - 1 ? 4 : 2}
                style={{ fill: i === step - 1 ? "var(--accent)" : "var(--fg-faint)" }} />
            ))}
            <text x={PX} y={py(1) + 4} fontSize={9} className="mono" style={{ fill: "var(--fg-faint)" }}>黑优</text>
            <text x={PX} y={py(-1) + 4} fontSize={9} className="mono" style={{ fill: "var(--fg-faint)" }}>白优</text>
          </svg>
          <div className="mini-label" style={{ marginTop: 10 }}>
            估值为每手搜索根的输出,已统一换算成黑方视角
          </div>
        </div>
      </div>
    </div>
  )
}

/* ====================================================== chapter */

export default function Ch7() {
  return (
    <section id="ch-7">
      <div className="prose-col">
        <ChapterHeader no="柒" eyebrow="THE ARENA" title="不变强,不上位" />
      </div>

      <div className="prose-col prose">
        <Reveal>
          <p>
            损失曲线下降,不等于棋真的变强了——也可能只是在背数据。
            客观的裁判只有对战。于是每两轮,刚训练完的<strong>挑战者</strong>要走进
            <strong>竞技场</strong>,与现任冠军(best.pt)交替先后手打一组对抗赛:
            胜率过半(≥ 55%)才能取而代之,否则冠军留任。
          </p>
          <p>
            但 vs best 的曲线天生会「抖动」——冠军本身在不停换人。
            所以系统还养着第三张牌:<em>baseline</em>,第 0 轮冻结的随机初始网络,永远不变。
            对它的胜率曲线,才是单调可比的进步刻度。
          </p>
          <p>
            还有个只在工程里才看得到的坑,值得说给你听:无噪声 + 纯 argmax 的搜索是
            <strong>完全确定</strong>的——两个固定的网络,同先手的两局棋会逐手一模一样,
            「六局对抗」实际只有两局的信息量。这个项目真实的解法是:
            开局几手仍按 π 采样制造分叉,之后才认真 argmax。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <ArenaTimeline />
            <div className="figure-cap">
              <span className="cap-no">图 7-1</span>
              <span>
                晋升时间线(真实战报)。第 0 轮没有前任,直接加冕;第 2 轮挑战者以 6 比 0
                掀翻前冠军;对 baseline 的胜率两期都是 83%,进步稳定可证。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="figure-col" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <div className="figure">
            <ArenaReplay />
            <div className="figure-cap">
              <span className="cap-no">图 7-2</span>
              <span>
                第 2 轮晋升赛的一盘真实对局(ar_000002_000):拖滑杆逐手回放,
                看挑战者如何赢下属于自己的王座。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="prose-col" style={{ marginTop: "2.6rem" }}>
        <Reveal>
          <div className="tl-dr">
            <span className="tl-tag">尾声</span>
            <div>
              这台系统的每个零件你都摸过了:<strong>搜索教网络</strong>,访问分布是比直觉更好的老师;
              <strong>一切皆可证</strong>——本页标注「真实」的数字都来自你的真实训练,
              标注「教学示意」的部件则把机制原样摊开,供你亲手验算;
              想继续,去 <span className="chip mono">localhost:8000</span> 按「启动」,
              看活的飞轮,再在对战页亲自输给它一次。
              深入实现读 <span className="chip mono">PLAN.md</span> 与 <span className="chip mono">README.md</span>。
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
