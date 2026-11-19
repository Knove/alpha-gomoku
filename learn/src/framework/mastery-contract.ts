export const MASTERY_DIMENSIONS = [
  "explanation",
  "application",
  "correction",
  "transfer",
] as const

/** 动手产物在判定证据里的固定来源；它来自复述前的练习，不是聊天消息。 */
export const PRACTICE_ARTIFACT_SOURCE_ID = "practice-artifact"

export type MasteryDimension = (typeof MASTERY_DIMENSIONS)[number] | "unclassified"

export interface MasteryEvidence {
  kind: MasteryDimension
  /** 判定器对这条证据的概括，用来向学生解释为什么通过或没通过。 */
  text: string
  /** 证据必须能追到某一条学生复述消息，不能由判定器凭空补写。 */
  sourceMessageId: string
  /** 学生原话中被引用的连续片段；服务端会回到消息正文验证。 */
  quote: string
}

export const MASTERY_DIMENSION_LABEL: Record<MasteryDimension, string> = {
  explanation: "解释",
  application: "应用",
  correction: "纠错",
  transfer: "迁移",
  unclassified: "未分类",
}

const DIMENSION_SET = new Set<string>(MASTERY_DIMENSIONS)

const TRIVIAL_EVIDENCE = new Set([
  "不知道",
  "不知道啊",
  "不会",
  "不懂",
  "没懂",
  "不清楚",
  "我懂了",
  "懂了",
  "明白了",
  "我明白了",
  "有道理",
  "是的",
  "对的",
  "好的",
  "嗯嗯",
  "差不多",
])

const VAGUE_AGREEMENT = [
  /^(?:我)?(?:同意|赞同|认同)(?:刚才|上面|导师)?(?:的)?(?:说法|观点|解释|判断)?$/,
  /^(?:我)?(?:觉得|认为)?(?:刚才|上面)?(?:说得)?(?:很)?(?:对|有道理|正确)$/,
  /^(?:大概|差不多|可能|应该)?(?:就是|是)?(?:这样|这个意思)(?:吧|啊)?$/,
]

/** 判断一段话是否有可核对的内容，而不是“懂了 / 不知道”这类空话。 */
export function isSubstantiveEvidenceText(value: unknown): boolean {
  if (typeof value !== "string") return false
  const core = value
    .normalize("NFKC")
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]【】<>《》-]+/g, "")
  if (core.length < 6) return false
  return !TRIVIAL_EVIDENCE.has(core) && !VAGUE_AGREEMENT.some((pattern) => pattern.test(core))
}

export function isMasteryDimension(value: unknown): value is MasteryDimension {
  return typeof value === "string" && DIMENSION_SET.has(value)
}

export function requiredEvidenceKinds(checkpoint: boolean): readonly MasteryDimension[] {
  return checkpoint
    ? ["explanation", "application", "correction", "transfer"]
    : ["explanation", "application", "correction"]
}

// 场景证据必须包含一次真实的换条件、代入或计算结果；单看数字会把“第 2 课”误当应用。
const APPLICATION_SCENE = /(?:换成|换到|改为|改成|代入|套到|套用|试算|算一下|算一遍|举个(?:例子)?|另一种|另一个|新局面|新局|新的|另一盘|把[^。！？!?]{0,40}(?:放|带|用|套|代|调|改)[^。！？!?]{0,30}(?:新|另一|别的|不同|这个局面)|[a-zA-Zα-ωΑ-Ω]\s*(?:=|:|：|是|为)\s*-?\d|[a-zA-Zα-ωΑ-Ω]\s*(?:乘|加|减|除)\s*\d|[-+]?\d+(?:\.\d+)?\s*(?:×|x|\*|\/|÷|\+|-)\s*[-+]?\d+)/

// 只出现“不”或“不清楚”不是纠错；必须指出具体做法、后果或边界。
const CORRECTION_BOUNDARY = /(?:不能|不可以|不对|错了|错误|否则|边界|风险|无效|漏掉?|漏算|混淆|混用|忽略|忘了|必须|应该|只会|不再|反而|失败|反了|反过来|不会|只(?:翻|调|看|检查|改)|不同步|不翻|不调|不检查)/
const CORRECTION_UNCERTAIN = /(?:不懂|不清楚|不太清楚|不知道|没懂|不会做|没把握|还是不明白|有点糊涂)/
const CORRECTION_CONSEQUENCE = /(?:因为|所以|否则|就|会|导致|结果|使得|从而|一旦|如果|只|必须|应该|才|不然|错|失败|无效|风险|边界)/

