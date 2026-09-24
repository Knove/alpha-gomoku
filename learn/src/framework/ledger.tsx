import type { ReactNode } from "react"
import { FidelityBadge } from "./evidence"

/** 真实项目对证区：可折叠只为控制页面长度，内容仍属于章节必修与考核。 */
export function Ledger({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="account-book mt-4" open>
      <summary>
        <FidelityBadge kind="runtime-exact" />
        <span>对证 · {title}</span>
      </summary>
      <div className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
        {children}
      </div>
    </details>
  )
}
