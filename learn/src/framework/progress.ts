import type { CurriculumUnit } from "./curriculum"

export interface UnitCompletion {
  contentVersion: number
  completedAt: number
}

export interface Progress {
  version: 4
  completed: Record<string, UnitCompletion>
}

interface LegacyProgress {
  unlocked?: unknown
  quizPassed?: unknown
}

export const PROGRESS_KEY = "learn-progress-v4"
const LEGACY_KEYS = ["learn-progress-v3", "learn-progress-v2"] as const

const freshProgress = (): Progress => ({ version: 4, completed: {} })

function parseProgress(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeV4(value: unknown, curriculum: readonly CurriculumUnit[]): Progress | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<Progress>
  if (candidate.version !== 4 || !candidate.completed || typeof candidate.completed !== "object") return null
  const completed: Record<string, UnitCompletion> = {}
  for (const unit of curriculum) {
    const saved = candidate.completed[unit.id]
    if (!saved || typeof saved !== "object") continue
    const entry = saved as Partial<UnitCompletion>
    if (entry.contentVersion !== unit.contentVersion || typeof entry.completedAt !== "number") continue
    completed[unit.id] = { contentVersion: entry.contentVersion, completedAt: entry.completedAt }
  }
  return { version: 4, completed }
}

export function migrateLegacyProgress(value: unknown, curriculum: readonly CurriculumUnit[]): Progress | null {
  if (!value || typeof value !== "object") return null
  const legacy = value as LegacyProgress
  if (!legacy.quizPassed || typeof legacy.quizPassed !== "object") return null
  const quizPassed = legacy.quizPassed as Record<string, unknown>
  const completed: Record<string, UnitCompletion> = {}
  const migratedAt = Date.now()
  // v3 的显示顺序曾把源文件 L07-L11 放在第 6-10 课、L06 放在第 11 课。
  // 新课程 ID 表示稳定的语义位置，因此迁移时显式映射，不能按同名 ID 猜测。
  // 新增的 l11、l14、l16-l18 以及毕业包含旧测验未覆盖的必修内容，不自动通过。
  const legacyToCurrent: Record<string, string> = {
    prologue: "prologue",
    l01: "l01",
    l02: "l02",
    l03: "l03",
    l04: "l04",
    l05: "l05",
    l07: "l06",
    l08: "l07",
    l09: "l08",
    l10: "l09",
    l11: "l10",
    l12: "l12",
    l06: "l13",
    l13: "l15",
  }
  for (const [legacyId, currentId] of Object.entries(legacyToCurrent)) {
    if (quizPassed[legacyId] !== true) continue
    const unit = curriculum.find((entry) => entry.id === currentId)
    if (!unit) continue
    completed[currentId] = { contentVersion: unit.contentVersion, completedAt: migratedAt }
  }
  return { version: 4, completed }
}

export function loadProgress(curriculum: readonly CurriculumUnit[]): Progress {
  try {
    const current = normalizeV4(parseProgress(localStorage.getItem(PROGRESS_KEY)), curriculum)
    if (current) return current
    for (const key of LEGACY_KEYS) {
      const migrated = migrateLegacyProgress(parseProgress(localStorage.getItem(key)), curriculum)
      if (!migrated) continue
      saveProgress(migrated)
      return migrated
    }
  } catch {
    /* private mode */
  }
  return freshProgress()
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    /* ignore */
  }
}

export function isCompleted(progress: Progress, unit: CurriculumUnit): boolean {
  return progress.completed[unit.id]?.contentVersion === unit.contentVersion
}

export function isAvailable(
  progress: Progress,
  unit: CurriculumUnit,
  curriculumById: ReadonlyMap<string, CurriculumUnit>,
): boolean {
  return unit.prerequisites.every((id) => {
    const prerequisite = curriculumById.get(id)
    return prerequisite ? isCompleted(progress, prerequisite) : false
  })
}

export function completeUnit(
  progress: Progress,
  unitId: string,
  curriculumById: ReadonlyMap<string, CurriculumUnit>,
  completedAt = Date.now(),
): Progress {
  const unit = curriculumById.get(unitId)
  if (!unit || !isAvailable(progress, unit, curriculumById)) return progress
  if (isCompleted(progress, unit)) return progress
  return {
    version: 4,
    completed: {
      ...progress.completed,
      [unit.id]: { contentVersion: unit.contentVersion, completedAt },
    },
  }
}

export function completedCount(progress: Progress, curriculum: readonly CurriculumUnit[]): number {
  return curriculum.filter((unit) => isCompleted(progress, unit)).length
}

export function firstIncompleteAvailable(
  progress: Progress,
  curriculum: readonly CurriculumUnit[],
  curriculumById: ReadonlyMap<string, CurriculumUnit>,
): CurriculumUnit {
  return curriculum.find((unit) => !isCompleted(progress, unit) && isAvailable(progress, unit, curriculumById))
    ?? curriculum[curriculum.length - 1]
}
