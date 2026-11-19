export const FIDELITY_KINDS = [
  "runtime-exact",
  "mirror-exact",
  "recomputed",
  "constructed",
  "adapted",
  "drift",
] as const

export type FidelityKind = (typeof FIDELITY_KINDS)[number]
export type SourceKind = "python" | "browser" | "test" | "contract" | "artifact"

export interface SourceMapping {
  kind: SourceKind
  path: string
  symbol?: string
  fidelity: FidelityKind
}

export interface CurriculumUnit {
  id: string
  num: string
  title: string
  puzzle: string
  phase: string
  preview: string
  outcomes: readonly string[]
  sources: readonly SourceMapping[]
  aliases?: readonly string[]
}

export interface CurriculumStage {
  id: string
  title: string
  range: string
  entryId: string
  lessonIds: readonly string[]
  goal: string
  checkpoint: string
  core: readonly string[]
  practice: string
  commonMistake: string
  selfTests: readonly string[]
  hours: number
}

const unit = (value: CurriculumUnit): CurriculumUnit => value

export const CURRICULUM: readonly CurriculumUnit[] = [
  unit({
    id: "prologue", num: "序", title: "没人教过它下棋", puzzle: "一手棋怎样走完整个学习闭环？",
    phase: "先看整条链", preview: "沿一份真实案例看见棋盘、网络、搜索、训练、验收和网页之间的全部箭头。",
    outcomes: ["画出完整系统的先后关系：谁产生什么、谁改谁", "区分真实记录、代码复现、教学构造和浏览器适配", "对证一处真实记录并指出各环节职责"],
    sources: [
      { kind: "contract", path: "PLAN.md", symbol: "§1 总体架构", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/real.ts", symbol: "REAL", fidelity: "runtime-exact" },
    ], aliases: ["home"],
  }),
  unit({
    id: "l01", num: "1", title: "一次点击怎样成为合法落子或终局", puzzle: "点击一个格子后，机器怎样知道发生了什么？",
    phase: "棋局成为数据", preview: "从坐标和动作编号走到合法落子、五连与终局。",
    outcomes: ["在坐标与 action 之间互换", "写出合法动作判定与以新子为锚的判胜检查"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "Game", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "play", fidelity: "mirror-exact" },
      { kind: "test", path: "learn/tests/game.test.ts", symbol: "action 40 is tengen", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l02", num: "2", title: "视角：一条约定", puzzle: "黑白轮流时，怎样让“我方”永远指当前玩家？",
    phase: "棋局成为数据", preview: "统一当前行棋方视角，并把同一约定贯穿价值和终局答案。",
    outcomes: ["对任意局面算出 canonical board", "写出 z 按行棋方记分并与价值共用 −1…+1 标尺"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "Game.canonical_board", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "canonical", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l03", num: "3", title: "权重：自己变准的机器", puzzle: "为什么调 w，又怎样确定方向和距离？",
    phase: "数字开始学习", preview: "从一个权重、平方损失和梯度走到学习率控制的一次更新。",
    outcomes: ["分辨 x、w、r、z 各自角色", "手算一次梯度下降更新", "写出学习率过大过小的后果与玩具地形的边界"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "linGrad", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/train.py", symbol: "make_optimizer", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l04", num: "4", title: "加权求和：乘和加，不多不少", puzzle: "多个特征怎样合成一个分数？",
    phase: "数字开始学习", preview: "用正负权重、乘加和点积汇总特征，并看清线性计算的边界。",
    outcomes: ["手算任意窗口的点积", "指出正负权重各把分数推向哪边，并用例 4-1 换卷积核对拍分数方向"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "dot", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l05", num: "5", title: "非线性变换：直线画不出的形状", puzzle: "只有乘和加为什么认不出所有形状？",
    phase: "数字开始学习", preview: "用 XOR 和 ReLU 证明非线性为什么不可缺少。",
    outcomes: ["算出 ReLU 对四点的分类", "用四个点指出线性切不开的位置"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "reluAbs", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/model.py", symbol: "ResBlock.forward", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l06", num: "6", title: "三个输入平面", puzzle: "统一视角后，为什么还要拆成三张图？",
    phase: "造出真实网络", preview: "把当前行棋方、对方和颜色身份保存为真实网络输入。",
    outcomes: ["从局面构造 own/opponent/color 三个平面并与 encode() 对拍", "写出颜色平面与空位的编码，指出漏写各自坏在哪"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "encode", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "encode", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l07", num: "7", title: "卷积核：在全盘滑动的一组权重", puzzle: "同一种局部棋形为什么只需学一次？",
    phase: "造出真实网络", preview: "从一个 3×3×3 乘加窗口走到 padding、滑动和权重共享。",
    outcomes: ["手算一处卷积响应", "写出滑窗、padding、通道与权重共享的实现要点"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet.stem", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/weights-best.json", symbol: "stem.0.weight", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l08", num: "8", title: "叠层：看见全盘", puzzle: "网络怎样看得更远，又不把信息弄丢？",
    phase: "造出真实网络", preview: "连续完成感受野、残差路径和 BatchNorm 三个必修小步。",
    outcomes: ["计算感受野", "写出残差捷径 x+h 的位置", "区分 BN 的训练与推理统计"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "ResBlock", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/model.ts", symbol: "traceNet", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l09", num: "9", title: "双头：一次前向两个答案", puzzle: "哪里该下和谁占优为什么共用主干？",
    phase: "造出真实网络", preview: "分别走完策略 logits/softmax 和价值 v_net/tanh 两个必修小步。",
    outcomes: ["把 logits 走完 softmax/tanh 得到 p 与 v_net", "写出 v_net 的范围与视角（tanh 压进 −1…+1，站当前行棋方）", "区分 P 与价值"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet.forward", fidelity: "runtime-exact" },
      { kind: "test", path: "learn/tests/parity.test.ts", symbol: "逐层对拍", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l10", num: "10", title: "搜索：一次模拟怎样来回走一遍", puzzle: "网络第一眼之后，一次搜索具体做什么？",
    phase: "搜索检查第一眼", preview: "沿根、边、叶前进，再按当前行棋方视角把结果逐层回传到 N/W/Q。",
    outcomes: ["手推一次 select/evaluate/expand/backup 并对拍 N/W/Q", "写出负极大值搜索的逐层取负与搜索汇总 root_value 的记账", "写出子树复用的换根要点"],
    sources: [
      { kind: "python", path: "alphagomoku/mcts.py", symbol: "SearchTree", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/mcts.ts", symbol: "SearchTree", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l11", num: "11", title: "搜索：下一次该查哪条路", puzzle: "怎样兼顾已有好成绩和没看够的候选？",
    phase: "搜索检查第一眼", preview: "从 Q+U 走到 π、根噪声、温度和实际动作。",
    outcomes: ["计算 PUCT 并选边", "由全部根访问数计算 π", "区分噪声、温度与预算"],
    sources: [
      { kind: "python", path: "alphagomoku/mcts.py", symbol: "SearchTree._puct_select", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/selfplay.py", symbol: "play_games", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l12", num: "12", title: "自我对弈：一手棋怎样成为样本", puzzle: "落子时不知道输赢，终局后怎样补全目标答案？",
    phase: "搜索变成学习", preview: "追踪真实样本，并看真正的训练器如何跨多局批量评估、逐树顺序搜索。",
    outcomes: ["从一局棋构造全部 (s,π,z) 并对拍记录", "写出 z 按记录时行棋方补 ±1/0", "区分 v_net、root_value 和 z", "写出跨树批量求值的锁步接口"],
    sources: [
      { kind: "python", path: "alphagomoku/selfplay.py", symbol: "play_games", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/real.ts", symbol: "REAL.selfplayGame", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l13", num: "13", title: "反向传播：两种错误怎样改动所有权重", puzzle: "π 和 z 的错误怎样穿过共享主干？",
    phase: "搜索变成学习", preview: "在两个训练目标和真实网络都出现后，完整计算双损失与链式反向传播。",
    outcomes: ["计算策略和价值损失", "手算两权重链式法则", "把 backward/step 对应到数学"],
    sources: [
      { kind: "python", path: "alphagomoku/train.py", symbol: "train_step", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "twoLayer", fidelity: "constructed" },
    ],
  }),
  unit({
    id: "l14", num: "14", title: "训练：许多样本怎样形成一次更新", puzzle: "旧新样本怎样混合、变换并共同更新网络？",
    phase: "搜索变成学习", preview: "走过回放池、随机抽样、旋转翻转变换和一次真实的权重更新。",
    outcomes: ["写出 replay 抽样与重建并复现一次 train_step", "同步变换棋盘和 π", "把两笔损失接回 zero_grad → backward → step"],
    sources: [
      { kind: "python", path: "alphagomoku/replay.py", symbol: "ReplayBuffer", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/train.py", symbol: "train_step", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l15", num: "15", title: "竞技场：谁有资格成为 best", puzzle: "损失下降为什么还不能换 best?",
    phase: "验收与运行", preview: "控制颜色和开局，用 best、baseline 和有限比赛证据决定晋升。",
    outcomes: ["区分 challenger/best/baseline/latest", "计算竞技场得分率并执行 55% 晋升判定", "配置换先后手与开局采样的受控对战", "指出 55% 阈值的作用范围与小样本证据的限制"],
    sources: [
      { kind: "python", path: "alphagomoku/arena.py", symbol: "play_match", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/pipeline.py", symbol: "run", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l16", num: "16", title: "管线：一轮训练怎样运行并恢复", puzzle: "阶段、指标和检查点为什么必须按这个顺序？",
    phase: "验收与运行", preview: "从配置、预热和竞技场，走到“先记指标、再存模型”的顺序、暂停、停止与自动恢复。",
    outcomes: ["跑通一轮 pipeline 并排列各阶段产物", "排障崩溃一致性与恢复边界", "指出优化器与随机数发生器不入检查点的后果"],
    sources: [
      { kind: "python", path: "alphagomoku/pipeline.py", symbol: "run", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/trainer.py", symbol: "main", fidelity: "runtime-exact" },
      { kind: "test", path: "tests/test_smoke.py", symbol: "test_two_iterations", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l17", num: "17", title: "运行产物：训练事实怎样安全留下", puzzle: "网页上的每项证据究竟来自哪个运行文件？",
    phase: "验收与运行", preview: "检查 run 目录：当前文件怎样完整换新、历史怎样逐行接长、对局怎样取名、谁写谁读。",
    outcomes: ["把事实追溯到 run artifact", "实现 atomic replace 与 append 的写读", "用心跳、锁和破损尾行规则排障"],
    sources: [
      { kind: "python", path: "alphagomoku/storage.py", symbol: "RunStorage", fidelity: "runtime-exact" },
      { kind: "contract", path: "PLAN.md", symbol: "§6 run 目录文件契约", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l18", num: "18", title: "服务边界：训练事实怎样变成网页", puzzle: "服务器和浏览器怎样观察并操作训练？",
    phase: "验收与运行", preview: "沿“完整快照、实时消息和独立的人机对战”三条数据通路，追踪 Dashboard、Live、Replay 与 Play。",
    outcomes: ["接线并验收一条 REST+WS 数据通路", "追踪每个 web view 的数据来源", "区分 REST 快照与 WS 增量"],
    sources: [
      { kind: "python", path: "server/app.py", symbol: "create_app", fidelity: "runtime-exact" },
      { kind: "python", path: "server/tail.py", symbol: "EventTail", fidelity: "runtime-exact" },
      { kind: "browser", path: "web/src/ws.ts", symbol: "useEvents", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "graduation", num: "毕业", title: "毕业：在新局面里找出第一处错误", puzzle: "你能独立修好一条损坏的全系统链吗？",
    phase: "综合验收", preview: "在未见局面中完成计算、修复视角和数据来源错误，再与真模型实战。",
    outcomes: ["在新局面开发并修通完整系统", "找出并修复第一处不变量破坏", "配置一次训练并按验收标准判断变强", "指出模型与证据的边界"],
    sources: [
      { kind: "browser", path: "learn/src/lessons/L99.tsx", symbol: "PlayGround", fidelity: "recomputed" },
      { kind: "test", path: "learn/tests/parity.test.ts", symbol: "逐层对拍", fidelity: "recomputed" },
    ], aliases: ["sandbox"],
  }),
] as const

/** 五个能力台阶。阶段末课要额外按整个阶段的目标验收。 */
export const STAGES: readonly CurriculumStage[] = [
  {
    id: "foundation",
    title: "刚入门",
    range: "序 – 第 2 课",
    entryId: "prologue",
    lessonIds: ["prologue", "l01", "l02"],
    goal: "能画出自我对弈闭环，并说清谁产生数据、谁改权重。",
    checkpoint: "在白纸上画出“对弈 → 样本 → 训练 → 新模型 → 再对弈”的闭环，并指出每一步的输入与输出。",
    core: ["棋盘数组与 action 编号", "合法落子、五连与终局", "当前行棋方视角与 z 标尺", "数据、训练和新模型的闭环"],
    practice: "画一次落子和一次终局，分别写出输入、输出、谁被修改。",
    commonMistake: "只翻转棋盘却不翻转终局 z；把真实记录、代码复现和教学构造混成同一种证据。",
    selfTests: [
      "天元 (4,4) 的 action 是多少？为什么？",
      "白棋刚完成五连时，黑方视角的 z 是多少？",
      "没有训练时，网络权重会自己变吗？为什么？",
    ],
    hours: 2,
  },
  {
    id: "network",
    title: "看懂了",
    range: "第 3 – 6 课",
    entryId: "l03",
    lessonIds: ["l03", "l04", "l05", "l06"],
    goal: "能手算一次更新，并讲清网络为什么需要非线性。",
    checkpoint: "把特征、权重、预测、损失和一次更新串起来，再用一个棋盘窗口解释卷积与三输入面各自解决什么问题。",
    core: ["x、w、r、z 与平方损失", "梯度方向与学习率", "点积与加权求和", "ReLU 非线性", "三输入面与卷积核"],
    practice: "手算 x=3、w=0、z=1 的一次更新，再用一个 3×3 窗口算点积。",
    commonMistake: "把 x（盘面事实）当成可调权重；把 ReLU 当成可有可无的装饰。",
    selfTests: [
      "x=3、w=0、z=1 时，损失和梯度分别是多少？",
      "为什么只有乘加的多层网络仍然画不出 XOR？",
      "三个输入面分别回答棋盘上的什么问题？",
    ],
    hours: 5,
  },
  {
    id: "search",
    title: "会用了",
    range: "第 7 – 11 课",
    entryId: "l07",
    lessonIds: ["l07", "l08", "l09", "l10", "l11"],
    goal: "能沿张量形状走到双头输出，并解释搜索为什么选这一步。",
    checkpoint: "从三输入面沿张量形状走到策略与价值，再用 PUCT、回传和访问分布解释一次实际选点。",
    core: ["卷积与感受野", "策略头与价值头", "MCTS 的 select/expand/evaluate/backup", "PUCT 的 Q 与探索项", "根噪声、温度与访问分布"],
    practice: "给一棵两层树手算一次回传后的 Q，再解释访问最多的子节点为什么不一定是最终落子。",
    commonMistake: "把 root_value 当成价值头裸输出；用 top-k 摘要重新归一化 π。",
    selfTests: [
      "策略头和价值头分别在回答什么问题？",
      "一次 MCTS 模拟的四个阶段各做什么？",
      "为什么访问次数最多的子节点不一定是最终选点？",
    ],
    hours: 5,
  },
  {
    id: "training",
    title: "会修了",
    range: "第 12 – 15 课",
    entryId: "l12",
    lessonIds: ["l12", "l13", "l14", "l15"],
    goal: "能定位训练或搜索里的一处不变量错误，并说出判断依据。",
    checkpoint: "给出一条自我对弈到权重更新的链，指出一处会破坏学习目标的不变量，并说明用什么记录或数值证明它。",
    core: ["(s, π, z) 样本", "回放池与同步增广", "策略/价值双损失", "优化器三件配套", "竞技场晋升线"],
    practice: "画一条从自我对弈到权重更新的链，故意破坏一个不变量，再写出怎样用记录发现它。",
    commonMistake: "棋盘和 π 增强不同步；忘记 zero_grad，或把胜负标签当成网络价值。",
    selfTests: [
      "一条样本的 s、π、z 分别来自哪里？",
      "为什么旋转棋盘时必须同步旋转 π？",
      "竞技场为什么不能只比一局？",
    ],
    hours: 4,
  },
  {
    id: "delivery",
    title: "能独立做",
    range: "第 16 – 18 课 + 毕业",
    entryId: "l16",
    lessonIds: ["l16", "l17", "l18", "graduation"],
    goal: "能从管线跑到服务，独立修通一条完整数据链。",
    checkpoint: "从 run 产物追到服务端与网页，定位并修通一条完整数据链，同时说明证据边界。",
    core: ["pipeline 顺序与恢复", "run 快照的原子替换与历史追加", "REST 快照 + WS 增量", "网页、训练与人机对弈的边界"],
    practice: "从网页上的一个数字追到 run 文件，再修一个视角或数据来源错误。",
    commonMistake: "把历史 append 与快照 replace 混用；把实时事件当成完整状态。",
    selfTests: [
      "为什么当前文件和历史文件使用不同的写入方式？",
      "REST 快照和 WebSocket 增量各自解决什么问题？",
      "网页上的一个数字要经过哪几层才能到达屏幕？",
    ],
    hours: 4,
  },
] as const

export const STAGE_BY_LESSON_ID = new Map<string, CurriculumStage>(
  STAGES.flatMap((stage) => stage.lessonIds.map((lessonId) => [lessonId, stage] as const)),
)

export function stageForLesson(lessonId: string): CurriculumStage | null {
  return STAGE_BY_LESSON_ID.get(lessonId) ?? null
}

export function isStageCheckpoint(lessonId: string): boolean {
  const stage = stageForLesson(lessonId)
  return stage?.lessonIds.at(-1) === lessonId
}

/** 阶段末多收一轮跨课迁移证据；普通课至少需要解释、应用、纠错三类证据。 */
export function requiredFeynmanTurns(lessonId: string): number {
  return isStageCheckpoint(lessonId) ? 3 : 2
}

export const CURRICULUM_BY_ID = new Map(CURRICULUM.map((entry) => [entry.id, entry]))
export const CURRICULUM_ALIASES = new Map(
  CURRICULUM.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.id] as const)),
)

export function canonicalCurriculumId(id: string): string | null {
  if (CURRICULUM_BY_ID.has(id)) return id
  return CURRICULUM_ALIASES.get(id) ?? null
}

export interface LessonPractice {
  /** 任务版本化 ID；换题目时必须升级，旧产物不能继续算数。 */
  id: string
  version: number
  /** 合书复述前必须亲手完成的最小动作，不是又一道选择题。 */
  task: string
  /** 学生在导师里提交的文字产物应包含什么；判定器会核对它能否作为应用证据。 */
  deliverable: string
  /** 对答案唯一的计算题做确定性数值门禁；自由设计题只做结构核对。 */
  verification?: PracticeVerification
}

export interface PracticeArtifactCheck {
  label: string
  pattern: RegExp
  /** 同一标签出现这些值时会与正确答案矛盾，不能只看“正例是否出现”。 */
  forbidden?: RegExp
}

export interface PracticeVerification {
  checks: readonly PracticeArtifactCheck[]
  /** 明确说“以上答案都是错的”这类否定结论，不能靠正确 token 混过去。 */
  rejects?: readonly RegExp[]
}

const ARTIFACT_NEGATION = /(?:都是|均为|全是|以上|这些|上述)[^。\n]{0,16}(?:错误|不对|错|不是|并非|不等于|不成立)|(?:错误答案|答案错误)/
// 确定性门禁不能只找“正确 token”；学生写出正确数字后紧跟一句否定结论，也必须 fail-closed。
const L01_CONTRADICTIONS = [
  /58[^。\n,;；]{0,40}(?:不是|并非|不等于|不对|错误)[^。\n,;；]{0,24}4\s*,\s*6|4\s*,\s*6[^。\n,;；]{0,40}(?:不是|并非|不等于|不对|错误)[^。\n,;；]{0,24}58/i,
  /3\s*,\s*7[^。\n,;；]{0,40}(?:不是|并非|不等于|不对|错误)[^。\n,;；]{0,24}66|66[^。\n,;；]{0,40}(?:不是|并非|不等于|不对|错误)[^。\n,;；]{0,24}3\s*,\s*7/i,
  /9\s*,\s*0[^。\n,;；]{0,50}(?:(?<!不)合法|在棋盘内|不越界|不是越界|不是非法)|(?:(?<!不)合法|在棋盘内|不越界)[^。\n,;；]{0,40}9\s*,\s*0/i,
] as const
const L02_CONTRADICTIONS = [
  /白[^。\n,;；]{0,28}(?:不是|并非|不等于|不对|错误|记\s*-1|是\s*-1|为\s*-1)/,
  /黑[^。\n,;；]{0,28}(?:不是|并非|不等于|不对|错误|记\s*\+?1|是\s*\+?1|为\s*\+?1)/,
  /z[^。\n,;；]{0,24}(?:不是|并非|不等于|不对|错误|是\s*-1|为\s*-1|=\s*-1)/i,
  /(?:不同号|符号相反|反号|不一致)/,
] as const
const L03_CONTRADICTIONS = [
  /(?:x|w|z|lr|学习率|预测(?:值|结果)?|r)[^。\n,;；]{0,16}(?:不是|并非|不等于|不为|不对)[^。\n,;；]{0,12}(?:3|0|1|0\.1)/i,
  /(?:误差|r\s*-\s*z)[^。\n,;；]{0,16}(?:不是|并非|不等于|不为|不对)[^。\n,;；]{0,12}-1/i,
  /(?:平方损失|损失|loss)[^。\n,;；]{0,16}(?:不是|并非|不等于|不为|不对)[^。\n,;；]{0,12}1/i,
  /(?:梯度|g(?:rad(?:ient)?)?)[^。\n,;；]{0,16}(?:不是|并非|不等于|不为|不对)[^。\n,;；]{0,12}-?6/i,
  /(?:更新后(?:的)?\s*w|新(?:的)?\s*w|w\s*(?:_?新|_new|new))[^。\n,;；]{0,16}(?:不是|并非|不等于|不为|不对)[^。\n,;；]{0,12}0\.6/i,
  /(?:负梯度|梯度为负)[^。\n,;；]{0,36}(?:调小|减小|降低|向左)/,
] as const
const L15_CONTRADICTIONS = [
  /(?:未|没有|没能|不)(?:晋升|通过|达标|合格|超过\s*55|超过\s*55%|跨过\s*55|跨过\s*55%)|未达标|不合格/,
  /(?:得分率|12\s*\/\s*20)[^。\n]{0,20}(?:不是|并非|不等于|不为)\s*(?:60\s*%|0\.6)/,
] as const
// 变量赋值前不能紧挨字母、数字或算式符号，否则 `r−z=−1` 里的 z 会被误当成 `z=...` 的声明。
const PRACTICE_VARIABLE_BOUNDARY = String.raw`(?:^|[^A-Za-z0-9_\-+−–—*/×÷])`
const PRACTICE_ASSIGNMENT = String.raw`\s*(?:=|:|是|为)\s*`

/**
 * 每课的动手检查。它把文章里的 exercise 从侧栏说明变成放行前置：
 * 产物随判定一起提交，应用证据必须能回到这份产物。
 */
type LessonPracticeDefinition = Pick<LessonPractice, "task" | "deliverable"> & Pick<Partial<LessonPractice>, "verification">

export const LESSON_PRACTICES: Readonly<Record<string, LessonPracticeDefinition>> = {
  prologue: {
    task: "从 learn/src/data/real.ts 里任选一个真实数字，查出它的字段名，并写出它从哪个文件流向哪个教学环节。",
    deliverable: "数字、字段名、来源文件，以及至少两个流转环节。",
  },
  l01: {
    task: "在空棋盘上把 action 58 换成 (x, y)，把 (3, 7) 换回 action；再判断 (9, 0) 是否合法。",
    deliverable: "两组坐标/编号换算，以及一条越界判断。",
    verification: {
      checks: [
        {
          label: "action 58 对应 (4, 6)",
          pattern: /(?:action\s*)?58[\s\S]{0,40}(?:\(\s*4\s*,\s*6\s*\)|x\s*=\s*4[^0-9]{0,8}y\s*=\s*6|y\s*=\s*6[^0-9]{0,8}x\s*=\s*4|第\s*6\s*行[^。\n]{0,12}第\s*4\s*列)|(?:\(\s*4\s*,\s*6\s*\)|x\s*=\s*4[^0-9]{0,8}y\s*=\s*6|y\s*=\s*6[^0-9]{0,8}x\s*=\s*4|第\s*6\s*行[^。\n]{0,12}第\s*4\s*列)[\s\S]{0,40}58/i,
        },
        {
          label: "(3, 7) 对应 action 66",
          pattern: /(?:\(\s*3\s*,\s*7\s*\)|x\s*=\s*3[^0-9]{0,8}y\s*=\s*7|第\s*3\s*列[^。\n]{0,12}第\s*7\s*行)[\s\S]{0,40}66|66[\s\S]{0,40}(?:\(\s*3\s*,\s*7\s*\)|x\s*=\s*3[^0-9]{0,8}y\s*=\s*7|第\s*3\s*列[^。\n]{0,12}第\s*7\s*行)/i,
        },
        {
          label: "(9, 0) 越界",
          pattern: /(?:\(\s*9\s*,\s*0\s*\)|x\s*=\s*9|9\s*,\s*0)[\s\S]{0,80}(?:非法|越界|不合法|无效|超出|出界)|(?:非法|越界|不合法|无效|超出|出界)[\s\S]{0,80}(?:\(\s*9\s*,\s*0\s*\)|x\s*=\s*9|9\s*,\s*0)/i,
        },
      ],
      rejects: [ARTIFACT_NEGATION, ...L01_CONTRADICTIONS],
    },
  },
  l02: {
    task: "假设白方刚落下并最终白胜。写出这一手在规范视角下的棋盘符号、z，以及为什么它们同号。",
    deliverable: "黑/白符号、z 的数值和一个视角理由。",
    verification: {
      checks: [
        { label: "白子记 +1", pattern: /白[^。\n]{0,30}(?:\+1|=\s*\+?1|是\s*1|为\s*1|记\s*\+?1)/ },
        { label: "黑子记 -1", pattern: /黑[^。\n]{0,30}(?:-1|=\s*-1|是\s*-1|为\s*-1|记\s*-1)/ },
        { label: "z = +1", pattern: /z\s*(?:=|:|是|为)\s*(?:\+1|1)(?![0-9.])/i },
        { label: "说明视角/同号理由", pattern: /(?:视角|行棋方|同号|统一)/ },
      ],
      rejects: [ARTIFACT_NEGATION, ...L02_CONTRADICTIONS],
    },
  },
  l03: {
    task: "取 x=3、w=0、z=1、lr=0.1，依次算预测 r、误差、平方损失、梯度，以及更新后的 w。",
    deliverable: "五个数值和一次代入过程。",
    verification: {
      checks: [
        {
          label: "x = 3",
          pattern: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}x${PRACTICE_ASSIGNMENT}3(?:\\.0+)?(?![0-9.])`, "i"),
          forbidden: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}x${PRACTICE_ASSIGNMENT}(?!\\+?3(?:\\.0+)?(?![0-9.]))[-+]?\\d`, "i"),
        },
        {
          label: "w = 0",
          pattern: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}w${PRACTICE_ASSIGNMENT}0(?:\\.0+)?(?![0-9.])`, "i"),
          forbidden: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}w${PRACTICE_ASSIGNMENT}(?!\\+?0(?:\\.0+)?(?![0-9.])|\\+?0\\.6(?![0-9]))[-+]?\\d`, "i"),
        },
        {
          label: "z = 1",
          pattern: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}z${PRACTICE_ASSIGNMENT}1(?:\\.0+)?(?![0-9.])`, "i"),
          forbidden: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}z${PRACTICE_ASSIGNMENT}(?!\\+?1(?:\\.0+)?(?![0-9.]))[-+]?\\d`, "i"),
        },
        {
          label: "lr = 0.1",
          pattern: /(?:lr|学习率)\s*(?:=|:|是|为)\s*0\.1(?![0-9])/i,
          forbidden: /(?:lr|学习率)\s*(?:=|:|是|为)\s*(?!0\.1(?![0-9]))[-+]?\d/i,
        },
        {
          label: "预测 r = 0",
          pattern: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}(?:r|预测(?:值|结果)?)${PRACTICE_ASSIGNMENT}0(?:\\.0+)?(?![0-9.])`, "i"),
          forbidden: new RegExp(`${PRACTICE_VARIABLE_BOUNDARY}(?:r|预测(?:值|结果)?)${PRACTICE_ASSIGNMENT}(?!\\+?0(?:\\.0+)?(?![0-9.]))[-+]?\\d`, "i"),
        },
        {
          label: "误差 = -1",
          pattern: /(?:误差|r\s*-\s*z)\s*(?:=|:|是|为)\s*-1(?:\.0+)?(?![0-9.])/i,
          forbidden: /(?:误差|r\s*-\s*z)\s*(?:=|:|是|为)\s*(?!-1(?:\.0+)?(?![0-9.]))[-+]?\d/i,
        },
        {
          label: "平方损失 = 1",
          pattern: /(?:平方损失|损失|loss)\s*(?:=|:|是|为)\s*1(?:\.0+)?(?![0-9.])/i,
          forbidden: /(?:平方损失|损失|loss)\s*(?:=|:|是|为)\s*(?!\+?1(?:\.0+)?(?![0-9.]))[-+]?\d/i,
        },
        {
          label: "梯度 = -6",
          pattern: /(?:梯度|g(?:rad(?:ient)?)?)\s*(?:=|:|是|为)\s*-6(?:\.0+)?(?![0-9.])/i,
          forbidden: /(?:梯度|g(?:rad(?:ient)?)?)\s*(?:=|:|是|为)\s*(?!-6(?:\.0+)?(?![0-9.]))[-+]?\d/i,
        },
        {
          label: "更新后 w = 0.6",
          pattern: /(?:更新后(?:的)?\s*w|w\s*(?:_?新|_new|new)|新(?:的)?\s*w)\s*(?:=|:|是|为|变成)\s*0\.6(?![0-9])/i,
          forbidden: /(?:更新后(?:的)?\s*w|w\s*(?:_?新|_new|new)|新(?:的)?\s*w)\s*(?:=|:|是|为|变成)\s*(?!0\.6(?![0-9]))[-+]?\d/i,
        },
      ],
      rejects: [ARTIFACT_NEGATION, ...L03_CONTRADICTIONS],
    },
  },
  l04: {
    task: "自己写一个含正负权重的 3×3 窗口，手算一次点积；把中心权重取反再算一次，并比较分数方向。",
    deliverable: "两组九项乘加和，以及方向变化的解释。",
  },
  l05: {
    task: "把 XOR 的四个点列成表，给出一个含至少两个 ReLU 的组合把它们分开，并写出每个点的隐藏层输出。",
    deliverable: "四点真值表、权重/偏置和一列隐藏层输出。",
  },
  l06: {
    task: "任选一个非空棋盘，取 (4, 4) 写出 own、opponent、color 三个输入面的值；再说明少了颜色面会丢失什么。",
    deliverable: "同一格的三面数值和一条缺失后果。",
  },
  l07: {
    task: "自拟一个 3×3×3 窗口和 27 个卷积权重，算出一格响应；再写出 padding=1 时输出 (0, 0) 对应的输入范围。",
    deliverable: "27 项乘加结果和一格填充范围。",
  },
  l08: {
    task: "算出 3 层 3×3 卷积的感受野，指出残差捷径加在什么位置，并比较 BN 训练与推理使用的统计量。",
    deliverable: "感受野数值、捷径位置和两组统计量。",
  },
  l09: {
    task: "给三个 logits 做一次 softmax，写出归一化式子；再用一句话分别说明 p 和 v_net 回答什么问题。",
    deliverable: "三个概率、分母式子和两个输出含义。",
  },
  l10: {
    task: "画一棵两层树，给两个叶值，手算一次 backup 后的 N/W/Q；再说明父层回传为什么取负。",
    deliverable: "逐层 N/W/Q 和一条符号解释。",
  },
  l11: {
    task: "给一条 P=0.4、N=10、W=2、cPuct=1.5 的边，代入 Q 与探索项算出 PUCT；再说明温度改变什么、不改变什么。",
    deliverable: "Q、探索项、PUCT 数值和温度边界。",
  },
  l12: {
    task: "从一局真实或演示对局末尾选两手，写出两条样本的 s 描述、π 来源、z，以及记录时轮到谁。",
    deliverable: "两条 (s, π, z) 账和当时行棋方。",
  },
  l13: {
    task: "给 π、预测 p、v 和 z 各一组小数，算策略或价值损失，并写出一个共享权重梯度里的一项链式乘积。",
    deliverable: "损失数值、梯度式子和每个乘数的来源。",
  },
  l14: {
    task: "取一个棋盘和 π，做一次 90° 旋转；写清一个格子和对应 π 下标如何移动，并判断 z 是否要变。",
    deliverable: "棋盘/π 的坐标变换和 z 的处理。",
  },
  l15: {
    task: "挑战者 12 胜 8 负：算得分率并对照 55% 线；再指出这 20 局仍不能证明什么。",
    deliverable: "得分率、晋升判断和一条样本边界。",
    verification: {
      checks: [
        { label: "12 胜 8 负或 12/20", pattern: /(?:12\s*\/\s*20|12\s*胜\s*8\s*负|12\s*[:：]\s*8)/ },
        { label: "得分率 60%", pattern: /(?:60\s*%|0\.6)/ },
        { label: "对照 55% 晋升线", pattern: /(?:晋升|通过|达标|合格|超过\s*55|≥\s*55|取代|成为新\s*best)/i },
        { label: "说明 20 局/样本边界", pattern: /(?:20\s*(?:局|盘)|样本(?:量)?(?:不足|小|边界)|不能证明|运气|统计)/ },
      ],
      rejects: [ARTIFACT_NEGATION, ...L15_CONTRADICTIONS],
    },
  },
  l16: {
    task: "列出一轮 pipeline 从指标到检查点的写入顺序；假设 metrics 写完后、checkpoint 保存前崩溃，说明恢复会读什么。",
    deliverable: "产物顺序、崩溃点和恢复读取目标。",
  },
  l17: {
    task: "分别给 current.json 的原子替换和 history.jsonl 的追加写一个并发读到的合法状态，并说明两种写法为什么不能互换。",
    deliverable: "两个读状态和一条原子性理由。",
  },
  l18: {
    task: "选网页上的一个数字，写出 REST 快照、服务端状态、WS 增量和 UI 的路径；再说明断线重连为什么先拉快照。",
    deliverable: "一条从文件到 UI 的通路和一条重连理由。",
  },
  graduation: {
    task: "提交 CAPSTONE 证据摘要：改了哪条规则、哪条测试保护不变量、一轮 pipeline 留下什么产物、受控对战说明了什么，以及一条仍不能下的结论。",
    deliverable: "规则、测试、run 产物、对战结果和证据边界五段摘要。",
  },
}

export function practiceForLesson(lessonId: string): LessonPractice | null {
  const canonicalId = canonicalCurriculumId(lessonId)
  const definition = canonicalId ? LESSON_PRACTICES[canonicalId] : null
  return canonicalId && definition
    ? { ...definition, id: `${canonicalId}-v1`, version: 1 }
    : null
}
