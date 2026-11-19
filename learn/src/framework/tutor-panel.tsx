import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  CURRICULUM,
  CURRICULUM_BY_ID,
  isStageCheckpoint,
  practiceForLesson,
  requiredFeynmanTurns,
  stageForLesson,
  type LessonPractice,
} from "./curriculum"
import { useLearningProgress } from "./progress-context"
import { getTutorQuestions } from "./question-bank"
import {
  loadPracticeArtifact,
  normalizePracticeArtifactText,
  practiceArtifactMatchesDigest,
  practiceVerificationError,
  savePracticeArtifact,
  shouldAdoptExternalPracticeArtifact,
  type PracticeArtifact,
} from "./practice-artifacts"
import { useLessonReading } from "./reading-context"
import { RECALL_QUESTIONS } from "./reflection"
import { rememberFeynmanFinal, useFeynmanNote } from "./feynman-notes"
import { coreUnitCompleted, coreUnitForLesson, stageSelfTestReady } from "./study-system"
import { useTutor, type QuizPlan, type TutorMode } from "./tutor-context"
import { useBodyScrollLock } from "./use-body-scroll-lock"
import { useFocusTrap } from "./use-focus-trap"
import { usePracticeArtifact } from "./use-practice-artifact"
import {
  assessmentIsSufficient,
  beginTutorAssessment,
  clearRejectedAssessment,
  completeTutorAssessment,
  completedFeynmanMessages,
  failTutorAssessment,
  failTutorRequest,
  invalidateFeynmanEvidence,
  MASTERY_DIMENSION_LABEL,
  recordTutorReply,
  settledTutorMessages,
  tutorRequestUserMessageId,
  type TutorAssessment,
} from "./tutor-session"

const MODE_LABEL: Record<TutorMode, string> = {
  ask: "答疑",
  feynman: "合书复述",
  quiz: "考我",
}

const MODE_PLACEHOLDER: Record<TutorMode, string> = {
  ask: "哪里没懂？可以贴原句，或直接说「这里跳步了」…",
  feynman: "从「这一课解决的是……」开始，用你自己的话讲…",
  quiz: "先作答；不会就说不会，导师会退一步问…",
}

const QUIZ_START: Record<QuizPlan, string> = {
  quick: "请开始 3 分钟快问：只问 3 个问题，一新手中级一高级，一次一题；我回答前不要给答案。",
  unit: "请开始本单元复盘：只问 5 个问题，逐个覆盖本单元的 5 个复习问题，一次一题；我回答前不要给答案。",
  full: "请开始完整考问：按 10 题阶梯来，一次一题，从新手到专家；我回答前不要给答案。",
  stage: "请开始本级自测：只问 3 个问题，严格对应阶段契约里的 3 条本级闭卷自测，一次一题；我回答前不要给答案。",
}

/** 轻量读取当前小节标题；面板每次输入都会重渲染，不能在这里克隆整篇正文。 */
export function collectLessonSection() {
  const article = document.querySelector<HTMLElement>("#main > section")
  let section = article?.querySelector("h1")?.textContent?.trim() ?? ""
  for (const heading of article?.querySelectorAll<HTMLElement>("h2, h3, h4") ?? []) {
    if (heading.getBoundingClientRect().top <= 150) {
      section = heading.textContent?.trim() || section
    }
  }
  return section
}

export function collectLessonContext() {
  const article = document.querySelector<HTMLElement>("#main > section")
  // 速查卡里的 5 问带着答案；复习/考问时不能把答案悄悄喂进导师上下文。
  const readable = article?.cloneNode(true) as HTMLElement | undefined
  readable?.querySelector("#lesson-cheat-sheet")?.remove()
  const raw = readable?.textContent ?? ""
  const lessonText = raw
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, 60000)

  return { lessonText, section: collectLessonSection() }
}

function messageId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function tutorErrorMessage(error: unknown, timedOut: boolean) {
  if (timedOut) return "导师思考超时了。可以重试，或先把问题复制到 Codex。"
  if (error instanceof Error) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
      return "连不上本机导师。请确认页面由 `npm run dev` 打开，并先在终端确认 `codex --version` 可用。"
    }
    return error.message
  }
  return "导师暂时没有回应。"
}

function isTutorConnectionFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to fetch|NetworkError|Load failed/i.test(error.message)
}

interface ActiveRequest {
  lessonId: string
  controller: AbortController
  kind: "chat" | "assessment"
  userMessageId?: string
  artifactDigest?: string
  abortReason?: "lesson-change" | "artifact-change"
}

