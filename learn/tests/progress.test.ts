import { test } from "node:test"
import assert from "node:assert/strict"
import { CURRICULUM, CURRICULUM_BY_ID } from "../src/framework/curriculum.ts"
import {
  completeUnit,
  completedCount,
  isAvailable,
  isCompleted,
  migrateLegacyProgress,
  type Progress,
} from "../src/framework/progress.ts"

const fresh: Progress = { version: 4, completed: {} }

test("completeUnit 只完成指定语义单元，不修改旧进度", () => {
  const next = completeUnit(fresh, "prologue", CURRICULUM_BY_ID, 123)
  assert.equal(isCompleted(next, CURRICULUM_BY_ID.get("prologue")!), true)
  assert.equal(completedCount(next, CURRICULUM), 1)
  assert.equal(completedCount(fresh, CURRICULUM), 0)
  assert.equal(next.completed.prologue.completedAt, 123)
})

test("前置单元未完成时不能越级；完成后下一单元可达", () => {
  const l01 = CURRICULUM_BY_ID.get("l01")!
  assert.equal(isAvailable(fresh, l01, CURRICULUM_BY_ID), false)
  assert.equal(completeUnit(fresh, "l01", CURRICULUM_BY_ID), fresh)
  const afterPrologue = completeUnit(fresh, "prologue", CURRICULUM_BY_ID)
  assert.equal(isAvailable(afterPrologue, l01, CURRICULUM_BY_ID), true)
})

test("重复完成幂等，毕业必须等到 l18", () => {
  let progress = fresh
  for (const unit of CURRICULUM.slice(0, -2)) progress = completeUnit(progress, unit.id, CURRICULUM_BY_ID)
  const beforeL18 = progress
  assert.equal(isAvailable(progress, CURRICULUM_BY_ID.get("graduation")!, CURRICULUM_BY_ID), false)
  progress = completeUnit(progress, "l18", CURRICULUM_BY_ID)
  assert.notEqual(progress, beforeL18)
  const afterL18 = progress
  progress = completeUnit(progress, "l18", CURRICULUM_BY_ID)
  assert.equal(progress, afterL18)
  assert.equal(isAvailable(progress, CURRICULUM_BY_ID.get("graduation")!, CURRICULUM_BY_ID), true)
})

test("v3 进度按旧显示顺序迁移，不把新增必修课误判为完成", () => {
  const old = {
    unlocked: 14,
    quizPassed: Object.fromEntries([
      "prologue", "l01", "l02", "l03", "l04", "l05", "l07", "l08",
      "l09", "l10", "l11", "l06", "l12", "l13",
    ].map((id) => [id, true])),
  }
  const migrated = migrateLegacyProgress(old, CURRICULUM)!
  for (const id of ["prologue", "l01", "l02", "l03", "l04", "l05", "l06", "l07", "l08", "l09", "l10", "l12", "l13", "l15"])
    assert.ok(migrated.completed[id], id)
  for (const id of ["l11", "l14", "l16", "l17", "l18", "graduation"])
    assert.equal(migrated.completed[id], undefined, id)
})