// 迁移不是提一句课号：要同时出现跨课锚点、具体概念和一次实际连接/应用。
const TRANSFER_ANCHOR = /(?:第\s*\d+\s*课|上一课|前一课|前面(?:学过|的)|之前(?:学过|的)|前一阶段|上一阶段|跨课|两课|三课)/
const TRANSFER_TOPIC = /(?:棋盘|动作|视角|z|胜负|权重|损失|梯度|学习率|点积|ReLU|非线性|输入面|平面|卷积|感受野|残差|BN|批标准化|策略|价值|MCTS|搜索|回传|PUCT|访问|温度|自我对弈|样本|回放|增广|反向传播|训练|优化器|竞技场|晋升|管线|检查点|事件|快照|WebSocket|REST|服务|证据|来源|规则)/
const TRANSFER_LINK = /(?:串|联系|迁移|套|用|带|放|结合|依赖|对应|接|比|从|到|因为|所以|同一条|同一个|同|一致|共用|保持|贯穿|复用)/
const TRANSFER_SCENARIO = /(?:新局面|新数字|新局|另一个|另一局|换个|换成|假设|如果|白方|黑方|四子棋|13×13|这局|当前局|新的)/

/**
 * 对“应用/纠错/迁移”再做一层可核对的结构检查：
 * 定义复述可以冒充解释，但不能仅靠标签就变成换场景、指出边界或跨课迁移。
 */
export function evidenceQuoteShowsKind(kind: MasteryDimension, quote: unknown): boolean {
  if (!isSubstantiveEvidenceText(quote)) return false
  const text = String(quote).normalize("NFKC")
  if (kind === "explanation") return true
  if (kind === "application") return APPLICATION_SCENE.test(text)
  if (kind === "correction") {
    if (CORRECTION_UNCERTAIN.test(text)) return false
    return CORRECTION_BOUNDARY.test(text) && CORRECTION_CONSEQUENCE.test(text)
  }
  if (kind === "transfer") {
    return TRANSFER_ANCHOR.test(text)
      && TRANSFER_TOPIC.test(text)
      && TRANSFER_LINK.test(text)
      && TRANSFER_SCENARIO.test(text)
  }
  return false
}

function overlapText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\[\]【】<>《》\-_=+*/\\|]+/g, "")
}

function charGrams(text: string, size = 5): Set<string> {
  const grams = new Set<string>()
  if (text.length < size) return grams
  for (let index = 0; index <= text.length - size; index += 1) grams.add(text.slice(index, index + size))
  return grams
}

/**
 * 检测学生是否把导师刚给出的整段文字直接抄回。
 * 这是反照抄的结构护栏，不声称能判断学生是否理解。
 */
export function isLikelyCopiedFromTutor(
  text: unknown,
  tutorMessages: readonly unknown[],
  minimumLength = 36,
): boolean {
  const student = overlapText(text)
  if (student.length < minimumLength || !Array.isArray(tutorMessages)) return false
  const studentGrams = charGrams(student)
  if (studentGrams.size < 8) return false
  for (const tutorText of tutorMessages) {
    const tutor = overlapText(tutorText)
    if (tutor.length < 24) continue
    if (student.length >= 48 && tutor.includes(student)) return true
    const tutorGrams = charGrams(tutor)
    if (tutorGrams.size === 0) continue
    let shared = 0
    for (const gram of studentGrams) {
      if (tutorGrams.has(gram)) shared += 1
    }
    if (shared >= 8 && shared / studentGrams.size >= 0.72) return true
  }
  return false
}

/** 证据必须跨过足够多的学生轮次，避免一段长回答自说自话地包办全部维度。 */
export function minimumEvidenceSources(checkpoint: boolean): number {
  return checkpoint ? 3 : 2
}

/** 客户端写入进度前的最后一道结构校验；引用原文本身由服务端对照历史验证。 */
export function evidenceShapeIsSufficient(
  evidence: readonly MasteryEvidence[],
  checkpoint: boolean,
): boolean {
  if (!Array.isArray(evidence) || evidence.length < requiredEvidenceKinds(checkpoint).length) return false
  const seenKinds = new Set<string>()
  const sources = new Set<string>()
  const quotes = new Set<string>()
  for (const item of evidence) {
    if (!item || !isMasteryDimension(item.kind) || item.kind === "unclassified") return false
    if (typeof item.sourceMessageId !== "string" || !item.sourceMessageId.trim()) return false
    if (!isSubstantiveEvidenceText(item.text) || !isSubstantiveEvidenceText(item.quote)) return false
    // 动手产物已经经过任务版本、指纹与确定性数值门禁；自由文本课不能再拿应用场景正则二次误杀。
    if (item.sourceMessageId === PRACTICE_ARTIFACT_SOURCE_ID) {
      if (item.kind !== "application") return false
    } else if (!evidenceQuoteShowsKind(item.kind, item.quote)) {
      return false
    }
    const normalizedQuote = item.quote.normalize("NFKC").replace(/\s+/g, " ").trim()
    if (quotes.has(normalizedQuote)) return false
    seenKinds.add(item.kind)
    sources.add(item.sourceMessageId)
    quotes.add(normalizedQuote)
  }
  return requiredEvidenceKinds(checkpoint).every((kind) => seenKinds.has(kind))
    && sources.size >= minimumEvidenceSources(checkpoint)
}
