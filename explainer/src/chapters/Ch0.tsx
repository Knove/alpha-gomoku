/** 第 0 章 · 英雄区:一手棋,是怎么想出来的(真实数据开场,不用 ChapterHeader)。 */
import type { CSSProperties, ReactNode } from "react"
import GomokuBoard from "../lib/board"
import Reveal from "../lib/reveal"
import { coordLabel, fmtFloat, fmtInt, fmtPct, resultText } from "../lib/format"
import { REAL } from "../data/real"

/* ------------------------------------------------------------
   真实数据:第 3 轮自我对局 sp_000003_000 的高光手(heroIndex)
   ------------------------------------------------------------ */

const GAME = REAL.selfplayGame
const SIZE = GAME.board_size
const HERO = GAME.moves[REAL.heroIndex]

/** 把 moves[0..heroIndex] 应用到空盘(action = y * 9 + x)。 */
function buildHeroBoard(): number[] {
  const b = new Array<number>(SIZE * SIZE).fill(0)
  for (let i = 0; i <= REAL.heroIndex; i++) {
    const mv = GAME.moves[i]
    b[mv.y * SIZE + mv.x] = mv.player
  }
  return b
}

const HERO_BOARD = buildHeroBoard()
const HERO_TOP_MOVES = HERO.top.map((t) => ({ x: t.x, y: t.y, prob: t.prob }))
const HERO_VALUE = `${HERO.value >= 0 ? "+" : ""}${fmtFloat(HERO.value, 3)}`
const TOTAL_SAMPLES = fmtInt(REAL.metrics[REAL.metrics.length - 1].samples_total)
const TOTAL_ITERS = REAL.metrics.length

/* ------------------------------------------------------------ */

const thStyle: CSSProperties = {
  fontWeight: 400,
  fontSize: "0.72rem",
  letterSpacing: "0.14em",
  color: "var(--fg-faint)",
  textAlign: "left",
  padding: "0.3rem 0",
}

const tdStyle: CSSProperties = {
  padding: "0.42rem 0",
  textAlign: "left",
  borderTop: "1px solid var(--hairline)",
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "1rem",
        padding: "0.48rem 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <span className="mini-label" style={{ flex: "none" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: "0.92rem", textAlign: "right" }}>
        {children}
      </span>
    </div>
  )
}

function StoneDot({ player }: { player: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: "0.72em",
        height: "0.72em",
        borderRadius: "50%",
        marginRight: "0.42em",
        background: player === 1 ? "var(--stone-b)" : "var(--stone-w)",
        border: player === 1 ? "none" : "1px solid var(--stone-w-edge)",
      }}
    />
  )
}

const CARDS: { no: string; title: string; body: string }[] = [
  {
    no: "01",
    title: "这不是人写的规则",
    body: "系统里没有任何人工棋理与定式。它从随机落子开始,只靠胜负反馈,把自己一点点教会。",
  },
  {
    no: "02",
    title: "搜索教网络",
    body: "每落一子前,蒙特卡洛树搜索先把几十种未来推演一遍;这份访问分布,就是网络模仿的标准答案。",
  },
  {
    no: "03",
    title: "全部可玩",
    body: "七章交互教程,每个概念都配一件可以上手的部件。读完,你等于亲手把这套系统训练过一遍。",
  },
]

