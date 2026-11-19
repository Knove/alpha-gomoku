import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PassThrough } from "node:stream"
import { fileURLToPath } from "node:url"
import {
  buildAssessmentPrompt,
  buildTutorPrompt,
  guardAssessment,
  isFullQuizWrapUp,
  isQuizWrapUp,
  parseAssessment,
  validateTutorReply,
} from "../tutor/prompt.mjs"
import { isLoopbackHost, originMatchesRequest, readBody, TUTOR_LIMITS } from "../tutor/vite-plugin.mjs"
import { assessmentRequestError, lessonContract, withAuthoritativeContract } from "../tutor/contract.mjs"
import { getTutorQuestions, registerTutorQuestions } from "../src/framework/question-bank.ts"
import { practiceForLesson } from "../src/framework/curriculum.ts"
import { practiceArtifactDigest } from "../src/framework/practice-artifacts.ts"
import {
  PRACTICE_ARTIFACT_SOURCE_ID,
  evidenceQuoteShowsKind,
  isLikelyCopiedFromTutor,
  isSubstantiveEvidenceText,
} from "../src/framework/mastery-contract.ts"
import { extractFeynmanFinal } from "../src/framework/feynman-notes.ts"
import {
  assessmentIsSufficient,
  beginTutorAssessment,
  clearRejectedAssessment,
  completedFeynmanMessages,
  completedTutorMessages,
  completeTutorAssessment,
  emptyTutorSession,
  failTutorRequest,
  invalidateFeynmanEvidence,
  recordTutorReply,
  settledTutorMessages,
  tutorRequestUserMessageId,
} from "../src/framework/tutor-session.ts"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

const lesson = {
  id: "l03",
  num: "3",
  title: "权重：自己变准的机器",
  puzzle: "为什么调 w，又怎样确定方向和距离？",
  phase: "数字开始学习",
  outcomes: ["分清 x、w、r、z 各自角色", "手算一次梯度下降更新"],
  sources: [
    { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "linGrad", fidelity: "constructed" },
    { kind: "python", path: "alphagomoku/train.py", symbol: "make_optimizer", fidelity: "runtime-exact" },
  ],
}

const context = {
  section: "3. 怎样找准调权重的方向：梯度",
  selection: "梯度是负的，权重向右调。",
  lessonText: "x=2，z=+1，r=w*x，损失=(r-z)^2，梯度=2x(wx-z)。",
}

const stage = {
  id: "network",
  title: "看懂了",
  range: "第 3 – 6 课",
  goal: "能手算一次更新，并讲清网络为什么需要非线性。",
  checkpoint: "把特征、权重、预测、损失和一次更新串起来，并解释卷积与三输入面。",
  core: ["x、w、r、z 与平方损失", "点积与加权求和", "ReLU 非线性"],
  practice: "手算一次更新，再用一个 3×3 窗口算点积。",
  commonMistake: "把 x 当成可调权重，把 ReLU 当成装饰。",
  selfTests: ["x=3、w=0、z=1 时梯度是多少？", "为什么线性层需要非线性？", "三个输入面分别回答什么问题？"],
  hours: 5,
  isCheckpoint: true,
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    lesson,
    context,
    mode: "ask",
    message: "为什么梯度为负时要把 w 调大？",
    history: [],
    questionBank: [],
    ...overrides,
  }
}

const explanationEvidence = {
  kind: "explanation" as const,
  text: "学生解释了预测、答案和平方损失之间的关系",
  sourceMessageId: "u1",
  quote: "r 是预测，z 是答案",
}

const applicationEvidence = {
  kind: "application" as const,
  text: "学生把梯度公式用到了新的数字上",
  sourceMessageId: "u2",
  quote: "把 x 换成 3，梯度变成",
}

const correctionEvidence = {
  kind: "correction" as const,
  text: "学生指出了只调预测不调权重的错误",
  sourceMessageId: "u3",
  quote: "只调预测不调权重，系统不会真的学习",
}

const transferEvidence = {
  kind: "transfer" as const,
  text: "学生把视角、样本和权重更新串成了一条跨课链",
  sourceMessageId: "u3",
  quote: "如果只调预测不调权重，系统不会真的学习；把这课和第 2 课的视角串起来看",
}

const l03Practice = practiceForLesson("l03")!
const practiceArtifactText = "取 x=3、w=0、z=1、lr=0.1：r=0，r−z=−1，平方损失=1，梯度=−6，更新后 w=0.6。"
const practiceArtifact = {
  taskId: l03Practice.id,
  version: l03Practice.version,
  text: practiceArtifactText,
  savedAt: "2026-11-05T02:00:00.000Z",
  digest: practiceArtifactDigest(practiceArtifactText, l03Practice.id, l03Practice.version),
}

const artifactApplicationEvidence = {
  kind: "application" as const,
  text: "学生亲手算出了本课的更新数字",
  sourceMessageId: PRACTICE_ARTIFACT_SOURCE_ID,
  quote: practiceArtifactText,
}

function practiceHistory() {
  return [
    { id: "u1", role: "user", mode: "feynman", status: "ok", text: "r 是预测，z 是答案，平方损失量误差。" },
    { id: "a1", role: "assistant", status: "ok", text: "还缺一次换数字。" },
    { id: "u2", role: "user", mode: "feynman", status: "ok", text: "把 x 换成 3，梯度变成 6(w×3−1)。" },
    { id: "a2", role: "assistant", status: "ok", text: "再说一个常见错误。" },
    { id: "u3", role: "user", mode: "feynman", status: "ok", text: "如果只调预测不调权重，系统不会真的学习；把这课和第 2 课的视角串起来看，更新方向也要用同一把尺子。" },
    { id: "a3", role: "assistant", status: "ok", text: "把这两课串起来。" },
  ]
}

test("导师提示词携带当前课、小节、选中原文与源码入口", () => {
  const prompt = buildTutorPrompt(base())
  for (const expected of [
    "权重：自己变准的机器",
    "为什么调 w，又怎样确定方向和距离",
    "3. 怎样找准调权重的方向：梯度",
    "梯度是负的，权重向右调。",
    "learn/src/lib/foundations.ts",
    "alphagomoku/train.py",
    "当前模式是“答疑”",
  ]) {
    assert.ok(prompt.includes(expected), `缺少：${expected}`)
  }
  assert.ok(!prompt.includes("# 本课内部题库（仅考我模式使用）\n1."), "答疑不应注入题库")
})

test("合书复述提示词带上已提交产物和上一轮判定缺口，但不把它们算成学生复述", () => {
  const prompt = buildTutorPrompt(base({
    mode: "feynman",
    message: "我刚才算的这一步对吗？",
    artifact: practiceArtifact,
    retryGaps: ["你还没有解释梯度为负时为什么向右调。"],
  }))
  for (const expected of [
    practiceArtifactText,
    "本课动手产物",
    "不是学生本轮的复述",
    "上一轮独立判定留下的缺口",
    "梯度为负时为什么向右调",
    "不能增加复述轮次",
  ]) {
    assert.ok(prompt.includes(expected), `缺少：${expected}`)
  }

  const askPrompt = buildTutorPrompt(base({ mode: "ask", artifact: practiceArtifact }))
  assert.ok(!askPrompt.includes(practiceArtifactText), "答疑不应把产物当成必带上下文")
})

test("复述模式要求先指漏洞、只补漏掉的一步、再让学生重讲", () => {
  const prompt = buildTutorPrompt(base({
    mode: "feynman",
    message: "我觉得 w 是损失，x 是学习率。",
  }))
  for (const expected of [
    "当前模式是“合书复述”",
    "先明确说对的部分",
    "只重新讲学生漏掉的那一小步",
    "请学生把那一小步重新讲一遍",
    "你只评价这一遍解释",
    "至少收集三类证据",
    "指出一个常见错误或边界",
    "可复制为笔记",
    "【费曼定稿】",
    "定稿不是放行",
  ]) {
    assert.ok(prompt.includes(expected), `缺少：${expected}`)
  }
})

