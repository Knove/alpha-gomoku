import {
  CURRICULUM,
  CURRICULUM_BY_ID,
  canonicalCurriculumId,
  isStageCheckpoint,
} from "./curriculum.ts"
import { isSubstantiveEvidenceText } from "./mastery-contract.ts"
import { assessmentIsSufficient, type TutorAssessment } from "./tutor-session.ts"
import type { PracticeArtifact } from "./practice-artifacts.ts"

export const PROGRESS_STORAGE_KEY = "alpha-gomoku-learn/progress/v1"

export type MasteryScope = "lesson" | "stage"

export interface MasteryRecord {
  passedAt: string
  /** 最近一次判定的时间；同一课重新提交产物/重新判定时用它合并，不能只看首次 passedAt。 */
  updatedAt?: string
  evidence: string[]
  nextAction: string
  scope: MasteryScope
  /** 这次判定引用的学生自述产物；旧记录可以没有，新流程会写入。 */
  practice?: string
  practiceTaskId?: string
  practiceVersion?: number
  practiceDigest?: string
}

export interface LearningProgress {
  version: 1
  mastered: Record<string, MasteryRecord>
}

export interface ProgressStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type ProgressLoadStatus = "empty" | "ok" | "corrupt" | "unavailable"

export interface ProgressLoadResult {
  progress: LearningProgress
  status: ProgressLoadStatus
  raw: string | null
}

export function emptyProgress(): LearningProgress {
  return { version: 1, mastered: {} }
}

function browserStorage(): ProgressStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeRecord(value: unknown, lessonId: string): MasteryRecord | null {
  const record = asRecord(value)
  if (!record || typeof record.passedAt !== "string") return null
  const passedAt = Date.parse(record.passedAt)
  if (!Number.isFinite(passedAt) || passedAt > Date.now() + 5 * 60_000) return null
  const updatedAtValue = typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) : passedAt
  if (!Number.isFinite(updatedAtValue) || updatedAtValue > Date.now() + 5 * 60_000 || updatedAtValue < passedAt) return null
  if (record.scope !== "lesson" && record.scope !== "stage") return null
  if (record.scope !== (isStageCheckpoint(lessonId) ? "stage" : "lesson")) return null
  const evidence = Array.isArray(record.evidence)
    ? record.evidence
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(isSubstantiveEvidenceText)
        .slice(0, 4)
    : []
  const nextAction = typeof record.nextAction === "string" ? record.nextAction : ""
  const practice = typeof record.practice === "string" ? record.practice.trim().slice(0, 8_000) : ""
  const practiceTaskId = typeof record.practiceTaskId === "string" ? record.practiceTaskId.trim() : ""
  const practiceVersion = Number.isInteger(record.practiceVersion) ? Number(record.practiceVersion) : null
  const practiceDigest = typeof record.practiceDigest === "string" ? record.practiceDigest.trim() : ""
  const practiceComplete = Boolean(
    practice && practiceTaskId && practiceVersion && practiceVersion > 0 && /^[0-9a-f]{8}$/.test(practiceDigest),
  )
  const requiredEvidence = isStageCheckpoint(lessonId) ? 4 : 3
  if (evidence.length < requiredEvidence || !nextAction.trim()) return null
  return {
    passedAt: record.passedAt,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : record.passedAt,
    evidence,
    nextAction,
    scope: record.scope,
    ...(practiceComplete ? {
      practice,
      practiceTaskId,
      practiceVersion: practiceVersion!,
      practiceDigest,
    } : {}),
  }
}

/** 区分“没有记录”和“记录损坏”；损坏时绝不能当成空进度再写回去。 */
export function inspectProgress(raw: string | null): ProgressLoadResult {
  if (!raw) return { progress: emptyProgress(), status: "empty", raw }
  try {
    const parsed = asRecord(JSON.parse(raw))
    if (!parsed || parsed.version !== 1) return { progress: emptyProgress(), status: "corrupt", raw }
    const masteredInput = asRecord(parsed.mastered)
    if (!masteredInput) return { progress: emptyProgress(), status: "corrupt", raw }

    const mastered: Record<string, MasteryRecord> = {}
    for (const [lessonId, value] of Object.entries(masteredInput)) {
      if (!CURRICULUM_BY_ID.has(lessonId)) continue
      const record = normalizeRecord(value, lessonId)
      if (record) mastered[lessonId] = record
    }
    return { progress: { version: 1, mastered }, status: "ok", raw }
  } catch {
    return { progress: emptyProgress(), status: "corrupt", raw }
  }
}

export function parseProgress(raw: string | null): LearningProgress {
  return inspectProgress(raw).progress
}

