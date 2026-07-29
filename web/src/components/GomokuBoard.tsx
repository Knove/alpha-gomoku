import { useId, useMemo, useState } from "react"
import type { CSSProperties, PointerEvent } from "react"
import { COL_LETTERS } from "../lib/format"

/**
 * GomokuBoard — hand-drawn SVG board (PLAN.md §7).
 *
 * Wood-toned surface (var(--board)), hairline grid, star points (five on
 * 9x9 / 15x15), radial-gradient stones, cinnabar last-move marker, policy
 * heat layer (accent-opacity discs), top-move dots with probabilities,
 * hover ghost stone when interactive, coordinate labels (hidden when small).
 */

export interface TopMove {
  x: number
  y: number
  prob: number
}

interface GomokuBoardProps {
  /** Board dimension N (9, 15, ...). */
  size: number
  /** Flat N*N array: 0 empty, 1 black, -1 white. */
  board: number[]
  onCellClick?: (x: number, y: number) => void
  /** Flat N*N policy probabilities (0..1), rendered as accent heat discs. */
  heat?: number[]
  lastMove?: { x: number; y: number } | null
  /** Candidate dots with probability labels, drawn on empty points. */
  topMoves?: TopMove[]
  /** Compact rendering: no coordinates, tighter padding. */
  small?: boolean
  /** Stone color of the hover ghost (side to move). Default 1 (black). */
  ghostPlayer?: number
  className?: string
  style?: CSSProperties
}

const VB = 560 // internal viewBox units

function starPoints(n: number): [number, number][] {
  if (n === 15) return [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]
  if (n >= 9 && n % 2 === 1) {
    const e = n <= 9 ? 2 : 3
    const c = (n - 1) / 2
    return [[e, e], [e, n - 1 - e], [n - 1 - e, e], [n - 1 - e, n - 1 - e], [c, c]]
  }
  if (n % 2 === 1) {
    const c = (n - 1) / 2
    return [[c, c]]
  }
  return []
}

