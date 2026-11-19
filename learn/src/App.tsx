import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { CURRICULUM, canonicalCurriculumId } from "./framework/curriculum"
import { LESSONS } from "./framework/lesson"
import { LearningProgressProvider, useLearningProgress } from "./framework/progress-context"
import { LessonReadingProvider } from "./framework/reading-context"
import { StudyRail } from "./framework/study-rail"
import { useTheme } from "./framework/theme"
import { TutorPanel } from "./framework/tutor-panel"
import { TutorProvider } from "./framework/tutor-context"
import { useBodyScrollLock } from "./framework/use-body-scroll-lock"
import { useFocusTrap } from "./framework/use-focus-trap"

/** hash 形如 "#/l01";不匹配(空/首页/未知)返回 "" 由重定向兜底。 */
function routeId(): string {
  const match = location.hash.match(/^#\/([a-z0-9-]+)/)
  return match ? match[1] : ""
}

export default function App() {
  return (
    <LearningProgressProvider>
      <CourseApp />
    </LearningProgressProvider>
  )
}

function CourseApp() {
  const [route, setRoute] = useState(routeId)
  const [railOpen, setRailOpen] = useState(false)
  const railRef = useRef<HTMLElement>(null)
  const pendingScrollRestore = useRef<number | null>(null)
  const { theme, toggle } = useTheme()
  const { frontierIndex, isMastered, isUnlocked } = useLearningProgress()

  useFocusTrap(railOpen, railRef)

  useEffect(() => {
    const on = () => setRoute(routeId())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])

  // 把每一条历史记录的最后阅读位置写回 history.state；Back/Forward 回到旧课时可以接着读。
  useEffect(() => {
    const previousRestoration = history.scrollRestoration
    history.scrollRestoration = "manual"
    history.replaceState({ ...history.state, learnScroll: window.scrollY }, "")
    let frame = 0
    const saveScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        history.replaceState({ ...history.state, learnScroll: window.scrollY }, "")
      })
    }
    const restore = (event: PopStateEvent) => {
      const value = event.state?.learnScroll
      if (typeof value === "number" && Number.isFinite(value)) pendingScrollRestore.current = Math.max(0, value)
    }
    addEventListener("scroll", saveScroll, { passive: true })
    addEventListener("popstate", restore)
    return () => {
      history.scrollRestoration = previousRestoration
      cancelAnimationFrame(frame)
      removeEventListener("scroll", saveScroll)
      removeEventListener("popstate", restore)
    }
  }, [])

  const canonicalRoute = useMemo(() => canonicalCurriculumId(route), [route])
  const routeIndex = canonicalRoute
    ? CURRICULUM.findIndex((unit) => unit.id === canonicalRoute)
    : -1
  const landing = CURRICULUM[Math.min(frontierIndex, CURRICULUM.length - 1)]

  // 首页回到当前学习边界；越过边界的深链也退回边界，不能靠改 URL 跳课。
  useEffect(() => {
    if (canonicalRoute && canonicalRoute !== route) {
      location.replace(`#/${canonicalRoute}`)
      return
    }
    if (!canonicalRoute) {
      location.replace(`#/${landing.id}`)
      return
    }
    if (routeIndex > frontierIndex) location.replace(`#/${landing.id}`)
  }, [canonicalRoute, frontierIndex, landing.id, route, routeIndex])

  // 换课时从正文开头进入，避免把上一课底部的滚动位置带过去。
  useLayoutEffect(() => {
    if (!canonicalRoute) return
    const restore = pendingScrollRestore.current
    pendingScrollRestore.current = null
    window.scrollTo({ top: restore ?? 0, left: 0, behavior: "instant" })
  }, [canonicalRoute])

  useEffect(() => {
    if (!railOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false)
    }
    addEventListener("keydown", onKeyDown)
    return () => removeEventListener("keydown", onKeyDown)
  }, [railOpen])

  useBodyScrollLock(railOpen)

  useEffect(() => {
    const desktop = matchMedia("(min-width: 1200px)")
    const closeAtDesktop = () => {
      if (desktop.matches) setRailOpen(false)
    }
    closeAtDesktop()
    desktop.addEventListener("change", closeAtDesktop)
    return () => desktop.removeEventListener("change", closeAtDesktop)
  }, [])

  const activeId = routeIndex >= 0 && routeIndex <= frontierIndex ? canonicalRoute : landing.id
  const idx = LESSONS.findIndex((lesson) => lesson.meta.id === activeId)
  const lesson = idx >= 0 ? LESSONS[idx] : null

  // 复习队列用 ?review=sheet 直接落到课末；展开后把 URL 收回干净路由。
  useEffect(() => {
    if (!activeId) return
    const params = new URLSearchParams(location.hash.split("?")[1] ?? "")
    if (params.get("review") !== "sheet") return
    let frame = 0
    const open = () => {
      const sheet = document.querySelector<HTMLDetailsElement>("#lesson-cheat-sheet")
      if (!sheet) return
      sheet.open = true
      sheet.scrollIntoView({ block: "start", behavior: "instant" })
      sheet.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true })
      history.replaceState(null, "", `#/${activeId}`)
    }
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(open) })
    return () => cancelAnimationFrame(frame)
  }, [activeId])

  // 窄屏学习路径是抽屉；换课、按 Esc 或回到桌面宽度时自动收起。
  useEffect(() => {
    setRailOpen(false)
  }, [activeId])

  return (
    <LessonReadingProvider lessonId={activeId || "prologue"}>
      <TutorProvider currentId={activeId || "prologue"}>
        <div id="app-surface">
        <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/prologue">
            <span className="brand-seal">学</span>
            学会下棋的机器
          </a>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="icon-btn path-btn"
            onClick={() => setRailOpen((value) => !value)}
            aria-label={railOpen ? "收起学习路径" : "打开学习路径"}
            aria-controls="study-rail"
            aria-expanded={railOpen}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20z" />
              <path d="M9 4v13.5M15 6.5V20" />
            </svg>
            <span className="path-btn-label">路径</span>
          </button>
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

        <div className="lesson-shell">
        <nav className="lesson-nav" aria-label="课程">
          {(() => {
            let previousPhase = ""
            return LESSONS.map((entry) => {
              const startsPhase = entry.meta.phase !== previousPhase
              previousPhase = entry.meta.phase
              const unlocked = isUnlocked(entry.meta.id)
              const mastered = isMastered(entry.meta.id)
              const current = entry.meta.id === activeId
              const prerequisite = LESSONS[Math.min(frontierIndex, LESSONS.length - 1)]
              return (
                <Fragment key={entry.meta.id}>
                  {startsPhase && <div className="lesson-phase">{entry.meta.phase}</div>}
                  {unlocked ? (
                    <a
                      href={`#/${entry.meta.id}`}
                      className={`lesson-item${current ? " current" : ""}${mastered ? " mastered" : ""}`}
                      aria-current={current ? "page" : undefined}
                    >
                      <span className="num lesson-no">{entry.meta.num}</span>
                      <span className="lesson-title">{entry.meta.title}</span>
                      {mastered && <DoneMark />}
                    </a>
                  ) : (
                    <span
                      className="lesson-item locked"
                      aria-disabled="true"
                      title={`先通过${prerequisite.meta.num === "序" ? "序章" : `第 ${prerequisite.meta.num} 课`}，再进入这一课`}
                    >
                      <span className="num lesson-no">{entry.meta.num}</span>
                      <span className="lesson-title">{entry.meta.title}</span>
                      <LockMark />
                    </span>
                  )}
                </Fragment>
              )
            })
          })()}
        </nav>

        <main id="main" className="min-w-0 flex-1">
          {lesson && <lesson.Comp key={activeId} />}
        </main>

        <StudyRail currentId={activeId} open={railOpen} onClose={() => setRailOpen(false)} containerRef={railRef} />
        </div>
        {railOpen && (
          <button
            type="button"
            className="study-rail-scrim"
            onClick={() => setRailOpen(false)}
            aria-label="关闭学习路径"
          />
        )}
        </div>
        <TutorPanel />
      </TutorProvider>
    </LessonReadingProvider>
  )
}

function DoneMark() {
  return (
    <span className="lesson-state" aria-label="已通过">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 8.5 3.2 3.2L13 5" />
      </svg>
    </span>
  )
}

function LockMark() {
  return (
    <span className="lesson-state" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
        <path d="M5.2 7V5.3a2.8 2.8 0 0 1 5.6 0V7" />
      </svg>
    </span>
  )
}