test("导师回复只增加复述轮次，不会自动产生掌握判定", () => {
  const empty = emptyTutorSession("feynman")
  assert.equal(empty.lastRequest, null)
  assert.equal(empty.pendingQuiz, null)
  let session = {
    ...empty,
    messages: [{ id: "u1", role: "user" as const, text: "这一课把误差变成调权重的方向。", status: "pending" as const }],
  }
  session = recordTutorReply(
    session,
    { id: "a1", role: "assistant", text: "对了一半；你还漏了为什么用平方。" },
    "feynman",
  )
  assert.equal(session.feynmanTurns, 1)
  assert.equal(session.messages[0].status, "ok")
  assert.equal(session.messages[1].status, "ok")
  assert.equal(session.assessment, null, "导师回复后不应自动通过")
  assert.equal(session.assessmentLoading, false)

  session = beginTutorAssessment(session)
  assert.equal(session.assessmentLoading, true)
  session = completeTutorAssessment(session, {
    verdict: "pass",
    evidence: [
      explanationEvidence,
      applicationEvidence,
      correctionEvidence,
    ],
    gaps: [],
    nextAction: "进入下一课。",
  })
  assert.equal(session.assessment?.verdict, "pass")
  assert.equal(session.assessmentLoading, false)
})

test("产物变更后旧复述保留在对话里，但不能再计入当前证据", () => {
  const messages = [
    { id: "u1", role: "user" as const, mode: "feynman" as const, status: "ok" as const, text: "先解释误差怎样变成方向。" },
    { id: "a1", role: "assistant" as const, status: "ok" as const, text: "再换一个数字。" },
    { id: "u2", role: "user" as const, mode: "feynman" as const, status: "ok" as const, text: "把 x 换成 3，梯度变成 -6。" },
    { id: "a2", role: "assistant" as const, status: "ok" as const, text: "再指出一个边界。" },
  ]
  let session = {
    ...emptyTutorSession("feynman"),
    messages,
    feynmanTurns: 2,
  }
  assert.equal(completedFeynmanMessages(session.messages).length, 4)
  session = invalidateFeynmanEvidence(session, "产物已变更。")
  assert.equal(session.feynmanTurns, 0)
  assert.equal(session.feynmanEvidenceStart, 4)
  assert.equal(session.assessmentError, "产物已变更。")
  assert.equal(completedFeynmanMessages(session.messages, session.feynmanEvidenceStart).length, 0)

  session = {
    ...session,
    messages: [...session.messages, {
      id: "u3",
      role: "user",
      mode: "feynman",
      status: "pending",
      text: "新产物里换成 x=3，先算预测再算梯度。",
    }],
  }
  session = recordTutorReply(
    session,
    { id: "a3", role: "assistant", status: "ok", text: "这遍接上了，再换一个局面。" },
    "feynman",
    "u3",
  )
  assert.equal(session.feynmanTurns, 1, "只数新产物之后的复述")
})

test("答疑与考我回复不算复述回合", () => {
  for (const mode of ["ask", "quiz"] as const) {
    const session = recordTutorReply(
      emptyTutorSession(mode),
      { id: "a1", role: "assistant", text: "先回答这一小步。" },
      mode,
    )
    assert.equal(session.feynmanTurns, 0, `${mode} 不应增加复述回合`)
    assert.equal(session.assessment, null)
  }
})

test("未通过的旧判定会在新证据出现后作废，通过判定会保留", () => {
  const retry = {
    verdict: "retry" as const,
    evidence: [{ ...explanationEvidence, text: "只解释了表面的一层" }],
    gaps: ["没有迁移证据"],
    nextAction: "换一个数字重算。",
  }
  let session = completeTutorAssessment(emptyTutorSession("feynman"), retry)
  session = clearRejectedAssessment(session)
  assert.equal(session.assessment, null, "新证据后旧 retry 不应继续卡住界面")

  const pass = {
    verdict: "pass" as const,
    evidence: [
      explanationEvidence,
      applicationEvidence,
      correctionEvidence,
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  session = completeTutorAssessment(session, pass)
  assert.equal(clearRejectedAssessment(session).assessment?.verdict, "pass")
})

test("独立判定 JSON 解析严格，掌握护栏要求足够的复述轮次与三类证据", () => {
  const history = practiceHistory()
  const payload = {
    verdict: "pass",
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence],
    gaps: [],
    nextAction: "进入下一课。",
  }
  const pass = parseAssessment(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)
  assert.equal(pass.verdict, "pass")
  assert.equal(pass.evidence[0].sourceMessageId, "u1")
  assert.equal(pass.evidence[0].quote, "r 是预测，z 是答案")
  assert.equal(guardAssessment(pass, history).verdict, "pass")
  assert.equal(guardAssessment(pass, history.slice(0, 2)).verdict, "retry")
  assert.equal(guardAssessment(pass, history, { requiredStudentTurns: 4 }).verdict, "retry")
  assert.equal(guardAssessment(pass, history.map((item) => (
    item.role === "user" ? { ...item, mode: "ask" } : item
  ))).verdict, "retry", "答疑/考我的发言不能冒充复述证据")
  const missingCorrection = {
    ...pass,
    evidence: pass.evidence.filter((item) => item.kind !== "correction"),
  }
  assert.equal(guardAssessment(missingCorrection, history).verdict, "retry")
  assert.equal(guardAssessment(pass, history, { checkpoint: true }).verdict, "retry")
  assert.throws(() => parseAssessment('{"verdict":"maybe"}'), /缺少 pass\/retry/)
})

test("应用证据必须回到学生在复述前亲手提交的产物", () => {
  const history = practiceHistory()
  const pass = {
    verdict: "pass" as const,
    evidence: [explanationEvidence, artifactApplicationEvidence, correctionEvidence],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(pass, history, {
    artifact: practiceArtifact,
    requireArtifact: true,
  }).verdict, "pass")

  const noArtifact = guardAssessment(pass, history, { requireArtifact: true })
  assert.equal(noArtifact.verdict, "retry")
  assert.match(noArtifact.gaps.join(" "), /动手产物/)

  const proseOnly = {
    ...pass,
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence],
  }
  assert.equal(guardAssessment(proseOnly, history, {
    artifact: practiceArtifact,
    requireArtifact: true,
  }).verdict, "retry", "复述里说会算，不能替代产物")

  const fakeArtifactQuote = {
    ...pass,
    evidence: pass.evidence.map((item) => item.kind === "application"
      ? { ...item, quote: "这段数字根本没有出现在产物里" }
      : item),
  }
  assert.equal(guardAssessment(fakeArtifactQuote, history, {
    artifact: practiceArtifact,
    requireArtifact: true,
  }).verdict, "retry")

  const explanationFromArtifact = {
    ...pass,
    evidence: [
      { ...artifactApplicationEvidence, kind: "explanation" as const },
      artifactApplicationEvidence,
      correctionEvidence,
    ],
  }
  assert.equal(guardAssessment(explanationFromArtifact, history, {
    artifact: practiceArtifact,
    requireArtifact: true,
  }).verdict, "retry", "产物只能支撑应用维度，不能同时冒充解释")
})

