import { coordLabel, fmtPct } from "../lib/format"

/**
 * TopMoves — ranked candidate list (PLAN.md §7): coordinate chip,
 * accent probability bar, mono percentage, optional visit count.
 */
export interface TopMoveRow {
  x: number
  y: number
  prob: number
  visits?: number
}

interface TopMovesProps {
  moves: TopMoveRow[]
  title?: string
}

export default function TopMoves({ moves, title }: TopMovesProps) {
  const max = moves.length ? Math.max(...moves.map((m) => m.prob)) : 1
  return (
    <div>
      {title && (
        <div className="mini-label" style={{ marginBottom: 8 }}>
          {title}
        </div>
      )}
      {moves.length === 0 ? (
        <div style={{ color: "var(--fg-faint)", fontSize: "0.85rem" }}>
          暂无候选
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 7 }}>
          {moves.map((m, i) => (
            <div key={i} className="flex items-center" style={{ gap: 10 }}>
              <span
                className="mono"
                style={{
                  width: "1.2rem",
                  textAlign: "right",
                  color: "var(--fg-faint)",
                  fontSize: "0.75rem",
                  flex: "none",
                }}
              >
                {i + 1}
              </span>
              <span className="chip" style={{ flex: "none" }}>
                {coordLabel(m.x, m.y)}
              </span>
              <div className="prob-track">
                <div
                  className="prob-fill"
                  style={{ width: `${(m.prob / max) * 100}%` }}
                />
              </div>
              <span
                className="mono"
                style={{
                  width: "3.4rem",
                  textAlign: "right",
                  fontSize: "0.8rem",
                  flex: "none",
                }}
              >
                {fmtPct(m.prob)}
              </span>
              {m.visits != null && (
                <span
                  className="mono"
                  style={{
                    width: "3rem",
                    textAlign: "right",
                    fontSize: "0.72rem",
                    color: "var(--fg-faint)",
                    flex: "none",
                  }}
                >
                  {m.visits}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
