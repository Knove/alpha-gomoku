import type { ReactNode } from "react"

/**
 * StatCard — mini-label + big mono value + optional sub-line (PLAN.md §7).
 */
interface StatCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
}

export default function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div className="card" style={{ padding: "0.9rem 1.1rem" }}>
      <div className="mini-label">{label}</div>
      <div
        className="stat-big"
        style={{
          fontSize: "1.55rem",
          marginTop: 6,
          color: accent ? "var(--accent-deep)" : "var(--fg)",
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          style={{
            marginTop: 5,
            fontSize: "0.78rem",
            color: "var(--fg-faint)",
            lineHeight: 1.5,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