export function loadProgressState(
  storage: ProgressStorage | null = browserStorage(),
): ProgressLoadResult {
  if (!storage) return { progress: emptyProgress(), status: "unavailable", raw: null }
  try {
    return inspectProgress(storage.getItem(PROGRESS_STORAGE_KEY))
  } catch {
    return { progress: emptyProgress(), status: "unavailable", raw: null }
  }
}

export function loadProgress(storage: ProgressStorage | null = browserStorage()): LearningProgress {
  return loadProgressState(storage).progress
}

export function saveProgress(
  progress: LearningProgress,
  storage: ProgressStorage | null = browserStorage(),
): boolean {
  if (!storage) return false
  try {
    // 两个标签页可能各自拿着旧快照；写回前合并磁盘上的通过记录，避免后写者回滚先写者。
    const existing = inspectProgress(storage.getItem(PROGRESS_STORAGE_KEY))
    if (existing.status === "corrupt") return false
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(mergeProgress(existing.progress, progress)))
    return true
  } catch {
    return false
  }
}

/** 先把损坏原文备份到独立键，确认写入成功后才重置，避免“修复”变成永久删除。 */
export function resetCorruptProgress(
  storage: ProgressStorage | null = browserStorage(),
  now: Date = new Date(),
): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    if (raw === null) return null
    const stamp = now.toISOString().replace(/[:.]/g, "-")
    const backupKey = `${PROGRESS_STORAGE_KEY}/corrupt-backup/${stamp}`
    storage.setItem(backupKey, raw)
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(emptyProgress()))
    return backupKey
  } catch {
    return null
  }
}

/** 只有导师判定 pass 才写入掌握记录；retry 或不存在的课不会推进。 */
export function recordMastery(
  progress: LearningProgress,
  lessonId: string,
  assessment: TutorAssessment,
  now: Date = new Date(),
  practice?: PracticeArtifact,
): LearningProgress {
  const canonicalId = canonicalCurriculumId(lessonId)
  if (!canonicalId) return progress
  const checkpoint = isStageCheckpoint(canonicalId)
  if (!assessmentIsSufficient(assessment, checkpoint)) return progress
  if (!assessment.nextAction.trim()) return progress

  const previous = progress.mastered[canonicalId]
  const record: MasteryRecord = {
    passedAt: previous?.passedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    evidence: assessment.evidence
      .map((item) => item.text.trim())
      .filter(Boolean)
      .slice(0, 4),
    nextAction: assessment.nextAction.trim(),
    scope: checkpoint ? "stage" : "lesson",
    ...(practice ? {
      practice: practice.text.trim().slice(0, 8_000),
      practiceTaskId: practice.taskId,
      practiceVersion: practice.version,
      practiceDigest: practice.digest,
    } : previous?.practice && previous.practiceDigest && previous.practiceTaskId && previous.practiceVersion
      ? {
          practice: previous.practice,
          practiceTaskId: previous.practiceTaskId,
          practiceVersion: previous.practiceVersion,
          practiceDigest: previous.practiceDigest,
        }
      : {}),
  }
  return {
    version: 1,
    mastered: { ...progress.mastered, [canonicalId]: record },
  }
}

export function isLessonMastered(progress: LearningProgress, lessonId: string): boolean {
  const canonicalId = canonicalCurriculumId(lessonId)
  return Boolean(canonicalId && progress.mastered[canonicalId])
}

/** 从序章开始连续通过的节点数；下一课只有在这个边界内才可打开。 */
export function frontierIndex(progress: LearningProgress): number {
  let index = 0
  while (index < CURRICULUM.length && isLessonMastered(progress, CURRICULUM[index].id)) {
    index += 1
  }
  return index
}

export function isLessonUnlocked(progress: LearningProgress, lessonId: string): boolean {
  const canonicalId = canonicalCurriculumId(lessonId)
  if (!canonicalId) return false
  const index = CURRICULUM.findIndex((unit) => unit.id === canonicalId)
  return index >= 0 && index <= frontierIndex(progress)
}

/** 合并两份本机进度；同一课以较晚的通过时间为准，旧快照不能删掉别的标签页刚写入的课。 */
export function mergeProgress(
  existing: LearningProgress,
  incoming: LearningProgress,
): LearningProgress {
  const mastered = { ...existing.mastered }
  for (const [lessonId, record] of Object.entries(incoming.mastered)) {
    const previous = mastered[lessonId]
    const incomingAt = Date.parse(record.updatedAt ?? record.passedAt)
    const previousAt = Date.parse(previous?.updatedAt ?? previous?.passedAt ?? "0")
    if (!previous || incomingAt > previousAt) {
      mastered[lessonId] = record
    }
  }
  return { version: 1, mastered }
}

export function masteryRecord(progress: LearningProgress, lessonId: string): MasteryRecord | null {
  const canonicalId = canonicalCurriculumId(lessonId)
  return canonicalId ? progress.mastered[canonicalId] ?? null : null
}