test("整段照抄导师解释或正文的产物不能成为应用证据", () => {
  const copiedText = "把 x 换成 3，w 保持 0，算得梯度为 −6，这一步说明权重会沿负梯度方向增大。"
  const copiedArtifact = {
    ...practiceArtifact,
    text: copiedText,
    digest: practiceArtifactDigest(copiedText, l03Practice.id, l03Practice.version),
  }
  const pass = {
    verdict: "pass" as const,
    evidence: [
      explanationEvidence,
      { ...artifactApplicationEvidence, quote: copiedText },
      correctionEvidence,
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(pass, practiceHistory(), {
    artifact: copiedArtifact,
    referenceTexts: [copiedText],
    requireArtifact: true,
  }).verdict, "retry")
})

test("判定提示携带本课动手任务、产物和固定证据来源", () => {
  const contract = lessonContract("l03")
  assert.ok(contract?.lesson.practice?.task.includes("x=3"))
  const prompt = buildAssessmentPrompt({
    lesson: contract?.lesson ?? lesson,
    stage: contract?.stage,
    context,
    history: practiceHistory(),
    artifact: practiceArtifact,
  })
  assert.ok(prompt.includes("本课动手任务"))
  assert.ok(prompt.includes("取 x=3、w=0、z=1、lr=0.1"))
  assert.ok(prompt.includes(PRACTICE_ARTIFACT_SOURCE_ID))
  assert.ok(prompt.includes("应用证据的 sourceMessageId 必须是 practice-artifact"))
})

test("判定接口要求复述前已提交可核对的动手产物", () => {
  const l03Contract = lessonContract("l03")
  assert.ok(l03Contract?.lesson.practice)
  const options = { requireArtifact: true, practice: l03Contract.lesson.practice }
  const baseRequest = {
    lesson: { id: "l03" },
    history: [],
    context: { reading: { reachedEnd: true, percent: 100 } },
  }
  assert.match(assessmentRequestError(baseRequest, options) ?? "", /动手任务/)
  assert.match(assessmentRequestError({ ...baseRequest, artifact: { ...practiceArtifact, text: "太短" } }, options) ?? "", /动手任务/)
  assert.match(assessmentRequestError({ ...baseRequest, artifact: { ...practiceArtifact, text: "课".repeat(8_001) } }, options) ?? "", /太长/)
  assert.match(assessmentRequestError({ ...baseRequest, artifact: { ...practiceArtifact, taskId: "l03-v0" } }, options) ?? "", /版本不一致/)
  assert.match(assessmentRequestError({ ...baseRequest, artifact: { ...practiceArtifact, digest: "deadbeef" } }, options) ?? "", /指纹不一致/)
  const wrongNumbers = "取 x=999、w=0、z=1、lr=0.1：预测 r=0，误差 r−z=−1，平方损失=1，梯度=123，更新后 w=999。"
  assert.match(assessmentRequestError({
    ...baseRequest,
    artifact: {
      ...practiceArtifact,
      text: wrongNumbers,
      digest: practiceArtifactDigest(wrongNumbers, l03Practice.id, l03Practice.version),
    },
  }, options) ?? "", /数值\/步骤还没对上|这些数值/)
  assert.equal(assessmentRequestError({
    ...baseRequest,
    artifact: practiceArtifact,
  }, options), null)
})

test("判定证据必须逐字回到不同学生消息；伪造 ID、伪造引文和空话一律降级", () => {
  const history = practiceHistory()
  const pass = {
    verdict: "pass" as const,
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(pass, history).verdict, "pass")

  const fakeSource = {
    ...pass,
    evidence: pass.evidence.map((item, index) => index === 0 ? { ...item, sourceMessageId: "a1" } : item),
  }
  assert.equal(guardAssessment(fakeSource, history).verdict, "retry")

  const fakeQuote = {
    ...pass,
    evidence: pass.evidence.map((item, index) => index === 0 ? { ...item, quote: "这段原话根本没有出现过" } : item),
  }
  assert.equal(guardAssessment(fakeQuote, history).verdict, "retry")

  const sameSource = {
    ...pass,
    evidence: [
      explanationEvidence,
      { ...applicationEvidence, sourceMessageId: "u1", quote: "平方损失量误差" },
      { ...correctionEvidence, sourceMessageId: "u1", quote: "z 是答案" },
    ],
  }
  assert.equal(guardAssessment(sameSource, history).verdict, "retry", "一段长回答不能包办三类证据")

  const emptyTalk = {
    ...pass,
    evidence: pass.evidence.map((item, index) => index === 0 ? { ...item, quote: "我不知道" } : item),
  }
  assert.equal(guardAssessment(emptyTalk, history).verdict, "retry")

  const brokenPair = history.slice(0, 3)
  assert.equal(guardAssessment(pass, brokenPair).verdict, "retry", "没有导师回复的半截请求不能计入")

  const failed = history.map((item) => item.id === "u2" ? { ...item, status: "failed" } : item)
  assert.equal(guardAssessment(pass, failed).verdict, "retry", "失败消息不能成为证据来源")

  const pending = history.map((item) => item.id === "u2" ? { ...item, status: "pending" } : item)
  assert.equal(guardAssessment(pass, pending).verdict, "retry", "未结算消息不能成为证据来源")
  assert.equal(
    completedTutorMessages(pending).some((item) => item.id === "u2"),
    false,
    "客户端也不能把 pending 当成完整成功的一轮",
  )
})

test("空泛认同和含糊附和不能冒充可核对证据", () => {
  for (const vague of ["我不知道", "我同意刚才的说法", "大概就是这样吧", "我觉得刚才说得对", "应该是这样"]) {
    assert.equal(isSubstantiveEvidenceText(vague), false, `空话不应算证据：${vague}`)
  }
  for (const concrete of ["把胜负变成同尺度的 z", "先算梯度再决定权重方向", "旋转棋盘时 π 也要同步旋转"]) {
    assert.equal(isSubstantiveEvidenceText(concrete), true, `具体陈述应能作为证据：${concrete}`)
  }
})

test("一条实质复述加一句“嗯”加产物，不能凑成两轮独立复述", () => {
  const history = [
    { id: "u1", role: "user", mode: "feynman", status: "ok", text: "r 是预测，z 是答案，平方损失量误差。" },
    { id: "a1", role: "assistant", status: "ok", text: "再算一个应用。" },
    { id: "u2", role: "user", mode: "feynman", status: "ok", text: "嗯" },
    { id: "a2", role: "assistant", status: "ok", text: "还有别的吗？" },
  ]
  const pass = {
    verdict: "pass" as const,
    evidence: [
      explanationEvidence,
      { ...applicationEvidence, sourceMessageId: PRACTICE_ARTIFACT_SOURCE_ID, quote: practiceArtifactText },
      { ...correctionEvidence, sourceMessageId: "u1", quote: "平方损失量误差" },
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(pass, history, {
    requireArtifact: true,
    artifact: practiceArtifact,
    requiredStudentTurns: 2,
  }).verdict, "retry")
})

test("应用、纠错和迁移不能只靠标签冒充，引文必须出现对应结构", () => {
  assert.equal(evidenceQuoteShowsKind("application", "权重决定每个特征有多重要"), false)
  assert.equal(evidenceQuoteShowsKind("application", "第 2 课说 w 是参数"), false)
  assert.equal(evidenceQuoteShowsKind("application", "把 x 换成 3 后梯度变成 12"), true)
  assert.equal(evidenceQuoteShowsKind("application", "白胜时黑方的 z 是 -1"), true)
  assert.equal(evidenceQuoteShowsKind("correction", "r 是预测，z 是答案"), false)
  assert.equal(evidenceQuoteShowsKind("correction", "我还是不太清楚这个"), false)
  assert.equal(evidenceQuoteShowsKind("correction", "只调预测不调权重，系统不会学习"), true)
  assert.equal(evidenceQuoteShowsKind("correction", "只翻棋盘不翻 z，胜负尺度就错了"), true)
  assert.equal(evidenceQuoteShowsKind("transfer", "视角和终局必须使用同一把尺子"), false)
  assert.equal(evidenceQuoteShowsKind("transfer", "这一课和前面学过的东西有关"), false)
  assert.equal(evidenceQuoteShowsKind("transfer", "把这课和第 2 课的视角串起来看"), false)
  assert.equal(evidenceQuoteShowsKind("transfer", "第 2 课规定 z 和棋盘同视角；白胜时黑方样本的 z 应为 -1"), true)
})

test("12 岁版、已存定稿或正文被整段抄回时不能算独立复述", () => {
  const tutorExplanation = "棋盘特征回答现在发生了什么，权重决定每种特征有多重要，预测与终局答案的差给出调整方向，学习率决定这一步走多远。"
  const copied = tutorExplanation
  const history = [
    { id: "u1", role: "user", mode: "feynman", status: "ok", text: "r 是预测，z 是答案，平方损失量误差。" },
    { id: "a1", role: "assistant", status: "ok", text: "再换一个数字算一次。" },
    { id: "u2", role: "user", mode: "feynman", status: "ok", text: copied },
    { id: "a2", role: "assistant", status: "ok", text: "再指出一个错误。" },
    { id: "u3", role: "user", mode: "feynman", status: "ok", text: "如果只调预测不调权重，系统不会真的学习。" },
    { id: "a3", role: "assistant", status: "ok", text: "继续。" },
  ]
  const copiedPass = {
    verdict: "pass" as const,
    evidence: [
      { kind: "explanation" as const, text: "解释", sourceMessageId: "u1", quote: "r 是预测，z 是答案" },
      { kind: "application" as const, text: "应用", sourceMessageId: "u2", quote: "学习率决定这一步走多远" },
      { kind: "correction" as const, text: "纠错", sourceMessageId: "u3", quote: "只调预测不调权重" },
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(copiedPass, history, { referenceTexts: [tutorExplanation] }).verdict, "retry")
  assert.equal(guardAssessment(copiedPass, history, { lessonText: tutorExplanation }).verdict, "retry")
})

test("两段定义复述不能靠错误标签解锁下一课", () => {
  const history = [
    { id: "u1", role: "user", mode: "feynman", status: "ok", text: "r 是预测，z 是答案，平方损失量误差。" },
    { id: "a1", role: "assistant", status: "ok", text: "再讲一个换数字的应用。" },
    { id: "u2", role: "user", mode: "feynman", status: "ok", text: "权重决定特征有多重要；没有训练，权重不会自己改变。" },
    { id: "a2", role: "assistant", status: "ok", text: "再指出一个常见错误。" },
  ]
  const definitionOnly = {
    verdict: "pass" as const,
    evidence: [
      { kind: "explanation" as const, text: "学生解释了预测与答案的关系", sourceMessageId: "u1", quote: "r 是预测，z 是答案" },
      { kind: "application" as const, text: "学生声称换了一个场景", sourceMessageId: "u2", quote: "权重决定特征有多重要" },
      { kind: "correction" as const, text: "学生声称指出了错误", sourceMessageId: "u2", quote: "没有训练，权重不会自己改变" },
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(definitionOnly, history).verdict, "retry")
})

test("整段照抄导师定稿不能算学生自己的复述证据", () => {
  const tutorFinal = "棋盘特征回答现在发生了什么，权重决定每种特征有多重要，预测与终局答案的差给出调整方向，学习率决定这一步走多远。"
  assert.equal(isLikelyCopiedFromTutor(tutorFinal, [tutorFinal]), true)
  const history = [
    { id: "u1", role: "user", mode: "feynman", status: "ok", text: "特征给出盘面事实，权重给出打分，预测和答案的差指出调整方向。" },
    { id: "a1", role: "assistant", status: "ok", text: tutorFinal },
    { id: "u2", role: "user", mode: "feynman", status: "ok", text: tutorFinal },
    { id: "a2", role: "assistant", status: "ok", text: "再换一个数字算一次。" },
    { id: "u3", role: "user", mode: "feynman", status: "ok", text: "如果只调预测不调权重，系统不会真的学习。" },
    { id: "a3", role: "assistant", status: "ok", text: "再讲一个应用。" },
  ]
  const copiedPass = {
    verdict: "pass" as const,
    evidence: [
      { kind: "explanation" as const, text: "第一轮解释", sourceMessageId: "u1", quote: "特征给出盘面事实" },
      { kind: "application" as const, text: "第二轮应用", sourceMessageId: "u2", quote: "学习率决定这一步走多远" },
      { kind: "correction" as const, text: "第三轮纠错", sourceMessageId: "u3", quote: "只调预测不调权重" },
    ],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment(copiedPass, history).verdict, "retry")
})

test("阶段末四类证据可以完整追溯，且至少跨三条学生复述", () => {
  const history = practiceHistory()
  const checkpointPass = {
    verdict: "pass" as const,
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence, transferEvidence],
    gaps: [],
    nextAction: "进入下一阶段。",
  }
  assert.equal(guardAssessment(checkpointPass, history, {
    checkpoint: true,
    requiredStudentTurns: 3,
  }).verdict, "pass")

  const oneSource = {
    ...checkpointPass,
    evidence: [
      explanationEvidence,
      { ...applicationEvidence, sourceMessageId: "u1", quote: "平方损失量误差" },
      { ...correctionEvidence, sourceMessageId: "u1", quote: "z 是答案" },
      { ...transferEvidence, sourceMessageId: "u1", quote: "r 是预测" },
    ],
  }
  assert.equal(guardAssessment(oneSource, history, {
    checkpoint: true,
    requiredStudentTurns: 3,
  }).verdict, "retry")
})

test("阶段身份、判定轮次和阶段末要求只由服务端课程契约推导", () => {
  const checkpoints = ["l02", "l06", "l11", "l15", "graduation"]
  for (const lessonId of checkpoints) {
    const contract = lessonContract(lessonId)
    assert.ok(contract, `${lessonId}: 应存在课程契约`)
    assert.equal(contract.checkpoint, true, `${lessonId}: 应为阶段末课`)
    assert.equal(contract.requiredStudentTurns, 3, `${lessonId}: 阶段末至少三轮回合`)
    assert.equal(contract.stage?.isCheckpoint, true, `${lessonId}: 阶段契约应标记 checkpoint`)
  }
  assert.equal(lessonContract("l03")?.checkpoint, false)
  assert.equal(lessonContract("l03")?.requiredStudentTurns, 2)
  assert.equal(lessonContract("not-a-lesson"), null)

  const forged = { lesson: { id: "l02", title: "伪造标题" }, stage: { isCheckpoint: false }, history: [] }
  const contract = lessonContract(forged.lesson.id)
  assert.ok(contract)
  const authoritative = withAuthoritativeContract(forged, contract)
  assert.equal(authoritative.lesson.title, "视角：一条约定")
  assert.equal(authoritative.stage.isCheckpoint, true, "客户端伪造 isCheckpoint=false 不能降级阶段末要求")
})

test("判定请求必须在服务端看到读到末尾的凭证，并拒绝真实失败交换", () => {
  const request = {
    lesson: { id: "l03" },
    history: [],
    context: { reading: { reachedEnd: false, percent: 42 } },
  }
  assert.match(assessmentRequestError(request) ?? "", /读到收束/)
  assert.equal(assessmentRequestError({
    ...request,
    context: { reading: { reachedEnd: true, percent: 100 } },
  }), null)

  const failedHistory = [
    { id: "u1", role: "user", mode: "feynman", status: "failed", text: "这条请求失败了。" },
  ]
  assert.deepEqual(completedTutorMessages(failedHistory), [])
})

test("导师输出校验拒绝一次多题和选择题选项", () => {
  assert.match(validateTutorReply("先说说梯度方向？再举一个例子？", "quiz") ?? "", /一次只能问一个问题/)
  assert.match(validateTutorReply("A. 向上\nB. 向下", "quiz") ?? "", /不能展示选择题选项/)
  assert.equal(validateTutorReply("换一个数字后，梯度方向会怎样？", "quiz"), null)
  assert.equal(validateTutorReply("代码里的 `x?` 只是符号；请解释梯度方向。", "quiz"), null)
})

test("完整考问只在最终收束时允许列五道挑战题", () => {
  const challengeList = "最终得分 7/10。挑战题：\n1. 梯度为什么换方向？\n2. 学习率过大怎样？\n3. 视角为何统一？\n4. π 为什么是分布？\n5. 竞技场为何要控制颜色？"
  const early = {
    mode: "quiz",
    quizPlan: "full",
    message: "学生正在答第三题。",
    history: [
      { id: "q1", role: "user", mode: "quiz", status: "ok", text: "第一题回答。" },
      { id: "a1", role: "assistant", status: "ok", text: "下一题。" },
    ],
  }
  assert.equal(isFullQuizWrapUp(early), false)
  assert.match(validateTutorReply(challengeList, "quiz", "full") ?? "", /一次只能问一个问题/)

  const late = {
    ...early,
    message: "第十题回答。",
    history: Array.from({ length: 9 }, (_, index) => [
      { id: `q${index + 1}`, role: "user", mode: "quiz", status: "ok", text: `第 ${index + 1} 题回答。` },
      { id: `a${index + 1}`, role: "assistant", status: "ok", text: "继续下一题。" },
    ]).flat(),
  }
  assert.equal(isFullQuizWrapUp(late), true)
  assert.equal(validateTutorReply(challengeList, "quiz", "full", { allowFinalSummary: true }), null)
  assert.match(validateTutorReply(`${challengeList}\n6. 第六道不该出现？`, "quiz", "full", { allowFinalSummary: true }) ?? "", /最多只能列 5 道/)

  const summaryWithFive = [
    "最终得分：7/10。",
    "最强：能解释为什么换手。",
    "1. 为什么终局 z 要按行棋方翻转？",
    "2. 天元对应的 action 是多少？",
    "3. 哪种写法会让棋盘和 π 增强不同步？",
    "4. 为什么 root_value 不能直接当价值头输出？",
    "5. 如何用一条记录证明网页数字来自 run 文件？",
  ].join("\n")
  assert.equal(
    validateTutorReply(summaryWithFive, "quiz", "full", { allowFinalSummary: true }),
    null,
    "总结里的普通“为什么”不能把五道挑战题挤成六道",
  )
})

test("快问、单元复盘和阶段自测的最后一题也能正常收束", () => {
  const late = (quizPlan: "quick" | "unit" | "stage", pairs: number) => ({
    mode: "quiz",
    quizPlan,
    message: "这是最后一题的作答。",
    history: Array.from({ length: pairs }, (_, index) => [
      { id: `q${index}`, role: "user", mode: "quiz", status: "ok", text: `第 ${index + 1} 题回答。` },
      { id: `a${index}`, role: "assistant", status: "ok", text: "继续。" },
    ]).flat(),
  })
  assert.equal(isQuizWrapUp(late("quick", 1)), false)
  assert.equal(isQuizWrapUp(late("quick", 2)), true)
  assert.equal(isQuizWrapUp(late("unit", 4)), true)
  assert.equal(isQuizWrapUp(late("stage", 2)), true)

  const summary = "最强：因果。\n最弱：边界。\n下一步：回到第 2 小节重算一次。"
  assert.equal(validateTutorReply(summary, "quiz", "quick"), "导师回复没有留下一个待答问题；请先反馈，再只问一个能继续学习的问题。")
  assert.equal(validateTutorReply(summary, "quiz", "quick", { allowFinalSummary: true }), null)
})

test("完整考问只在明确要求停止时提前收束，正文里的“结束”不算", () => {
  const full = (message: string) => base({ mode: "quiz", quizPlan: "full", message })
  assert.equal(isFullQuizWrapUp(full("训练结束后的 z 才是终局事实。")), false)
  assert.equal(isFullQuizWrapUp(full("这一局结束时黑棋五连。")), false)
  assert.equal(isFullQuizWrapUp(full("结束")), false)
  assert.equal(isFullQuizWrapUp(full("停止考问")), true)
  assert.equal(isFullQuizWrapUp(full("结束本轮")), true)
  assert.equal(isFullQuizWrapUp(full("先到这里吧")), true)
  assert.equal(isFullQuizWrapUp(full("结束吧")), true)
  assert.equal(isFullQuizWrapUp(full("先停一下")), true)
  assert.equal(isFullQuizWrapUp(full("别问了")), true)
  assert.equal(isFullQuizWrapUp(full("暂停")), true)
  assert.equal(isFullQuizWrapUp(full("训练暂停时检查点还在写吗")), false)
})

test("导师回复必须留下一个可继续学习的提问", () => {
  assert.match(validateTutorReply("这遍讲对了，先休息一下。", "feynman") ?? "", /没有留下一个待答问题/)
  assert.equal(validateTutorReply("这遍完整。请再算一次？", "feynman"), null)
  assert.equal(validateTutorReply("代码里的 `x?` 只是符号；请解释梯度方向。", "feynman"), null)
  assert.match(
    validateTutorReply("先说到这。请说明 A。请解释 B。", "feynman") ?? "",
    /一次只能问一个/,
    "没有问号但有两个独立指令时也必须拒绝",
  )
  assert.match(
    validateTutorReply("请先解释 A，再解释 B。", "feynman") ?? "",
    /一次只能问一个/,
    "用“先……再……”串两个动作时也必须拒绝",
  )
  assert.match(
    validateTutorReply("为什么梯度方向？请解释 B。", "feynman") ?? "",
    /一次只能问一个/,
    "问号后另起一个指令是两问，不能取两者最大值",
  )
  for (const reply of [
    "请说明 A。接着解释 B。",
    "请说明 A。解释 B。",
    "请先说明 A，然后解释 B。",
    "请说明 A，之后说明 B。",
    "请说明 A；随后解释 B。",
  ]) {
    assert.match(
      validateTutorReply(reply, "feynman") ?? "",
      /一次只能问一个/,
      `连接词不能把两个动作伪装成一问：${reply}`,
    )
  }
  assert.match(
    validateTutorReply("请说明 A，请解释 B。", "feynman") ?? "",
    /一次只能问一个/,
    "逗号连接的两个指令也是两问",
  )
  for (const reply of [
    "请说明 A，解释 B。",
    "请说明 A、解释 B。",
    "请说明 A,解释 B。",
    "请说明 A，而且解释 B。",
  ]) {
    assert.match(
      validateTutorReply(reply, "feynman") ?? "",
      /一次只能问一个/,
      `逗号、顿号或“而且”不能把两个指令并成一问：${reply}`,
    )
  }
  assert.match(
    validateTutorReply("请先解释梯度方向。再举一个棋盘例子？", "feynman") ?? "",
    /一次只能问一个/,
    "句号后的第二个任务也要算一问",
  )
  assert.match(
    validateTutorReply("请解释梯度方向，并说明学习率的影响？", "feynman") ?? "",
    /一次只能问一个/,
    "并列表述也是两个任务",
  )
  assert.match(
    validateTutorReply("请解释梯度方向。它为什么会改变符号？", "feynman") ?? "",
    /一次只能问一个/,
    "第二句是独立追问",
  )
  assert.match(
    validateTutorReply("先解释 A，再解释 B？", "feynman") ?? "",
    /一次只能问一个/,
    "省略“请”的两个顺序任务也要拒绝",
  )
  assert.equal(
    validateTutorReply("你的漏洞：为什么换手还没有讲清。请解释一次换手顺序。", "feynman"),
    null,
    "反馈里的“为什么”不能冒充另一个待答问题",
  )
  assert.equal(
    validateTutorReply("你说对了，你解释了 A，同时指出了 B。请再复述一次？", "feynman"),
    null,
    "陈述句里的“同时指出”不能冒充第二个指令",
  )
  assert.match(
    validateTutorReply("为什么这点重要你已经解释过，请继续。", "feynman") ?? "",
    /没有留下一个待答问题/,
    "陈述里的“为什么”不能冒充待答问题",
  )
})

test("费曼定稿必须是代码外独占一行的完整一对标记", () => {
  const final = [
    "因果讲清了。",
    "【费曼定稿】",
    "权重是打分标准，盘面特征是输入；预测与终局答案比较后，梯度告诉我们往哪边调。",
    "【费曼定稿结束】",
    "如果学习率再大十倍，第一步会跨到哪里？",
  ].join("\n")
  assert.equal(validateTutorReply(final, "feynman"), null)
  assert.match(extractFeynmanFinal(final) ?? "", /权重是打分标准/)
  assert.match(validateTutorReply(final.replace("【费曼定稿结束】", ""), "feynman") ?? "", /各出现一次/)

  const inline = "因果讲清了。【费曼定稿】权重把特征变成分数。【费曼定稿结束】\n下一问是什么？"
  assert.match(validateTutorReply(inline, "feynman") ?? "", /独占一行/)
  assert.equal(extractFeynmanFinal(inline), null)

  const reversed = "先有结束。\n【费曼定稿结束】\n内容。\n【费曼定稿】\n下一问是什么？"
  assert.match(validateTutorReply(reversed, "feynman") ?? "", /之后|各出现一次/)

  const fenced = [
    "协议写法如下：",
    "```text",
    "【费曼定稿】",
    "这里只是代码示例。",
    "【费曼定稿结束】",
    "```",
    "现在请用自己的话复述？",
  ].join("\n")
  assert.equal(validateTutorReply(fenced, "feynman"), null, "代码示例里的标记不能当成真实定稿")
  assert.equal(extractFeynmanFinal(fenced), null)

  const hiddenQuestions = [
    "因果讲清了。",
    "【费曼定稿】",
    "权重把每个特征变成分数，预测再和终局答案比较；但第一问？第二问？",
    "【费曼定稿结束】",
    "请解释 C？",
  ].join("\n")
  assert.match(validateTutorReply(hiddenQuestions, "feynman") ?? "", /不能包含待答问句/)

  const emptyFinal = ["因果讲清了。", "【费曼定稿】", "", "【费曼定稿结束】", "请解释 C？"].join("\n")
  assert.match(validateTutorReply(emptyFinal, "feynman") ?? "", /太短/)
  assert.equal(extractFeynmanFinal(emptyFinal), null)
})

test("请求体读取有独立超时，不会让半截上传占住导师并发槽", async () => {
  const partial = new PassThrough()
  const startedAt = Date.now()
  await assert.rejects(
    readBody(partial, undefined, 25),
    (error: unknown) => {
      const timedOut = error as { status?: number; closeConnection?: boolean }
      return timedOut.status === 408 && timedOut.closeConnection === true
    },
  )
  assert.ok(Date.now() - startedAt >= 20, "应等待读取超时而不是立即失败")
  assert.equal(partial.listenerCount("data"), 0, "超时后不能继续累积 data 监听器")
  assert.equal(partial.listenerCount("end"), 0, "超时后不能继续累积 end 监听器")
  assert.ok(partial.listenerCount("error") <= 1, "只保留一个等待连接关闭的错误兜底")
  partial.destroy()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(partial.listenerCount("error"), 0, "连接关闭后错误兜底也要移除")
})

test("导师桥只接受与当前页面同协议、同主机、同端口的 Origin", () => {
  assert.equal(originMatchesRequest("http://localhost:5198", "localhost:5198"), true)
  assert.equal(originMatchesRequest("http://127.0.0.1:5198", "127.0.0.1:5198"), true)
  assert.equal(isLoopbackHost("[::1]:5198"), true)
  assert.equal(originMatchesRequest("http://localhost:5289", "localhost:5198"), false)
  assert.equal(originMatchesRequest("http://127.0.0.1:5289", "127.0.0.1:5198"), false)
  assert.equal(originMatchesRequest("https://localhost:5198", "localhost:5198"), false)
  assert.equal(originMatchesRequest("http://evil.example", "localhost:5198"), false)
  assert.equal(originMatchesRequest("http://attacker.example:5198", "attacker.example:5198"), false, "同源攻击域名也不能进回环桥")
  assert.equal(originMatchesRequest("null", "localhost:5198"), false)
  assert.equal(originMatchesRequest("", "localhost:5198"), false)
})

test("失败请求不增加复述轮次，重试成功后才把同一轮记为完整证据", () => {
  let session = emptyTutorSession("feynman")
  session = {
    ...session,
    messages: [{
      id: "u1",
      role: "user",
      mode: "feynman",
      status: "pending",
      text: "我用自己的话解释一次误差怎样变成方向。",
    }],
  }
  session = failTutorRequest(session, "网络失败", "u1")
  assert.equal(session.feynmanTurns, 0)
  assert.equal(session.messages[0].status, "failed")
  session = recordTutorReply(
    session,
    { id: "a1", role: "assistant", status: "ok", text: "这遍完整，再换一个数字。" },
    "feynman",
    "u1",
  )
  assert.equal(session.feynmanTurns, 1)
  assert.equal(session.messages[0].status, "ok")
})

test("导师主动出题保留在下一轮聊天上下文里", () => {
  const messages = [
    { id: "a1", role: "assistant" as const, mode: "quiz" as const, status: "ok" as const, text: "第一题：天元 (4,4) 的 action 是多少？" },
    { id: "u1", role: "user" as const, mode: "quiz" as const, status: "pending" as const, text: "40" },
    { id: "a2", role: "assistant" as const, mode: "quiz" as const, status: "failed" as const, text: "这条失败回复不能进上下文。" },
  ]
  assert.deepEqual(settledTutorMessages(messages).map((message) => message.id), ["a1"])
})

test("导师主动出题时不会把更早的失败复述误标为成功", () => {
  let session = emptyTutorSession("feynman")
  session = {
    ...session,
    messages: [{
      id: "u1",
      role: "user",
      mode: "feynman",
      status: "failed",
      text: "上一轮失败的复述。",
    }],
  }
  session = recordTutorReply(
    session,
    { id: "a1", role: "assistant", mode: "quiz", status: "ok", text: "第一题：先说说这里的因果。" },
    "quiz",
  )
  assert.equal(session.messages[0].status, "failed")
  assert.equal(session.feynmanTurns, 0)
})

test("新开考问不会复用失败复述的 userMessageId，只有同一条请求重试才允许复用", () => {
  const session = {
    ...emptyTutorSession("feynman"),
    messages: [{
      id: "failed-feynman",
      role: "user" as const,
      mode: "feynman" as const,
      status: "failed" as const,
      text: "上一轮失败的复述。",
    }],
    lastRequest: {
      text: "上一轮请求",
      mode: "feynman" as const,
      quizPlan: "quick" as const,
      userMessageId: "failed-feynman",
    },
  }
  assert.equal(tutorRequestUserMessageId(
    session,
    { text: "请开始 3 分钟快问", mode: "quiz", quizPlan: "quick" },
    { appendUser: false, newQuizRound: true },
  ), undefined, "新考问不能继承失败复述")
  assert.equal(tutorRequestUserMessageId(
    session,
    { text: "上一轮请求", mode: "feynman", quizPlan: "quick" },
    { appendUser: false },
  ), "failed-feynman", "只有原请求重试才可恢复同一条 user 消息")
})

test("客户端在写进度前也会拒绝缺少来源原话或跨轮不足的 pass", () => {
  const valid = {
    verdict: "pass" as const,
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(assessmentIsSufficient(valid, false), true)
  assert.equal(assessmentIsSufficient({ ...valid, evidence: [] }, false), false)
  assert.equal(assessmentIsSufficient({ ...valid, gaps: ["还有一个边界没讲清"] }, false), false, "pass 带未解决缺口不能写进度")
  assert.equal(assessmentIsSufficient({
    ...valid,
    evidence: valid.evidence.map((item) => ({ ...item, sourceMessageId: "u1" })),
  }, false), false)
  assert.equal(assessmentIsSufficient(valid, true), false, "阶段末课必须含迁移证据")
})

test("判定器不能一边列出缺口一边通过，也不能拿同一段原话包办多类证据", () => {
  const history = practiceHistory()
  const pass = {
    verdict: "pass" as const,
    evidence: [explanationEvidence, applicationEvidence, correctionEvidence],
    gaps: [],
    nextAction: "进入下一课。",
  }
  assert.equal(guardAssessment({ ...pass, gaps: ["纠错还不够具体"] }, history).verdict, "retry")
  const duplicate = {
    ...pass,
    evidence: [
      explanationEvidence,
      { ...applicationEvidence, quote: explanationEvidence.quote },
      correctionEvidence,
    ],
  }
  assert.equal(guardAssessment(duplicate, history).verdict, "retry")
})

test("同一轮复述重试不会重复计轮次", () => {
  let session = emptyTutorSession("feynman")
  session = {
    ...session,
    messages: [{ id: "u1", role: "user", text: "这是我的复述。" }],
  }
  session = recordTutorReply(session, { id: "a1", role: "assistant", text: "补一个应用。" }, "feynman")
  assert.equal(session.feynmanTurns, 1)
  session = recordTutorReply(session, { id: "a2", role: "assistant", text: "重试后的同一轮。" }, "feynman")
  assert.equal(session.feynmanTurns, 1, "最后一条是导师消息时不能再次计数")
})

test("阶段末课提示词要求额外验收跨课迁移", () => {
  const tutorPrompt = buildTutorPrompt(base({ mode: "feynman", stage }))
  assert.ok(tutorPrompt.includes("是否阶段末课：是"), "应付带阶段末标记")
  assert.ok(tutorPrompt.includes("跨课迁移"), "复述提示应要求跨课迁移")

  const assessmentPrompt = buildAssessmentPrompt({
    lesson,
    context,
    history: [{ role: "user", text: "我先讲一遍。" }],
    stage,
  })
  for (const expected of [
    "阶段验收场景",
    stage.goal,
    "必须额外验收跨课迁移",
    "没有这些证据",
  ]) {
    assert.ok(assessmentPrompt.includes(expected), `判定提示缺少：${expected}`)
  }
})

test("导师与判定提示都携带阶段核心、练习、常见错误和闭卷自测", () => {
  const tutorPrompt = buildTutorPrompt(base({ mode: "feynman", stage }))
  const assessmentPrompt = buildAssessmentPrompt({
    lesson,
    context,
    history: [{ role: "user", mode: "feynman", text: "我来复述。" }],
    stage,
  })
  for (const prompt of [tutorPrompt, assessmentPrompt]) {
    for (const expected of [
      "本级核心概念",
      "点积与加权求和",
      "本级动手练习",
      "3×3 窗口算点积",
      "本级常见错误",
      "ReLU 当成装饰",
      "本级闭卷自测",
      "x=3、w=0、z=1",
      "建议投入：5 小时",
    ]) {
      assert.ok(prompt.includes(expected), `阶段上下文缺少：${expected}`)
    }
  }
})

test("判定提示只带合书复述历史，答疑和考我不混入证据", () => {
  const prompt = buildAssessmentPrompt({
    lesson,
    context,
    history: [
      { role: "user", mode: "ask", text: "这是答疑里问的内容，不应该作为证据" },
      { role: "assistant", mode: "ask", text: "答疑回复" },
      { role: "user", mode: "feynman", text: "这是学生自己的复述" },
      { role: "assistant", mode: "feynman", text: "请补一个换数字的应用" },
    ],
    stage: { ...stage, isCheckpoint: false },
  })
  assert.ok(prompt.includes("这是学生自己的复述"))
  assert.ok(prompt.includes("请补一个换数字的应用"))
  assert.ok(!prompt.includes("这是答疑里问的内容"), "答疑内容不应进入判定证据上下文")
})

test("考我模式注入内部题库，但要求改写为开放式问题且一次一题", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    message: "请开始考我。",
    questionBank: [{
      question: "为什么权重需要是连续值？",
      referenceAnswer: "连续值可求梯度，离散档位无法高效搜索。",
      explain: "真实网络有 145,050 个权重，组合数会爆炸。",
    }],
  }))
  for (const expected of [
    "当前模式是“考我”",
    "参考题库只用于确定考点",
    "绝不展示选项",
    "一次只问一个问题",
    "10 分制",
    "为什么权重需要是连续值？",
  ]) {
    assert.ok(prompt.includes(expected), `缺少：${expected}`)
  }
})

