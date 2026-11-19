import { useEffect, type RefObject } from "react"

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",")

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => !element.hidden && element.getClientRects().length > 0)
}

/** 移动端浮层打开时，把 Tab 焦点留在浮层内；关闭后还给原来的触发按钮。 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!container.contains(document.activeElement)) {
      const first = focusableIn(container)[0] ?? container
      if (!first.hasAttribute("tabindex")) first.tabIndex = -1
      first.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const focusable = focusableIn(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      // 导师关闭时 inert 的清理可能晚于本 effect 的清理；延后一帧再还焦点，
      // 否则 focus() 会落在仍 inert 的背景上而静默失败。
      requestAnimationFrame(() => {
        const triggerStillThere = previous?.isConnected && previous.getClientRects().length > 0
        const target = triggerStillThere
          ? previous
          : document.querySelector<HTMLElement>("#main h1")
        if (!target) return
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1
        target.focus({ preventScroll: true })
      })
    }
  }, [active, containerRef])
}
