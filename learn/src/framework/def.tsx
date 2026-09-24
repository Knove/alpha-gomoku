import type { ReactNode } from "react"

/**
 * 教材定义框：关键术语首次定义(中文名 + 英文名 + 定义与机制)。
 * 正文随后直接用名，不再挂括号补丁；需要复习时用 see 传回指章节。
 */
export function Def({
  term,
  en,
  children,
  see,
}: {
  term: string
  en: string
  children: ReactNode
  see?: string
}) {
  return (
    <dl className="def-box">
      <dt>
        <strong>{term}</strong>
        <span className="def-en">{en}</span>
      </dt>
      <dd>{children}</dd>
      {see && <dd className="def-see">参见：{see}</dd>}
    </dl>
  )
}

/** 本章小结与下节预告：全章唯一的前瞻出口。 */
export function ChapterEnd({
  summary,
  next,
}: {
  summary: readonly ReactNode[]
  next: ReactNode
}) {
  return (
    <section className="chapter-end">
      <h3>本章小结</h3>
      <ol className="chapter-end-summary">
        {summary.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
      <h3>下节预告</h3>
      <p>{next}</p>
    </section>
  )
}