test("完整考问按 10 题四档，并在最后给最终分与 5 道挑战题", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "full",
    message: "请开始完整考问。",
  }))
  for (const expected of [
    "主线 10 题",
    "第 1–3 题新手",
    "第 4–6 题中级",
    "第 7–8 题高级",
    "第 9–10 题专家",
    "最终得分",
    "5 道终极挑战题",
  ]) {
    assert.ok(prompt.includes(expected), `完整考问缺少：${expected}`)
  }
})

test("3 分钟快问只问 3 题，不扩成完整考卷", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "quick",
    message: "请开始 3 分钟快问。",
  }))
  for (const expected of ["3 分钟快问", "只问 3 题", "最强", "最弱", "下一步复习动作"]) {
    assert.ok(prompt.includes(expected), `快问缺少：${expected}`)
  }
  assert.ok(!prompt.includes("5 道终极挑战题"), "快问不应追加完整挑战题")
})

test("单元复盘严格用当前单元的 5 个复习问题", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "unit",
    message: "请开始本单元复盘。",
  }))
  for (const expected of [
    "本单元复盘",
    "只问 5 题",
    "当前 20 小时单元的 5 个复习问题",
    "逐题得分概览",
    "不要追加完整考问的 10 题",
  ]) {
    assert.ok(prompt.includes(expected), `单元复盘缺少：${expected}`)
  }
})

