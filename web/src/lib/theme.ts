import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const KEY = "ag-theme"

function stored(): Theme | null {
  try {
    const s = localStorage.getItem(KEY)
    return s === "light" || s === "dark" ? s : null
  } catch {
    return null
  }
}

function system(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
}

/**
 * Theme hook: data-theme on <html>, persisted to localStorage once the user
 * toggles; follows the OS preference until then (and live-tracks OS changes
 * while no explicit choice is stored).
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system())

  useEffect(() => apply(theme), [theme])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (!stored()) setTheme(mq.matches ? "dark" : "light")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const toggle = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark"
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // private mode: theme still applies for the session
      }
      return next
    })
  }

  return [theme, toggle]
}
