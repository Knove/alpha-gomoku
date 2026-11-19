import {
  MASTERY_DIMENSIONS,
  MASTERY_DIMENSION_LABEL,
  evidenceShapeIsSufficient,
  isSubstantiveEvidenceText,
  type MasteryDimension,
  type MasteryEvidence,
} from "./mastery-contract.ts"

export type TutorMode = "ask" | "feynman" | "quiz"
export type QuizPlan = "quick" | "unit" | "full" | "stage"

export { MASTERY_DIMENSIONS, MASTERY_DIMENSION_LABEL }
export type { MasteryDimension }
export type TutorEvidence = MasteryEvidence

export interface TutorMessage {
  id: string
  role: "user" | "assistant"
  text: string
  mode?: TutorMode
  /** 只有一次“学生发言 + 导师回复”完整落盘，才可能成为掌握证据。 */
  status?: "pending" | "ok" | "failed"
  /** 同一课多次考问的轮次；旧轮次不能污染新一轮的题号与收束判断。 */
  quizRound?: number
}

export interface TutorAssessment {
  verdict: "pass" | "retry"
  evidence: TutorEvidence[]
  gaps: string[]
  nextAction: string
}

export interface TutorSession {
  messages: TutorMessage[]
  draft: string
  mode: TutorMode
  quizPlan: QuizPlan
  /** 考问轮次；每次从侧栏或面板启动新一轮时递增。 */
  quizRound: number
  /** 由页面按钮排队的考问；导师面板打开后自动开始，而不是再让用户点一次。 */
  pendingQuiz: QuizPlan | null
  loading: boolean
  error: string | null
  lastRequest: {
    text: string
    mode: TutorMode
    quizPlan: QuizPlan
    afterMode?: TutorMode
    userMessageId?: string
    quizRound?: number
  } | null
  selection: string
  feynmanTurns: number
  /** 产物变更后从这里重新计数复述；旧对话保留但不冒充当前产物的证据。 */
  feynmanEvidenceStart: number
  assessment: TutorAssessment | null
  assessmentLoading: boolean
  assessmentError: string | null
}

export interface TutorRequestIdentity {
  text: string
  mode: TutorMode
  quizPlan: QuizPlan
  afterMode?: TutorMode
}

function isSettled(message: TutorMessage | undefined): boolean {
  return Boolean(message && (message.status === undefined || message.status === "ok"))
}

/** 只返回完整成功的“学生发言 + 导师回复”对；失败或半截请求不能进入上下文。 */
export function completedTutorMessages(messages: readonly TutorMessage[]): TutorMessage[] {
  const completed: TutorMessage[] = []
  for (let index = 0; index < messages.length; index += 1) {
    const user = messages[index]
    if (user?.role !== "user" || !isSettled(user)) continue
    const assistant = messages[index + 1]
    if (assistant?.role !== "assistant" || !isSettled(assistant)) continue
    completed.push(user, assistant)
    index += 1
  }
  return completed
}

/**
 * 聊天上下文可以包含导师主动发起的题目；只排除失败请求和尚未落盘的本地草稿。
 * 不能只发送“学生 + 导师”成对消息，否则考我模式下一轮会丢掉导师刚问的问题。
 */
export function settledTutorMessages(messages: readonly TutorMessage[]): TutorMessage[] {
  return messages.filter((message) => message.status !== "pending" && message.status !== "failed")
}

/** 判定上下文只取完整的合书复述交换，答疑和考问不混入。 */
export function completedFeynmanMessages(messages: readonly TutorMessage[], startIndex = 0): TutorMessage[] {
  const from = Number.isInteger(startIndex) ? Math.max(0, Math.min(startIndex, messages.length)) : 0
  const completed = completedTutorMessages(messages.slice(from))
  const practice: TutorMessage[] = []
  for (let index = 0; index < completed.length; index += 2) {
    const user = completed[index]
    const assistant = completed[index + 1]
    if (user?.mode !== "feynman" || !assistant) continue
    practice.push(user, assistant)
  }
  return practice
}

function countFeynmanTurns(messages: readonly TutorMessage[], startIndex = 0): number {
  return completedFeynmanMessages(messages, startIndex).filter((message) => (
    message.role === "user"
      && message.mode === "feynman"
      && isSubstantiveEvidenceText(message.text)
  )).length
}

