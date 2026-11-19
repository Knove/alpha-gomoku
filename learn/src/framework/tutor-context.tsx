import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  emptyTutorSession,
  type QuizPlan,
  type TutorMode,
  type TutorSession,
} from "./tutor-session"

export type { QuizPlan, TutorMessage, TutorMode, TutorSession } from "./tutor-session"

interface TutorContextValue {
  currentId: string
  open: boolean
  session: TutorSession
  openTutor: (mode?: TutorMode, quizPlan?: QuizPlan) => void
  closeTutor: () => void
  updateSession: (updater: (previous: TutorSession) => TutorSession) => void
  updateSessionFor: (lessonId: string, updater: (previous: TutorSession) => TutorSession) => void
  clearSelection: () => void
}

const TutorContext = createContext<TutorContextValue | null>(null)

function selectedLessonText(): string {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ""
  if (!text) return ""
  const article = document.querySelector("#main > section")
  const anchor = selection?.anchorNode
  const focus = selection?.focusNode
  if (!article || !anchor || !focus || !article.contains(anchor) || !article.contains(focus)) return ""
  // 速查卡、费曼定稿和学习面板里的答案不能作为“选中原文”回灌给导师。
  const protectedNodes = document.querySelectorAll("#lesson-cheat-sheet, .feynman-note-card, .study-rail-feynman-note")
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  if (range && [...protectedNodes].some((node) => range.intersectsNode(node))) return ""
  return text.slice(0, 4000)
}

export function TutorProvider({
  currentId,
  children,
}: {
  currentId: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<Record<string, TutorSession>>({})
  const latestSelection = useRef("")

  useEffect(() => {
    const capture = () => {
      const text = selectedLessonText()
      if (text) latestSelection.current = text
    }
    addEventListener("pointerdown", capture, true)
    addEventListener("selectionchange", capture)
    return () => {
      removeEventListener("pointerdown", capture, true)
      removeEventListener("selectionchange", capture)
    }
  }, [])

  useEffect(() => {
    setOpen(false)
    latestSelection.current = ""
  }, [currentId])

  const session = sessions[currentId] ?? emptyTutorSession()

  const openTutor = useCallback((mode?: TutorMode, quizPlan?: QuizPlan) => {
    const selection = latestSelection.current || selectedLessonText()
    setOpen(true)
    setSessions((previous) => {
      const current = previous[currentId] ?? emptyTutorSession()
      return {
        ...previous,
        [currentId]: {
          ...current,
          mode: mode ?? current.mode,
          quizPlan: quizPlan ?? current.quizPlan,
          pendingQuiz: mode === "quiz" && quizPlan ? quizPlan : null,
          selection: selection || current.selection,
        },
      }
    })
  }, [currentId])

  const closeTutor = useCallback(() => setOpen(false), [])

  const updateSession = useCallback((updater: (previous: TutorSession) => TutorSession) => {
    setSessions((previous) => {
      const current = previous[currentId] ?? emptyTutorSession()
      return { ...previous, [currentId]: updater(current) }
    })
  }, [currentId])

  const updateSessionFor = useCallback((lessonId: string, updater: (previous: TutorSession) => TutorSession) => {
    setSessions((previous) => {
      const current = previous[lessonId] ?? emptyTutorSession()
      return { ...previous, [lessonId]: updater(current) }
    })
  }, [])

  const clearSelection = useCallback(() => {
    latestSelection.current = ""
    setSessions((previous) => {
      const current = previous[currentId] ?? emptyTutorSession()
      return { ...previous, [currentId]: { ...current, selection: "" } }
    })
  }, [currentId])

  const value = useMemo<TutorContextValue>(() => ({
    currentId,
    open,
    session,
    openTutor,
    closeTutor,
    updateSession,
    updateSessionFor,
    clearSelection,
  }), [clearSelection, closeTutor, currentId, open, openTutor, session, updateSession, updateSessionFor])

  return <TutorContext.Provider value={value}>{children}</TutorContext.Provider>
}

export function useTutor() {
  const context = useContext(TutorContext)
  if (!context) throw new Error("useTutor must be used inside TutorProvider")
  return context
}
