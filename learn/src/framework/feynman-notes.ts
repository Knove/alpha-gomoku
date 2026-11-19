import { useEffect, useState } from "react"
import { CURRICULUM_BY_ID, canonicalCurriculumId } from "./curriculum.ts"

export const FEYNMAN_NOTES_STORAGE_KEY = "alpha-gomoku-learn/feynman-notes/v1"
export const FEYNMAN_NOTE_STORAGE_PREFIX = `${FEYNMAN_NOTES_STORAGE_KEY}/`
export const FEYNMAN_FINAL_START = "【费曼定稿】"
export const FEYNMAN_FINAL_END = "【费曼定稿结束】"
export const FEYNMAN_NOTE_EVENT = "alpha-gomoku-learn:feynman-note"

export interface FeynmanNote {
  text: string
  updatedAt: string
}

export interface FeynmanNotes {
  version: 1
  notes: Record<string, FeynmanNote>
}

export interface NoteStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function emptyFeynmanNotes(): FeynmanNotes {
  return { version: 1, notes: {} }
}

function noteStorageKey(lessonId: string) {
  return `${FEYNMAN_NOTE_STORAGE_PREFIX}${lessonId}`
}

interface FeynmanBlock {
  body: string
  error: string | null
}

/** 标记必须独占一行、位于代码围栏外，并且一条消息最多一个定稿块。 */
function inspectFeynmanBlock(text: string): FeynmanBlock | null {
  const source = String(text ?? "")
  const lines = source.split(/\r?\n/)
  const starts: number[] = []
  const ends: number[] = []
  let misplaced = false
  let inFence = false

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const withoutInlineCode = trimmed.replace(/`[^`]*`/g, " ")
    const mentionsStart = withoutInlineCode.includes(FEYNMAN_FINAL_START)
    const mentionsEnd = withoutInlineCode.includes(FEYNMAN_FINAL_END)
    if (!mentionsStart && !mentionsEnd) return
    if (trimmed === FEYNMAN_FINAL_START) starts.push(index)
    else if (trimmed === FEYNMAN_FINAL_END) ends.push(index)
    else misplaced = true
  })

  if (starts.length === 0 && ends.length === 0 && !misplaced) return null
  if (misplaced) return { body: "", error: "定稿标记必须独占一行，不能在句子或行内代码里。" }
  if (starts.length !== 1 || ends.length !== 1) {
    return { body: "", error: "一条消息只能有一个完整定稿块。" }
  }
  if (starts[0] >= ends[0]) {
    return { body: "", error: "定稿结束标记必须位于开始标记之后。" }
  }
  return {
    body: lines.slice(starts[0] + 1, ends[0]).join("\n").trim(),
    error: null,
  }
}

/** 从导师消息中取出定稿块；定稿是学习笔记，不是掌握证据。 */
export function extractFeynmanFinal(text: string): string | null {
  const block = inspectFeynmanBlock(text)
  if (!block || block.error || block.body.length < 20) return null
  return block.body.slice(0, 6000)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeNote(value: unknown): FeynmanNote | null {
  const note = asRecord(value)
  if (!note || typeof note.text !== "string" || typeof note.updatedAt !== "string") return null
  const text = note.text.trim()
  const updatedAt = Date.parse(note.updatedAt)
  if (text.length < 20 || !Number.isFinite(updatedAt) || updatedAt > Date.now() + 5 * 60_000) return null
  return { text: text.slice(0, 6000), updatedAt: new Date(updatedAt).toISOString() }
}

export function parseFeynmanNotes(raw: string | null): FeynmanNotes {
  if (!raw) return emptyFeynmanNotes()
  try {
    const parsed = asRecord(JSON.parse(raw))
    if (!parsed || parsed.version !== 1) return emptyFeynmanNotes()
    const input = asRecord(parsed.notes)
    if (!input) return emptyFeynmanNotes()
    const notes: Record<string, FeynmanNote> = {}
    for (const [lessonId, value] of Object.entries(input)) {
      const canonicalId = canonicalCurriculumId(lessonId)
      if (!canonicalId || !CURRICULUM_BY_ID.has(canonicalId)) continue
      const note = normalizeNote(value)
      if (note) notes[canonicalId] = note
    }
    return { version: 1, notes }
  } catch {
    return emptyFeynmanNotes()
  }
}

function browserStorage(): NoteStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

export function loadFeynmanNotes(storage: NoteStorage | null = browserStorage()): FeynmanNotes {
  if (!storage) return emptyFeynmanNotes()
  try {
    // 先读旧版聚合键，再用每课独立键覆盖。两标签页写不同课程时不会互相丢笔记。
    const aggregate = parseFeynmanNotes(storage.getItem(FEYNMAN_NOTES_STORAGE_KEY))
    const notes = { ...aggregate.notes }
    for (const unit of CURRICULUM_BY_ID.values()) {
      const raw = storage.getItem(noteStorageKey(unit.id))
      if (!raw) continue
      try {
        const note = normalizeNote(JSON.parse(raw))
        if (note) notes[unit.id] = note
      } catch {
        // 单课损坏不拖垮其他课的笔记。
      }
    }
    return { version: 1, notes }
  } catch {
    return emptyFeynmanNotes()
  }
}

export function saveFeynmanNotes(
  notes: FeynmanNotes,
  storage: NoteStorage | null = browserStorage(),
): boolean {
  if (!storage) return false
  try {
    for (const [lessonId, note] of Object.entries(notes.notes)) {
      const canonicalId = canonicalCurriculumId(lessonId)
      if (!canonicalId || !CURRICULUM_BY_ID.has(canonicalId)) continue
      storage.setItem(noteStorageKey(canonicalId), JSON.stringify(note))
    }
    // 聚合键只用于旧版本迁移和人工查看；每课独立键才是并发安全的读取源。
    try {
      storage.setItem(FEYNMAN_NOTES_STORAGE_KEY, JSON.stringify(notes))
    } catch {
      // 聚合键写失败不影响每课笔记已经落盘。
    }
    return true
  } catch {
    return false
  }
}

/** 只写当前课程，避免两个标签页拿着旧快照时把别的课回滚。 */
export function saveFeynmanNote(
  lessonId: string,
  note: FeynmanNote,
  storage: NoteStorage | null = browserStorage(),
): boolean {
  if (!storage) return false
  const canonicalId = canonicalCurriculumId(lessonId)
  if (!canonicalId || !CURRICULUM_BY_ID.has(canonicalId)) return false
  try {
    storage.setItem(noteStorageKey(canonicalId), JSON.stringify(note))
    // 聚合键只服务旧版本迁移；读不到或写失败都不影响每课独立键。
    try {
      const aggregate = parseFeynmanNotes(storage.getItem(FEYNMAN_NOTES_STORAGE_KEY))
      storage.setItem(FEYNMAN_NOTES_STORAGE_KEY, JSON.stringify({
        version: 1,
        notes: { ...aggregate.notes, [canonicalId]: note },
      }))
    } catch {
      // 单课键已经写入，聚合键失败不回滚这次笔记。
    }
    return true
  } catch {
    return false
  }
}

export function upsertFeynmanNote(
  notes: FeynmanNotes,
  lessonId: string,
  text: string,
  now: Date = new Date(),
): FeynmanNotes {
  const canonicalId = canonicalCurriculumId(lessonId)
  const final = text.trim()
  if (!canonicalId || !CURRICULUM_BY_ID.has(canonicalId) || final.length < 20) return notes
  return {
    version: 1,
    notes: {
      ...notes.notes,
      [canonicalId]: { text: final.slice(0, 6000), updatedAt: now.toISOString() },
    },
  }
}

/** 导师返回定稿块时自动存到本机；写入失败不阻塞对话。 */
export function rememberFeynmanFinal(lessonId: string, reply: string): FeynmanNote | null {
  const final = extractFeynmanFinal(reply)
  if (!final) return null
  const next = upsertFeynmanNote(emptyFeynmanNotes(), lessonId, final)
  const note = next.notes[canonicalCurriculumId(lessonId) ?? ""] ?? null
  if (!note) return null
  if (!saveFeynmanNote(lessonId, note)) return null
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FEYNMAN_NOTE_EVENT, { detail: { lessonId } }))
  }
  return note
}

export function useFeynmanNote(lessonId: string): FeynmanNote | null {
  const canonicalId = canonicalCurriculumId(lessonId)
  const [snapshot, setSnapshot] = useState<{ lessonId: string | null; note: FeynmanNote | null }>(() => (
    { lessonId: canonicalId, note: canonicalId ? loadFeynmanNotes().notes[canonicalId] ?? null : null }
  ))
  const note = snapshot.lessonId === canonicalId
    ? snapshot.note
    : canonicalId
      ? loadFeynmanNotes().notes[canonicalId] ?? null
      : null

  useEffect(() => {
    const refresh = () => setSnapshot({
      lessonId: canonicalId,
      note: canonicalId ? loadFeynmanNotes().notes[canonicalId] ?? null : null,
    })
    refresh()
    const onLocal = () => refresh()
    const onStorage = (event: StorageEvent) => {
      if (event.key === FEYNMAN_NOTES_STORAGE_KEY || event.key?.startsWith(FEYNMAN_NOTE_STORAGE_PREFIX)) refresh()
    }
    window.addEventListener(FEYNMAN_NOTE_EVENT, onLocal)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(FEYNMAN_NOTE_EVENT, onLocal)
      window.removeEventListener("storage", onStorage)
    }
  }, [canonicalId])

  return note
}
