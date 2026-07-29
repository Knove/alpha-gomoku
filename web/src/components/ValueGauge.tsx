import { fmtPct } from "../lib/format"

/**
 * ValueGauge — 胜率天平 (PLAN.md §7).
 * Horizontal split bar: black stone gradient on the left, white on the
 * right, cinnabar tick at 50%. `blackRate` is P(black wins) in 0..1.
 */
interface ValueGaugeProps {
  blackRate: number | null
  label?: string
}

export default function ValueGauge({ blackRate, label }: ValueGaugeProps) {
  const p = blackRate == null ? null : Math.min(1, Math.max(0, blackRate))
  return (
    <div>
      {label && (
        <div className="mini-label" style={{ marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div className="gauge">
        {p != null && (
          <div className="g-black" style={{ width: `${p * 100}%` }} />
        )}
        <div className="g-white" />
        <div className="g-mid" />
      </div>
      <div
        className="mono flex justify-between"
        style={{ fontSize: "0.75rem", marginTop: 5, color: "var(--fg-muted)" }}
      >
        <span>黑 {p == null ? "—" : fmtPct(p, 0)}</span>
        <span>白 {p == null ? "—" : fmtPct(1 - p, 0)}</span>
      </div>
    </div>
  )
}

/** Root value (-1..1, side-to-move perspective) -> P(black wins). */
export function valueToBlackRate(value: number, sideToMove: number): number {
  const rate = (value + 1) / 2
  return sideToMove === 1 ? rate : 1 - rate
}
