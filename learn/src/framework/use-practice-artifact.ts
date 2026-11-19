import { useEffect, useState } from "react"
import {
  PRACTICE_ARTIFACT_CHANGED_EVENT,
  loadPracticeArtifact,
  practiceArtifactStorageKey,
  type PracticeArtifact,
} from "./practice-artifacts.ts"

/** 读取某课动手产物，并跟随提交/其他标签页写入刷新。 */
export function usePracticeArtifact(lessonId: string): PracticeArtifact | null {
  const [artifact, setArtifact] = useState<PracticeArtifact | null>(() => loadPracticeArtifact(lessonId))

  useEffect(() => {
    setArtifact(loadPracticeArtifact(lessonId))
    const sync = () => setArtifact(loadPracticeArtifact(lessonId))
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ lessonId?: string; canonicalId?: string }>).detail
      if (!detail || detail.lessonId === lessonId || detail.canonicalId === lessonId) sync()
    }
    addEventListener(PRACTICE_ARTIFACT_CHANGED_EVENT, onChanged)
    addEventListener("storage", sync)
    return () => {
      removeEventListener(PRACTICE_ARTIFACT_CHANGED_EVENT, onChanged)
      removeEventListener("storage", sync)
    }
  }, [lessonId])

  // 同一页面内刚创建产物时，首帧可能仍拿到旧快照；键存在时以存储为准。
  if (practiceArtifactStorageKey(lessonId) && typeof localStorage !== "undefined") {
    const stored = loadPracticeArtifact(lessonId)
    if (stored?.text !== artifact?.text) return stored
  }
  return artifact
}
