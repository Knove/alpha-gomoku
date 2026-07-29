import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useEvents } from "./ws"
import ThemeToggle from "./components/ThemeToggle"
import Dashboard from "./views/Dashboard"
import Live from "./views/Live"
import Games from "./views/Games"
import Replay from "./views/Replay"
import Play from "./views/Play"

/**
 * App — hash router (no router library, PLAN.md §7) + top navigation.
 * Routes: #/  #/live  #/games  #/games/:id  #/play
 */

const TABS: { path: string; label: string }[] = [
  { path: "#/", label: "总览" },
  { path: "#/live", label: "直播" },
  { path: "#/games", label: "对局" },
  { path: "#/play", label: "对战" },
]

function useHashRoute(): string {
  const [hash, setHash] = useState(() => location.hash || "#/")
  useEffect(() => {
    const on = () => setHash(location.hash || "#/")
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return hash
}

export default function App() {
  const route = useHashRoute()
  const { events, status, connected } = useEvents()

  // Scroll to top on every route change.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  const path = route.replace(/^#/, "") || "/"

  const isActive = (tabPath: string) => {
    const p = tabPath.replace(/^#/, "")
    if (p === "/") return path === "/"
    return path.startsWith(p)
  }

  let view: ReactNode
  const gameMatch = path.match(/^\/games\/([^/]+)$/)
  if (path === "/live") {
    view = <Live events={events} status={status} />
  } else if (path === "/games") {
    view = <Games />
  } else if (gameMatch) {
    view = <Replay id={decodeURIComponent(gameMatch[1])} />
  } else if (path === "/play") {
    view = <Play />
  } else {
    view = <Dashboard events={events} status={status} connected={connected} />
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-seal">五</span>
            Alpha-Gomoku
          </a>
          <nav className="nav">
            {TABS.map((t) => (
              <a
                key={t.path}
                href={t.path}
                className={`nav-tab${isActive(t.path) ? " active" : ""}`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <span
            className={`conn-dot${connected ? " on" : ""}`}
            title={connected ? "实时连接正常" : "连接中断,重连中"}
          />
          <ThemeToggle />
        </div>
      </header>
      <main className="page">{view}</main>
    </div>
  )
}