test("本级自测严格按阶段的三条闭卷自测出题，不混成单元 5 问或完整 10 题", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "stage",
    message: "请开始本级自测。",
    stage,
  }))
  for (const expected of [
    "本级自测",
    "只问 3 题",
    "严格按顺序对应当前阶段契约里的 3 条",
    "不参与课程放行",
    ...stage.selfTests,
  ]) {
    assert.ok(prompt.includes(expected), `阶段自测缺少：${expected}`)
  }
  assert.ok(!prompt.includes("本单元复盘，主线只问 5 题"), "阶段自测不应退化成单元 5 问")
  assert.ok(!prompt.includes("主线 10 题，按难度分四段"), "阶段自测不应退化成完整 10 题")
})

test("12 岁讲解结束后交给费曼复述，不把讲解消息冒充学生证据", () => {
  const panel = readFileSync(`${repoRoot}/learn/src/framework/tutor-panel.tsx`, "utf8")
  for (const expected of [
    "modeAfterReply",
    'return modeAfterReply ? { ...next, mode: modeAfterReply } : next',
    'session.quizPlan,\n      "feynman"',
    "现在合上书，用你自己的话讲一遍",
  ]) {
    assert.ok(panel.includes(expected), `12 岁讲解交接缺少：${expected}`)
  }
})

