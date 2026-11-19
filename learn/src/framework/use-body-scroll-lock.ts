import { useEffect } from "react"

let lockCount = 0
let previousOverflow = ""
let previousPaddingRight = ""

/** 多个浮层可能短暂重叠；用引用计数避免后关的那层把前一层仍在用的锁释放掉。 */
function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {}

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    document.body.style.overflow = "hidden"
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
  }
  lockCount += 1

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount > 0) return
    document.body.style.overflow = previousOverflow
    document.body.style.paddingRight = previousPaddingRight
  }
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
