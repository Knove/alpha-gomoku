/** Theme: data-theme on <html>, persisted in localStorage ("exp-theme"). */
import { useCallback, useEffect, useState } from "react"

type Theme = "light" | "dark"

function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light"
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(current)

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)")
    const on = () => {
      if (!localStorage.getItem("exp-theme")) setTheme(mq.matches ? "dark" : "light")
    }
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark"
      try {
        localStorage.setItem("exp-theme", next)
      } catch {
        /* private mode */
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
