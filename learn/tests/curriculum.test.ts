import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  CURRICULUM,
  CURRICULUM_ALIASES,
  CURRICULUM_BY_ID,
  STAGES,
  canonicalCurriculumId,
  isStageCheckpoint,
  requiredFeynmanTurns,
  stageForLesson,
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

test("第 1–18 课的文件名与导出组件名一一对应", () => {
  for (let lesson = 1; lesson <= 18; lesson++) {
    const fileNo = String(lesson).padStart(2, "0")
    const body = readFileSync(`${repoRoot}/learn/src/lessons/L${fileNo}.tsx`, "utf8")
    assert.match(
      body,
      new RegExp(`export default function L${fileNo}\\(\\)`),
      `L${fileNo}.tsx: 导出组件应为 L${fileNo}`,
    )
  }
})

test("五级台阶覆盖全部节点，阶段末课与复述轮次一一对应", () => {
  assert.deepEqual(
    STAGES.flatMap((stage) => stage.lessonIds),
    CURRICULUM.map((unit) => unit.id),
    "每个课程节点必须恰好归入一个阶段",
  )
  for (const stage of STAGES) {
    const lastId = stage.lessonIds.at(-1)
    assert.ok(lastId, `${stage.id}: 阶段末课不能为空`)
    assert.equal(stageForLesson(lastId)?.id, stage.id)
    assert.equal(isStageCheckpoint(lastId), true, `${lastId}: 应触发阶段验收`)
    assert.equal(requiredFeynmanTurns(lastId), 3)
    assert.equal(isStageCheckpoint(stage.lessonIds[0]), false)
    assert.equal(requiredFeynmanTurns(stage.lessonIds[0]), 2)
  }
})

test("五级阶梯每级都有核心、练习、里程碑、常见错误、自测和时长", () => {
  for (const stage of STAGES) {
    assert.ok(stage.core.length >= 3, `${stage.id}: 核心概念不足`)
    assert.ok(stage.practice.trim().length > 0, `${stage.id}: 缺少动手练习`)
    assert.ok(stage.checkpoint.trim().length > 0, `${stage.id}: 缺少阶段里程碑`)
    assert.ok(stage.commonMistake.trim().length > 0, `${stage.id}: 缺少常见错误`)
    assert.ok(stage.selfTests.length >= 3, `${stage.id}: 至少 3 个闭卷自测`)
    assert.ok(stage.hours > 0, `${stage.id}: 缺少建议时长`)
  }
  assert.equal(STAGES.reduce((sum, stage) => sum + stage.hours, 0), 20, "五级建议时长合计应为 20 小时")
})

