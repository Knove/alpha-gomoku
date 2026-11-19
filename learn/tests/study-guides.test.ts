import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CHEAT_SHEETS, cheatSheetFor } from "../src/framework/cheat-sheets.ts"
import { CURRICULUM } from "../src/framework/curriculum.ts"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

test("20 个课程节点各有一张完整的 5 问速查卡", () => {
  assert.deepEqual(
    Object.keys(CHEAT_SHEETS).sort(),
    CURRICULUM.map((unit) => unit.id).sort(),
    "速查卡必须与课程节点一一对应",
  )
  for (const unit of CURRICULUM) {
    const sheet = cheatSheetFor(unit.id)
    assert.ok(sheet, `${unit.id}: 缺少速查卡`)
    for (const expected of [sheet.model, sheet.mistake]) {
      assert.ok(expected.trim().length > 0, `${unit.id}: 速查卡内容不完整`)
    }
    assert.ok(sheet.examples.length >= 3 && sheet.examples.length <= 5, `${unit.id}: 需要 3–5 个具体例子`)
    for (const example of sheet.examples) {
      assert.ok(example.trim().length > 0, `${unit.id}: 速查卡例子不能为空`)
    }
    assert.ok(sheet.checklist.length >= 3, `${unit.id}: 使用前检查至少 3 条`)
    assert.equal(sheet.qa.length, 5, `${unit.id}: 必须有 5 个快问快答`)
    assert.equal(new Set(sheet.qa.map((item) => item.q)).size, 5, `${unit.id}: 问题不应重复`)
    for (const item of sheet.qa) {
      assert.ok(item.q.trim().endsWith("？"), `${unit.id}: 快问快答应为问句`)
      assert.ok(item.a.trim().length > 0, `${unit.id}: 快问快答缺少答案`)
    }
  }
  assert.equal(cheatSheetFor("unknown"), null)
})

test("速查卡通过后才展开，且不参与掌握判定", () => {
  const chapterEnd = readFileSync(`${repoRoot}/learn/src/framework/def.tsx`, "utf8")
  for (const expected of ["cheatSheetFor", "一页速查卡", "lesson-cheat-sheet", "cheat-sheet-flow", "cheatSheet.examples", "5 个快问快答", "openTutor(\"quiz\", \"quick\")", "openTutor(\"quiz\", \"full\")"]) {
    assert.ok(chapterEnd.includes(expected), `ChapterEnd 缺少：${expected}`)
  }
  assert.equal(chapterEnd.includes("markMastered"), false, "速查卡不能写入掌握记录")
  assert.equal(chapterEnd.includes("localStorage"), false, "速查卡不能自己保存过关状态")

  const rail = readFileSync(`${repoRoot}/learn/src/framework/study-rail.tsx`, "utf8")
  for (const expected of ["本级阶梯卡", "五级全图", "stage.checkpoint", "stage.commonMistake", "stage.selfTests", "用本级自测考我", "用本单元 5 问考我", "复习这 5 个问题", "5 个信号源 · 7 天冲刺", "上一课 · 30 秒回忆", "previousRecall", "openChapterCheatSheet", "速查卡复习队列", "最早通过的先复习", "不假装知道你的遗忘曲线", "openTutorFromRail(\"quiz\", \"unit\")", "openTutorFromRail(\"quiz\", \"stage\")", "openTutorFromRail(\"quiz\", \"full\")"]) {
    assert.ok(rail.includes(expected), `学习面板缺少：${expected}`)
  }
  for (const expected of ["stageReadyForSelfTest", "stageSelfTestReady", "不参与放行"]) {
    assert.ok(rail.includes(expected), `阶段自测时机缺少：${expected}`)
  }
  assert.equal(rail.includes("markMastered"), false, "学习面板不能自行写入掌握记录")
  assert.ok(rail.includes("提前看标准不等于提前解锁"), "五级全图只能展示标准，不能解锁课程")
})
