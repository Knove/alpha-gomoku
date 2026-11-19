import {
  CURRICULUM_BY_ID,
  canonicalCurriculumId,
  isStageCheckpoint,
  practiceForLesson,
  requiredFeynmanTurns,
  stageForLesson,
} from "../src/framework/curriculum.ts"
import { practiceArtifactDigest, practiceVerificationError } from "../src/framework/practice-artifacts.ts"

function copyLesson(lesson) {
  return {
    id: lesson.id,
    num: lesson.num,
    title: lesson.title,
    puzzle: lesson.puzzle,
    phase: lesson.phase,
    preview: lesson.preview,
    outcomes: [...lesson.outcomes],
    sources: lesson.sources.map((source) => ({ ...source })),
    practice: practiceForLesson(lesson.id),
  }
}

function copyStage(stage, checkpoint) {
  return {
    id: stage.id,
    title: stage.title,
    range: stage.range,
    entryId: stage.entryId,
    lessonIds: [...stage.lessonIds],
    goal: stage.goal,
    checkpoint: stage.checkpoint,
    core: [...stage.core],
    practice: stage.practice,
    commonMistake: stage.commonMistake,
    selfTests: [...stage.selfTests],
    hours: stage.hours,
    isCheckpoint: checkpoint,
    lessons: stage.lessonIds.flatMap((lessonId) => {
      const unit = CURRICULUM_BY_ID.get(lessonId)
      return unit ? [{ num: unit.num, title: unit.title, outcomes: [...unit.outcomes] }] : []
    }),
  }
}

/** 课程身份、阶段边界和放行轮次只由仓库里的课程契约决定。 */
export function lessonContract(lessonId) {
  const canonicalId = typeof lessonId === "string" ? canonicalCurriculumId(lessonId) : null
  if (!canonicalId) return null
  const lesson = CURRICULUM_BY_ID.get(canonicalId)
  if (!lesson) return null
  const stage = stageForLesson(canonicalId)
  const checkpoint = isStageCheckpoint(canonicalId)
  return {
    lesson: copyLesson(lesson),
    stage: stage ? copyStage(stage, checkpoint) : null,
    checkpoint,
    requiredStudentTurns: requiredFeynmanTurns(canonicalId),
  }
}

/** 丢弃客户端可伪造的 lesson/stage 身份，只保留它提供的正文、对话和教学单元。 */
export function withAuthoritativeContract(input, contract) {
  return {
    ...input,
    lesson: contract.lesson,
    stage: contract.stage,
  }
}

/** 判定请求的客户端前置条件；阅读凭证会在这里硬检查，而不是只靠按钮禁用。 */
export function assessmentRequestError(input, options = {}) {
  if (!input?.lesson || typeof input.lesson !== "object") return "判定请求缺少课程信息。"
  if (!Array.isArray(input.history)) return "判定请求缺少对话记录。"
  if (input?.context?.reading?.reachedEnd !== true) {
    return "先把本章读到收束处，再来申请掌握判定。"
  }
  if (options.requireArtifact === true) {
    const text = input?.artifact?.text
    if (typeof text !== "string" || text.trim().length < 8) {
      return "先亲手完成本课动手任务并记录产物，再来申请掌握判定。"
    }
    if (text.length > 8_000) return "动手产物太长，请压缩到关键步骤和结果。"
    const practice = options.practice
    const artifact = input.artifact
    if (!practice || artifact.taskId !== practice.id || artifact.version !== practice.version) {
      return "动手产物与当前课任务版本不一致，请重新完成并记录。"
    }
    if (artifact.digest !== practiceArtifactDigest(text.trim(), practice.id, practice.version)) {
      return "动手产物内容与记录指纹不一致，请返回重存后再申请判定。"
    }
    const verificationError = practiceVerificationError(practice, text)
    if (verificationError) return verificationError
  }
  return null
}
