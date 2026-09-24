import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { CURRICULUM, CURRICULUM_BY_ID, canonicalCurriculumId } from "./framework/curriculum"
import { LESSONS } from "./framework/lesson"
import {
  completedCount,
  completeUnit,
  firstIncompleteAvailable,
  isAvailable,
  isCompleted,
  loadProgress,
  saveProgress,
  type Progress,
} from "./framework/progress"
import { PassLessonContext } from "./framework/quiz"
import { useTheme } from "./framework/theme"

/** hash 形如 "#/l01";不匹配(空/首页/未知)返回 "" 由重定向兜底。 */
function routeId(): string {
  const match = location.hash.match(/^#\/([a-z0-9-]+)/)
  return match ? match[1] : ""
}

export default function App() {
  const [route, setRoute] = useState(routeId)
  const [progress, setProgress] = useState<Progress>(() => loadProgress(CURRICULUM))
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const on = () => setRoute(routeId())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])

  const canonicalRoute = useMemo(() => canonicalCurriculumId(route), [route])

  // 首页 / 未知路由 → 回到第一个已解锁但尚未完成的学习单元。
  useEffect(() => {
    if (canonicalRoute && canonicalRoute !== route) {
      location.replace(`#/${canonicalRoute}`)
      return
    }
    if (!canonicalRoute) {
      const target = firstIncompleteAvailable(progress, CURRICULUM, CURRICULUM_BY_ID)
      location.replace(`#/${target.id}`)
    }
  }, [canonicalRoute, route, progress])

  const passLesson = useCallback((lessonId: string) => {
    // 只接受当前页面发出的完成信号，避免旧组件或后台页面误完成另一章。
    if (lessonId !== canonicalRoute) return
    setProgress((previous) => {
      const next = completeUnit(previous, lessonId, CURRICULUM_BY_ID)
      saveProgress(next)
      return next
    })
  }, [canonicalRoute])

  const idx = LESSONS.findIndex((lesson) => lesson.meta.id === canonicalRoute)
  const lesson = idx >= 0 ? LESSONS[idx] : null
  const locked = lesson ? !isAvailable(progress, lesson.meta, CURRICULUM_BY_ID) : false
  const unmet = lesson?.meta.prerequisites.filter((id) => {
    const prerequisite = CURRICULUM_BY_ID.get(id)
    return prerequisite ? !isCompleted(progress, prerequisite) : true
  }) ?? []
  const completed = completedCount(progress, CURRICULUM)

  return (
    <PassLessonContext.Provider value={passLesson}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-seal">学</span>
            学会下棋的机器
          </a>
          <span className="mini-label num" style={{ flex: 1 }}>
            已完成 {completed}/{CURRICULUM.length} 章
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "切换为浅色" : "切换为深色"}
            title={theme === "dark" ? "切换为浅色" : "切换为深色"}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col lg:flex-row">
        <nav className="lesson-nav" aria-label="课程">
          {(() => {
            let previousPhase = ""
            return LESSONS.map((entry) => {
              const itemLocked = !isAvailable(progress, entry.meta, CURRICULUM_BY_ID)
              const itemDone = isCompleted(progress, entry.meta)
              const startsPhase = entry.meta.phase !== previousPhase
              previousPhase = entry.meta.phase
              return (
                <Fragment key={entry.meta.id}>
                  {startsPhase && <div className="lesson-phase">{entry.meta.phase}</div>}
                  <a
                    href={`#/${entry.meta.id}`}
                    className={`lesson-item${entry.meta.id === canonicalRoute ? " current" : ""}${itemLocked ? " lesson-locked" : ""}${itemDone ? " lesson-done" : ""}`}
                    aria-current={entry.meta.id === canonicalRoute ? "page" : undefined}
                    aria-label={itemLocked ? `${entry.meta.title}，尚未解锁，可查看预告` : undefined}
                  >
                    <span className="num lesson-no">{entry.meta.num}</span>
                    <span className="lesson-title">{entry.meta.title}</span>
                    {itemDone ? <span className="completion-badge">✓</span> : itemLocked ? <span className="lock-badge">锁</span> : null}
                  </a>
                </Fragment>
              )
            })
          })()}
        </nav>

        <main id="main" className="min-w-0 flex-1">
          {!lesson ? null : locked ? (
            <section className="mx-auto max-w-3xl px-6 py-16">
              <div className="card p-6">
                <div className="eyebrow mb-2">{lesson.meta.phase}</div>
                <h1 className="text-xl font-bold">下一站预告 · {lesson.meta.num} {lesson.meta.title}</h1>
                <p className="mt-3" style={{ color: "var(--fg-muted)" }}>{lesson.meta.preview}</p>
                <p className="mt-3 text-sm" style={{ color: "var(--fg-faint)" }}>
                  它会从这个问题开始：{lesson.meta.puzzle}
                </p>
                <p className="mt-5 text-sm" style={{ color: "var(--fg-muted)" }}>
                  先完成前置章节，这一站的完整内容就会打开。预告始终可见，是为了让你知道眼前这一步最终会用在哪里。
                </p>
                {unmet.map((id) => {
                  const prerequisite = CURRICULUM_BY_ID.get(id)
                  return prerequisite ? (
                    <a key={id} className="btn primary mt-5 mr-2" href={`#/${id}`}>
                      回到 {prerequisite.num} · {prerequisite.title}
                    </a>
                  ) : null
                })}
              </div>
            </section>
          ) : (
            <lesson.Comp key={canonicalRoute} />
          )}
        </main>
      </div>
    </PassLessonContext.Provider>
  )
}
