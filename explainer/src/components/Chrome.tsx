/** Page chrome: scroll progress bar, sticky topbar with theme toggle, side rail. */
import { useEffect, useState } from "react"
import { useTheme } from "../lib/theme"

export interface RailItem {
  id: string
  no: string
  label: string
}

export function Chrome({ rail }: { rail: RailItem[] }) {
  const { theme, toggle } = useTheme()
  const [active, setActive] = useState<string>(rail[0]?.id ?? "")

  useEffect(() => {
    const bar = document.querySelector<HTMLDivElement>(".progress-bar")
    const onScroll = () => {
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      if (bar) bar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`
      // active rail item: last chapter whose top passed 40% of viewport
      let cur = rail[0]?.id ?? ""
      for (const item of rail) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top < innerHeight * 0.4) cur = item.id
      }
      setActive(cur)
    }
    onScroll()
    addEventListener("scroll", onScroll, { passive: true })
    return () => removeEventListener("scroll", onScroll)
  }, [rail])

  return (
    <>
      <a className="skip-link" href="#main">
        跳到主内容
      </a>
      <div className="progress-bar" />
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top">
            <span className="brand-seal">讲</span>
            Alpha-Gomoku 原理交互课
          </a>
          <span className="mini-label" style={{ flex: 1 }}>
            五子棋上的 AlphaZero · 图文与交互
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
      <nav className="rail" aria-label="章节">
        {rail.map((item) => (
          <a key={item.id} href={`#${item.id}`} className={active === item.id ? "active" : ""}>
            <span className="r-no">{item.no}</span>
            <span className="r-line" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </>
  )
}
