import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  CURRICULUM,
  CURRICULUM_ALIASES,
  CURRICULUM_BY_ID,
  canonicalCurriculumId,
} from "../src/framework/curriculum.ts"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

test("课程清单固定为序 + 18 课 + 毕业，ID/编号唯一", () => {
  assert.equal(CURRICULUM.length, 20)
  assert.deepEqual(CURRICULUM.map((unit) => unit.id), [
    "prologue", ...Array.from({ length: 18 }, (_, i) => `l${String(i + 1).padStart(2, "0")}`), "graduation",
  ])
  assert.equal(new Set(CURRICULUM.map((unit) => unit.id)).size, CURRICULUM.length)
  assert.equal(new Set(CURRICULUM.map((unit) => unit.num)).size, CURRICULUM.length)
})

test("每课必修契约完整：outcomes/sources 齐全且无未决 drift", () => {
  for (const unit of CURRICULUM) {
    assert.ok(unit.outcomes.length > 0, `${unit.id}: outcomes`)
    assert.ok(unit.sources.length > 0, `${unit.id}: sources`)
    assert.equal(unit.sources.some((source) => source.fidelity === "drift"), false, `${unit.id}: unresolved drift`)
    assert.ok(CURRICULUM_BY_ID.has(unit.id), `${unit.id}: registered`)
  }
})

test("教材无学习管理机制：不设锁、勾、进度与过关接线", () => {
  for (const file of ["App.tsx", "framework/quiz.tsx", "framework/curriculum.ts"]) {
    const body = readFileSync(`${repoRoot}/learn/src/${file}`, "utf8")
    for (const banned of ["usePassLesson", "onAllCorrect", "prerequisites", "contentVersion", "completion-badge", "lock-badge", "lesson-locked"]) {
      assert.equal(body.includes(banned), false, `${file}: ${banned}`)
    }
  }
  assert.equal(existsSync(`${repoRoot}/learn/src/framework/progress.ts`), false, "progress.ts 已删除")
})

test("课程组件与源码引用全部存在", () => {
  const lessonSource = readFileSync(`${repoRoot}/learn/src/framework/lesson.ts`, "utf8")
  for (const unit of CURRICULUM) {
    const componentMatch = lessonSource.match(new RegExp(`${unit.id}: (L\\d+|Prologue|Graduation)`))
    assert.ok(componentMatch, `${unit.id}: component mapping`)
    const component = componentMatch[1]
    const componentPath = component === "Prologue" ? "L00" : component === "Graduation" ? "L99" : component
    readFileSync(`${repoRoot}/learn/src/lessons/${componentPath}.tsx`, "utf8")
    for (const source of unit.sources) {
      const sourcePath = `${repoRoot}/${source.path}`
      assert.equal(existsSync(sourcePath), true, `${unit.id}: ${source.path}`)
      if (source.symbol && source.kind !== "contract" && source.kind !== "artifact") {
        const symbol = source.symbol.split(".").at(-1)!
        assert.match(readFileSync(sourcePath, "utf8"), new RegExp(symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${unit.id}: ${source.symbol}`)
      }
    }
  }
})

test("路由别名唯一并能规范化", () => {
  assert.equal(new Set(CURRICULUM_ALIASES.keys()).size, CURRICULUM_ALIASES.size)
  assert.equal(canonicalCurriculumId("home"), "prologue")
  assert.equal(canonicalCurriculumId("sandbox"), "graduation")
  assert.equal(canonicalCurriculumId("l18"), "l18")
  assert.equal(canonicalCurriculumId("unknown"), null)
})
