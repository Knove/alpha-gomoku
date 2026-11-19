import { canonicalCurriculumId, practiceForLesson, type LessonPractice } from "./curriculum.ts"

export const PRACTICE_ARTIFACT_STORAGE_PREFIX = "alpha-gomoku-learn/practice-artifacts/v1/"
export const PRACTICE_ARTIFACT_CHANGED_EVENT = "alpha-gomoku:practice-artifact-changed"

export interface PracticeArtifact {
  taskId: string
  version: number
  text: string
  savedAt: string
  /** 本机内容指纹；只用于发现错配/误改，不是防伪签名。 */
  digest: string
}

export interface PracticeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

/** 外部标签页写入产物时，只有本页还没开始输入才允许自动切回只读展示。 */
export function shouldAdoptExternalPracticeArtifact(
  text: string | undefined,
  editing: boolean,
  editStarted: boolean,
): boolean {
  return Boolean(text) && editing && !editStarted
}

function browserStorage(): PracticeStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

export function practiceArtifactStorageKey(lessonId: string): string | null {
  const canonicalId = canonicalCurriculumId(lessonId)
  return canonicalId ? `${PRACTICE_ARTIFACT_STORAGE_PREFIX}${canonicalId}` : null
}

export function normalizePracticeArtifactText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (text.length < 8 || text.length > 8_000) return null
  return text
}

function normalizeVerificationText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/[，、]/g, ",")
    .replace(/：/g, ":")
    // 统一算式中的空白，避免 `r − z = -1` 里的 z 被当成独立的 `z = ...` 声明。
    .replace(/\s*([+\-*/×÷])\s*/g, "$1")
}

/**
 * 只对答案唯一的计算题拒绝明显错误的数字。
 * 这不是全自动评分：自由设计题仍由导师核对步骤，不能把“正则通过”当成理解证明。
 */
export function practiceVerificationError(
  practice: LessonPractice | null | undefined,
  value: string,
): string | null {
  const text = normalizePracticeArtifactText(value)
  if (!text) return "产物至少写 8 个字，并保留计算步骤、观察结果或测试输出。"
  const checks = practice?.verification?.checks ?? []
  if (checks.length === 0) return null
  const normalized = normalizeVerificationText(text)
  if ((practice?.verification?.rejects ?? []).some((pattern) => pattern.test(normalized))) {
    return "产物里有否定或错误答案声明；请先核对，再只写最终的正确步骤和结果。"
  }
  const missing = checks
    .filter((check) => !check.pattern.test(normalized) || check.forbidden?.test(normalized))
    .map((check) => check.label)
  return missing.length > 0
    ? `这些数值/步骤还没对上：${missing.join("；")}。请按题目给定值重算后再记录。`
    : null
}

export function practiceArtifactDigest(text: string, taskId: string, version: number): string {
  const source = `${taskId}\u0000${version}\u0000${text}`
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function parsePracticeArtifact(raw: string | null, lessonId: string): PracticeArtifact | null {
  const canonicalId = canonicalCurriculumId(lessonId)
  const practice = practiceForLesson(lessonId)
  if (!raw || !canonicalId || !practice) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const text = normalizePracticeArtifactText(record.text)
    if (!text || typeof record.savedAt !== "string") return null
    if (record.taskId !== practice.id || record.version !== practice.version) return null
    const savedAt = Date.parse(record.savedAt)
    if (!Number.isFinite(savedAt) || savedAt > Date.now() + 5 * 60_000) return null
    const digest = practiceArtifactDigest(text, practice.id, practice.version)
    if (record.digest !== digest) return null
    // 旧版本可能保存过错误答案；加载时重跑数值门禁，别把“已记录”当成仍然有效。
    if (practiceVerificationError(practice, text)) return null
    return {
      taskId: practice.id,
      version: practice.version,
      text,
      savedAt: record.savedAt,
      digest,
    }
  } catch {
    return null
  }
}

export function loadPracticeArtifact(
  lessonId: string,
  storage: PracticeStorage | null = browserStorage(),
): PracticeArtifact | null {
  const key = practiceArtifactStorageKey(lessonId)
  if (!key || !storage) return null
  try {
    return parsePracticeArtifact(storage.getItem(key), lessonId)
  } catch {
    return null
  }
}

/** 判定返回时重新核对磁盘上的产物，防止旧请求给新产物写通过记录。 */
export function practiceArtifactMatchesDigest(
  lessonId: string,
  expectedDigest: string,
  storage: PracticeStorage | null = browserStorage(),
): boolean {
  return loadPracticeArtifact(lessonId, storage)?.digest === expectedDigest
}

export function savePracticeArtifact(
  lessonId: string,
  text: string,
  now: Date = new Date(),
  storage: PracticeStorage | null = browserStorage(),
): PracticeArtifact | null {
  const key = practiceArtifactStorageKey(lessonId)
  const practice = practiceForLesson(lessonId)
  const normalized = normalizePracticeArtifactText(text)
  if (!key || !storage || !normalized || !practice) return null
  if (practiceVerificationError(practice, normalized)) return null
  const artifact: PracticeArtifact = {
    taskId: practice.id,
    version: practice.version,
    text: normalized,
    savedAt: now.toISOString(),
    digest: practiceArtifactDigest(normalized, practice.id, practice.version),
  }
  try {
    storage.setItem(key, JSON.stringify(artifact))
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(PRACTICE_ARTIFACT_CHANGED_EVENT, {
        detail: { lessonId: lessonId.trim(), canonicalId: key.slice(PRACTICE_ARTIFACT_STORAGE_PREFIX.length) },
      }))
    }
    return artifact
  } catch {
    return null
  }
}
