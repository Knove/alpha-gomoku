import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export interface LessonReadingState {
  percent: number
  reachedEnd: boolean
}

interface ReadingSnapshot extends LessonReadingState {
  lessonId: string
}

function freshReading(lessonId: string): ReadingSnapshot {
  return { lessonId, percent: 0, reachedEnd: false }
}

/** 阅读完成只表示“滚到了本章收束”，不表示掌握，也不写入进度。 */
export function useLessonReadPosition(lessonId: string): LessonReadingState {
  const [snapshot, setSnapshot] = useState<ReadingSnapshot>(() => freshReading(lessonId))
  const state = snapshot.lessonId === lessonId ? snapshot : freshReading(lessonId)

  useEffect(() => {
    const article = document.querySelector<HTMLElement>("#main > section")
    if (!article) return

    let frame = 0
    let disposed = false
    setSnapshot(freshReading(lessonId))
    const measure = () => {
      frame = 0
      if (disposed) return
      const top = window.scrollY + article.getBoundingClientRect().top
      const travel = Math.max(1, article.offsetHeight - window.innerHeight)
      const percent = Math.min(100, Math.max(0, Math.round(((window.scrollY - top) / travel) * 100)))
      const endThreshold = Math.max(120, window.innerHeight * 0.25)
      const atEnd = window.scrollY + window.innerHeight >= top + article.offsetHeight - endThreshold
      setSnapshot((previous) => {
        const current = previous.lessonId === lessonId ? previous : freshReading(lessonId)
        const reachedEnd = current.reachedEnd || atEnd
        return current.percent === percent && current.reachedEnd === reachedEnd
          ? current
          : { lessonId, percent, reachedEnd }
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    // 换课时 App 会先把滚动位置复位；等下一帧再测量，避免拿上一课的底部位置误判新课程。
    frame = requestAnimationFrame(measure)
    addEventListener("scroll", schedule, { passive: true })
    addEventListener("resize", schedule)
    const observer = new MutationObserver(schedule)
    observer.observe(article, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    })
    return () => {
      disposed = true
      if (frame) cancelAnimationFrame(frame)
      removeEventListener("scroll", schedule)
      removeEventListener("resize", schedule)
      observer.disconnect()
    }
  }, [lessonId])

  return state
}

const LessonReadingContext = createContext<LessonReadingState | null>(null)

export function LessonReadingProvider({ lessonId, children }: { lessonId: string; children: ReactNode }) {
  const reading = useLessonReadPosition(lessonId)
  return <LessonReadingContext.Provider value={reading}>{children}</LessonReadingContext.Provider>
}

export function useLessonReading(): LessonReadingState {
  const context = useContext(LessonReadingContext)
  if (!context) throw new Error("useLessonReading must be used inside LessonReadingProvider")
  return context
}
