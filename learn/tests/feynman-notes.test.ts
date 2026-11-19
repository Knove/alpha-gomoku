import { test } from "node:test"
import assert from "node:assert/strict"
import {
  FEYNMAN_NOTES_STORAGE_KEY,
  FEYNMAN_NOTE_STORAGE_PREFIX,
  emptyFeynmanNotes,
  extractFeynmanFinal,
  loadFeynmanNotes,
  parseFeynmanNotes,
  saveFeynmanNote,
  saveFeynmanNotes,
  upsertFeynmanNote,
} from "../src/framework/feynman-notes.ts"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value },
  }
}

test("费曼定稿只取标记之间的文本，不把后续追问算进笔记", () => {
  const reply = [
    "这遍完整，只差把因果关系再压实。",
    "【费曼定稿】",
    "盘面特征回答现在发生了什么，权重决定每种特征有多重要，预测和终局答案的差给出调整方向。",
    "【费曼定稿结束】",
    "如果把学习率放大十倍，第一步会跨过谷底吗？",
  ].join("\n")
  const final = extractFeynmanFinal(reply)
  assert.ok(final)
  assert.match(final, /盘面特征回答/)
  assert.doesNotMatch(final, /学习率放大十倍/)
  assert.equal(extractFeynmanFinal("只有【费曼定稿】没有结束标记"), null)
})

test("费曼定稿保存在本机独立键中，并按课程规范化", () => {
  const storage = memoryStorage()
  let notes = upsertFeynmanNote(emptyFeynmanNotes(), "home", "这是一段足够长的费曼定稿，用自己的话解释闭环如何产生样本并更新权重。")
  assert.equal(saveFeynmanNotes(notes, storage), true)
  notes = loadFeynmanNotes(storage)
  assert.ok(notes.notes.prologue)
  assert.match(notes.notes.prologue.text, /闭环/)
  assert.ok(storage.data[FEYNMAN_NOTES_STORAGE_KEY])
  assert.ok(storage.data[`${FEYNMAN_NOTE_STORAGE_PREFIX}prologue`])
})

test("两个标签页分别写不同课程时不会互相覆盖", () => {
  const storage = memoryStorage()
  const tabA = upsertFeynmanNote(
    emptyFeynmanNotes(),
    "prologue",
    "标签页 A 用自己的话解释棋盘、搜索、训练和再对弈如何首尾相接。",
  )
  const tabB = upsertFeynmanNote(
    emptyFeynmanNotes(),
    "l03",
    "标签页 B 用自己的话解释预测、损失与梯度如何决定权重的调整方向。",
  )
  assert.equal(saveFeynmanNote("prologue", tabA.notes.prologue, storage), true)
  assert.equal(saveFeynmanNote("l03", tabB.notes.l03, storage), true)
  const merged = loadFeynmanNotes(storage)
  assert.ok(merged.notes.prologue)
  assert.ok(merged.notes.l03)
})

test("两个标签页拿着同一份旧快照时，只写各自课程不回滚另一课", () => {
  const storage = memoryStorage()
  const first = upsertFeynmanNote(
    emptyFeynmanNotes(),
    "prologue",
    "序章旧版：棋盘产生局面，搜索给出访问分布，训练再更新权重。",
  )
  const third = upsertFeynmanNote(
    emptyFeynmanNotes(),
    "l03",
    "第三课旧版：预测和答案的差给出方向，学习率决定步长。",
  )
  assert.equal(saveFeynmanNote("prologue", first.notes.prologue, storage), true)
  assert.equal(saveFeynmanNote("l03", third.notes.l03, storage), true)
  const staleA = loadFeynmanNotes(storage)
  const staleB = loadFeynmanNotes(storage)
  const updatedA = upsertFeynmanNote(staleA, "prologue", "序章新版：自我对弈产生样本，训练更新权重，再用竞技场验收。")
  const updatedB = upsertFeynmanNote(staleB, "l03", "第三课新版：把 x 换成 3，梯度指出权重该往哪边调。")
  assert.equal(saveFeynmanNote("prologue", updatedA.notes.prologue, storage), true)
  assert.equal(saveFeynmanNote("l03", updatedB.notes.l03, storage), true)
  const merged = loadFeynmanNotes(storage)
  assert.match(merged.notes.prologue.text, /序章新版/)
  assert.match(merged.notes.l03.text, /第三课新版/)
})

test("单课笔记损坏不会拖垮其他课程", () => {
  const storage = memoryStorage({
    [`${FEYNMAN_NOTE_STORAGE_PREFIX}prologue`]: JSON.stringify({
      text: "这是一段足够长、格式正确的定稿，解释完整闭环如何产生训练样本。",
      updatedAt: new Date().toISOString(),
    }),
    [`${FEYNMAN_NOTE_STORAGE_PREFIX}l03`]: "{broken",
  })
  const notes = loadFeynmanNotes(storage)
  assert.ok(notes.notes.prologue)
  assert.equal(notes.notes.l03, undefined)
})

test("损坏、未知课程和空泛定稿会被丢弃", () => {
  const storage = memoryStorage({
    [FEYNMAN_NOTES_STORAGE_KEY]: JSON.stringify({
      version: 1,
      notes: {
        unknown: { text: "这段定稿足够长，但它属于不存在的课程节点。", updatedAt: new Date().toISOString() },
        l01: { text: "太短", updatedAt: new Date().toISOString() },
        l02: { text: "这段定稿足够长，但时间戳在未来。", updatedAt: "2999-01-01T00:00:00.000Z" },
      },
    }),
  })
  assert.deepEqual(loadFeynmanNotes(storage), emptyFeynmanNotes())
  assert.deepEqual(parseFeynmanNotes("{not json"), emptyFeynmanNotes())
})

test("费曼定稿不会写入掌握进度", () => {
  const notes = upsertFeynmanNote(emptyFeynmanNotes(), "l03", "这是一段足够长的费曼定稿，解释权重、预测、损失与更新方向，但不代表导师已经判定通过。")
  assert.ok(notes.notes.l03)
  assert.equal("mastered" in notes, false)
})
