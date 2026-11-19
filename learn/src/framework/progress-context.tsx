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
  PROGRESS_STORAGE_KEY,
  frontierIndex,
  isLessonMastered,
  isLessonUnlocked,
  emptyProgress,
  loadProgressState,
  recordMastery,
  resetCorruptProgress,
  saveProgress,
  type LearningProgress,
} from "./progress"
import type { TutorAssessment } from "./tutor-session"
import type { PracticeArtifact } from "./practice-artifacts"

interface LearningProgressContextValue {
  progress: LearningProgress
  frontierIndex: number
  masteredCount: number
  storageError: string | null
  corruptProgress: boolean
  isMastered: (lessonId: string) => boolean
  isUnlocked: (lessonId: string) => boolean
  markMastered: (lessonId: string, assessment: TutorAssessment, practice?: PracticeArtifact) => boolean
  resetDamagedProgress: () => string | null
}

const LearningProgressContext = createContext<LearningProgressContextValue | null>(null)

export function LearningProgressProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadProgressState())
  const [progress, setProgress] = useState<LearningProgress>(initial.progress)
  const progressRef = useRef(initial.progress)
  const [corruptProgress, setCorruptProgress] = useState(initial.status === "corrupt")
  const [storageError, setStorageError] = useState<string | null>(() => (
    initial.status === "corrupt"
      ? "本机进度记录损坏，已停止自动覆盖。原记录仍保留；请先备份并重置，再继续学习。"
      : initial.status === "unavailable"
        ? "读不到本机进度存储；当前只能浏览，判定通过也无法持久保存。"
        : null
  ))

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== PROGRESS_STORAGE_KEY) return
      const loaded = loadProgressState()
      if (loaded.status === "corrupt") {
        setCorruptProgress(true)
        setStorageError("本机进度记录损坏，已停止自动覆盖。原记录仍保留；请先备份并重置，再继续学习。")
        return
      }
      if (loaded.status === "unavailable") {
        setStorageError("读不到本机进度存储；当前只能浏览。")
        return
      }
      progressRef.current = loaded.progress
      setProgress(loaded.progress)
      setCorruptProgress(false)
      setStorageError(null)
    }
    addEventListener("storage", sync)
    return () => removeEventListener("storage", sync)
  }, [])

  const markMastered = useCallback((lessonId: string, assessment: TutorAssessment, practice?: PracticeArtifact): boolean => {
    const next = recordMastery(progressRef.current, lessonId, assessment, new Date(), practice)
    if (next === progressRef.current) return false
    if (!saveProgress(next)) {
      setStorageError("判定通过，但本机进度写入失败，不能算解锁。请检查 localStorage 权限或空间后重新判定。")
      return false
    }
    const stored = loadProgressState()
    if (stored.status !== "ok" || !isLessonMastered(stored.progress, lessonId)) {
      const damaged = stored.status === "corrupt"
      setCorruptProgress(damaged)
      setStorageError(damaged
        ? "判定通过后读回的本机进度已损坏，不能算解锁。原记录仍保留；请先备份并重置，再重新判定。"
        : "判定通过后无法确认本课已写入本机进度，不能算解锁。请检查浏览器存储权限后重新判定。")
      return false
    }
    progressRef.current = stored.progress
    setProgress(stored.progress)
    setCorruptProgress(false)
    setStorageError(null)
    return true
  }, [])

  const resetDamagedProgress = useCallback((): string | null => {
    const backupKey = resetCorruptProgress()
    if (!backupKey) {
      setStorageError("备份损坏记录失败，尚未重置；原记录仍在，请检查浏览器存储权限。")
      return null
    }
    const empty = emptyProgress()
    progressRef.current = empty
    setProgress(empty)
    setCorruptProgress(false)
    setStorageError(`已把损坏记录备份到 ${backupKey}，并重置为空白进度。`)
    return backupKey
  }, [])

  const isMastered = useCallback((lessonId: string) => isLessonMastered(progress, lessonId), [progress])
  const isUnlocked = useCallback((lessonId: string) => isLessonUnlocked(progress, lessonId), [progress])
  const frontier = frontierIndex(progress)

  const value = useMemo<LearningProgressContextValue>(() => ({
    progress,
    frontierIndex: frontier,
    masteredCount: frontier,
    storageError,
    corruptProgress,
    isMastered,
    isUnlocked,
    markMastered,
    resetDamagedProgress,
  }), [corruptProgress, frontier, isMastered, isUnlocked, markMastered, progress, resetDamagedProgress, storageError])

  return <LearningProgressContext.Provider value={value}>{children}</LearningProgressContext.Provider>
}

export function useLearningProgress() {
  const context = useContext(LearningProgressContext)
  if (!context) throw new Error("useLearningProgress must be used inside LearningProgressProvider")
  return context
}
