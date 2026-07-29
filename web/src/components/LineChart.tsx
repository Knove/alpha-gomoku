import { useEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent } from "react"

/**
 * LineChart — hand-drawn SVG multi-series line chart (PLAN.md §7).
 * No chart library: equal scaling across series, dashed grid, axis ticks,
 * hover crosshair with mono-number tooltip, clickable legend to toggle
 * series, adaptive y-axis (or fixed via yMin/yMax).
 */

export interface ChartSeries {
  key: string
  label: string
  color?: string
  dashed?: boolean
  points: { x: number; y: number }[]
}

interface LineChartProps {
  series: ChartSeries[]
  height?: number
  formatX?: (v: number) => string
  formatY?: (v: number) => string
  yMin?: number
  yMax?: number
}

const DEFAULT_COLORS = [
  "var(--accent)",
  "var(--fg-muted)",
  "var(--fg-faint)",
  "var(--accent-deep)",
]

/** "Nice" tick step (1/2/2.5/5 × 10^k). */
function niceStep(span: number, target: number): number {
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 2.5) return 2.5 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

function ticks(min: number, max: number, target: number): number[] {
  if (!(max > min)) return [min]
  const step = niceStep(max - min, target)
  const out: number[] = []
  const start = Math.ceil(min / step) * step
  for (let v = start; v <= max + step * 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)))
  }
  return out
}

