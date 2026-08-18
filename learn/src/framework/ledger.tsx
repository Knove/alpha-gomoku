import type { ReactNode } from "react"

/** 对账折叠区:细节记账,默认收起,不挡主线。 */
export function Ledger({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="account-book mt-4">
      <summary>对账 · {title}</summary>
      <div className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
        {children}
      </div>
    </details>
  )
}
