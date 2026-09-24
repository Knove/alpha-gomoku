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

test("每课依赖存在且只指向更早课程，必修契约完整", () => {
  const position = new Map(CURRICULUM.map((unit, index) => [unit.id, index]))
  for (const unit of CURRICULUM) {
    assert.ok(unit.outcomes.length > 0, `${unit.id}: outcomes`)
    assert.ok(unit.sources.length > 0, `${unit.id}: sources`)
    assert.equal(unit.sources.some((source) => source.fidelity === "drift"), false, `${unit.id}: unresolved drift`)
    for (const prerequisite of unit.prerequisites) {
      assert.ok(CURRICULUM_BY_ID.has(prerequisite), `${unit.id}: missing ${prerequisite}`)
      assert.ok(position.get(prerequisite)! < position.get(unit.id)!, `${unit.id}: forward dependency ${prerequisite}`)
    }
  }
})

test("课程组件、过关 ID 与源码引用全部存在", () => {
  const lessonSource = readFileSync(`${repoRoot}/learn/src/framework/lesson.ts`, "utf8")
  for (const unit of CURRICULUM) {
    const componentMatch = lessonSource.match(new RegExp(`${unit.id}: (L\\d+|Prologue|Graduation)`))
    assert.ok(componentMatch, `${unit.id}: component mapping`)
    const component = componentMatch[1]
    const componentPath = component === "Prologue" ? "L00" : component === "Graduation" ? "L99" : component
    const body = readFileSync(`${repoRoot}/learn/src/lessons/${componentPath}.tsx`, "utf8")
    if (unit.id !== "graduation") assert.match(body, new RegExp(`pass\\("${unit.id}"\\)`), `${unit.id}: pass ID`)
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
