import type { ReactNode } from "react"
import { CURRICULUM, isStageCheckpoint } from "./curriculum"
import { cheatSheetFor } from "./cheat-sheets"
import { FeynmanNoteCard } from "./feynman-note-card"
import { useLearningProgress } from "./progress-context"
import { RECALL_QUESTIONS } from "./reflection"
import { useTutor } from "./tutor-context"

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

/** 本章收束：先合书复述，再由导师判定；通过后才展开小结并解锁下一课。 */
export function ChapterEnd({
  summary,
  next,
}: {
  summary: readonly ReactNode[]
  next: ReactNode
}) {
  const { currentId, openTutor } = useTutor()
  const { isMastered } = useLearningProgress()
  const currentIndex = CURRICULUM.findIndex((unit) => unit.id === currentId)
  const isLast = currentIndex === CURRICULUM.length - 1
  const nextUnit = currentIndex >= 0 && !isLast ? CURRICULUM[currentIndex + 1] : null
  const currentUnit = currentIndex >= 0 ? CURRICULUM[currentIndex] : null
  const cheatSheet = cheatSheetFor(currentId)
  const mastered = isMastered(currentId)
  const checkpoint = isStageCheckpoint(currentId)

  return (
    <section className="chapter-end" id="lesson-close">
      <div className="chapter-reflect">
        <div className="eyebrow">合书复述 · 先别看小结</div>
        <h3>用自己的话讲三件事</h3>
        <ol className="chapter-reflect-questions">
          {RECALL_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
        </ol>
        <p className="chapter-reflect-note">
          不要背术语。导师会追问“换个局面怎么用”和“哪里容易错”；它判定通过，下一课才解锁。
        </p>
        <div className="chapter-reflect-actions">
          <button type="button" className="btn primary" onClick={() => openTutor("feynman")}>
            {mastered ? "再复盘一遍" : "我来讲给导师听"}
          </button>
          <button type="button" className="btn" onClick={() => openTutor("ask")}>
            我还有疑问
          </button>
          {mastered && (
            <>
              <button type="button" className="btn" onClick={() => openTutor("quiz", "quick")}>
                3 分钟快问 · 考我
              </button>
              <button type="button" className="btn" onClick={() => openTutor("quiz", "full")}>
                完整 10 题 · 考我
              </button>
            </>
          )}
        </div>
        {mastered && (
          <p className="chapter-reflect-done">
            导师已判定这一课通过，记录已保存在本机。可以继续追问，也可以进入下一课。
          </p>
        )}
        {mastered && nextUnit && (
          <a className="chapter-reflect-next" href={`#/${nextUnit.id}`}>
            <span>{checkpoint ? "阶段验收通过 · 下一阶段已解锁" : "导师判定通过 · 下一课已解锁"}</span>
            <strong>{nextUnit.num} · {nextUnit.title}</strong>
            <i aria-hidden="true">→</i>
          </a>
        )}
        {mastered && isLast && (
          <p className="chapter-reflect-done">课程完成。已通过的课仍可从左侧回看。</p>
        )}
      </div>

      {mastered ? (
        <details className="chapter-end-book" id="lesson-cheat-sheet">
          <summary>导师判定已通过：展开一页速查卡与下节预告</summary>
          <section className="cheat-sheet" aria-label="本课一页速查卡">
            <header className="cheat-sheet-head">
              <span className="cheat-sheet-kicker">一页速查卡 · 考前 / 复盘前 5 分钟</span>
              <strong>先回想，再展开答案</strong>
            </header>
            {cheatSheet && (
              <p className="cheat-sheet-model"><strong>一句话模型：</strong>{cheatSheet.model}</p>
            )}
            <h3>因果流程 · 按顺序讲一遍</h3>
            <ol className="chapter-end-summary cheat-sheet-flow" aria-label="本课因果流程">
              {summary.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
            {currentUnit && (
              <>
                <h3>学完应该能做到</h3>
                <ul className="cheat-sheet-list">
                  {currentUnit.outcomes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            )}
            <FeynmanNoteCard lessonId={currentId} />
            {cheatSheet && (
              <>
                <div className="cheat-sheet-pair">
                  <div>
                    <h3>拿它做三次</h3>
                    <ul className="cheat-sheet-examples">
                      {cheatSheet.examples.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h3>最容易错</h3>
                    <p>{cheatSheet.mistake}</p>
                  </div>
                </div>
                <h3>使用前检查</h3>
                <ul className="cheat-sheet-checklist">
                  {cheatSheet.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <h3>5 个快问快答</h3>
                <ol className="cheat-sheet-qa">
                  {cheatSheet.qa.map((item, index) => (
                    <li key={item.q}>
                      <details>
                        <summary><span className="num">{String(index + 1).padStart(2, "0")}</span>{item.q}</summary>
                        <p>{item.a}</p>
                      </details>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
          <h3>下节预告</h3>
          <p>{next}</p>
        </details>
      ) : (
        <p className="chapter-end-locked">
          本章小结会先收着。用自己的话讲完，回答导师的应用与纠错追问{checkpoint ? "，并完成一次跨课迁移" : ""}；判定通过后这里再展开。
        </p>
      )}
    </section>
  )
}
