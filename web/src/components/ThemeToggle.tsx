import { useTheme } from "../lib/theme"

/**
 * ThemeToggle — light/dark switch (PLAN.md §7). Drawn icons, no emoji.
 * Persists to localStorage; defaults to the OS preference.
 */
export default function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const dark = theme === "dark"
  return (
    <button
      type="button"
      className="btn"
      style={{ padding: "0.5rem 0.62rem" }}
      onClick={toggle}
      aria-label={dark ? "切换到浅色主题" : "切换到深色主题"}
      title={dark ? "切换到浅色主题" : "切换到深色主题"}
    >
      {dark ? (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
        </svg>
      )}
    </button>
  )
}
