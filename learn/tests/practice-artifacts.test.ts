import { test } from "node:test"
import assert from "node:assert/strict"
import { CURRICULUM, practiceForLesson } from "../src/framework/curriculum.ts"
import {
  PRACTICE_ARTIFACT_STORAGE_PREFIX,
  loadPracticeArtifact,
  parsePracticeArtifact,
  practiceArtifactMatchesDigest,
  practiceVerificationError,
  practiceArtifactStorageKey,
  savePracticeArtifact,
  shouldAdoptExternalPracticeArtifact,
  type PracticeStorage,
} from "../src/framework/practice-artifacts.ts"

function memoryStorage(): PracticeStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

test("20 个课程节点都有可执行的动手任务和可核对产物", () => {
  for (const lesson of CURRICULUM) {
    const practice = practiceForLesson(lesson.id)
    assert.ok(practice, `${lesson.id}: 缺少动手任务`)
    assert.ok(practice.task.trim().length >= 20, `${lesson.id}: 任务太笼统`)
    assert.ok(practice.deliverable.trim().length >= 8, `${lesson.id}: 没有说清提交什么`)
    assert.ok(practice.task !== practice.deliverable, `${lesson.id}: 任务与产物不能是同一句话`)
  }
  assert.deepEqual(practiceForLesson("home"), practiceForLesson("prologue"), "别名应解析到序章")
  assert.equal(practiceForLesson("not-a-lesson"), null)
})

test("动手产物按课程独立保存，并带可信时间戳", () => {
  const storage = memoryStorage()
  const at = new Date("2026-11-05T02:00:00Z")
  const prologue = savePracticeArtifact("prologue", "action 58 换成 (4, 6)，来自 real.ts。", at, storage)
  const l01 = savePracticeArtifact("l01", "action 58 换成 (4, 6)；(3, 7) 换成 action 66；(9, 0) 越界，不合法。", at, storage)
  assert.ok(prologue && l01)
  assert.equal(prologue.taskId, "prologue-v1")
  assert.equal(prologue.version, 1)
  assert.match(prologue.digest, /^[0-9a-f]{8}$/)
  assert.equal(loadPracticeArtifact("prologue", storage)?.text, prologue.text)
  assert.equal(loadPracticeArtifact("l01", storage)?.text, l01.text)
  assert.equal(practiceArtifactStorageKey("home"), `${PRACTICE_ARTIFACT_STORAGE_PREFIX}prologue`)
})

test("短产物、未知课程和损坏记录会被拒绝", () => {
  const storage = memoryStorage()
  assert.equal(savePracticeArtifact("prologue", "太短", new Date(), storage), null)
  assert.equal(loadPracticeArtifact("not-a-lesson", storage), null)
  assert.equal(parsePracticeArtifact("{broken", "prologue"), null)
  storage.setItem(practiceArtifactStorageKey("prologue")!, JSON.stringify({
    text: "这是一份足够长的产物内容。",
    savedAt: "future",
  }))
  assert.equal(loadPracticeArtifact("prologue", storage), null)
})

test("动手产物过长会被截断保护拒绝，而不是悄悄写进本机", () => {
  const storage = memoryStorage()
  assert.equal(savePracticeArtifact("prologue", "课".repeat(8_001), new Date(), storage), null)
  assert.equal(loadPracticeArtifact("prologue", storage), null)
})

test("产物被手改、换任务版本或换课时，旧记录会被拒绝而不是静默复用", () => {
  const storage = memoryStorage()
  const saved = savePracticeArtifact("prologue", "action 58 换成 (4, 6)，来自 real.ts。", new Date(), storage)
  assert.ok(saved)
  const key = practiceArtifactStorageKey("prologue")!
  storage.setItem(key, JSON.stringify({ ...saved, text: "action 58 换成 (9, 9)。" }))
  assert.equal(loadPracticeArtifact("prologue", storage), null, "改正文后旧指纹必须失配")
  storage.setItem(key, JSON.stringify({ ...saved, taskId: "prologue-v0" }))
  assert.equal(loadPracticeArtifact("prologue", storage), null, "换任务版本后旧产物不能继续算数")
  assert.equal(loadPracticeArtifact("l01", storage), null, "产物不能跨课复用")
})