export function TutorPanel() {
  const {
    currentId,
    open,
    session,
    openTutor,
    closeTutor,
    updateSessionFor,
    clearSelection,
  } = useTutor()
  const { markMastered, isMastered } = useLearningProgress()
  const reading = useLessonReading()
  const feynmanNote = useFeynmanNote(currentId)
  const [health, setHealth] = useState<"checking" | "ready" | "offline">("checking")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [mobilePanel, setMobilePanel] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [shortViewport, setShortViewport] = useState(false)
  // 与学习面板共用同一份本机产物；storage 事件会让另一个标签页的修改同步过来。
  const practiceArtifact = usePracticeArtifact(currentId)
  const [practiceDraft, setPracticeDraft] = useState("")
  const [practiceEditing, setPracticeEditing] = useState(false)
  const [practiceConflict, setPracticeConflict] = useState(false)
  const practiceEditStarted = useRef(false)
  const practiceEditBaseDigest = useRef<string | null>(null)
  const practiceArtifactObservedDigest = useRef<string | null>(practiceArtifact?.digest ?? null)
  const practiceDigestRef = useRef<{ lessonId: string; digest: string | null }>({
    lessonId: currentId,
    digest: practiceArtifact?.digest ?? null,
  })
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const activeRequest = useRef<ActiveRequest | null>(null)
  const composing = useRef(false)
  const lesson = CURRICULUM_BY_ID.get(currentId)
  const practice = practiceForLesson(currentId)
  const currentCoreUnit = coreUnitForLesson(currentId)
  const stage = stageForLesson(currentId)
  const checkpoint = isStageCheckpoint(currentId)
  // 通过记录只代表过去完成过，不代表这次重新阅读过；复述和 12 岁版仍要读到收束。
  const readingReady = reading.reachedEnd
  const unitReady = currentCoreUnit ? coreUnitCompleted(currentCoreUnit, isMastered) : false
  const stageReady = stageSelfTestReady(stage, isMastered)
  const requiredPracticeTurns = requiredFeynmanTurns(currentId)
  const enoughPractice = session.feynmanTurns >= requiredPracticeTurns
  const artifactReady = Boolean(practiceArtifact?.text.trim())
  const lessonIndex = CURRICULUM.findIndex((unit) => unit.id === currentId)
  const nextLesson = lessonIndex >= 0 && lessonIndex < CURRICULUM.length - 1
    ? CURRICULUM[lessonIndex + 1]
    : null
  const lastRequest = session.lastRequest
  const busy = session.loading || session.assessmentLoading
  const practiceBlocked = session.mode === "feynman" && (!readingReady || !artifactReady)
  const currentStepLabel = !readingReady
    ? "继续读正文"
    : !artifactReady
      ? "继续动手"
      : !enoughPractice
        ? "继续复述"
        : "回到判定"
  const lessonLabel = lesson
    ? lesson.id === "prologue"
      ? "序"
      : lesson.id === "graduation"
        ? "毕业"
        : `第 ${lesson.num} 课`
    : "课程"

  // 导师是带遮罩的对话框；桌面端同样锁背景并限制 Tab，否则键盘会跑到遮罩后的正文。
  useBodyScrollLock(open)
  useFocusTrap(open, panelRef)

  // 桌面端也是真正的模态框：遮罩挡鼠标，inert 把背景从焦点和读屏树里一起移出。
  useEffect(() => {
    if (!open) return
    const surface = document.getElementById("app-surface")
    if (!surface) return
    const alreadyInert = surface.hasAttribute("inert")
    surface.setAttribute("inert", "")
    return () => {
      if (!alreadyInert) surface.removeAttribute("inert")
    }
  }, [open])

  useEffect(() => {
    const media = matchMedia("(max-width: 767px)")
    const sync = () => setMobilePanel(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    // 与样式表的全高 sheet 断点保持一致；否则 561–720px 高会显示无效的“展开”按钮。
    const media = matchMedia("(max-width: 767px) and (max-height: 720px)")
    const sync = () => setShortViewport(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!open) return
    let alive = true
    setHealth("checking")
    fetch("/api/tutor/health", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (alive) setHealth(response.ok && data.available ? "ready" : "offline")
      })
      .catch(() => {
        if (alive) setHealth("offline")
      })
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    if (!open) setMobileExpanded(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, currentId])

  useEffect(() => {
    setCopyState("idle")
  }, [currentId])

  useEffect(() => {
    const stored = loadPracticeArtifact(currentId)
    practiceEditStarted.current = false
    practiceEditBaseDigest.current = stored?.digest ?? null
    practiceArtifactObservedDigest.current = stored?.digest ?? null
    setPracticeDraft(stored?.text ?? "")
    setPracticeEditing(!stored)
    setPracticeConflict(false)
    setPracticeError(null)
  }, [currentId])

  // 只有产物真的换了才触发接管/冲突；点“修改产物”本身不能把自己立刻关回只读。
  useEffect(() => {
    const text = practiceArtifact?.text
    const digest = practiceArtifact?.digest ?? null
    if (!text || digest === practiceArtifactObservedDigest.current) return
    practiceArtifactObservedDigest.current = digest
    if (shouldAdoptExternalPracticeArtifact(text, practiceEditing, practiceEditStarted.current)) {
      setPracticeDraft(text)
      setPracticeEditing(false)
      practiceEditBaseDigest.current = digest
      setPracticeConflict(false)
      setPracticeError(null)
      return
    }
    // 用户已经动过草稿时，另一标签页的新版本不能被静默覆盖；显式让用户选保留哪一份。
    if (practiceEditing && practiceEditStarted.current && digest !== practiceEditBaseDigest.current) {
      setPracticeConflict(true)
    }
  }, [practiceArtifact?.digest, practiceArtifact?.text, practiceEditing])

  useEffect(() => {
    if (practiceEditing) return
    setPracticeDraft(practiceArtifact?.text ?? "")
  }, [practiceArtifact?.text, practiceEditing])

  useEffect(() => {
    const nextDigest = practiceArtifact?.digest ?? null
    const previous = practiceDigestRef.current
    if (previous.lessonId !== currentId) {
      previous.lessonId = currentId
      previous.digest = nextDigest
      return
    }
    if (previous.digest === nextDigest) return
    previous.digest = nextDigest
    const active = activeRequest.current
    if (active?.kind === "assessment" && active.lessonId === currentId && active.artifactDigest !== nextDigest) {
      active.abortReason = "artifact-change"
      active.controller.abort()
    }
    // 没开始复述时只是换了题面；已有复述或判定时，旧证据必须作废。
    if (session.feynmanTurns === 0 && !session.assessment) return
    updateSessionFor(currentId, (previousSession) => invalidateFeynmanEvidence(
      previousSession,
      "动手产物已变更。旧复述不再对应当前产物，请重新讲一轮后再申请判定。",
    ))
  }, [currentId, practiceArtifact?.digest, session.assessment, session.feynmanTurns, updateSessionFor])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) closeTutor()
    }
    addEventListener("keydown", onKeyDown)
    return () => removeEventListener("keydown", onKeyDown)
  }, [closeTutor, open])

  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`
  }, [session.draft, open])

  useEffect(() => {
    const node = messagesRef.current
    if (!node || !open) return
    if (session.messages.length === 0) {
      node.scrollTop = 0
      return
    }
    const last = session.messages.at(-1)
    const lastMessage = node.querySelector<HTMLElement>(".tutor-message:last-of-type")
    if (last?.role === "assistant" && lastMessage && lastMessage.offsetHeight > node.clientHeight * 0.65) {
      const nodeTop = node.getBoundingClientRect().top
      const messageTop = lastMessage.getBoundingClientRect().top
      node.scrollTop += messageTop - nodeTop - 8
    } else {
      node.scrollTop = node.scrollHeight
    }
  }, [open, session.loading, session.messages])

  useEffect(() => {
    const active = activeRequest.current
    if (!active || active.lessonId === currentId) return
    active.abortReason = "lesson-change"
    active.controller.abort()
    updateSessionFor(active.lessonId, (previous) => active.kind === "chat"
      ? failTutorRequest(previous, "切换课程后，这条消息没有完成。回来后可以重试。", active.userMessageId)
      : { ...previous, assessmentLoading: false, assessmentError: "切换课程后判定中断，请回来后重新申请。" })
  }, [currentId, updateSessionFor])

  const focusComposer = () => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const changeMode = (mode: TutorMode) => {
    if (mode === "feynman" && !readingReady) return
    updateSessionFor(currentId, (previous) => ({
      ...previous,
      mode,
      quizPlan: mode === "quiz" ? "full" : previous.quizPlan,
      pendingQuiz: null,
      error: null,
    }))
    focusComposer()
  }

  const copyQuestion = async () => {
    if (!lastRequest) return
    try {
      await navigator.clipboard.writeText(lastRequest.text)
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 1800)
    } catch {
      setCopyState("failed")
    }
  }

  const runTutor = async (
    rawText: string,
    mode: TutorMode,
    appendUser: boolean,
    quizPlan: QuizPlan = session.quizPlan,
    modeAfterReply?: TutorMode,
    newQuizRound = false,
  ) => {
    const text = rawText.trim()
    if (!text || activeRequest.current || !lesson) return
    if (mode === "feynman" && !readingReady) return

    const plan = mode === "quiz" ? quizPlan : session.quizPlan
    if (mode === "quiz" && plan === "unit" && !unitReady) return
    if (mode === "quiz" && plan === "stage" && !stageReady) return
    const lessonId = currentId
    const roundId = mode === "quiz"
      ? (newQuizRound ? session.quizRound + 1 : session.quizRound)
      : session.quizRound
    const retryGaps = mode === "feynman" && session.assessment?.verdict === "retry"
      ? session.assessment.gaps.slice(0, 3)
      : []
    const userMessageId = tutorRequestUserMessageId(
      session,
      { text, mode, quizPlan: plan, afterMode: modeAfterReply },
      { appendUser, newUserMessageId: appendUser ? messageId() : undefined, newQuizRound },
    )
    // 保留导师主动发起的题目（如“快问 3”的第一问）；只丢失败消息和未完成草稿。
    const historySource = settledTutorMessages(session.messages)
    // 完整 10 题至少有 21 条消息；只带 16 条会让判定器看不到前两题，无法正常收束。
    const historyLimit = mode === "quiz" && plan === "full" ? 40 : 16
    // 服务端本来也只会保留每条 3000 字；先在客户端截断，避免把长回复重复上传。
    const scopedHistory = mode === "quiz"
      ? historySource.filter((message) => message.quizRound === roundId)
      : historySource
    const history = scopedHistory.slice(-historyLimit).map(({ id, role, text: body, mode: historyMode, quizRound }) => ({
      id,
      role,
      text: body.slice(0, 3000),
      mode: historyMode,
      status: "ok",
      ...(quizRound == null ? {} : { quizRound }),
    }))
    const controller = new AbortController()
    let timedOut = false

    activeRequest.current = { lessonId, controller, kind: "chat", userMessageId }
    setCopyState("idle")
    updateSessionFor(lessonId, (previous) => {
      const current = clearRejectedAssessment(previous)
      return {
        ...current,
        mode,
        quizPlan: plan,
        quizRound: mode === "quiz" ? roundId : current.quizRound,
        pendingQuiz: null,
        draft: "",
        loading: true,
        error: null,
        assessmentError: null,
        lastRequest: {
          text,
          mode,
          quizPlan: plan,
          ...(modeAfterReply ? { afterMode: modeAfterReply } : {}),
          ...(userMessageId ? { userMessageId } : {}),
          ...(mode === "quiz" ? { quizRound: roundId } : {}),
        },
        messages: appendUser
          ? [...current.messages, {
            id: userMessageId!,
            role: "user",
            text,
            mode,
            status: "pending",
            ...(mode === "quiz" ? { quizRound: roundId } : {}),
          }]
          : current.messages,
      }
    })

    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 130000)

    try {
      const context = collectLessonContext()
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          lesson: {
            id: lesson.id,
            num: lesson.num,
            title: lesson.title,
            puzzle: lesson.puzzle,
            phase: lesson.phase,
            outcomes: lesson.outcomes,
            sources: lesson.sources,
          },
          context: {
            ...context,
            selection: session.selection,
            reading: { reachedEnd: reading.reachedEnd, percent: reading.percent },
          },
          mode,
          quizPlan: plan,
          quizRound: mode === "quiz" ? roundId : undefined,
          message: text,
          history,
          questionBank: mode === "quiz" ? getTutorQuestions(lessonId).slice(0, 16) : [],
          unit: currentCoreUnit,
          retryGaps,
          // 复述导师需要围绕学生刚算出的结果追问；它仍然不是复述轮次或掌握证据。
          ...(mode === "feynman" && practiceArtifact ? { artifact: practiceArtifact } : {}),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `导师服务返回 ${response.status}`)
      if (!data.text) throw new Error("导师没有返回可显示的文字。")
      setHealth("ready")

      updateSessionFor(lessonId, (previous) => {
        const next = recordTutorReply(
          previous,
          {
            id: messageId(),
            role: "assistant",
            text: data.text,
            mode,
            status: "ok",
            ...(mode === "quiz" ? { quizRound: roundId } : {}),
          },
          mode,
          userMessageId,
        )
        return modeAfterReply ? { ...next, mode: modeAfterReply } : next
      })
      if (mode === "feynman") rememberFeynmanFinal(lessonId, data.text)
    } catch (error) {
      if (isTutorConnectionFailure(error)) setHealth("offline")
      if (controller.signal.aborted && !timedOut) {
        updateSessionFor(lessonId, (previous) => failTutorRequest(
          previous,
          "这条消息没有完成。回来后可以重试；失败的消息不会计入证据轮次。",
          userMessageId,
        ))
      } else {
        const message = tutorErrorMessage(error, timedOut)
        updateSessionFor(lessonId, (previous) => failTutorRequest(previous, message, userMessageId))
      }
    } finally {
      window.clearTimeout(timer)
      if (activeRequest.current?.controller === controller) activeRequest.current = null
    }
  }

  const runAssessment = async () => {
    const artifact = practiceArtifact
    if (activeRequest.current || !lesson || !artifact || !readingReady || session.feynmanTurns < requiredPracticeTurns) return
    const lessonId = currentId
    const history = completedFeynmanMessages(session.messages, session.feynmanEvidenceStart)
      .slice(-16)
      .map(({ id, role, text, mode: messageMode }) => ({
        id,
        role,
        text: text.slice(0, 3000),
        mode: messageMode,
        status: "ok",
      }))
    const controller = new AbortController()
    let timedOut = false

    const request: ActiveRequest = {
      lessonId,
      controller,
      kind: "assessment",
      artifactDigest: artifact.digest,
    }
    activeRequest.current = request
    updateSessionFor(lessonId, (previous) => beginTutorAssessment(previous))

    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 130000)

    try {
      const context = collectLessonContext()
      const referenceTexts = [
        ...session.messages
          .filter((message) => message.role === "assistant" && (message.status === "ok" || message.status === undefined))
          .slice(-20)
          .map((message) => message.text.slice(0, 4000)),
        ...(feynmanNote ? [feynmanNote.text.slice(0, 6000)] : []),
      ]
      const response = await fetch("/api/tutor/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          lesson: {
            id: lesson.id,
            num: lesson.num,
            title: lesson.title,
            puzzle: lesson.puzzle,
            phase: lesson.phase,
            outcomes: lesson.outcomes,
            sources: lesson.sources,
          },
          context: {
            ...context,
            selection: session.selection,
            reading: { reachedEnd: reading.reachedEnd, percent: reading.percent },
          },
          artifact,
          referenceTexts,
          history,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `导师判定返回 ${response.status}`)
      const assessment = data.assessment as TutorAssessment | undefined
      if (!assessment
        || (assessment.verdict !== "pass" && assessment.verdict !== "retry")
        || !Array.isArray(assessment.evidence)
        || !Array.isArray(assessment.gaps)
        || typeof assessment.nextAction !== "string") {
        throw new Error("导师没有返回有效判定。")
      }
      if (assessment.verdict === "pass" && !assessmentIsSufficient(assessment, checkpoint)) {
        throw new Error("导师判定缺少可追溯到复述原话的完整证据，本次不放行。")
      }
      if (!practiceArtifactMatchesDigest(lessonId, artifact.digest)) {
        throw new Error("判定期间动手产物已更新，本次结果作废；请确认新产物后重新申请。")
      }
      setHealth("ready")
      if (assessment.verdict === "pass" && !markMastered(lessonId, assessment, artifact)) {
        updateSessionFor(lessonId, (previous) => failTutorAssessment(
          previous,
          "判定已经通过，但本机进度没有写入成功，因此不能解锁。请先处理存储问题，再重新申请判定。",
        ))
        return
      }
      updateSessionFor(lessonId, (previous) => completeTutorAssessment(previous, assessment))
    } catch (error) {
      if (isTutorConnectionFailure(error)) setHealth("offline")
      if (request.abortReason === "artifact-change") {
        updateSessionFor(lessonId, (previous) => ({
          ...previous,
          assessmentLoading: false,
          assessmentError: "动手产物在判定期间发生变化，本次判定已作废；请确认产物后重新申请。",
        }))
      } else if (controller.signal.aborted && !timedOut) {
        updateSessionFor(lessonId, (previous) => ({
          ...previous,
          assessmentLoading: false,
          assessmentError: "切换课程后判定中断，请回来后重新申请。",
        }))
      } else {
        const message = tutorErrorMessage(error, timedOut)
        updateSessionFor(lessonId, (previous) => failTutorAssessment(previous, message))
      }
    } finally {
      window.clearTimeout(timer)
      if (activeRequest.current?.controller === controller) activeRequest.current = null
    }
  }

  const submit = () => {
    if (practiceBlocked) return
    const text = session.draft.trim()
    if (!text) return
    void runTutor(text, session.mode, true)
  }

  const goToNextStation = () => {
    closeTutor()
    if (nextLesson) {
      requestAnimationFrame(() => { location.hash = `#/${nextLesson.id}` })
      return
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#lesson-close")?.scrollIntoView({ block: "center" })
    })
  }

  const requestAssessment = () => {
    if (busy || !readingReady || !artifactReady || !enoughPractice || health === "offline") return
    void runAssessment()
  }

  const savePractice = () => {
    if (!normalizePracticeArtifactText(practiceDraft)) {
      setPracticeError("产物至少写 8 个字，并保留计算步骤、观察结果或测试输出。")
      return
    }
    const verificationError = practiceVerificationError(practice, practiceDraft)
    if (verificationError) {
      setPracticeError(verificationError)
      return
    }
    const saved = savePracticeArtifact(currentId, practiceDraft)
    if (!saved) {
      setPracticeError("本机存储写入失败，无法保存产物。请检查浏览器是否允许本地存储，或释放空间后重试。")
      return
    }
    setPracticeDraft(saved.text)
    setPracticeEditing(false)
    practiceEditStarted.current = false
    practiceEditBaseDigest.current = saved.digest
    practiceArtifactObservedDigest.current = saved.digest
    setPracticeConflict(false)
    setPracticeError(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const editPractice = () => {
    setPracticeDraft(practiceArtifact?.text ?? "")
    setPracticeError(null)
    setPracticeConflict(false)
    practiceEditStarted.current = false
    practiceEditBaseDigest.current = practiceArtifact?.digest ?? null
    setPracticeEditing(true)
  }

  const loadExternalPractice = () => {
    const text = practiceArtifact?.text ?? ""
    setPracticeDraft(text)
    setPracticeEditing(false)
    setPracticeConflict(false)
    setPracticeError(null)
    practiceEditStarted.current = false
    practiceEditBaseDigest.current = practiceArtifact?.digest ?? null
    practiceArtifactObservedDigest.current = practiceArtifact?.digest ?? null
  }

  const keepLocalPracticeDraft = () => {
    practiceEditBaseDigest.current = practiceArtifact?.digest ?? null
    setPracticeConflict(false)
  }

  const continueAfterRetry = () => {
    updateSessionFor(currentId, (previous) => ({ ...previous, mode: "feynman" }))
    focusComposer()
  }

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return
    if (composing.current || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  const sendExample = () => {
    if (activeRequest.current) return
    if (session.messages.length === 0) {
      updateSessionFor(currentId, (previous) => ({
        ...previous,
        mode: "ask",
        draft: "请换一个更具体、贴近本课内容的例子解释核心问题。",
      }))
      focusComposer()
      return
    }
    void runTutor("刚才这一点换个例子讲，最好用本课已经出现过的棋盘或数字。", "ask", true)
  }

  const requestSimpleExplanation = () => {
    if (!readingReady) return
    void runTutor(
      "先用 12 岁能懂的话讲清本课核心问题：用 2–3 个短段，只保留一个主因果；配一个现实类比和一个本课棋盘或数字例子，不用未解释的术语；讲完停下来，请我用自己的话复述，不要继续展开整课。",
      "ask",
      true,
      session.quizPlan,
      "feynman",
    )
  }

  useEffect(() => {
    if (!open || !session.pendingQuiz || busy) return
    const plan = session.pendingQuiz
    updateSessionFor(currentId, (previous) => ({ ...previous, pendingQuiz: null }))
    void runTutor(QUIZ_START[plan], "quiz", false, plan, undefined, true)
  }, [busy, currentId, open, session.pendingQuiz, updateSessionFor])

  if (!open) {
    return (
      <button
        type="button"
        className="tutor-launcher"
        onClick={() => openTutor("ask")}
        aria-haspopup="dialog"
        aria-expanded="false"
      >
        <span className="tutor-launcher-mark" aria-hidden="true">?</span>
        <span>问导师</span>
      </button>
    )
  }

  return (
    <>
      <button type="button" className="tutor-scrim" onClick={closeTutor} aria-label="关闭导师面板" />
      <aside
        ref={panelRef}
        id="tutor-panel"
        className={`tutor-panel${mobilePanel && (mobileExpanded || shortViewport) ? " is-expanded" : ""}`}
        role="dialog"
        aria-label="本课导师"
        aria-modal={true}
      >
        <header className="tutor-head">
          <div className="tutor-head-copy">
            <div className="tutor-head-kicker">本课导师 · {MODE_LABEL[session.mode]}</div>
            <div className="tutor-head-title">
              {lesson ? <>{lessonLabel} · {lesson.title}</> : "AlphaZero 五子棋"}
            </div>
          </div>
          <div className="tutor-head-side">
              <button
                type="button"
                className="tutor-return"
                onClick={closeTutor}
                title="关闭导师，回到正文当前滚动位置；不会自动换课或推进"
              >
                {currentStepLabel}
              </button>
            <span className={`tutor-health ${health}`}>
              {health === "ready" ? "本机 Codex · 只读" : health === "checking" ? "连接中" : "未连接"}
            </span>
            {mobilePanel && !shortViewport && (
              <button
                type="button"
                className="tutor-expand"
                onClick={() => setMobileExpanded((previous) => !previous)}
                aria-label={mobileExpanded ? "收起导师面板" : "展开导师面板"}
                aria-controls="tutor-panel"
                aria-expanded={mobileExpanded}
              >
                {mobileExpanded ? "收起" : "展开"}
              </button>
            )}
            <button type="button" className="tutor-close" onClick={closeTutor} aria-label="关闭导师">
              ×
            </button>
          </div>
        </header>

        <div className="tutor-context">
          <span className="tutor-context-label">正在看</span>
          <span className="tutor-context-section">{collectLessonSection() || lesson?.puzzle || "本课正文"}</span>
          {session.selection && (
            <blockquote className="tutor-selection">
              <span>{session.selection}</span>
              <button
                type="button"
                onClick={clearSelection}
                aria-label="不再引用选中文字"
              >
                移除
              </button>
            </blockquote>
          )}
        </div>

        <div className="tutor-modebar" aria-label="导师模式">
          {(["ask", "feynman", "quiz"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={session.mode === mode ? "active" : ""}
              onClick={() => changeMode(mode)}
              disabled={busy || (mode === "feynman" && !readingReady)}
              title={mode === "feynman" && !readingReady ? "先把本章读到收束处，再合书复述" : undefined}
              aria-pressed={session.mode === mode}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>

        {session.mode === "quiz" && session.messages.length > 0 && (
          <div className="tutor-quiz-launch" aria-label="考问操作">
            <span>考问操作</span>
            <button type="button" disabled={busy} onClick={() => void runTutor(QUIZ_START.quick, "quiz", false, "quick", undefined, true)}>快问 3</button>
            <button
              type="button"
              disabled={busy || !unitReady}
              title={unitReady ? "本单元全部通过，可以做 5 问复盘" : "本单元全部通过后才开放 5 问复盘"}
              onClick={() => void runTutor(QUIZ_START.unit, "quiz", false, "unit", undefined, true)}
            >
              单元 5
            </button>
            <button
              type="button"
              disabled={busy || !stageReady}
              title={stageReady ? "用本阶段三条闭卷自测查漏" : "先通过本阶段前面的课"}
              onClick={() => void runTutor(QUIZ_START.stage, "quiz", false, "stage", undefined, true)}
            >
              阶段 3
            </button>
            <button type="button" disabled={busy} onClick={() => void runTutor(QUIZ_START.full, "quiz", false, "full", undefined, true)}>完整 10</button>
            <button
              type="button"
              disabled={busy}
              title="停止当前考问，让导师按已答内容总结"
              onClick={() => void runTutor("停止考问", "quiz", true)}
            >
              结束本轮
            </button>
          </div>
        )}

        <div className="tutor-messages" ref={messagesRef}>
          {session.mode === "feynman" && readingReady && practice && (
            <PracticeCard
              practice={practice}
              artifact={practiceArtifact}
              draft={practiceDraft}
              editing={practiceEditing}
              conflict={practiceConflict}
              error={practiceError}
              onDraft={(value) => {
                practiceEditStarted.current = true
                setPracticeDraft(value)
              }}
              onSave={savePractice}
              onEdit={editPractice}
              onLoadExternal={loadExternalPractice}
              onKeepDraft={keepLocalPracticeDraft}
            />
          )}

          {session.messages.length === 0 && !session.loading && (
            <TutorWelcome
              mode={session.mode}
              quizPlan={session.quizPlan}
              requiredTurns={requiredPracticeTurns}
              checkpoint={checkpoint}
              unitRange={currentCoreUnit?.range ?? null}
              unitReady={unitReady}
              stageReady={stageReady}
              readingReady={readingReady}
              onStartQuiz={(plan) => void runTutor(QUIZ_START[plan], "quiz", false, plan, undefined, true)}
              onAsk={() => { changeMode("ask") }}
              onSimpleExplain={requestSimpleExplanation}
              onContinueReading={closeTutor}
            />
          )}

          <div className="tutor-chat-log" role="log" aria-live="polite" aria-relevant="additions text">
          {session.messages.map((message, index) => {
            const previous = session.messages[index - 1]
            const startsNewRound = message.quizRound != null && message.quizRound !== previous?.quizRound
            return (
              <Fragment key={message.id}>
                {startsNewRound && (
                  <div className="tutor-round-divider">
                    <span>考问 · 第 {message.quizRound} 轮</span>
                  </div>
                )}
                <article className={`tutor-message ${message.role}${message.status === "failed" ? " failed" : ""}`}>
                  <div className="tutor-message-meta">
                    <span>{message.role === "assistant" ? "导师" : message.status === "failed" ? "我 · 未完成" : "我"}</span>
                  {message.role === "assistant" && message.text.includes("【费曼定稿】") && (
                    <span className="tutor-final-note-tag">费曼定稿 · 可复制</span>
                  )}
                    {message.role === "assistant" && <CopyMessage text={message.text} />}
                  </div>
                  <RichText text={message.text} />
                </article>
              </Fragment>
            )
          })}
          </div>

          {session.loading && (
            <div className="tutor-thinking" role="status">
              <span /><span /><span />
              <em>导师正在想，不替你跳过步骤…</em>
            </div>
          )}

          {session.error && (
            <div className="tutor-error" role="alert">
              <strong>导师没有回来</strong>
              <p>{session.error}</p>
              <div className="tutor-error-actions">
                {lastRequest && (
                  <button
                    type="button"
                    onClick={() => void runTutor(lastRequest.text, lastRequest.mode, false, lastRequest.quizPlan, lastRequest.afterMode)}
                    disabled={session.loading}
                  >
                    重试
                  </button>
                )}
                {lastRequest && (
                  <button type="button" onClick={() => void copyQuestion()} aria-live="polite">
                    {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败，请手动选中" : "复制这条问题"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {session.mode === "feynman" && (
          session.messages.length > 0 || Boolean(session.assessment) || Boolean(session.assessmentError)
        ) && (
          <section
            className={`tutor-gate${!readingReady ? " reading" : ""}${session.assessment?.verdict === "pass" ? " passed" : session.assessment?.verdict === "retry" ? " retry" : ""}`}
            aria-live="polite"
          >
            {session.assessmentLoading ? (
              <div className="tutor-gate-loading" role="status">
                <span className="tutor-gate-kicker">掌握判定</span>
                <strong>导师正在核对证据</strong>
                <p>只算你自己说出的解释、应用和纠错，不算它刚才教过的内容。</p>
              </div>
            ) : !readingReady ? (
              <>
                <div className="tutor-gate-head">
                  <span className="tutor-gate-kicker">合书复述 · 还没读完</span>
                  <strong>先读到本章收束处</strong>
                </div>
                <p>
                  当前读到 {reading.percent}%。先把正文和小节里的例子读完，再合书复述；遇到卡点仍可留在“答疑”里问。
                </p>
                <div className="tutor-gate-actions">
                  <button type="button" onClick={closeTutor}>继续读正文</button>
                </div>
              </>
            ) : session.assessment?.verdict === "pass" ? (
              <>
                <div className="tutor-gate-head">
                  <span className="tutor-gate-kicker">{checkpoint ? "阶段验收 · 通过" : "掌握判定 · 通过"}</span>
                  <strong>
                    {checkpoint && nextLesson
                      ? "下一阶段已经解锁"
                      : nextLesson
                        ? "下一课已经解锁"
                        : "课程已经完成"}
                  </strong>
                </div>
                {session.assessment.evidence.length > 0 && (
                  <ul className="tutor-gate-list evidence">
                    {session.assessment.evidence.map((item, index) => (
                      <li key={index}>
                        <strong>{MASTERY_DIMENSION_LABEL[item.kind] ?? "证据"}：</strong>{item.text}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="tutor-gate-next">{session.assessment.nextAction}</p>
                <div className="tutor-gate-actions">
                  <button type="button" onClick={goToNextStation}>
                    {nextLesson
                      ? `进入${checkpoint ? "下一阶段" : "下一课"} · ${nextLesson.num} ${nextLesson.title}`
                      : "回到课末收束"}
                  </button>
                </div>
              </>
            ) : session.assessment?.verdict === "retry" ? (
              <>
                <div className="tutor-gate-head">
                  <span className="tutor-gate-kicker">掌握判定 · 暂不放行</span>
                  <strong>先补这一个缺口</strong>
                </div>
                <ul className="tutor-gate-list gaps">
                  {(session.assessment.gaps.length > 0 ? session.assessment.gaps : ["还没有足够证据。"]).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
                <p className="tutor-gate-next">{session.assessment.nextAction}</p>
                <p className="tutor-gate-foot">先补这一个缺口；新回复后旧判定会作废，需要重新申请。</p>
                {session.assessmentError && <p className="tutor-gate-error" role="alert">{session.assessmentError}</p>}
                <div className="tutor-gate-actions">
                  <button type="button" onClick={continueAfterRetry}>继续补这一段</button>
                  <button type="button" onClick={editPractice}>修改动手产物</button>
                </div>
              </>
            ) : enoughPractice ? (
              <>
                <div className="tutor-gate-head">
                  <span className="tutor-gate-kicker">掌握判定 · 最低 {requiredPracticeTurns} 轮已达到</span>
                  <strong>交给独立判定（不是自动通过）</strong>
                </div>
                <p className="tutor-gate-copy">
                  轮次只证明你已经开口，不证明讲对了。判定只看你自己说出的证据；导师刚才讲得再清楚也不算。不会因为一句“懂了”就放行。
                </p>
                <ul className="tutor-gate-list criteria">
                  <li>解释：核心因果能用不带术语的话说清</li>
                  <li>应用：亲手产物解决了本课任务，不是复述原例</li>
                  <li>纠错：能指出一个常见错误或边界</li>
                  {checkpoint && <li>迁移：能把本阶段至少两课串起来，完成阶段目标</li>}
                </ul>
                {session.assessmentError && <p className="tutor-gate-error" role="alert">{session.assessmentError}</p>}
                <div className="tutor-gate-actions">
                  <button type="button" onClick={requestAssessment} disabled={busy || health === "offline" || !artifactReady}>
                    {session.assessmentError ? "重试判定" : "交给导师判定"}
                  </button>
                </div>
              </>
            ) : (
              <div className="tutor-gate-pending">
                <div className="tutor-gate-head">
                  <span className="tutor-gate-kicker">掌握判定 · 证据 {session.feynmanTurns}/{requiredPracticeTurns} 轮</span>
                  <strong>还差 {requiredPracticeTurns - session.feynmanTurns} 轮追问</strong>
                </div>
                <p>
                  先回答导师上一条追问，不要跳到总结。{checkpoint ? "这是阶段末课，还会多问一次跨课迁移。" : "导师会补问应用或纠错，不会只听解释。"}
                </p>
                {session.assessmentError && <p className="tutor-gate-error" role="alert">{session.assessmentError}</p>}
              </div>
            )}
          </section>
        )}

        {session.mode === "feynman" && session.messages.length > 0 && (
          <p className="tutor-mode-hint">
            {session.feynmanTurns === 0
              ? "导师已经用简单版本开了头。现在合上书，用你自己的话讲一遍；不要抄它的句子。"
              : "继续用自己的话讲；申请判定时，导师只看你自己说出的证据。"}
          </p>
        )}

        {session.mode === "feynman" && feynmanNote && (
          <p className="tutor-final-saved">本课已保存一份费曼定稿；可在右侧“本课费曼定稿”回看或复制。</p>
        )}

        <div className="tutor-quick-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              updateSessionFor(currentId, (previous) => ({
                ...previous,
                mode: "ask",
                draft: previous.draft || "我没懂：",
              }))
              focusComposer()
            }}
          >
            我没懂
          </button>
          <button type="button" disabled={busy} onClick={sendExample}>换个例子</button>
          <button
            type="button"
            disabled={busy || !readingReady}
            title={readingReady ? "先听简单版，再交回复述" : "先读到本章收束处"}
            onClick={requestSimpleExplanation}
          >
            12 岁版
          </button>
          <button
            type="button"
            disabled={busy || !readingReady}
            title={readingReady ? "合书复述" : "先读到本章收束处"}
            onClick={() => changeMode("feynman")}
          >
            我来讲
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runTutor(QUIZ_START.quick, "quiz", false, "quick", undefined, true)}
            title="3 道快问，用于课后短回忆"
          >
            快问 3
          </button>
        </div>

        <form
          className="tutor-composer"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <textarea
            ref={textareaRef}
            value={session.draft}
            rows={1}
            aria-label="给导师发消息"
            placeholder={!readingReady && session.mode === "feynman"
              ? "先读到本章收束处，再合书复述…"
              : session.mode === "feynman" && !artifactReady
                ? "先记录上面的动手产物，再合书复述…"
                : MODE_PLACEHOLDER[session.mode]}
            disabled={practiceBlocked}
            onChange={(event) => updateSessionFor(currentId, (previous) => ({
              ...previous,
              draft: event.target.value,
            }))}
            onKeyDown={onComposerKeyDown}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false }}
          />
          <div className="tutor-composer-foot">
            <span>Enter 发送 · Shift+Enter 换行</span>
            <button type="submit" disabled={busy || practiceBlocked || !session.draft.trim()}>
              {busy ? "等待" : "发送"}
            </button>
          </div>
        </form>

        {health === "offline" && (
          <p className="tutor-offline">
            站内对话需要本地导师服务。用 <code>npm run dev</code> 打开本站；静态构建只能阅读。
          </p>
        )}
      </aside>
    </>
  )
}

function PracticeCard({
  practice,
  artifact,
  draft,
  editing,
  conflict,
  error,
  onDraft,
  onSave,
  onEdit,
  onLoadExternal,
  onKeepDraft,
}: {
  practice: LessonPractice
  artifact: PracticeArtifact | null
  draft: string
  editing: boolean
  conflict: boolean
  error: string | null
  onDraft: (value: string) => void
  onSave: () => void
  onEdit: () => void
  onLoadExternal: () => void
  onKeepDraft: () => void
}) {
  const recorded = Boolean(artifact) && !editing
  return (
    <section className={`tutor-practice${recorded ? " recorded" : ""}`} aria-label="本课动手任务">
      <div className="tutor-practice-head">
        <span>动手 · 判定前置</span>
        <strong>{recorded ? "产物已记录" : "先做这一步"}</strong>
      </div>
      <p className="tutor-practice-task">{practice.task}</p>
      <p className="tutor-practice-deliverable"><b>提交什么：</b>{practice.deliverable}</p>
      {conflict && (
        <div className="tutor-practice-conflict" role="alert">
          <strong>另一标签页更新了这份产物</strong>
          <p>你这里有还没保存的草稿；系统不会替你决定覆盖哪一份。</p>
          <div>
            <button type="button" onClick={onLoadExternal}>载入新版本</button>
            <button type="button" onClick={onKeepDraft}>保留我的草稿</button>
          </div>
          <small>保留草稿后，保存会覆盖另一标签页的新版本。</small>
        </div>
      )}
      {recorded && artifact ? (
        <>
          <blockquote>{artifact.text}</blockquote>
          <div className="tutor-practice-foot">
            <button type="button" onClick={onEdit}>修改产物</button>
            <small>判定器会把应用证据回到这份产物；只复述概念不算。</small>
          </div>
        </>
      ) : (
        <>
          <label htmlFor="tutor-practice-artifact">把你亲手算/看到的结果写下来，不是写“我懂了”</label>
          <textarea
            id="tutor-practice-artifact"
            value={draft}
            rows={4}
            maxLength={8000}
            placeholder="例如：action 58 = (4, 6)；计算步骤、测试输出或观察结果……"
            onChange={(event) => onDraft(event.target.value)}
          />
          {error && <p className="tutor-practice-error" role="alert">{error}</p>}
          <div className="tutor-practice-foot">
            <button type="button" onClick={onSave} disabled={conflict || draft.trim().length < 8}>记录产物，开始复述</button>
            <small>本机保存；未记录产物不能申请掌握判定。</small>
          </div>
        </>
      )}
    </section>
  )
}

function TutorWelcome({
  mode,
  quizPlan,
  requiredTurns,
  checkpoint,
  unitRange,
  unitReady,
  stageReady,
  readingReady,
  onStartQuiz,
  onAsk,
  onSimpleExplain,
  onContinueReading,
}: {
  mode: TutorMode
  quizPlan: QuizPlan
  requiredTurns: number
  checkpoint: boolean
  unitRange: string | null
  unitReady: boolean
  stageReady: boolean
  readingReady: boolean
  onStartQuiz: (plan: QuizPlan) => void
  onAsk: () => void
  onSimpleExplain: () => void
  onContinueReading: () => void
}) {
  if (mode === "feynman") {
    if (!readingReady) {
      return (
        <div className="tutor-welcome">
          <div className="tutor-welcome-kicker">合书复述 · 还没读完</div>
          <h2>先读到本章收束处</h2>
          <p>复述要从完整正文出发，不能只读开头就申请判定。遇到卡点可以先用“答疑”问清楚，再继续读。</p>
          <button type="button" className="btn primary" onClick={onContinueReading}>继续读正文</button>
        </div>
      )
    }
    return (
      <div className="tutor-welcome">
        <div className="tutor-welcome-kicker">先动手 · 再合书 · 至少 {requiredTurns} 轮证据</div>
        <h2>先交代产物，再合书讲</h2>
        <ol>
          {RECALL_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
        </ol>
        <p>
          先完成上方动手任务并记录结果，再不用术语地讲清因果。导师会先指出对在哪里，再只补漏洞；判定器还会核对产物，不能只靠复述概念。
          {checkpoint ? "这是阶段末课，还会请你把本阶段两课串起来。" : ""}
        </p>
        <button type="button" className="btn primary" onClick={onSimpleExplain}>先听 12 岁版，再轮到我讲</button>
      </div>
    )
  }
  if (mode === "quiz") {
    return (
      <div className="tutor-welcome">
        <div className="tutor-welcome-kicker">一次一题 · 逐步加难</div>
        <h2>先找出你真正不会的边界</h2>
        <p>导师不会先给答案，也不会一次抛出整张试卷。答不出就说「不会」，它会退到更基础的一步。先选节奏，之后仍可随时停止。</p>
        <div className="tutor-welcome-actions">
          <button
            type="button"
            className={`btn${quizPlan === "quick" ? " primary" : ""}`}
            onClick={() => onStartQuiz("quick")}
          >
            3 分钟快问 · 3 题
          </button>
          <button
            type="button"
            className={`btn${quizPlan === "unit" ? " primary" : ""}`}
            onClick={() => onStartQuiz("unit")}
            disabled={!unitReady}
            title={unitReady && unitRange ? `${unitRange} · 用本单元 5 个复习问题考我` : "本单元全部通过后才开放 5 问复盘"}
          >
            单元复盘 · 5 题
          </button>
          <button
            type="button"
            className={`btn${quizPlan === "stage" ? " primary" : ""}`}
            onClick={() => onStartQuiz("stage")}
            disabled={!stageReady}
            title={stageReady ? "用本阶段契约里的 3 条闭卷自测查漏；不参与放行" : "先通过本阶段前面的课"}
          >
            本级自测 · 3 题
          </button>
          <button
            type="button"
            className={`btn${quizPlan === "full" ? " primary" : ""}`}
            onClick={() => onStartQuiz("full")}
          >
            完整考问 · 10 题
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="tutor-welcome">
      <div className="tutor-welcome-kicker">随时打断 · 随时换说法</div>
      <h2>直接说你卡在哪</h2>
      <p>可以贴一句原文、点出一个跳步，或只说「这里没懂」。导师会先定位那一小步，再用本课的例子解释。</p>
      <button type="button" className="btn" onClick={onAsk}>从一句话开始</button>
    </div>
  )
}

function CopyMessage({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
      window.setTimeout(() => setState("idle"), 1600)
    } catch {
      setState("failed")
    }
  }
  return (
    <button type="button" className="tutor-copy" onClick={() => void copy()} aria-live="polite">
      {state === "copied" ? "已复制" : state === "failed" ? "复制失败，请手动选中" : "复制"}
    </button>
  )
}

function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n")
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let bullets: string[] = []
  let numbered: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(<p key={`p-${blocks.length}`}>{inline(paragraph.join(" "), blocks.length)}</p>)
    paragraph = []
  }
  const flushBullets = () => {
    if (bullets.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((item, index) => <li key={index}>{inline(item, index)}</li>)}
      </ul>,
    )
    bullets = []
  }
  const flushNumbered = () => {
    if (numbered.length === 0) return
    blocks.push(
      <ol key={`ol-${blocks.length}`}>
        {numbered.map((item, index) => <li key={index}>{inline(item, index)}</li>)}
      </ol>,
    )
    numbered = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushBullets()
      flushNumbered()
      continue
    }
    if (/^[-•]\s+/.test(line)) {
      flushParagraph()
      flushNumbered()
      bullets.push(line.replace(/^[-•]\s+/, ""))
      continue
    }
    const numberedItem = line.match(/^\d+[.)]\s+(.*)$/)
    if (numberedItem) {
      flushParagraph()
      flushBullets()
      numbered.push(numberedItem[1])
      continue
    }
    flushBullets()
    flushNumbered()
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      flushParagraph()
      blocks.push(<p className="tutor-rich-head" key={`h-${blocks.length}`}>{inline(heading[1], blocks.length)}</p>)
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()
  flushBullets()
  flushNumbered()

  return <div className="tutor-rich">{blocks}</div>
}

function inline(text: string, keyBase: number) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyBase}-${index}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${keyBase}-${index}`}>{part.slice(1, -1)}</code>
    }
    return <span key={`${keyBase}-${index}`}>{part}</span>
  })
}
