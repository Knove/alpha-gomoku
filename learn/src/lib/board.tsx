import { useId, useState } from "react"
import type { CSSProperties } from "react"

/** 9×9 SVG 棋盘(移植自 explainer 的 GomokuBoard,改数值坐标轴):
 *  - board: 81 长的扁平整型数组，0 空 / 1 黑 / -1 白，下标 = y*9+x;
 *  - swap: 视角换色(白方视角时黑白互换渲染，双图层交叉淡化);
 *  - marks: 判胜计数演示用的高亮环(anchor 为落点锚);
 *  - heat: 81 长的分布(访问分布 π 或策略头概率 P，由调用方给)，朱砂热度圆盘。 */
export interface BoardMark {
  x: number
  y: number
  anchor?: boolean
}

interface BoardProps {
  board: number[]
  onCellClick?: (x: number, y: number) => void
  lastMove?: { x: number; y: number } | null
  heat?: number[]
  swap?: boolean
  marks?: BoardMark[]
  ghostPlayer?: number
  className?: string
  style?: CSSProperties
}

const N = 9
const VB = 560
const PAD = VB * 0.075
const CELL = (VB - 2 * PAD) / (N - 1)
const R = CELL * 0.47
const px = (x: number) => PAD + x * CELL
const py = (y: number) => PAD + y * CELL

const STARS: [number, number][] = [
  [2, 2],
  [2, 6],
  [6, 2],
  [6, 6],
  [4, 4],
]

