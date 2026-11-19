import { test } from "node:test"
import assert from "node:assert/strict"
import { CURRICULUM, isStageCheckpoint, practiceForLesson } from "../src/framework/curriculum.ts"
import { practiceArtifactDigest } from "../src/framework/practice-artifacts.ts"
import {
  PROGRESS_STORAGE_KEY,
  emptyProgress,
  frontierIndex,
  inspectProgress,
  isLessonMastered,
  isLessonUnlocked,
  loadProgress,
  loadProgressState,
  mergeProgress,
  parseProgress,
  recordMastery,
  resetCorruptProgress,
  saveProgress,
  type ProgressStorage,
} from "../src/framework/progress.ts"
import type { TutorAssessment } from "../src/framework/tutor-session.ts"

const pass: TutorAssessment = {
  verdict: "pass",
  evidence: [
    { kind: "explanation", text: "能解释自我对弈闭环的因果关系", sourceMessageId: "u1", quote: "对弈产生样本" },
    { kind: "application", text: "能把动作编号用到新的棋盘位置", sourceMessageId: "u2", quote: "用 y 乘 9 再加 x" },
    { kind: "correction", text: "能指出只检查落子点的常见错误边界", sourceMessageId: "u3", quote: "只检查刚落下的那颗子" },
  ],
  gaps: [],
  nextAction: "进入下一课。",
}

const stagePass: TutorAssessment = {
  ...pass,
  evidence: [
    ...pass.evidence,
    { kind: "transfer", text: "能把前一课和后一课的因果串起来", sourceMessageId: "u3", quote: "把第 2 课的视角和终局 z 用到新局" },
  ],
  nextAction: "进入下一阶段。",
}

const retry: TutorAssessment = {
  verdict: "retry",
  evidence: [{ kind: "explanation", text: "只背了结论而没有解释", sourceMessageId: "u1", quote: "只背了结论" }],
  gaps: ["缺少迁移证据"],
  nextAction: "换一个局面重讲。",
}

function memoryStorage(initial?: string): ProgressStorage {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(PROGRESS_STORAGE_KEY, initial)
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
  }
}

test("只有导师 pass 才写入掌握记录", () => {
  const initial = emptyProgress()
  assert.equal(recordMastery(initial, "prologue", retry), initial)
  const prologuePractice = practiceForLesson("prologue")!
  const artifactText = "action 58 换成 (4, 6)，来源是 REAL.selfplayGame 的真实记录。"
  const artifact = {
    taskId: prologuePractice.id,
    version: prologuePractice.version,
    text: artifactText,
    savedAt: "2026-11-04T00:00:00.000Z",
    digest: practiceArtifactDigest(artifactText, prologuePractice.id, prologuePractice.version),
  }
  const passed = recordMastery(initial, "prologue", pass, new Date("2026-11-04T00:00:00Z"), artifact)
  assert.equal(isLessonMastered(passed, "prologue"), true)
  assert.equal(passed.mastered.prologue.passedAt, "2026-11-04T00:00:00.000Z")
  assert.deepEqual(passed.mastered.prologue.evidence, pass.evidence.map((item) => item.text))
  assert.equal(passed.mastered.prologue.scope, "lesson")
  assert.equal(passed.mastered.prologue.practice, artifactText)
  const restored = parseProgress(JSON.stringify(passed)).mastered.prologue
  assert.equal(restored.practice, artifactText)
  assert.equal(restored.practiceDigest, artifact.digest)
  assert.equal(restored.practiceTaskId, artifact.taskId)
})

test("同一课复评会更新判定时间，合并时不会把新产物回滚成旧快照", () => {
  const prologuePractice = practiceForLesson("prologue")!
  const firstText = "action 58 换成 (4, 6)，来源是 REAL.selfplayGame 的真实记录。"
  const secondText = "action 58 换成 (4, 6)，并核对 (3, 7) 换回 action 66。"
  const firstArtifact = {
    taskId: prologuePractice.id,
    version: prologuePractice.version,
    text: firstText,
    savedAt: "2026-11-04T00:00:00.000Z",
    digest: practiceArtifactDigest(firstText, prologuePractice.id, prologuePractice.version),
  }
  const secondArtifact = {
    ...firstArtifact,
    text: secondText,
    savedAt: "2026-11-05T00:00:00.000Z",
    digest: practiceArtifactDigest(secondText, prologuePractice.id, prologuePractice.version),
  }
  const first = recordMastery(emptyProgress(), "prologue", pass, new Date("2026-11-04T00:00:00Z"), firstArtifact)
  const second = recordMastery(first, "prologue", pass, new Date("2026-11-05T00:00:00Z"), secondArtifact)
  assert.equal(second.mastered.prologue.passedAt, "2026-11-04T00:00:00.000Z")
  assert.equal(second.mastered.prologue.updatedAt, "2026-11-05T00:00:00.000Z")
  assert.equal(second.mastered.prologue.practice, secondText)
  const merged = mergeProgress(first, second)
  assert.equal(merged.mastered.prologue.practice, secondText)
  assert.equal(merged.mastered.prologue.practiceDigest, secondArtifact.digest)
})

test("线性边界只放行下一课，不能靠记住后面的课跳级", () => {
  let progress = emptyProgress()
  assert.equal(frontierIndex(progress), 0)
  assert.equal(isLessonUnlocked(progress, "prologue"), true)
  assert.equal(isLessonUnlocked(progress, "l01"), false)

  progress = recordMastery(progress, "prologue", pass)
  assert.equal(frontierIndex(progress), 1)
  assert.equal(isLessonUnlocked(progress, "l01"), true)
  assert.equal(isLessonUnlocked(progress, "l02"), false)

  progress = recordMastery(progress, "l01", pass)
  assert.equal(recordMastery(progress, "l02", pass), progress, "阶段末课不能用普通课三证据放行")
  progress = recordMastery(progress, "l02", stagePass)
  assert.equal(frontierIndex(progress), 3)
  assert.equal(isLessonUnlocked(progress, "l03"), true)
  assert.equal(isLessonUnlocked(progress, "l04"), false)
  assert.equal(progress.mastered.l02.scope, "stage", "第 2 课是阶段末课")
})