test("第 1–18 课正文不提前引用未来课号", () => {
  for (let lesson = 1; lesson <= 18; lesson++) {
    const fileNo = String(lesson).padStart(2, "0")
    const body = readFileSync(`${repoRoot}/learn/src/lessons/L${fileNo}.tsx`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    for (const match of body.matchAll(/第\s*(\d+)\s*课/g)) {
      assert.ok(
        Number(match[1]) <= lesson,
        `L${fileNo}.tsx: 提前引用第 ${match[1]} 课`,
      )
    }
  }
})

test("验收报告 Batch 1：概念顺序与对证材料不回退", () => {
  const l05 = readFileSync(`${repoRoot}/learn/src/lessons/L05.tsx`, "utf8")
  const reluSection = l05.indexOf("2. 先看一维")
  const reluEvidence = l05.indexOf("learn/src/lib/foundations.ts · relu 与 reluAbs")
  const evidenceEnd = l05.indexOf("</EvidenceCard>", reluEvidence)
  const foldSum = l05.indexOf("<FoldSum />")
  const xorSection = l05.indexOf("3. 再看二维")
  assert.ok(reluSection >= 0 && reluEvidence > reluSection, "L05: ReLU 定义应先于例 5-1")
  assert.ok(evidenceEnd > reluEvidence && foldSum > evidenceEnd, "L05: 例 5-1 应位于 ReLU 对证之后")
  assert.ok(xorSection > foldSum, "L05: 例 5-1 应先于二维 XOR")

  const l03 = readFileSync(`${repoRoot}/learn/src/lessons/L03.tsx`, "utf8")
  assert.ok(l03.includes("碗底 w* = 0.5（r = z，损失 = 0）"), "L03: 图内应保留单行谷底标签")
  assert.equal(l03.includes("损失是平方、永远 ≥0"), false, "L03: 图内不得恢复挤占空间的长句")

  const l04 = readFileSync(`${repoRoot}/learn/src/lessons/L04.tsx`, "utf8")
  assert.ok(l04.includes("self.stem = nn.Sequential("), "L04: Ledger 应展示 stem 真源码")
  assert.ok(l04.includes("nn.Conv2d(3, channels, 3, padding=1, bias=False)"), "L04: stem 卷积参数不得缺失")

  const l18 = readFileSync(`${repoRoot}/learn/src/lessons/L18.tsx`, "utf8")
  assert.ok(l18.includes('import { Ledger } from "../framework/ledger"'), "L18: 应导入 Ledger")
  assert.ok(l18.includes('<Ledger title="server/app.py · create_app 与服务启动验证">'), "L18: 应恢复对证收口")
  for (const entry of ["server/app.py", "server/tail.py", "server/play.py", "tests/test_server.py"]) {
    assert.ok(l18.includes(entry), `L18: Ledger 应覆盖 ${entry}`)
  }
})

test("学习面板展示五级路径、真实阅读位置和导师判定状态", () => {
  const app = readFileSync(`${repoRoot}/learn/src/App.tsx`, "utf8")
  assert.ok(app.includes("StudyRail"), "App: 应挂载学习面板")
  assert.ok(app.includes("<StudyRail currentId={activeId} open={railOpen}"), "App: 学习面板应跟随当前可读路由，并支持窄屏抽屉")
  assert.ok(app.includes("aria-controls=\"study-rail\""), "App: 顶栏应提供窄屏学习路径入口")
  assert.ok(app.includes("study-rail-scrim"), "App: 窄屏抽屉应有可关闭遮罩")
  assert.ok(app.includes("LearningProgressProvider"), "App: 应提供本机学习进度")
  assert.ok(app.includes("TutorProvider"), "App: 应提供站内导师上下文")
  assert.ok(app.includes("TutorPanel"), "App: 应挂载站内导师面板")
  assert.ok(app.includes('behavior: "instant"'), "App: 换课后应立刻回到正文开头")
  assert.ok(app.includes("routeIndex > frontierIndex"), "App: 越过学习边界的深链应退回边界")
  assert.ok(app.includes("lesson-item locked"), "App: 未解锁课程应显示为锁定项")
  const home = readFileSync(`${repoRoot}/learn/src/lessons/L00.tsx`, "utf8")
  assert.equal(home.includes("LearningPath"), false, "L00: 学习路径不应继续占用首页正文")
  assert.equal(home.includes('href="#/l01"'), false, "L00: 旧的手动下一课入口应删除")
  const path = readFileSync(`${repoRoot}/learn/src/framework/study-rail.tsx`, "utf8")
  for (const step of ["正在读", "五级台阶", "本级阶梯卡", "20 小时主线", "核心：", "去查：", "5 个信号源", "现在做什么", "读到末尾", "导师判定"]) {
    assert.ok(path.includes(step), `学习面板缺少动作：${step}`)
  }
  assert.ok(path.includes("isMastered"), "学习面板: 收束应读取导师判定后的持久状态")
  assert.ok(path.includes("requiredFeynmanTurns"), "学习面板: 应显示当前课需要的证据轮次")
  assert.ok(path.includes("frontierIndex"), "学习面板: 应读取线性进度边界")
  assert.ok(path.includes("reachedEnd"), "学习面板: 收束应读取真实阅读位置")
  assert.ok(path.includes('openTutorFromRail("feynman")'), "学习面板: 应能进入合书复述")
  assert.ok(path.includes('openTutorFromRail("quiz", "quick")'), "学习面板: 通过后应能进入 3 分钟快问")
  assert.ok(path.includes('openTutorFromRail("quiz", "stage")'), "学习面板: 本级自测应使用专用三问节奏")
  assert.ok(path.includes("study-rail-close"), "学习面板: 窄屏抽屉应有关闭按钮")
  assert.equal(path.includes("localStorage"), false, "学习面板本身不直接写存储")
  assert.equal(path.includes("sessionStorage"), false, "学习面板不得使用会话存储")
  for (const banned of ["quizCorrect", "quizTotal", "reading.complete", "data-quiz-state"]) {
    assert.equal(path.includes(banned), false, `学习路径不得再依赖选择题：${banned}`)
  }

  const quiz = readFileSync(`${repoRoot}/learn/src/framework/quiz.tsx`, "utf8")
  assert.ok(quiz.includes("registerTutorQuestions"), "旧习题: 应转入导师内部题库")
  assert.ok(quiz.includes("return null"), "旧习题: 页面不得再渲染选择题")
  assert.equal(quiz.includes("data-quiz-state"), false, "旧习题: 不得暴露页面作答状态")
  assert.equal(quiz.includes("quiz-option"), false, "旧习题: 不得渲染选项")

  const tutor = readFileSync(`${repoRoot}/learn/src/framework/tutor-panel.tsx`, "utf8")
  assert.ok(tutor.includes("/api/tutor"), "导师: 应连接本机导师桥")
  assert.ok(tutor.includes("/api/tutor/assess"), "导师: 应连接独立掌握判定")
  assert.ok(tutor.includes("lessonText"), "导师: 应携带当前课正文")
  assert.ok(tutor.includes("selection"), "导师: 应携带学生选中的原文")
  assert.ok(tutor.includes("markMastered"), "导师: 判定通过后应写入掌握记录")
  assert.ok(tutor.includes("交给导师判定"), "导师: 应把放行权交给独立判定")
  assert.ok(tutor.includes("requiredFeynmanTurns"), "导师: 应按普通课/阶段末课要求证据轮次")
  assert.equal(tutor.includes("confirmReflection"), false, "导师: 不得再提供学生自确认过关")
  assert.ok(tutor.includes("session.messages.length > 0"), "导师: 进入复述对话后才显示判定区")
  assert.ok(tutor.includes("Boolean(session.assessmentError)"), "导师: 证据作废后不能把错误提示一起藏掉")
  assert.ok(tutor.includes("先听 12 岁版，再轮到我讲"), "导师: 应提供先讲简单版本的入口")
  assert.ok(tutor.includes("CopyMessage"), "导师: 应允许把最终解释复制为笔记")
  assert.ok(tutor.includes("const lastRequest = session.lastRequest"), "导师: 重试状态应跟随课程，而不是全局串题")
  assert.equal(tutor.includes("setLastRequest"), false, "导师: 不得用全局请求状态覆盖别的课程")
  assert.ok(tutor.includes("body.slice(0, 3000)"), "导师: 对话历史应在客户端按服务端口径截断")
  assert.equal(tutor.includes("localStorage"), false, "导师: 不持久化学习进度")
  assert.equal(tutor.includes("sessionStorage"), false, "导师: 不持久化学习进度")

  const chapterEnd = readFileSync(`${repoRoot}/learn/src/framework/def.tsx`, "utf8")
  assert.ok(chapterEnd.includes("isMastered"), "窄屏: 课末收束应读取导师判定")
  assert.ok(chapterEnd.includes("chapter-reflect-next"), "窄屏: 判定通过后应有可继续的下一站入口")
  assert.ok(chapterEnd.includes("cheatSheetFor"), "课末: 通过后应展开一页速查卡")
  assert.ok(chapterEnd.includes("5 个快问快答"), "课末: 速查卡应包含主动回忆题")
  assert.ok(chapterEnd.includes('openTutor("quiz", "quick")'), "课末: 通过后应能进入 3 分钟快问")
  assert.equal(chapterEnd.includes("isReflectionConfirmed"), false, "课末不得再拿学生自确认当掌握")
  assert.equal(chapterEnd.includes("markMastered"), false, "速查卡不得自行推进掌握记录")

  const css = readFileSync(`${repoRoot}/learn/src/styles/index.css`, "utf8")
  assert.ok(css.includes(".study-rail-scroll"), "样式: 学习面板中部应可独立滚动")
  assert.ok(css.includes("@media (min-width: 1200px)"), "样式: 学习面板应在桌面常驻")
  assert.ok(css.includes(".study-rail-action"), "样式: 学习面板应突出当前动作")
  assert.ok(css.includes(".tutor-panel"), "样式: 应提供站内导师面板")
  assert.ok(css.includes(".tutor-gate"), "样式: 应突出导师独立判定")
  assert.ok(css.includes(".lesson-item.locked"), "样式: 未解锁课程应明确可见")
  assert.ok(css.includes(".study-rail-done"), "样式: 毕业态应有收束")
  assert.ok(css.includes("@media (max-width: 767px)"), "样式: 窄屏导师应占满可读区域")
  assert.equal(css.includes(".learning-path"), false, "样式: 首页旧路径样式应删除")
})

test("每课必修契约完整：outcomes/sources 齐全且无未决 drift", () => {
  for (const unit of CURRICULUM) {
    assert.ok(unit.outcomes.length > 0, `${unit.id}: outcomes`)
    assert.ok(unit.sources.length > 0, `${unit.id}: sources`)
    assert.equal(unit.sources.some((source) => source.fidelity === "drift"), false, `${unit.id}: unresolved drift`)
    assert.ok(CURRICULUM_BY_ID.has(unit.id), `${unit.id}: registered`)
  }
})

test("线性解锁只能由导师判定通过推进，旧选择题不参与过关", () => {
  const progressPath = `${repoRoot}/learn/src/framework/progress.ts`
  assert.equal(existsSync(progressPath), true, "应提供独立的本地进度模型")
  const progress = readFileSync(progressPath, "utf8")
  for (const expected of ["PROGRESS_STORAGE_KEY", "recordMastery", "frontierIndex", "assessmentIsSufficient", "evidence.length < requiredEvidence"]) {
    assert.ok(progress.includes(expected), `进度模型缺少：${expected}`)
  }
  assert.equal(progress.includes("sessionStorage"), false, "进度不得使用会话存储")

  const app = readFileSync(`${repoRoot}/learn/src/App.tsx`, "utf8")
  assert.ok(app.includes("isUnlocked"), "目录必须按边界判断是否可进入")
  assert.ok(app.includes("frontierIndex"), "目录必须读取线性边界")
  for (const banned of ["usePassLesson", "onAllCorrect", "quizCorrect", "quizTotal", "data-quiz-state", "completion-badge"]) {
    assert.equal(app.includes(banned), false, `页面不得依赖旧过关机制：${banned}`)
  }

  const shotScript = readFileSync(`${repoRoot}/learn/scripts/shot.mjs`, "utf8")
  assert.ok(shotScript.includes("alpha-gomoku-learn/progress/v1"), "逐课截图应显式准备测试进度，而不是靠改 URL 跳关")
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
