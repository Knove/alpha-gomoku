import type { ReactNode } from "react"

/**
 * 每课开场的认知地图。
 *
 * 它刻意不用术语堆砌，而是先交代问题、必要性、因果和边界；读者知道自己
 * 为什么要学这一课后，才进入谜题和细节。所有课程共用同一结构，避免每课
 * 各自发明一套开场话术。
 */
export function LessonGuide({
  question,
  why,
  chain,
  takeaway,
  boundary,
}: {
  /** 本课唯一要回答的问题。 */
  question: ReactNode
  /** 不学这一课会卡在哪里。 */
  why: ReactNode
  /** 读者应能复述的“因为 → 所以”链，保持 2–4 步。 */
  chain: readonly ReactNode[]
  /** 学完后可以拿走的结论。 */
  takeaway: ReactNode
  /** 主线暂时不讲什么，防止把玩具例子误当完整系统。 */
  boundary?: ReactNode
}) {
  return (
    <aside className="lesson-guide mt-6" aria-label="本章导航">
      <div className="lesson-guide-kicker">本章导航 · 先知道为什么，再学名词</div>
      <dl className="lesson-guide-grid">
        <div>
          <dt>这一章要回答什么？</dt>
          <dd>{question}</dd>
        </div>
        <div>
          <dt>为什么现在要学它？</dt>
          <dd>{why}</dd>
        </div>
        <div className="lesson-guide-takeaway">
          <dt>学完你能说清</dt>
          <dd>{takeaway}</dd>
        </div>
      </dl>
      <div className="lesson-guide-chain" aria-label="本章因果链">
        <span>因为 → 所以</span>
        <ol>
          {chain.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      </div>
      {boundary && <p className="lesson-guide-boundary"><strong>本章边界：</strong>{boundary}</p>}
    </aside>
  )
}