test("进度在本机存储中可恢复，损坏或未知课程会被安全丢弃", () => {
  const storage = memoryStorage()
  let progress = emptyProgress()
  progress = recordMastery(progress, "prologue", pass)
  progress = recordMastery(progress, "l01", pass)
  assert.equal(saveProgress(progress, storage), true)

  const restored = loadProgress(storage)
  assert.equal(frontierIndex(restored), 2)
  assert.equal(isLessonMastered(restored, "l01"), true)

  assert.equal(frontierIndex(parseProgress("{broken")), 0)
  const sanitized = parseProgress(JSON.stringify({
    version: 1,
    mastered: {
      l01: { passedAt: "2026-11-04", evidence: ["ok"], nextAction: "next", scope: "lesson" },
      l03: {
        passedAt: "2026-11-04T00:00:00.000Z",
        evidence: pass.evidence.map((item) => item.text),
        nextAction: "进入下一课。",
        scope: "lesson",
      },
      unknown: { passedAt: "2026-11-04", evidence: [], nextAction: "", scope: "lesson" },
    },
  }))
  assert.equal(isLessonMastered(sanitized, "l01"), false, "空证据或过短证据不能恢复")
  assert.equal(isLessonMastered(sanitized, "l03"), true)
  assert.equal(isLessonMastered(sanitized, "unknown"), false)
  assert.equal(frontierIndex(sanitized), 0, "越过序章的单条记录不能伪造线性进度")
})

test("损坏的进度记录不能被静默当成空进度覆盖", () => {
  const storage = memoryStorage("{broken")
  const loaded = loadProgressState(storage)
  assert.equal(loaded.status, "corrupt")
  assert.equal(frontierIndex(loaded.progress), 0)
  assert.equal(saveProgress(emptyProgress(), storage), false, "损坏时写进度必须 fail-closed")
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), "{broken", "原损坏记录必须保留")

  assert.equal(inspectProgress(null).status, "empty")
  const valid = JSON.stringify({ version: 1, mastered: {} })
  assert.equal(inspectProgress(valid).status, "ok")

  const backupKey = resetCorruptProgress(storage, new Date("2026-11-06T00:00:00Z"))
  assert.ok(backupKey)
  assert.equal(storage.getItem(backupKey!), "{broken")
  assert.equal(loadProgressState(storage).status, "ok")
  assert.equal(frontierIndex(loadProgress(storage)), 0)
})

test("双标签页交错写入不会丢掉另一页刚通过的课", () => {
  const storage = memoryStorage()
  const base = emptyProgress()
  const tabA = recordMastery(base, "prologue", pass)
  const tabB = recordMastery(base, "l01", pass)

  assert.equal(saveProgress(tabA, storage), true)
  assert.equal(saveProgress(tabB, storage), true)
  const restored = loadProgress(storage)
  assert.equal(isLessonMastered(restored, "prologue"), true)
  assert.equal(isLessonMastered(restored, "l01"), true)
  assert.equal(frontierIndex(restored), 2)

  const merged = mergeProgress(tabA, tabB)
  assert.deepEqual(Object.keys(merged.mastered).sort(), ["l01", "prologue"])
})

test("完整课程可以通过逐课判定达到毕业边界", () => {
  let progress = emptyProgress()
  for (const unit of CURRICULUM) {
    progress = recordMastery(progress, unit.id, isStageCheckpoint(unit.id) ? stagePass : pass)
  }
  assert.equal(frontierIndex(progress), CURRICULUM.length)
  assert.equal(isLessonUnlocked(progress, "graduation"), true)
})

test("阶段末课的四类证据会完整保存，刷新后不丢迁移证据", () => {
  const archivedStagePass: TutorAssessment = {
    ...stagePass,
    evidence: [
      ...pass.evidence,
      { kind: "transfer", text: "能把前一课和后一课串起来", sourceMessageId: "u4", quote: "把第 2 课的视角和终局 z 用到新局" },
    ],
  }
  const passed = recordMastery(emptyProgress(), "l02", archivedStagePass)
  assert.equal(passed.mastered.l02.evidence.length, 4)
  assert.equal(passed.mastered.l02.evidence.at(-1), "能把前一课和后一课串起来")
})

test("损坏、错阶段 scope、未来时间或缺少迁移证据的本地记录会被拒绝", () => {
  const baseRecord = {
    passedAt: "2026-11-04T00:00:00.000Z",
    evidence: pass.evidence.map((item) => item.text),
    nextAction: "进入下一课。",
  }
  const sanitized = parseProgress(JSON.stringify({
    version: 1,
    mastered: {
      l01: { ...baseRecord, passedAt: "not-a-date", scope: "lesson" },
      l02: { ...baseRecord, scope: "lesson" },
      l03: { ...baseRecord, scope: "stage" },
      l04: { ...baseRecord, nextAction: "", scope: "lesson" },
    },
  }))
  assert.deepEqual(sanitized.mastered, {}, "结构不完整或不匹配阶段契约的记录必须丢弃")

  const forged = parseProgress(JSON.stringify({
    version: 1,
    mastered: {
      l02: { ...baseRecord, scope: "stage" },
    },
  }))
  assert.deepEqual(forged.mastered, {}, "阶段末记录至少要有四条可核对证据")
})
