import type { ReactNode } from "react"
import type { FidelityKind } from "./curriculum"

const FIDELITY_LABELS: Record<FidelityKind, string> = {
  "runtime-exact": "真实记录",
  "mirror-exact": "契约复现",
  recomputed: "重新计算",
  constructed: "教学构造",
  adapted: "浏览器适配",
  drift: "契约待修",
}

export function FidelityBadge({ kind }: { kind: FidelityKind }) {
  return <span className={`fidelity-badge fidelity-${kind}`}>{FIDELITY_LABELS[kind]}</span>
}

export function RequiredStep({
  no,
  title,
  children,
}: {
  no: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="required-step mt-8">
      <header>
        <span className="num">{no}</span>
        <h3>{title}</h3>
        <strong>必修</strong>
      </header>
      <div className="required-step-body">{children}</div>
    </section>
  )
}

export function EvidenceCard({
  fidelity,
  title,
  source,
  children,
}: {
  fidelity: FidelityKind
  title: string
  source: string
  children: ReactNode
}) {
  return (
    <section className="evidence-card mt-6">
      <div className="evidence-card-head">
        <FidelityBadge kind={fidelity} />
        <strong>{title}</strong>
      </div>
      <div className="evidence-source mono">{source}</div>
      <div className="evidence-card-body">{children}</div>
    </section>
  )
}