test("导师面板在合书复述前要求提交动手产物，并随判定发出", () => {
  const panel = readFileSync(`${repoRoot}/learn/src/framework/tutor-panel.tsx`, "utf8")
  for (const expected of [
    "PracticeCard",
    "savePracticeArtifact",
    "未记录产物不能申请掌握判定",
    "artifact,",
    "artifact.text",
    "动手 · 判定前置",
  ]) {
    assert.ok(panel.includes(expected), `动手闭环缺少：${expected}`)
  }
  const rail = readFileSync(`${repoRoot}/learn/src/framework/study-rail.tsx`, "utf8")
  assert.ok(rail.includes('phase === "practice"'), "学习路径应把动手作为独立阶段")
  assert.ok(rail.includes("动手产物"), "学习路径应显示产物状态")
})

test("侧栏考问按钮直接开考，已有复述对话时仍能启动 5 题或 10 题", () => {
  const panel = readFileSync(`${repoRoot}/learn/src/framework/tutor-panel.tsx`, "utf8")
  for (const expected of [
    "pendingQuiz",
    "void runTutor(QUIZ_START[plan], \"quiz\", false, plan, undefined, true)",
    "tutor-quiz-launch",
    "tutor-round-divider",
    "tutor-final-note-tag",
    "快问 3",
    "单元 5",
    "完整 10",
    "结束本轮",
    'void runTutor("停止考问", "quiz", true)',
  ]) {
    assert.ok(panel.includes(expected), `考问入口缺少：${expected}`)
  }
  const context = readFileSync(`${repoRoot}/learn/src/framework/tutor-context.tsx`, "utf8")
  assert.ok(context.includes("pendingQuiz: mode === \"quiz\" && quizPlan ? quizPlan : null"), "页面按钮应把考问计划排入导师会话")
})

