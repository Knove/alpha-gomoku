/** 第贰章:棋盘,与「轮到谁下」的视角。
 *  散文:9×9 的 0/1/-1 数组、action = y*9+x、四方向胜负、canonical_board。
 *  图 2-1:客观视角 ↔ 行棋方视角(白),棋子双图层交叉淡化,数值方阵同步。
 *  图 2-2:encode(game) 的 (3,9,9) 三张输入平面,同坐标悬停联动。
 *  两图均为内联构造的教学示意局面(5 黑 4 白共 9 手,轮到白棋)。 */
import { useEffect, useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"

const N = 9
const CELLS = N * N

/* 教学示意:内联定义的中盘局面(5 黑 4 白,共 9 手,轮到白棋)。 */
const DEMO: readonly { x: number; y: number; v: number }[] = [
  { x: 4, y: 4, v: 1 },
  { x: 5, y: 4, v: -1 },
  { x: 3, y: 4, v: 1 },
  { x: 4, y: 3, v: -1 },
  { x: 4, y: 5, v: 1 },
  { x: 5, y: 3, v: -1 },
  { x: 2, y: 4, v: 1 },
  { x: 6, y: 4, v: -1 },
  { x: 3, y: 5, v: 1 },
]

const OBJECTIVE: readonly number[] = (() => {
  const b = new Array<number>(CELLS).fill(0)
  for (const s of DEMO) b[s.y * N + s.x] = s.v
  return b
})()

/** 轮到白棋:canonical = board * (-1),己方(白)恒为 +1。 */
const CANON: readonly number[] = OBJECTIVE.map((v) => -v)
const PLANE_OWN: readonly number[] = CANON.map((v) => (v === 1 ? 1 : 0))
const PLANE_OPP: readonly number[] = CANON.map((v) => (v === -1 ? 1 : 0))
const PLANE_COLOR: readonly number[] = new Array<number>(CELLS).fill(0)

const STAR: readonly (readonly [number, number])[] = [
  [2, 2],
  [2, 6],
  [6, 2],
  [6, 6],
  [4, 4],
]

/* 示意棋盘几何(与 GomokuBoard 同口径)。 */
const B_VB = 560
const B_PAD = B_VB * 0.075
const B_CELL = (B_VB - 2 * B_PAD) / (N - 1)
const B_SR = B_CELL * 0.47
const bpx = (x: number) => B_PAD + x * B_CELL
const bpy = (y: number) => B_PAD + y * B_CELL

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

/* 9×9 mono 数值方阵:每格双图层 span 交叉淡化,与棋子同节奏(460ms)。 */
function NumMatrix({ canon, reduced }: { canon: boolean; reduced: boolean }) {
  const fade = reduced ? "none" : "opacity 460ms ease"
  const cell = "1.85rem"
  const text = (v: number) => (v === 0 ? "·" : String(v))
  const colorFor = (v: number, own: boolean) =>
    v === 1
      ? own
        ? "var(--accent-deep)"
        : "var(--fg)"
      : v === -1
        ? "var(--fg-muted)"
        : "var(--fg-faint)"
  return (
    <div>
      <div style={{ display: "flex" }}>
        <span style={{ width: "1.15rem", flex: "none" }} />
        {Array.from({ length: N }, (_, x) => (
          <span
            key={x}
            className="mono"
            style={{
              width: cell,
              flex: "none",
              textAlign: "center",
              fontSize: "0.66rem",
              lineHeight: "1.1rem",
              color: "var(--fg-faint)",
            }}
          >
            {x}
          </span>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: "1.15rem", flex: "none" }}>
          {Array.from({ length: N }, (_, y) => (
            <span
              key={y}
              className="mono"
              style={{
                display: "block",
                height: cell,
                lineHeight: cell,
                textAlign: "center",
                fontSize: "0.66rem",
                color: "var(--fg-faint)",
              }}
            >
              {y}
            </span>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${N}, ${cell})`,
            borderRight: "1px solid var(--hairline)",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          {OBJECTIVE.map((v, i) => {
            const cv = -v
            const base = {
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              transition: fade,
            } as const
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: cell,
                  height: cell,
                  boxSizing: "border-box",
                  borderTop: "1px solid var(--hairline)",
                  borderLeft: "1px solid var(--hairline)",
                  background: v !== 0 ? "var(--card)" : "transparent",
                }}
              >
                <span
                  className="mono"
                  style={{
                    ...base,
                    opacity: canon ? 0 : 1,
                    color: colorFor(v, false),
                    fontWeight: v === 1 ? 650 : 400,
                  }}
                >
                  {text(v)}
                </span>
                <span
                  className="mono"
                  style={{
                    ...base,
                    opacity: canon ? 1 : 0,
                    color: colorFor(cv, true),
                    fontWeight: cv === 1 ? 700 : 400,
                  }}
                >
                  {text(cv)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
/* 图 2-1:客观视角 ↔ 行棋方视角(白)。棋子双图层交叉淡化,与数值方阵同节奏。 */
function PerspectiveFigure() {
  const reduced = useReducedMotion()
  const [canon, setCanon] = useState(false)
  const fade = reduced ? "none" : "opacity 460ms ease"

  const stoneLayer = (sign: 1 | -1, visible: boolean, keyPrefix: string) => (
    <g style={{ transition: fade, opacity: visible ? 1 : 0 }}>
      {DEMO.map((s, i) => {
        const v = s.v * sign
        return (
          <circle
            key={`${keyPrefix}${i}`}
            cx={bpx(s.x)}
            cy={bpy(s.y)}
            r={B_SR}
            style={{
              fill: v === 1 ? "var(--stone-b)" : "var(--stone-w)",
              stroke: v === 1 ? "none" : "var(--stone-w-edge)",
            }}
            strokeWidth={1}
          />
        )
      })}
    </g>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center" style={{ gap: "0.8rem", padding: "1rem 1.25rem", borderBottom: "1px solid var(--hairline)" }}>
        <div className="seg" role="group" aria-label="视角切换">
          <button type="button" className={`seg-btn${canon ? "" : " active"}`} aria-pressed={!canon} onClick={() => setCanon(false)}>
            客观视角
          </button>
          <button type="button" className={`seg-btn${canon ? " active" : ""}`} aria-pressed={canon} onClick={() => setCanon(true)}>
            行棋方视角(白)
          </button>
        </div>
        <span className="mini-label">
          {canon ? "网络眼里:深色一律是「己方」,值 +1" : "人眼里:黑是黑,白是白"}
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 0 }}>
        <div style={{ padding: "1.1rem", borderRight: "1px solid var(--hairline)" }}>
          <svg viewBox={`0 0 ${B_VB} ${B_VB}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="视角切换棋盘">
            <rect x={0} y={0} width={B_VB} height={B_VB} rx={12} style={{ fill: "var(--board)" }} />
            <g style={{ stroke: "var(--board-line)" }} strokeWidth={1.1} opacity={0.85}>
              {Array.from({ length: N }, (_, i) => (
                <line key={`v${i}`} x1={bpx(i)} y1={B_PAD} x2={bpx(i)} y2={B_VB - B_PAD} />
              ))}
              {Array.from({ length: N }, (_, j) => (
                <line key={`h${j}`} x1={B_PAD} y1={bpy(j)} x2={B_VB - B_PAD} y2={bpy(j)} />
              ))}
            </g>
            <g style={{ fill: "var(--board-line)" }}>
              {STAR.map(([sx, sy]) => (
                <circle key={`${sx}-${sy}`} cx={bpx(sx)} cy={bpy(sy)} r={Math.max(2.4, B_CELL * 0.09)} />
              ))}
            </g>
            {stoneLayer(1, !canon, "obj")}
            {stoneLayer(-1, canon, "can")}
          </svg>
          <div className="mini-label" style={{ marginTop: 8, textAlign: "center" }}>
            同一局棋,两种表示 · 教学示意局面
          </div>
        </div>
        <div style={{ padding: "1.1rem 1.25rem", overflowX: "auto" }}>
          <div className="mini-label" style={{ marginBottom: 8 }}>
            数组表示(canonical_board = board × 行棋方)
          </div>
          <NumMatrix canon={canon} reduced={reduced} />
          <div className="mini-label" style={{ marginTop: 10 }}>
            {canon
              ? "轮到白棋:全部乘 −1,白棋(己方)变 +1(朱砂加粗)"
              : "原始数组:黑 = 1,白 = −1,空 = ·"}
          </div>
        </div>
      </div>
    </div>
  )
}

/* 图 2-2:encode(game) 的三张输入平面,同坐标悬停联动(触屏可点按钉住)。 */
function PlanesFigure() {
  const [hover, setHover] = useState<number | null>(null)
  const [pin, setPin] = useState<number | null>(null)
  const active = hover ?? pin
  const planes: { name: string; data: readonly number[]; fill: string; note: string }[] = [
    { name: "平面 0 · 己方子", data: PLANE_OWN, fill: "var(--fg)", note: "白棋(行棋方)的位置" },
    { name: "平面 1 · 对方子", data: PLANE_OPP, fill: "var(--accent)", note: "黑棋(对手)的位置" },
    { name: "平面 2 · 颜色面", data: PLANE_COLOR, fill: "var(--fg-faint)", note: "白方行棋 → 全 0(黑方则全 1)" },
  ]
  const CS = 26 // cell size px

  return (
    <div style={{ padding: "1.1rem 1.25rem" }}>
      <div className="flex flex-wrap justify-center" style={{ gap: "1.6rem" }}>
        {planes.map((pl) => (
          <div key={pl.name} style={{ textAlign: "center" }}>
            <div className="mini-label" style={{ marginBottom: 8 }}>{pl.name}</div>
            <svg
              width={CS * N}
              height={CS * N}
              style={{ display: "block", borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--card-sunken)" }}
              role="img"
              aria-label={pl.name}
            >
              {pl.data.map((v, i) => {
                const x = i % N, y = Math.floor(i / N)
                const hovered = active === i
                return (
                  <rect
                    key={i}
                    x={x * CS + 0.5}
                    y={y * CS + 0.5}
                    width={CS - 1}
                    height={CS - 1}
                    rx={3}
                    style={{
                      fill: v === 1 ? pl.fill : hovered ? "var(--accent-wash-2)" : "transparent",
                      stroke: hovered ? "var(--accent)" : "var(--hairline)",
                    }}
                    strokeWidth={hovered ? 1.6 : 0.6}
                    opacity={v === 1 ? (hovered ? 1 : 0.9) : 1}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => setPin(pin === i ? null : i)}
                  />
                )
              })}
            </svg>
            <div style={{ fontSize: "0.78rem", color: "var(--fg-faint)", marginTop: 6 }}>{pl.note}</div>
          </div>
        ))}
      </div>
      <div className="mini-label" style={{ marginTop: 12, textAlign: "center" }}>
        悬停或点按任意格,三张平面的同坐标格同步高亮 · 网络一次前向,吃的就是这样的 (3, 9, 9)
      </div>
    </div>
  )
}

/* ====================================================== chapter */

export default function Ch2() {
  return (
    <section id="ch-2">
      <div className="prose-col">
        <ChapterHeader no="贰" eyebrow="CANONICAL VIEW" title="棋盘,与「轮到谁下」的视角" />
      </div>

      <div className="prose-col prose">
        <Reveal>
          <p>
            先说最朴素的表示:棋盘就是一个 9×9 的数组,<strong>0 空、1 黑、−1 白</strong>;
            一个「动作」就是一个整数 <em>a = y × 9 + x</em>,于是 81 个格子就是 81 个动作——
            这个数目要记住,待会儿网络策略头的输出正好就是 81 个数。
            胜负判定也极简:只看<strong>最后一手</strong>往四个方向数,够不够 5 连。
          </p>
          <p>
            真正重要的是一个视角技巧。同一句「该堵活三了」,黑棋适用,白棋也适用——
            如果让网络分别学「黑方怎么办、白方怎么办」,同样的棋理要学两遍。
            AlphaZero 的做法是 <strong>canonical_board</strong>:把任意局面乘以当前行棋方,
            于是网络永远只看见「<em>我</em>的子(+1)和<em>对手</em>的子(−1)」。
            黑白两套棋理,塌缩成一套;同一个网络,也才能左手跟右手下棋。
            这条「当前行棋方视角」的约定会贯穿本页始终。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <PerspectiveFigure />
            <div className="figure-cap">
              <span className="cap-no">图 2-1</span>
              <span>
                同一局棋的两种表示。切换到「行棋方视角(白)」,黑白子全部互换:
                对网络来说,「己方」永远是同一种颜色、同一个符号 +1。
              </span>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="prose-col prose" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <p>
            视角定好后,一个局面怎么送进网络?不是一行数组,而是<strong>三张 9×9 的平面</strong>:
            第一张标出己方的子在哪些格子,第二张标出对方的子,
            第三张是「颜色面」——黑方行棋全填 1,白方行棋全填 0(给网络一个「谁该走」的上下文)。
            三张叠在一起,形状 (3, 9, 9),这就是 <em>encode(game)</em> 的全部输出,
            也是下一章那个网络的真正输入。
          </p>
        </Reveal>
      </div>

      <div className="figure-col">
        <Reveal>
          <div className="figure">
            <PlanesFigure />
            <div className="figure-cap">
              <span className="cap-no">图 2-2</span>
              <span>
                同一局面(行棋方为白)的三张输入平面。它们只含 0 和 1,
                却已经足够网络推断「我有哪些棋形、对手有哪些威胁」。
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