export default function GomokuBoard({
  size,
  board,
  onCellClick,
  heat,
  lastMove,
  topMoves,
  small = false,
  ghostPlayer = 1,
  className,
  style,
}: GomokuBoardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const interactive = Boolean(onCellClick)
  const pad = small ? VB * 0.045 : VB * 0.075
  const cell = (VB - 2 * pad) / (size - 1)
  const stoneR = cell * 0.47

  const px = (x: number) => pad + x * cell
  const py = (y: number) => pad + y * cell

  const maxHeat = useMemo(() => {
    if (!heat) return 0
    let m = 0
    for (const h of heat) if (h > m) m = h
    return m
  }, [heat])

  const maxTop = useMemo(() => {
    if (!topMoves || topMoves.length === 0) return 0
    return Math.max(...topMoves.map((t) => t.prob))
  }, [topMoves])

  const locate = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const scale = VB / rect.width
    const mx = (e.clientX - rect.left) * scale
    const my = (e.clientY - rect.top) * scale
    const x = Math.round((mx - pad) / cell)
    const y = Math.round((my - pad) / cell)
    if (x < 0 || x >= size || y < 0 || y >= size) return null
    // require the pointer to be near the intersection
    if (Math.hypot(mx - px(x), my - py(y)) > cell * 0.5) return null
    return { x, y }
  }

  const handleMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive) return
    const c = locate(e)
    if (c && board[c.y * size + c.x] === 0) setHover(c)
    else setHover(null)
  }

  const handleClick = () => {
    if (interactive && hover) onCellClick?.(hover.x, hover.y)
  }

  const stars = starPoints(size)
  const labelFont = Math.max(10, cell * 0.26)

  const stones: { x: number; y: number; v: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = board[y * size + x]
      if (v !== 0) stones.push({ x, y, v })
    }
  }

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
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
      onClick={handleClick}
    >
      <defs>
        <radialGradient id={`${uid}-b`} cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#5c5b56" />
          <stop offset="55%" style={{ stopColor: "var(--stone-b)" }} />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id={`${uid}-w`} cx="40%" cy="35%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="80%" style={{ stopColor: "var(--stone-w)" }} />
          <stop offset="100%" style={{ stopColor: "var(--stone-w-edge)" }} />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={cell * 0.07} />
        </filter>
      </defs>

      {/* wood surface + edge */}
      <rect x={0} y={0} width={VB} height={VB} rx={small ? 8 : 12}
        style={{ fill: "var(--board)" }} />
      <rect x={1.5} y={1.5} width={VB - 3} height={VB - 3} rx={small ? 7 : 11}
        fill="none" style={{ stroke: "var(--board-edge)" }} strokeWidth={2} />

      {/* grid */}
      <g style={{ stroke: "var(--board-line)" }} strokeWidth={1.1} opacity={0.85}>
        {Array.from({ length: size }, (_, i) => (
          <line key={`v${i}`} x1={px(i)} y1={pad} x2={px(i)} y2={VB - pad} />
        ))}
        {Array.from({ length: size }, (_, j) => (
          <line key={`h${j}`} x1={pad} y1={py(j)} x2={VB - pad} y2={py(j)} />
        ))}
      </g>

      {/* star points */}
      <g style={{ fill: "var(--board-line)" }}>
        {stars.map(([sx, sy]) => (
          <circle key={`${sx}-${sy}`} cx={px(sx)} cy={py(sy)}
            r={Math.max(2.4, cell * 0.09)} />
        ))}
      </g>

      {/* coordinates */}
      {!small && (
        <g style={{ fill: "var(--fg-faint)" }} fontSize={labelFont}
          fontFamily="ui-monospace, SF Mono, Menlo, monospace"
          textAnchor="middle">
          {Array.from({ length: size }, (_, i) => (
            <text key={`c${i}`} x={px(i)} y={VB - pad * 0.38}
              dominantBaseline="middle">
              {COL_LETTERS[i]}
            </text>
          ))}
          {Array.from({ length: size }, (_, j) => (
            <text key={`r${j}`} x={pad * 0.42} y={py(j)}
              dominantBaseline="middle">
              {j + 1}
            </text>
          ))}
        </g>
      )}

      {/* policy heat layer (accent discs, opacity ∝ probability) */}
      {heat && maxHeat > 0 && (
        <g>
          {heat.map((h, i) => {
            if (h <= 0.005 || board[i] !== 0) return null
            const x = i % size
            const y = Math.floor(i / size)
            const wn = h / maxHeat
            const r = stoneR * (0.5 + 0.5 * wn)
            return (
              <circle key={i} cx={px(x)} cy={py(y)} r={r}
                style={{ fill: "var(--heat)" }}
                opacity={0.08 + wn * 0.6} />
            )
          })}
        </g>
      )}

      {/* top-move candidate dots + probability labels */}
      {topMoves && topMoves.length > 0 && maxTop > 0 && (
        <g>
          {topMoves.map((t, i) => {
            if (board[t.y * size + t.x] !== 0) return null
            const wn = t.prob / maxTop
            const cx = px(t.x)
            const cy = py(t.y)
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={stoneR * (0.2 + 0.34 * wn)}
                  style={{ fill: "var(--heat)" }} opacity={0.28 + 0.6 * wn} />
                <text x={cx} y={cy + stoneR * 0.62} textAnchor="middle"
                  fontSize={Math.max(9, cell * (small ? 0.3 : 0.24))}
                  fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                  fontWeight={600}
                  style={{ fill: "var(--accent-deep)" }}>
                  {Math.round(t.prob * 100)}
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* hover ghost stone */}
      {interactive && hover && (
        <circle cx={px(hover.x)} cy={py(hover.y)} r={stoneR}
          style={{
            fill: ghostPlayer === 1 ? "var(--stone-b)" : "var(--stone-w)",
            stroke: ghostPlayer === 1 ? "none" : "var(--stone-w-edge)",
          }}
          opacity={0.42} />
      )}

      {/* stone shadows (single blurred group) */}
      {stones.length > 0 && (
        <g filter={`url(#${uid}-soft)`} opacity={0.3}>
          {stones.map((s) => (
            <circle key={`sh-${s.x}-${s.y}`}
              cx={px(s.x) + stoneR * 0.06} cy={py(s.y) + stoneR * 0.12}
              r={stoneR} fill="#14100a" />
          ))}
        </g>
      )}

      {/* stones */}
      {stones.map((s) => (
        <g key={`${s.x}-${s.y}`}>
          <circle cx={px(s.x)} cy={py(s.y)} r={stoneR}
            fill={s.v === 1 ? `url(#${uid}-b)` : `url(#${uid}-w)`}
            style={s.v === -1 ? { stroke: "var(--stone-w-edge)" } : undefined}
            strokeWidth={s.v === -1 ? 1 : 0} />
          {lastMove && lastMove.x === s.x && lastMove.y === s.y && (
            <circle cx={px(s.x)} cy={py(s.y)} r={stoneR * 0.26}
              style={{ fill: "var(--accent)" }} />
          )}
        </g>
      ))}
    </svg>
  )
}
