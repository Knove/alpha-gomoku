import type { ReactNode } from "react"

/**
 * 章首导读：教材体例的"为什么读这一章"。
 * 承载问题、必要性、路线、目标与范围；全章唯一的范围前瞻句放在 boundary。
 */
export function LessonGuide({
  question,
  why,
  chain,
  takeaway,
  boundary,
}: {
  /** 本章唯一要回答的问题。 */
  question: ReactNode
  /** 不学这一章会卡在哪里。 */
  why: ReactNode
  /** 读者应能复述的“因为 → 所以”链，保持 2–4 步。 */
  chain: readonly ReactNode[]
  /** 学完后可以拿走的结论。 */
  takeaway: ReactNode
  /** 本章范围声明(全章唯一允许前瞻的位置之一)。 */
  boundary?: ReactNode
}) {
  return (
    <aside className="chapter-intro" aria-label="导读">
      <div className="chapter-intro-kicker">导读</div>
      <p className="chapter-intro-q">{question}</p>
      <p className="chapter-intro-why">{why}</p>
      <div className="chapter-intro-chain">
        <span className="chapter-intro-label">本章路线</span>
        <ol>
          {chain.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      </div>
      <p className="chapter-intro-goal">
        <span className="chapter-intro-label">学完你能说清</span>
        {takeaway}
      </p>
      {boundary && (
        <p className="chapter-intro-scope">
          <span className="chapter-intro-label">范围</span>
          {boundary}
        </p>
      )}
    </aside>
  )
}