export default function LineChart({
  series,
  height = 220,
  formatX = (v) => String(v),
  formatY = (v) => String(Number(v.toPrecision(4))),
  yMin: yMinProp,
  yMax: yMaxProp,
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hoverX, setHoverX] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && Math.abs(w - width) > 1) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(
    () => series.filter((s) => !hidden.has(s.key) && s.points.length > 0),
    [series, hidden],
  )

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xMin = Infinity
    let xMax = -Infinity
    let yMin = Infinity
    let yMax = -Infinity
    for (const s of visible) {
      for (const p of s.points) {
        if (p.x < xMin) xMin = p.x
        if (p.x > xMax) xMax = p.x
        if (p.y < yMin) yMin = p.y
        if (p.y > yMax) yMax = p.y
      }
    }
    if (!Number.isFinite(xMin)) {
      xMin = 0; xMax = 1; yMin = 0; yMax = 1
    }
    if (xMax === xMin) { xMin -= 1; xMax += 1 }
    if (yMinProp !== undefined) yMin = yMinProp
    if (yMaxProp !== undefined) yMax = yMaxProp
    if (yMinProp === undefined || yMaxProp === undefined) {
      const padSpan = yMax > yMin ? (yMax - yMin) * 0.08 : Math.abs(yMax || 1) * 0.1
      if (yMinProp === undefined) yMin -= padSpan
      if (yMaxProp === undefined) yMax += padSpan
    }
    if (yMax === yMin) { yMin -= 1; yMax += 1 }
    return { xMin, xMax, yMin, yMax }
  }, [visible, yMinProp, yMaxProp])

  const ml = 46
  const mr = 14
  const mt = 12
  const mb = 26
  const iw = Math.max(10, width - ml - mr)
  const ih = Math.max(10, height - mt - mb)

  const sx = (x: number) => ml + ((x - xMin) / (xMax - xMin)) * iw
  const sy = (y: number) => mt + (1 - (y - yMin) / (yMax - yMin)) * ih

  const yTicks = ticks(yMin, yMax, 4)
  const xTicks = ticks(xMin, xMax, Math.max(3, Math.floor(width / 110)))

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Snap hover to the nearest data x among visible series.
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const dataX = xMin + ((mx - ml) / iw) * (xMax - xMin)
    let best: number | null = null
    let bestDist = Infinity
    for (const s of visible) {
      for (const p of s.points) {
        const d = Math.abs(p.x - dataX)
        if (d < bestDist) {
          bestDist = d
          best = p.x
        }
      }
    }
    setHoverX(best)
  }

  const hoverRows = useMemo(() => {
    if (hoverX == null) return []
    return visible
      .map((s) => {
        let p: { x: number; y: number } | null = null
        let d = Infinity
        for (const q of s.points) {
          const dist = Math.abs(q.x - hoverX)
          if (dist < d) {
            d = dist
            p = q
          }
        }
        return p ? { series: s, point: p } : null
      })
      .filter((r): r is { series: ChartSeries; point: { x: number; y: number } } => r !== null)
  }, [hoverX, visible])

  const empty = visible.length === 0

  return (
    <div ref={wrapRef} className="relative" style={{ width: "100%" }}>
      {/* legend */}
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
        {series.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`legend-btn${hidden.has(s.key) ? " off" : ""}`}
            onClick={() => toggle(s.key)}
          >
            <span
              className="l-dot"
              style={{ background: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
            />
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg
          width={width}
          height={height}
          style={{ display: "block" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverX(null)}
        >
          {/* horizontal grid + y labels */}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line
                x1={ml} x2={width - mr} y1={sy(t)} y2={sy(t)}
                style={{ stroke: "var(--hairline-strong)" }}
                strokeWidth={1} strokeDasharray="3 5" opacity={0.7}
              />
              <text
                x={ml - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: "var(--fg-faint)" }}
              >
                {formatY(t)}
              </text>
            </g>
          ))}

          {/* x labels */}
          {xTicks.map((t) => (
            <text
              key={`x${t}`} x={sx(t)} y={height - 8} textAnchor="middle"
              fontSize={10} fontFamily="ui-monospace, SF Mono, Menlo, monospace"
              style={{ fill: "var(--fg-faint)" }}
            >
              {formatX(t)}
            </text>
          ))}

          {/* plot-area frame (hairline baseline) */}
          <line
            x1={ml} x2={width - mr} y1={height - mb} y2={height - mb}
            style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1}
          />

          {empty && (
            <text
              x={ml + iw / 2} y={mt + ih / 2} textAnchor="middle"
              fontSize={13} style={{ fill: "var(--fg-faint)" }}
            >
              暂无数据
            </text>
          )}

          {/* series */}
          {visible.map((s, i) => {
            const color = s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
            const path = s.points
              .map((p, j) => `${j === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`)
              .join(" ")
            return (
              <g key={s.key}>
                <path
                  d={path} fill="none" stroke={color} strokeWidth={1.8}
                  strokeDasharray={s.dashed ? "5 5" : undefined}
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {s.points.length <= 80 &&
                  s.points.map((p, j) => (
                    <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={2.4} fill={color} />
                  ))}
              </g>
            )
          })}

          {/* hover crosshair */}
          {hoverX != null && (
            <g pointerEvents="none">
              <line
                x1={sx(hoverX)} x2={sx(hoverX)} y1={mt} y2={height - mb}
                style={{ stroke: "var(--fg-faint)" }} strokeWidth={1}
                strokeDasharray="2 4"
              />
              {hoverRows.map(({ series: s, point }, i) => (
                <circle
                  key={s.key} cx={sx(point.x)} cy={sy(point.y)} r={4}
                  fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  style={{ stroke: "var(--card)" }} strokeWidth={1.5}
                />
              ))}
            </g>
          )}
        </svg>

        {/* tooltip */}
        {hoverX != null && hoverRows.length > 0 && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(Math.max(sx(hoverX), 70), width - 70),
              top: mt + 4,
            }}
          >
            <div style={{ opacity: 0.65, marginBottom: 2 }}>{formatX(hoverX)}</div>
            {hoverRows.map(({ series: s, point }, i) => (
              <div className="tip-row" key={s.key}>
                <span
                  className="tip-dot"
                  style={{ background: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
                />
                <span style={{ opacity: 0.75 }}>{s.label}</span>
                <span style={{ marginLeft: "auto", paddingLeft: 12 }}>
                  {formatY(point.y)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