test("新一轮考问只带当前轮次，旧轮次不会污染题号或收束判断", () => {
  const history = [
    { id: "q1", role: "user", mode: "quiz", status: "ok", text: "上一轮第 1 题回答。", quizRound: 1 },
    { id: "a1", role: "assistant", mode: "quiz", status: "ok", text: "上一轮导师回复。", quizRound: 1 },
    { id: "q2", role: "user", mode: "quiz", status: "ok", text: "上一轮第 2 题回答。", quizRound: 1 },
    { id: "a2", role: "assistant", mode: "quiz", status: "ok", text: "上一轮继续。", quizRound: 1 },
    { id: "q3", role: "user", mode: "quiz", status: "ok", text: "这一轮第 1 题回答。", quizRound: 2 },
    { id: "a3", role: "assistant", mode: "quiz", status: "ok", text: "这一轮继续。", quizRound: 2 },
  ]
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "full",
    quizRound: 2,
    message: "这一轮第 2 题的回答。",
    history,
  }))
  assert.ok(prompt.includes("这一轮第 1 题回答"), "当前轮次历史必须保留")
  assert.ok(!prompt.includes("上一轮第 1 题回答"), "旧轮次回答不能进入当前上下文")
  assert.equal(isFullQuizWrapUp({
    mode: "quiz",
    quizPlan: "full",
    quizRound: 2,
    message: "继续。",
    history,
  }), false, "上一轮的 2 条回答不能把新一轮提前推到收束")
})

