import { Fragment, useCallback, useEffect, useState } from "react"
import { LESSONS } from "./framework/lesson"
import { loadProgress, passQuiz, saveProgress, type Progress } from "./framework/progress"
import { PassLessonContext } from "./framework/quiz"
import { useTheme } from "./framework/theme"

/** hash 形如 "#/l01";不匹配(空/首页/未知)返回 "" 由重定向兜底。 */
function routeId(): string {
  const m = location.hash.match(/^#\/([a-z0-9]+)/)
  return m ? m[1] : ""
}

export default function App() {
  const [route, setRoute] = useState(routeId)
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const on = () => setRoute(routeId())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])

  // 首页 / 未知路由 → 回到当前解锁进度那一课(读者回来接着学)
  useEffect(() => {
    if (!LESSONS.some((l) => l.meta.id === route)) {
      const target = LESSONS[Math.min(progress.unlocked, LESSONS.length - 1)]
      location.replace(`#/${target.meta.id}`)
    }
  }, [route, progress.unlocked])

  // 过关接线:课内 Quiz onAllCorrect → passQuiz + saveProgress,顶栏进度跟涨
  const passLesson = useCallback((lessonId: string) => {
    setProgress((prev) => {
      const next = passQuiz(prev, lessonId, LESSONS.length)
      saveProgress(next)
      return next
    })
  }, [])

  const idx = LESSONS.findIndex((l) => l.meta.id === route)
  const lesson = idx >= 0 ? LESSONS[idx] : null
  const locked = lesson ? idx > progress.unlocked : false
  const prev = idx > 0 ? LESSONS[idx - 1] : null

  return (
    <PassLessonContext.Provider value={passLesson}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-seal">学</span>
            学会下棋的机器
          </a>
          <span className="mini-label num" style={{ flex: 1 }}>
            已解锁 {Math.min(progress.unlocked + 1, LESSONS.length)}/{LESSONS.length} 课
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
            return LESSONS.map((l, i) => {
            const itemLocked = i > progress.unlocked
            const startsPhase = l.meta.phase !== previousPhase
            previousPhase = l.meta.phase
            return (
              <Fragment key={l.meta.id}>
                {startsPhase && <div className="lesson-phase">{l.meta.phase}</div>}
                <a
                  href={`#/${l.meta.id}`}
                  className={`lesson-item${i === idx ? " current" : ""}${itemLocked ? " lesson-locked" : ""}`}
                  aria-current={i === idx ? "page" : undefined}
                  aria-label={itemLocked ? `${l.meta.title}，尚未解锁，可查看预告` : undefined}
                  tabIndex={0}
                >
                  <span className="num lesson-no">{l.meta.num}</span>
                  <span className="lesson-title">{l.meta.title}</span>
                  {itemLocked && (
                    <span className="lock-badge">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
                        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                      </svg>
                      锁
                    </span>
                  )}
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
                <p className="mt-3" style={{ color: "var(--fg-muted)" }}>
                  {lesson.meta.preview}
                </p>
                <p className="mt-3 text-sm" style={{ color: "var(--fg-faint)" }}>
                  它会从这个问题开始：{lesson.meta.puzzle}
                </p>
                <p className="mt-5 text-sm" style={{ color: "var(--fg-muted)" }}>
                  先通关上一课，这一站的完整内容就会打开。预告始终可见，是为了让你知道
                  眼前这一步最终会用在哪里。
                </p>
                {prev && (
                  <a className="btn primary mt-5" href={`#/${prev.meta.id}`}>
                    回到 {prev.meta.num} · {prev.meta.title}
                  </a>
                )}
              </div>
            </section>
          ) : (
            <lesson.Comp key={route} />
          )}
        </main>
      </div>
    </PassLessonContext.Provider>
  )
}
