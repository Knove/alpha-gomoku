import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CURRICULUM, STAGES } from "../src/framework/curriculum.ts"
import {
  CAPSTONE,
  CORE_UNITS,
  SEVEN_DAY_PATH,
  SIGNAL_RESOURCES,
  coreUnitCompleted,
  coreUnitForLesson,
  coreUnitMasteryCount,
  stageSelfTestReady,
} from "../src/framework/study-system.ts"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

test("20 小时主线固定为 10 个单元，覆盖全部 20 个课程节点", () => {
  assert.equal(CORE_UNITS.length, 10)
  assert.deepEqual(CORE_UNITS.flatMap((unit) => unit.lessonIds), CURRICULUM.map((unit) => unit.id))
  assert.equal(CORE_UNITS.reduce((sum, unit) => sum + unit.hours, 0), 20)
  assert.equal(new Set(CORE_UNITS.flatMap((unit) => unit.lessonIds)).size, CURRICULUM.length)
})

test("每个核心单元都有目标、核心概念、练习、产出、资源和 5 个不重复的复习问题", () => {
  for (const unit of CORE_UNITS) {
    assert.equal(unit.hours, 2, `${unit.id}: 每个单元约为 2 小时`)
    for (const expected of [unit.goal, unit.why, unit.exercise, unit.output, unit.resource]) {
      assert.ok(expected.trim().length > 0, `${unit.id}: 缺少学习动作或资源`)
    }
    assert.ok(unit.coreConcepts.length >= 3, `${unit.id}: 至少 3 个核心概念`)
    assert.ok(unit.reviewQuestions.length >= 5, `${unit.id}: 至少 5 个复习问题`)
    assert.equal(new Set(unit.reviewQuestions).size, unit.reviewQuestions.length, `${unit.id}: 问题不应重复`)
    for (const question of unit.reviewQuestions) {
      assert.ok(question.trim().endsWith("？"), `${unit.id}: 复习问题应是可回答的问句`)
    }
  }
})

test("资源策展固定为 5 个信号源，并给出 7 天节奏", () => {
  assert.equal(SIGNAL_RESOURCES.length, 5)
  assert.equal(new Set(SIGNAL_RESOURCES.map((resource) => resource.title)).size, 5)
  for (const resource of SIGNAL_RESOURCES) {
    for (const expected of [resource.kind, resource.level, resource.fit, resource.why, resource.covers, resource.use, resource.avoid]) {
      assert.ok(expected.trim().length > 0, `${resource.title}: 资源说明不完整`)
    }
    assert.ok(resource.href.startsWith("#/") || resource.href.startsWith("https://github.com/Knove/alpha-gomoku/"),
      `${resource.title}: 资源必须有可用入口`)
  }
  assert.equal(SEVEN_DAY_PATH.length, 7)
  assert.deepEqual(SEVEN_DAY_PATH.map((day) => day.day), ["D1", "D2", "D3", "D4", "D5", "D6", "D7"])
  const resourceTitles = new Set(SIGNAL_RESOURCES.map((resource) => resource.title))
  for (const day of SEVEN_DAY_PATH) {
    assert.ok(day.resources.length > 0, `${day.day}: 应指定当天使用的信号源`)
    for (const title of day.resources) {
      assert.ok(resourceTitles.has(title), `${day.day}: 未知信号源 ${title}`)
    }
  }
})

test("毕业项目要求迁移规则改动，不只看训练损失", () => {
  assert.ok(CAPSTONE.title.length > 0)
  assert.ok(CAPSTONE.goal.includes("9×9"))
  assert.ok(CAPSTONE.deliverable.includes("可复现"))
  assert.ok(CAPSTONE.acceptance.length >= 4)
  assert.ok(CAPSTONE.acceptance.some((item) => item.includes("受控对局")))
})

test("毕业页使用同一条迁移项目，不让诊断题替代真实交付", () => {
  const graduation = readFileSync(`${repoRoot}/learn/src/lessons/L99.tsx`, "utf8")
  for (const expected of [
    'import { CAPSTONE } from "../framework/study-system"',
    "CAPSTONE.title",
    "CAPSTONE.goal",
    "CAPSTONE.deliverable",
    "CAPSTONE.acceptance",
    "它们不替代这次迁移项目",
  ]) {
    assert.ok(graduation.includes(expected), `毕业页缺少：${expected}`)
  }
  assert.equal(graduation.includes("出师任务三件"), false, "毕业页不应继续承诺另一套出师任务")
})

test("单元复盘与阶段自测共用同一套全通过资格，不靠页面各自猜测", () => {
  const unit = coreUnitForLesson("l03")
  assert.equal(unit?.id, "core-02")
  assert.equal(coreUnitForLesson("missing"), null)
  if (!unit) return

  const oneLesson = (lessonId: string) => lessonId === unit.lessonIds[0]
  assert.equal(coreUnitMasteryCount(unit, oneLesson), 1)
  assert.equal(coreUnitCompleted(unit, oneLesson), false)
  assert.equal(coreUnitCompleted(unit, () => true), true)

  const foundation = STAGES.find((stage) => stage.id === "foundation") ?? null
  assert.equal(stageSelfTestReady(null, () => true), false)
  assert.equal(stageSelfTestReady(foundation, () => false), false)
  assert.equal(stageSelfTestReady(foundation, (lessonId) => ["prologue", "l01"].includes(lessonId)), true)
  assert.equal(stageSelfTestReady(foundation, () => true), true, "阶段末课可以反复做诊断")

  const search = STAGES.find((stage) => stage.id === "search") ?? null
  assert.equal(stageSelfTestReady(search, (lessonId) => ["l07", "l08", "l09"].includes(lessonId)), false)
  assert.equal(stageSelfTestReady(search, (lessonId) => ["l07", "l08", "l09", "l10"].includes(lessonId)), true)
})