export default function Board({
  board,
  onCellClick,
  lastMove,
  heat,
  swap = false,
  marks,
  ghostPlayer = 1,
  className,
  style,
}: BoardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const interactive = Boolean(onCellClick)

  const maxHeat = heat ? Math.max(...heat) : 0

  const locate = (e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = VB / rect.width
    const mx = (e.clientX - rect.left) * scale
    const my = (e.clientY - rect.top) * scale
    const x = Math.round((mx - PAD) / CELL)
    const y = Math.round((my - PAD) / CELL)
    if (x < 0 || x >= N || y < 0 || y >= N) return null
    if (Math.hypot(mx - px(x), my - py(y)) > CELL * 0.5) return null
    return { x, y }
  }

  const stones: { x: number; y: number; v: number }[] = []
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = board[y * N + x]
      if (v !== 0) stones.push({ x, y, v })
    }

  const labelFont = Math.max(10, CELL * 0.26)
  const fade = { transition: "opacity 420ms ease" }

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className={className}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        cursor: interactive ? "pointer" : "default",
        touchAction: "manipulation",
        ...style,
      }}
      role="img"
      aria-label="五子棋棋盘"
      onPointerMove={(e) => {
        if (!interactive) return
        const c = locate(e)
        setHover(c && board[c.y * N + c.x] === 0 ? c : null)
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        // 从点击事件本身定位，不依赖 hover : 触屏点按可能不触发 pointermove
        const c = interactive ? locate(e) : null
        const cell = c && board[c.y * N + c.x] === 0 ? c : hover
        if (cell) onCellClick?.(cell.x, cell.y)
      }}
    >
      <defs>
        <radialGradient id={`${uid}-b`} cx="38%" cy="34%" r="75%">
          <stop offset="0%" style={{ stopColor: "var(--stone-b-hi)" }} />
          <stop offset="55%" style={{ stopColor: "var(--stone-b)" }} />
          <stop offset="100%" style={{ stopColor: "var(--stone-b-lo)" }} />
        </radialGradient>
        <radialGradient id={`${uid}-w`} cx="40%" cy="35%" r="78%">
          <stop offset="0%" style={{ stopColor: "var(--stone-w-hi)" }} />
          <stop offset="80%" style={{ stopColor: "var(--stone-w)" }} />
          <stop offset="100%" style={{ stopColor: "var(--stone-w-edge)" }} />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={CELL * 0.07} />
        </filter>
      </defs>

      <rect x={0} y={0} width={VB} height={VB} rx={12} style={{ fill: "var(--board)" }} />
      <rect x={1.5} y={1.5} width={VB - 3} height={VB - 3} rx={11} fill="none"
        style={{ stroke: "var(--board-edge)" }} strokeWidth={2} />

      <g style={{ stroke: "var(--board-line)" }} strokeWidth={1.1} opacity={0.85}>
        {Array.from({ length: N }, (_, i) => (
          <line key={`v${i}`} x1={px(i)} y1={PAD} x2={px(i)} y2={VB - PAD} />
        ))}
        {Array.from({ length: N }, (_, j) => (
          <line key={`h${j}`} x1={PAD} y1={py(j)} x2={VB - PAD} y2={py(j)} />
        ))}
      </g>

      <g style={{ fill: "var(--board-line)" }}>
        {STARS.map(([sx, sy]) => (
          <circle key={`${sx}-${sy}`} cx={px(sx)} cy={py(sy)} r={Math.max(2.4, CELL * 0.09)} />
        ))}
      </g>

      {/* 数值坐标轴：x 向右(底部)、y 向下(左侧),与 action = y×9+x 同口径 */}
      <g style={{ fill: "var(--board-coord)" }} fontSize={labelFont}
        fontFamily="ui-monospace, SF Mono, Menlo, monospace" textAnchor="middle">
        {Array.from({ length: N }, (_, i) => (
          <text key={`cx${i}`} x={px(i)} y={VB - PAD * 0.38} dominantBaseline="middle">
            {i}
          </text>
        ))}
        {Array.from({ length: N }, (_, j) => (
          <text key={`ry${j}`} x={PAD * 0.42} y={py(j)} dominantBaseline="middle">
            {j}
          </text>
        ))}
      </g>

      {heat && maxHeat > 0 && (
        <g>
          {heat.map((h, i) => {
            if (h <= 0.005 || board[i] !== 0) return null
            const wn = h / maxHeat
            return (
              <circle key={i} cx={px(i % N)} cy={py(Math.floor(i / N))}
                r={R * (0.5 + 0.5 * wn)} style={{ fill: "var(--heat)" }}
                opacity={0.08 + wn * 0.6} />
            )
          })}
        </g>
      )}

      {interactive && hover && (
        <circle cx={px(hover.x)} cy={py(hover.y)} r={R}
          style={{
            fill: ghostPlayer === 1 ? "var(--stone-b)" : "var(--stone-w)",
            stroke: ghostPlayer === 1 ? "none" : "var(--stone-w-edge)",
          }}
          opacity={0.42} />
      )}

      {stones.length > 0 && (
        <g filter={`url(#${uid}-soft)`} opacity={0.3}>
          {stones.map((s) => (
            <circle key={`sh-${s.x}-${s.y}`} cx={px(s.x) + R * 0.06} cy={py(s.y) + R * 0.12}
              r={R} style={{ fill: "var(--stone-shadow)" }} />
          ))}
        </g>
      )}

      {stones.map((s) => {
        // 双图层：swap 切换时黑白交叉淡化(视角换色动画)
        const shown = swap ? -s.v : s.v
        return (
          <g key={`${s.x}-${s.y}`}>
            <circle cx={px(s.x)} cy={py(s.y)} r={R} fill={`url(#${uid}-b)`}
              opacity={shown === 1 ? 1 : 0} style={fade} />
            <circle cx={px(s.x)} cy={py(s.y)} r={R} fill={`url(#${uid}-w)`}
              stroke="var(--stone-w-edge)" strokeWidth={1}
              opacity={shown === -1 ? 1 : 0} style={fade} />
            {lastMove && lastMove.x === s.x && lastMove.y === s.y && (
              <circle cx={px(s.x)} cy={py(s.y)} r={R * 0.26} style={{ fill: "var(--accent)" }} />
            )}
          </g>
        )
      })}

      {marks && marks.length > 0 && (
        <g>
          {marks.map((m, i) => (
            <circle key={`mk-${i}`} cx={px(m.x)} cy={py(m.y)}
              r={R * (m.anchor ? 1.28 : 1.14)} fill="none"
              style={{ stroke: "var(--accent)" }} strokeWidth={m.anchor ? 5 : 3}
              opacity={0.95} />
          ))}
        </g>
      )}
    </svg>
  )
}
