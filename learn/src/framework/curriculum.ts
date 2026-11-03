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
    outcomes: ["写出 replay 抽样与重建并复现一次 train_step", "同步变换棋盘和 π", "写出增广的同步规则与优化器三件配套"],
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

export const CURRICULUM_BY_ID = new Map(CURRICULUM.map((entry) => [entry.id, entry]))
export const CURRICULUM_ALIASES = new Map(
  CURRICULUM.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.id] as const)),
)

export function canonicalCurriculumId(id: string): string | null {
  if (CURRICULUM_BY_ID.has(id)) return id
  return CURRICULUM_ALIASES.get(id) ?? null
}