test("答案唯一的计算题会先核对关键数值，错误数字不能保存或送判定", () => {
  const storage = memoryStorage()
  const validL03 = "取 x=3、w=0、z=1、lr=0.1：预测 r=0，误差 r−z=−1，平方损失=1，梯度=−6，更新后 w=0.6。"
  assert.equal(practiceVerificationError(practiceForLesson("l03"), validL03), null)
  assert.ok(savePracticeArtifact("l03", validL03, new Date(), storage))

  const wrongL03 = "取 x=999、w=0、z=1、lr=0.1：预测 r=0，误差 r−z=−1，平方损失=1，梯度=123，更新后 w=999。"
  assert.match(practiceVerificationError(practiceForLesson("l03"), wrongL03) ?? "", /x = 3|梯度 = -6|w = 0.6/)
  assert.equal(savePracticeArtifact("l03", wrongL03, new Date(), storage), null)

  assert.equal(practiceVerificationError(
    practiceForLesson("l01"),
    "action 58 换成 (4, 6)；(3, 7) 换成 action 66；(9, 0) 越界，不合法。",
  ), null)
  assert.match(practiceVerificationError(
    practiceForLesson("l01"),
    "action 58 换成 (6, 4)；(3, 7) 换成 action 66；(9, 0) 合法。",
  ) ?? "", /58 对应 \(4, 6\)|\(9, 0\) 越界|否定|错误/)

  assert.equal(practiceVerificationError(
    practiceForLesson("l02"),
    "白方刚落下且白胜：白子记 +1，黑子记 −1，所以 z = +1；棋盘符号和 z 同号，因为都站在行棋方视角。",
  ), null)
  assert.equal(practiceVerificationError(
    practiceForLesson("l15"),
    "挑战者 12 胜 8 负，得分率 12/20 = 60%，超过 55% 线，晋升；但 20 局样本不足，不能证明长期更强。",
  ), null)
})

test("正确数字后面跟着否定结论，也不能混过确定性门禁", () => {
  const contradictions = [
    ["l01", "action 58 不是 (4, 6)，(3, 7) 对应 action 66；(9, 0) 越界。"],
    ["l01", "action 58 换成 (4, 6)；(3, 7) 换成 action 66；(9, 0) 不是越界。"],
    ["l02", "白子不是 +1，黑子记 −1，所以 z = +1；都站在行棋方视角。"],
    ["l02", "白子记 +1，黑子记 −1，z = +1；但棋盘符号和 z 不同号。"],
    ["l03", "取 x=3、w=0、z=1、lr=0.1：预测 r=0，误差 r−z=−1，平方损失=1，梯度=−6，更新后 w=0.6，但梯度为负时要把 w 调小。"],
    ["l15", "挑战者 12 胜 8 负，得分率 12/20 = 60%，超过 55% 线，但最终未晋升。"],
    ["l15", "挑战者 12 胜 8 负，得分率 12/20 = 60%，超过 55% 线，晋升；但得分率不是 60%。"],
  ] as const
  for (const [lessonId, text] of contradictions) {
    assert.match(
      practiceVerificationError(practiceForLesson(lessonId), text) ?? "",
      /否定|错误/,
      `${lessonId} 不应接受带否定结论的产物：${text}`,
    )
  }
})

test("外部产物只在用户尚未开始输入时自动接管面板", () => {
  assert.equal(shouldAdoptExternalPracticeArtifact("已经算完的产物。", true, false), true)
  assert.equal(shouldAdoptExternalPracticeArtifact("已经算完的产物。", false, false), false)
  assert.equal(shouldAdoptExternalPracticeArtifact("已经算完的产物。", true, true), false, "不能覆盖用户正在写的草稿")
  assert.equal(shouldAdoptExternalPracticeArtifact(undefined, true, false), false)
})

test("判定使用的产物指纹必须与当前存储一致", () => {
  const storage = memoryStorage()
  const saved = savePracticeArtifact("prologue", "action 58 换成 (4, 6)，来自 real.ts。", new Date(), storage)
  assert.ok(saved)
  assert.equal(practiceArtifactMatchesDigest("prologue", saved.digest, storage), true)

  savePracticeArtifact("prologue", "action 58 换成 (8, 0)，来自更新后的另一标签页。", new Date(), storage)
  assert.equal(
    practiceArtifactMatchesDigest("prologue", saved.digest, storage),
    false,
    "产物更新后，飞行中的旧判定不能再落地",
  )
})