test("完整考问保留开场题，不因最后两题丢掉第一问", () => {
  const history = [
    { id: "a0", role: "assistant", mode: "quiz", status: "ok", text: "第一问：请先解释当前行棋方视角。", quizRound: 4 },
  ]
  for (let index = 1; index <= 10; index += 1) {
    history.push(
      { id: `u${index}`, role: "user", mode: "quiz", status: "ok", text: `第 ${index} 题回答。`, quizRound: 4 },
      { id: `a${index}`, role: "assistant", mode: "quiz", status: "ok", text: index === 10 ? "最终总结。" : `第 ${index + 1} 问。`, quizRound: 4 },
    )
  }
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    quizPlan: "full",
    quizRound: 4,
    message: "请收束。",
    history,
  }))
  assert.ok(prompt.includes("第一问：请先解释当前行棋方视角。"), "21 条消息里最早的开场题不能被截掉")
  assert.ok(prompt.includes("第 10 题回答"), "最后一题回答也不能被截掉")
})

test("考问提示词不把参考答案和讲解直接喂给导师", () => {
  const prompt = buildTutorPrompt(base({
    mode: "quiz",
    message: "请开始考我。",
    questionBank: [{
      question: "为什么权重需要是连续值？",
      referenceAnswer: "这段参考答案不应进入导师上下文。",
      explain: "这段讲解依据也不应进入导师上下文。",
    }],
  }))
  assert.ok(prompt.includes("为什么权重需要是连续值？"))
  assert.ok(!prompt.includes("这段参考答案不应进入导师上下文。"))
  assert.ok(!prompt.includes("这段讲解依据也不应进入导师上下文。"))
})

test("导师提示词携带当前 20 小时单元的核心、练习、产出、资源和复习题", () => {
  const prompt = buildTutorPrompt(base({
    unit: {
      range: "第 4 – 5 课",
      title: "从加权求和走到非线性",
      hours: 2,
      goal: "知道多个特征怎样合成一个分数，以及为什么直线不够用。",
      why: "卷积、策略头和价值头都在做加权求和。",
      coreConcepts: ["点积 = 乘加汇总", "ReLU 折出非线性"],
      exercise: "手算一个 3×3 窗口的点积。",
      output: "能解释线性模型为什么卡在 XOR。",
      resource: "第 4–5 课 + learn/src/lib/foundations.ts",
      reviewQuestions: ["一个 3×3 窗口要点乘几次？", "XOR 为什么切不开？"],
    },
  }))
  for (const expected of [
    "当前 20 小时单元",
    "从加权求和走到非线性",
    "单元目标：知道多个特征怎样合成一个分数",
    "为什么先学：卷积、策略头和价值头都在做加权求和",
    "点积 = 乘加汇总",
    "手算一个 3×3 窗口的点积",
    "能解释线性模型为什么卡在 XOR",
    "learn/src/lib/foundations.ts",
    "一个 3×3 窗口要点乘几次",
  ]) {
    assert.ok(prompt.includes(expected), `单元上下文缺少：${expected}`)
  }
})

test("导师提示词对过长正文做硬截断，避免把请求无限放大", () => {
  const prompt = buildTutorPrompt(base({
    context: { ...context, lessonText: "课".repeat(80_000) },
  }))
  assert.ok(prompt.length < 70_000, "提示词应受长度上限约束")
})

test("导师桥的字节上限能容纳最长中文正文与对话历史", () => {
  const payload = {
    lesson: { num: "3", title: "权重", phase: "数字", puzzle: "为什么调权重", outcomes: [], sources: [] },
    context: {
      section: "小节",
      selection: "引".repeat(4_000),
      lessonText: "课".repeat(60_000),
    },
    mode: "quiz",
    message: "请开始考我。",
    history: Array.from({ length: 16 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      text: "历".repeat(3_000),
    })),
    questionBank: Array.from({ length: 16 }, () => ({
      question: "问".repeat(500),
      referenceAnswer: "答".repeat(500),
      explain: "解".repeat(800),
    })),
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload))
  assert.ok(bytes < TUTOR_LIMITS.maxBodyBytes, `最大请求 ${bytes} 字节应小于上限 ${TUTOR_LIMITS.maxBodyBytes}`)
  assert.ok(TUTOR_LIMITS.requestBudgetMs < 130_000, "服务端总预算必须早于客户端放弃时间")
})

test("旧习题只作为导师题库去重保存，不暴露页面作答状态", () => {
  registerTutorQuestions("test-lesson", "第一组", [{
    question: "同一个问题？",
    referenceAnswer: "答案 A",
    explain: "解释 A",
  }])
  registerTutorQuestions("test-lesson", "第二组", [{
    question: "同一个问题？",
    referenceAnswer: "答案 A",
    explain: "解释 A",
  }, {
    question: "第二个问题？",
    referenceAnswer: "答案 B",
    explain: "解释 B",
  }])
  assert.deepEqual(getTutorQuestions("test-lesson").map((item) => item.question), [
    "同一个问题？",
    "第二个问题？",
  ])
  assert.deepEqual(getTutorQuestions("missing"), [])
})