export default function Ch0() {
  return (
    <section id="ch-0">
      {/* 英雄块 */}
      <div
        className="prose-col"
        style={{ paddingTop: "4.6rem", paddingBottom: "2.9rem", textAlign: "center" }}
      >
        <Reveal>
          <div className="prose">
            <div className="eyebrow">ALPHA-GOMOKU · 原理交互课</div>
            <h1
              style={{
                fontSize: "clamp(2.1rem, 5.4vw, 3.3rem)",
                fontWeight: 780,
                lineHeight: 1.22,
                letterSpacing: "0.01em",
                margin: "0.9rem 0 1.35rem",
              }}
            >
              一手棋,是怎么想出来的
            </h1>
            <p style={{ maxWidth: "37rem", margin: "0 auto" }}>
              这是 <strong>alphagomoku</strong> 核心包一次真实训练留下的局面:
              训练到第 <span className="mono">3</span> 轮的模型,在第{" "}
              <span className="mono">10</span> 手把 <span className="mono">40</span>{" "}
              次模拟全部押给了天元。这一页不讲论文、不堆公式,只把这套
              AlphaZero 式系统的每个零件——网络、搜索、数据飞轮——用你自己训练出的模型与对局拆开讲,
              而且每一章都可以上手玩。
            </p>
          </div>
        </Reveal>
      </div>
      {/* 图 0-1:高光手局面 + 该手搜索数据 */}
      <div className="figure-col" style={{ paddingBottom: "2.4rem" }}>
        <Reveal delay={90}>
          <figure className="figure" style={{ margin: 0 }}>
            <div className="grid items-start gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_17rem]">
              <div style={{ width: "100%", maxWidth: "30rem", margin: "0 auto" }}>
                <GomokuBoard
                  size={SIZE}
                  board={HERO_BOARD}
                  topMoves={HERO_TOP_MOVES}
                  lastMove={{ x: HERO.x, y: HERO.y }}
                />
              </div>
              <aside
                style={{
                  background: "var(--card-sunken)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "12px",
                  padding: "1.05rem 1.15rem 1.15rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.95rem",
                }}
              >
                <div>
                  <span className="chip accent">
                    第 {GAME.iteration} 轮真实自我对局
                  </span>
                </div>
                <div>
                  <InfoRow label="手数">第 {REAL.heroIndex + 1} 手</InfoRow>
                  <InfoRow label="行棋方">
                    <span>
                      <StoneDot player={HERO.player} />
                      {HERO.player === 1 ? "黑" : "白"}
                    </span>
                  </InfoRow>
                  <InfoRow label="落点">{coordLabel(HERO.x, HERO.y)}</InfoRow>
                  <InfoRow label="根估值">{HERO_VALUE}</InfoRow>
                  <InfoRow label="终局">
                    {resultText(GAME.result)} · 共 {GAME.moves.length} 手
                  </InfoRow>
                </div>
                <div>
                  <div className="mini-label" style={{ marginBottom: "0.4rem" }}>
                    访问数 TOP5
                  </div>
                  <table
                    className="mono"
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.86rem",
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>落点</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>访问</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>占比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HERO.top.map((t) => (
                        <tr key={t.action}>
                          <td style={tdStyle}>{coordLabel(t.x, t.y)}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            {fmtInt(t.visits)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            {fmtPct(t.prob)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    lineHeight: 1.7,
                    color: "var(--fg-faint)",
                  }}
                >
                  根估值为行棋方视角:<span className="mono">+1</span> 必胜、
                  <span className="mono">−1</span>{" "}
                  必败。访问分布就是这一手的「思考过程」,第三章会把它彻底拆开。
                  列字母沿用围棋惯例,跳过 I(避免与数字 1 混淆)。
                </p>
              </aside>
            </div>
            <figcaption className="figure-cap">
              <span className="cap-no">图 0-1</span>
              <span>
                白棋第 <span className="mono">{REAL.heroIndex + 1}</span>{" "}
                手落在天元 <span className="mono">{coordLabel(HERO.x, HERO.y)}</span>:
                搜索的 <span className="mono">{HERO.top[0].visits}</span>{" "}
                次访问全部指向这一手,朱砂圆点标记本手。局面与数据来自
                data/runs/demo 第 <span className="mono">{GAME.iteration}</span>{" "}
                轮真实对局 <span className="mono">{GAME.id}</span>。
              </span>
            </figcaption>
          </figure>
        </Reveal>
      </div>
      {/* 三枚小卡 */}
      <div className="figure-col" style={{ paddingBottom: "2.2rem" }}>
        <Reveal delay={140}>
          <div className="grid sm:grid-cols-3 gap-4">
            {CARDS.map((c) => (
              <div key={c.no} className="card" style={{ padding: "1.15rem 1.25rem" }}>
                <div className="mono" style={{ fontSize: "0.72rem", color: "var(--accent-deep)", letterSpacing: "0.12em" }}>
                  {c.no}
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.02rem", margin: "0.35rem 0 0.45rem" }}>
                  {c.title}
                </div>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.75, color: "var(--fg-muted)" }}>
                  {c.body}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* 收尾 + CTA */}
      <div className="prose-col prose" style={{ paddingBottom: "1.2rem" }}>
        <Reveal>
          <p>
            刚才那一手,没有任何人教过它。系统只被告知「五个连成一线就算赢」,
            剩下的全是它自己在 <span className="mono">{TOTAL_ITERS}</span> 轮训练、
            <span className="mono">{TOTAL_SAMPLES}</span> 条真实对局样本里摸索出来的。
            这一页就回答一个问题:<strong>它是怎么学会的</strong>。
          </p>
          <p>
            我们从那台发动机开始——网络与搜索互相抬轿的<em>飞轮</em>。
          </p>
        </Reveal>
        <Reveal>
          <div style={{ textAlign: "center", padding: "0.6rem 0 1rem" }}>
            <a className="btn primary" href="#ch-1" style={{ textDecoration: "none" }}>
              开始:飞轮是怎么转起来的 →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
