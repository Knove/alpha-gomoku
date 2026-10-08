import { Fragment, useEffect, useMemo, useState } from "react"
import { canonicalCurriculumId } from "./framework/curriculum"
import { LESSONS } from "./framework/lesson"
import { useTheme } from "./framework/theme"

/** hash 形如 "#/l01";不匹配(空/首页/未知)返回 "" 由重定向兜底。 */
function routeId(): string {
  const match = location.hash.match(/^#\/([a-z0-9-]+)/)
  return match ? match[1] : ""
}

export default function App() {
  const [route, setRoute] = useState(routeId)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const on = () => setRoute(routeId())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])

  const canonicalRoute = useMemo(() => canonicalCurriculumId(route), [route])

  // 首页 / 未知路由 → 回序。
  useEffect(() => {
    if (canonicalRoute && canonicalRoute !== route) {
      location.replace(`#/${canonicalRoute}`)
      return
    }
    if (!canonicalRoute) location.replace("#/prologue")
  }, [canonicalRoute, route])

  const idx = LESSONS.findIndex((lesson) => lesson.meta.id === canonicalRoute)
  const lesson = idx >= 0 ? LESSONS[idx] : null

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/prologue">
            <span className="brand-seal">学</span>
            学会下棋的机器
          </a>
          <span style={{ flex: 1 }} />
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
              const startsPhase = entry.meta.phase !== previousPhase
              previousPhase = entry.meta.phase
              return (
                <Fragment key={entry.meta.id}>
                  {startsPhase && <div className="lesson-phase">{entry.meta.phase}</div>}
                  <a
                    href={`#/${entry.meta.id}`}
                    className={`lesson-item${entry.meta.id === canonicalRoute ? " current" : ""}`}
                    aria-current={entry.meta.id === canonicalRoute ? "page" : undefined}
                  >
                    <span className="num lesson-no">{entry.meta.num}</span>
                    <span className="lesson-title">{entry.meta.title}</span>
                  </a>
                </Fragment>
              )
            })
          })()}
        </nav>

        <main id="main" className="min-w-0 flex-1">
          {lesson && <lesson.Comp key={canonicalRoute} />}
        </main>
      </div>
    </>
  )
}