export function assessmentIsSufficient(assessment: TutorAssessment, checkpoint: boolean): boolean {
  return assessment.verdict === "pass"
    && Array.isArray(assessment.gaps)
    && assessment.gaps.length === 0
    && evidenceShapeIsSufficient(assessment.evidence, checkpoint)
}

export function emptyTutorSession(mode: TutorMode = "ask", quizPlan: QuizPlan = "quick"): TutorSession {
  return {
    messages: [],
    draft: "",
    mode,
    quizPlan,
    quizRound: 0,
    pendingQuiz: null,
    loading: false,
    error: null,
    lastRequest: null,
    selection: "",
    feynmanTurns: 0,
    feynmanEvidenceStart: 0,
    assessment: null,
    assessmentLoading: false,
    assessmentError: null,
  }
}

/**
 * 只有真正重试同一条失败请求，才允许复用旧的 userMessageId。
 * 新开考问/换模式不能把上一条失败复述“复活”成成功证据。
 */
export function tutorRequestUserMessageId(
  session: TutorSession,
  request: TutorRequestIdentity,
  options: {
    appendUser: boolean
    newUserMessageId?: string
    newQuizRound?: boolean
  },
): string | undefined {
  if (options.appendUser) return options.newUserMessageId
  if (options.newQuizRound) return undefined
  const last = session.lastRequest
  if (!last || !last.userMessageId) return undefined
  if (last.text !== request.text || last.mode !== request.mode || last.quizPlan !== request.quizPlan) return undefined
  if ((last.afterMode ?? undefined) !== (request.afterMode ?? undefined)) return undefined
  return last.userMessageId
}

/** 导师回复只说明这一轮对话发生过，不能自动算作掌握。 */
export function recordTutorReply(
  session: TutorSession,
  reply: TutorMessage,
  mode: TutorMode,
  userMessageId?: string,
): TutorSession {
  const fallbackUser = [...session.messages].reverse().find((message) => (
    message.role === "user" && message.status !== "ok" && message.status !== "failed"
  ))
  const settledUserId = userMessageId ?? fallbackUser?.id
  const messages = session.messages.map((message) => (
    message.id === settledUserId && message.role === "user"
      ? { ...message, mode: message.mode ?? mode, status: "ok" as const }
      : message
  ))
  const nextMessages = [...messages, { ...reply, status: "ok" as const }]
  return {
    ...session,
    loading: false,
    error: null,
    messages: nextMessages,
    feynmanTurns: countFeynmanTurns(nextMessages, session.feynmanEvidenceStart),
  }
}

export function failTutorRequest(
  session: TutorSession,
  error: string,
  userMessageId?: string,
): TutorSession {
  const messages = session.messages.map((message) => (
    message.id === userMessageId && message.role === "user"
      ? { ...message, status: "failed" as const }
      : message
  ))
  return {
    ...session,
    messages,
    loading: false,
    error,
    feynmanTurns: countFeynmanTurns(messages, session.feynmanEvidenceStart),
  }
}

/** 产物换了，旧轮次不能继续和新产物拼成同一条掌握证据。 */
export function invalidateFeynmanEvidence(session: TutorSession, reason: string): TutorSession {
  return {
    ...session,
    feynmanTurns: 0,
    feynmanEvidenceStart: session.messages.length,
    assessment: null,
    assessmentLoading: false,
    assessmentError: reason,
  }
}

export function beginTutorAssessment(session: TutorSession): TutorSession {
  return {
    ...session,
    assessmentLoading: true,
    assessmentError: null,
  }
}

export function completeTutorAssessment(
  session: TutorSession,
  assessment: TutorAssessment,
): TutorSession {
  return {
    ...session,
    assessment,
    assessmentLoading: false,
    assessmentError: null,
  }
}

export function failTutorAssessment(session: TutorSession, error: string): TutorSession {
  return {
    ...session,
    assessmentLoading: false,
    assessmentError: error,
  }
}

/** 新一轮学生证据出现后，旧的“未通过”判定不再代表当前状态。 */
export function clearRejectedAssessment(session: TutorSession): TutorSession {
  if (session.assessment?.verdict !== "retry") return session
  return {
    ...session,
    assessment: null,
    assessmentError: null,
  }
}
