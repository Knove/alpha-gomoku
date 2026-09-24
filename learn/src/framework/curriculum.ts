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
  prerequisites: readonly string[]
  contentVersion: number
  outcomes: readonly string[]
  sources: readonly SourceMapping[]
  aliases?: readonly string[]
}

const unit = (value: CurriculumUnit): CurriculumUnit => value

export const CURRICULUM: readonly CurriculumUnit[] = [
  unit({
    id: "prologue", num: "序", title: "没人教过它下棋", puzzle: "一手棋怎样走完整个学习闭环？",
    phase: "先看整条链", preview: "沿一份真实案例看见棋盘、网络、搜索、训练、验收和网页之间的全部箭头。",
    prerequisites: [], contentVersion: 1,
    outcomes: ["说出完整系统的先后关系", "区分真实记录、代码复现、教学构造和浏览器适配"],
    sources: [
      { kind: "contract", path: "PLAN.md", symbol: "§1 总体架构", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/real.ts", symbol: "REAL", fidelity: "runtime-exact" },
    ], aliases: ["home"],
  }),
  unit({
    id: "l01", num: "1", title: "一次点击怎样成为合法落子或终局", puzzle: "点击一个格子后，机器怎样知道发生了什么？",
    phase: "棋局成为数据", preview: "从坐标和动作编号走到合法落子、五连与终局。",
    prerequisites: ["prologue"], contentVersion: 1,
    outcomes: ["在坐标与 action 之间互换", "解释合法动作和最后一手判胜"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "Game", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "play", fidelity: "mirror-exact" },
      { kind: "test", path: "learn/tests/game.test.ts", symbol: "action 40 is tengen", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l02", num: "2", title: "视角：一条约定", puzzle: "黑白轮流时，怎样让“我方”永远指当前玩家？",
    phase: "棋局成为数据", preview: "统一当前行棋方视角，并把同一约定贯穿价值和终局答案。",
    prerequisites: ["l01"], contentVersion: 1,
    outcomes: ["计算 canonical board", "解释为什么 value、backup 和 z 必须同视角"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "Game.canonical_board", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "canonical", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l03", num: "3", title: "权重：自己变准的机器", puzzle: "为什么调 w，又怎样确定方向和距离？",
    phase: "数字开始学习", preview: "从一个权重、平方损失和梯度走到学习率控制的一次更新。",
    prerequisites: ["l02"], contentVersion: 1,
    outcomes: ["解释 x、w、r、z 各自角色", "计算一次梯度下降更新", "说明玩具地形的边界"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "linGrad", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/train.py", symbol: "make_optimizer", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l04", num: "4", title: "加权求和：乘和加，不多不少", puzzle: "多个特征怎样合成一个分数？",
    phase: "数字开始学习", preview: "用正负权重、乘加和点积汇总特征，并看清线性计算的边界。",
    prerequisites: ["l03"], contentVersion: 1,
    outcomes: ["计算点积", "解释正负权重和泛化"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "dot", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l05", num: "5", title: "非线性变换：直线画不出的形状", puzzle: "只有乘和加为什么认不出所有形状？",
    phase: "数字开始学习", preview: "用 XOR 和 ReLU 证明非线性为什么不可缺少。",
    prerequisites: ["l04"], contentVersion: 1,
    outcomes: ["算出 ReLU", "用四个点解释线性限制"],
    sources: [
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "reluAbs", fidelity: "constructed" },
      { kind: "python", path: "alphagomoku/model.py", symbol: "ResBlock.forward", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l06", num: "6", title: "三个输入平面", puzzle: "统一视角后，为什么还要拆成三张图？",
    phase: "造出真实网络", preview: "把当前方、对方和颜色身份保存为真实网络输入。",
    prerequisites: ["l05"], contentVersion: 1,
    outcomes: ["构造 own/opponent/color 三个平面", "解释颜色平面、空位和状态完整性"],
    sources: [
      { kind: "python", path: "alphagomoku/game.py", symbol: "encode", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/game.ts", symbol: "encode", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l07", num: "7", title: "卷积核：在全盘滑动的一组权重", puzzle: "同一种局部棋形为什么只需学一次？",
    phase: "造出真实网络", preview: "从一个 3×3×3 乘加窗口走到 padding、滑动和权重共享。",
    prerequisites: ["l06"], contentVersion: 1,
    outcomes: ["计算一处卷积响应", "解释滑动、padding、通道和权重共享"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet.stem", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/weights-best.json", symbol: "stem.0.weight", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l08", num: "8", title: "叠层：看见全盘", puzzle: "网络怎样看得更远，又不把信息弄丢？",
    phase: "造出真实网络", preview: "连续完成感受野、残差路径和 BatchNorm 三个必修小步。",
    prerequisites: ["l07"], contentVersion: 1,
    outcomes: ["计算感受野", "解释残差捷径", "区分 BN 的训练与推理统计"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "ResBlock", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/model.ts", symbol: "traceNet", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l09", num: "9", title: "双头：一次前向两个答案", puzzle: "哪里该下和谁占优为什么共用主干？",
    phase: "造出真实网络", preview: "分别走完策略 logits/softmax 和价值 v_net/tanh 两个必修小步。",
    prerequisites: ["l08"], contentVersion: 1,
    outcomes: ["把 logits 变成概率", "解释 v_net 的范围和视角", "区分 P 与价值"],
    sources: [
      { kind: "python", path: "alphagomoku/model.py", symbol: "AlphaGomokuNet.forward", fidelity: "runtime-exact" },
      { kind: "test", path: "learn/tests/parity.test.ts", symbol: "逐层对拍", fidelity: "recomputed" },
    ],
  }),
  unit({
    id: "l10", num: "10", title: "搜索：一次模拟怎样来回走一遍", puzzle: "网络第一眼之后，一次搜索具体做什么？",
    phase: "搜索检查第一眼", preview: "沿根、边、叶前进，再按当前方视角把结果逐层记回 N/W/Q。",
    prerequisites: ["l09"], contentVersion: 1,
    outcomes: ["执行一次 select/evaluate/expand/backup", "解释 negamax 符号和 rootValue", "说明子树复用"],
    sources: [
      { kind: "python", path: "alphagomoku/mcts.py", symbol: "SearchTree", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/engine/mcts.ts", symbol: "SearchTree", fidelity: "mirror-exact" },
    ],
  }),
  unit({
    id: "l11", num: "11", title: "搜索：下一次该查哪条路", puzzle: "怎样兼顾已有好成绩和没看够的候选？",
    phase: "搜索检查第一眼", preview: "从 Q+U 走到 π、根噪声、温度和实际动作。",
    prerequisites: ["l10"], contentVersion: 1,
    outcomes: ["计算 PUCT 并选边", "由全部根访问数计算 π", "区分噪声、温度与预算"],
    sources: [
      { kind: "python", path: "alphagomoku/mcts.py", symbol: "SearchTree._puct_select", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/selfplay.py", symbol: "play_games", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l12", num: "12", title: "自我对弈：一手棋怎样成为样本", puzzle: "落子时不知道输赢，终局后怎样补全目标答案？",
    phase: "搜索变成学习", preview: "追踪真实样本，并看真正的训练程序如何跨多局批量评估、逐树顺序搜索。",
    prerequisites: ["l11"], contentVersion: 1,
    outcomes: ["构造一条 (s,π,z)", "解释 z 的样本视角", "区分 v_net、rootValue 和 z", "解释跨树 batching"],
    sources: [
      { kind: "python", path: "alphagomoku/selfplay.py", symbol: "play_games", fidelity: "runtime-exact" },
      { kind: "artifact", path: "learn/src/data/real.ts", symbol: "REAL.selfplayGame", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l13", num: "13", title: "反向传播：两种错误怎样改动所有权重", puzzle: "π 和 z 的错误怎样穿过共享主干？",
    phase: "搜索变成学习", preview: "在两个训练目标和真实网络都出现后，完整计算双损失与链式反传。",
    prerequisites: ["l12"], contentVersion: 1,
    outcomes: ["计算策略和价值损失", "完成两权重链式法则", "把 backward/step 对应到数学"],
    sources: [
      { kind: "python", path: "alphagomoku/train.py", symbol: "train_step", fidelity: "runtime-exact" },
      { kind: "browser", path: "learn/src/lib/foundations.ts", symbol: "twoLayer", fidelity: "constructed" },
    ],
  }),
  unit({
    id: "l14", num: "14", title: "训练：许多样本怎样形成一次更新", puzzle: "旧新样本怎样混合、变换并共同更新网络？",
    phase: "搜索变成学习", preview: "走过回放池、随机抽样、旋转翻转变换和一次真实的参数更新。",
    prerequisites: ["l13"], contentVersion: 1,
    outcomes: ["解释 replay 存储与重建", "同步变换棋盘和 π", "说明数据增强与真实优化器"],
    sources: [
      { kind: "python", path: "alphagomoku/replay.py", symbol: "ReplayBuffer", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/train.py", symbol: "train_step", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l15", num: "15", title: "竞技场：谁有资格成为 best", puzzle: "损失下降为什么还不能换 best?",
    phase: "验收与运行", preview: "控制颜色和开局，用 best、baseline 和有限比赛证据决定晋升。",
    prerequisites: ["l14"], contentVersion: 1,
    outcomes: ["区分 challenger/best/baseline/latest", "计算竞技场得分", "说明阈值与证据限制"],
    sources: [
      { kind: "python", path: "alphagomoku/arena.py", symbol: "play_match", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/pipeline.py", symbol: "run", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l16", num: "16", title: "管线：一轮训练怎样运行并恢复", puzzle: "阶段、指标和 checkpoint 为什么必须按这个顺序？",
    phase: "验收与运行", preview: "从配置、预热和竞技场，走到“先记指标、再存模型”的顺序、暂停、停止与自动恢复。",
    prerequisites: ["l15"], contentVersion: 1,
    outcomes: ["排列完整迭代阶段", "解释崩溃一致性和恢复边界", "说明 optimizer/RNG 未恢复"],
    sources: [
      { kind: "python", path: "alphagomoku/pipeline.py", symbol: "run", fidelity: "runtime-exact" },
      { kind: "python", path: "alphagomoku/trainer.py", symbol: "main", fidelity: "runtime-exact" },
      { kind: "test", path: "tests/test_smoke.py", symbol: "test_two_iterations", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l17", num: "17", title: "运行产物：训练事实怎样安全留下", puzzle: "网页上的每项证据究竟来自哪个运行文件？",
    phase: "验收与运行", preview: "检查 run 目录：当前文件怎样完整换新、历史怎样逐行接长、对局怎样取名、谁写谁读。",
    prerequisites: ["l16"], contentVersion: 1,
    outcomes: ["把事实追溯到 run artifact", "区分 atomic replace 与 append", "解释 heartbeat、lock 和破损尾行"],
    sources: [
      { kind: "python", path: "alphagomoku/storage.py", symbol: "RunStorage", fidelity: "runtime-exact" },
      { kind: "contract", path: "PLAN.md", symbol: "§6 run 目录文件契约", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "l18", num: "18", title: "服务边界：训练事实怎样变成网页", puzzle: "服务器和浏览器怎样观察并操作训练？",
    phase: "验收与运行", preview: "沿“完整快照、实时消息和独立的人机对战”三条数据通路，追踪 Dashboard、Live、Replay 与 Play。",
    prerequisites: ["l17"], contentVersion: 1,
    outcomes: ["区分 REST 快照与 WS 增量", "追踪每个 web view 的数据来源", "说明浏览器与训练端适配差异"],
    sources: [
      { kind: "python", path: "server/app.py", symbol: "create_app", fidelity: "runtime-exact" },
      { kind: "python", path: "server/tail.py", symbol: "EventTail", fidelity: "runtime-exact" },
      { kind: "browser", path: "web/src/ws.ts", symbol: "useEvents", fidelity: "runtime-exact" },
    ],
  }),
  unit({
    id: "graduation", num: "毕业", title: "毕业：在新局面里找出第一处错误", puzzle: "你能独立修好一条损坏的全系统链吗？",
    phase: "综合验收", preview: "在未见局面中完成计算、修复视角和数据来源错误，再与真模型实战。",
    prerequisites: ["l18"], contentVersion: 1,
    outcomes: ["在新案例中追踪完整系统", "找出并修复第一处不变量破坏", "说明模型和证据的限制"],
    sources: [
      { kind: "browser", path: "learn/src/lessons/L99.tsx", symbol: "PlayGround", fidelity: "recomputed" },
      { kind: "test", path: "learn/tests/parity.test.ts", symbol: "逐层对拍", fidelity: "recomputed" },
    ], aliases: ["sandbox"],
  }),
] as const

export const CURRICULUM_BY_ID = new Map(CURRICULUM.map((entry) => [entry.id, entry]))
export const CURRICULUM_ALIASES = new Map(
  CURRICULUM.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.id] as const)),
)

export function canonicalCurriculumId(id: string): string | null {
  if (CURRICULUM_BY_ID.has(id)) return id
  return CURRICULUM_ALIASES.get(id) ?? null
}
