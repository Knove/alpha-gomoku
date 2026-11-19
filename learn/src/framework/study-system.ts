/**
 * 学习系统层：把「课文目录」压成可执行的节奏，而不是再复制一份课程正文。
 * 20 小时是规划框架；真正推进仍以导师掌握判定为准。
 */

import type { CurriculumStage } from "./curriculum.ts"

export interface CoreUnit {
  id: string
  range: string
  title: string
  lessonIds: readonly string[]
  hours: number
  goal: string
  /** 为什么先学这一块；对应文章里“这些核心为什么重要”的入口。 */
  why: string
  coreConcepts: readonly string[]
  exercise: string
  output: string
  reviewQuestions: readonly string[]
  resource: string
}

export const CORE_UNITS: readonly CoreUnit[] = [
  {
    id: "core-01",
    range: "序 – 第 1 课",
    title: "先看见闭环，再看一手棋",
    lessonIds: ["prologue", "l01"],
    hours: 2,
    goal: "知道谁产生样本、谁训练权重，以及一手棋怎样变成 action 和终局。",
    why: "后面每个训练数字都依赖样本从哪里来；不懂闭环，就会把日志、权重和棋谱混成一团。",
    coreConcepts: ["action = y×9+x", "合法落子、换手与终局", "五连只从新子四方向检查", "自我对弈闭环"],
    exercise: "画出「对弈 → 样本 → 训练 → 新模型 → 再对弈」，再用一个落子写出它的 action。",
    output: "能不看课文讲清一次落子在系统里走到哪里。",
    reviewQuestions: [
      "自我对弈闭环里，谁产生样本，谁改变权重？",
      "一手棋落下时已知什么，终局后才补上什么？",
      "天元 (4,4) 的 action 怎么用 y×9+x 算出来？",
      "为什么棋盘用 0/+1/−1，而不是 0/1/2？",
      "判胜为什么只检查刚落下的那颗子？",
    ],
    resource: "第 1 课 + `alphagomoku/game.py · Game.play`",
  },
  {
    id: "core-02",
    range: "第 2 – 3 课",
    title: "统一视角，第一次让权重变准",
    lessonIds: ["l02", "l03"],
    hours: 2,
    goal: "把当前行棋方视角和终局 z 对齐，并手算一次梯度下降。",
    why: "视角错了，z、价值和损失会一起错；一次更新则是后面所有训练步骤的原型。",
    coreConcepts: ["当前行棋方规范视角", "z 与棋盘共用 ±1 标尺", "平方损失与梯度方向", "学习率控制步长"],
    exercise: "用白方赢棋的例子写出双方视角的 z，再算 x=3、w=0、z=1 的一次更新。",
    output: "能解释棋盘、z、损失和权重更新为什么在同一把尺子上。",
    reviewQuestions: [
      "白胜之后，黑方某一步样本的 z 是多少？为什么？",
      "当前行棋方视角下，棋盘上的 +1 和 −1 各代表谁？",
      "x、w、r、z 四个量里，哪些是可调参数或目标，哪些是盘面事实？",
      "x=3、w=0、z=1 时，损失和梯度分别是多少？",
      "学习率太大会出现什么轨迹，为什么？",
    ],
    resource: "第 2–3 课 + `alphagomoku/game.py · canonical_board`",
  },
  {
    id: "core-03",
    range: "第 4 – 5 课",
    title: "从加权求和走到非线性",
    lessonIds: ["l04", "l05"],
    hours: 2,
    goal: "知道多个特征怎样合成一个分数，以及为什么直线不够用。",
    why: "卷积、策略头和价值头都在做加权求和；没有非线性，再深的网络也画不出 XOR。",
    coreConcepts: ["点积 = 乘加汇总", "权重正负改变贡献方向", "线性层叠仍等价于线性", "ReLU 折出非线性"],
    exercise: "手算一个 3×3 窗口的点积，再用 XOR 四个点说明线性模型卡在哪里。",
    output: "能用一个小窗口解释权重之和与 ReLU 各自解决什么问题。",
    reviewQuestions: [
      "一个 3×3 窗口的点积，乘法和加法各做多少次？",
      "某个特征的权重从 +0.5 变到 −0.5，它在总分里的角色怎样变化？",
      "为什么线性层叠再多，仍然等价于一次线性变换？",
      "XOR 的四个点为什么没有任何一条直线能正确分开？",
      "ReLU(t)+ReLU(−t) 等于什么？它怎样把 XOR 四点折开？",
    ],
    resource: "第 4–5 课 + `learn/src/lib/foundations.ts · dot / reluAbs`",
  },
  {
    id: "core-04",
    range: "第 6 – 7 课",
    title: "把棋盘送进卷积网络",
    lessonIds: ["l06", "l07"],
    hours: 2,
    goal: "讲清三个输入面与卷积核在全盘滑动时的角色。",
    why: "真实模型第一层读的就是这三个平面；不理解输入，后面的特征图和搜索都没有落点。",
    coreConcepts: ["三输入面：己方、对方、颜色", "3×3×3 卷积核含 27 个权重", "padding=1 保住 9×9", "48 个核输出 48 张特征图"],
    exercise: "给一个局面写出三面，再跟一个 3×3 卷积核算出一格响应。",
    output: "能从棋盘窗口走到一个卷积响应，不把通道和特征混为一谈。",
    reviewQuestions: [
      "为什么把一个 ±1 平面直接交给卷积核，会出现抵消或混叠？",
      "三个输入面分别是什么？为什么空格不需要单独的平面？",
      "单平面 3×3 卷积和真实三平面 3×3 卷积，各要乘加多少项？",
      "padding 解决了边角位置的什么问题？",
      "同一个卷积核扫全盘，省掉的是什么，又没有替你决定什么？",
    ],
    resource: "第 6–7 课 + `alphagomoku/game.py · encode`、`model.py · stem`",
  },
  {
    id: "core-05",
    range: "第 8 – 9 课",
    title: "看见全盘，得到两个答案",
    lessonIds: ["l08", "l09"],
    hours: 2,
    goal: "理解叠层为什么扩大感受野，以及策略头、价值头各输出什么。",
    why: "网络最终只给两个答案：哪些动作值得看、当前局面值多少；搜索全靠这两个输出。",
    coreConcepts: ["感受野公式 3+2(L−1)", "残差 y=ReLU(x+F(x))", "BN 训练/推理统计量", "策略 81 概率、价值 1 个标量"],
    exercise: "沿张量形状走一遍两次卷积，再指出策略分布和价值标度的区别。",
    output: "能说清‘这一步多好’和‘这盘谁会赢’为什么不能混。",
    reviewQuestions: [
      "7 层 3×3 卷积的感受野边长是多少，公式怎么写？",
      "残差块 y=ReLU(x+F(x)) 给旧信息留了哪条路？",
      "BN 在训练与推理时各使用哪份统计量？",
      "策略头和价值头分别输出什么形状、什么含义？",
      "两个头为什么要共用主干，而不是训练两个完全独立的网络？",
    ],
    resource: "第 8–9 课 + `alphagomoku/model.py · ResBlock / AlphaGomokuNet`",
  },
  {
    id: "core-06",
    range: "第 10 – 11 课",
    title: "让搜索走一遍，再决定查哪条路",
    lessonIds: ["l10", "l11"],
    hours: 2,
    goal: "理解一次模拟的 select/expand/evaluate/backup，以及 PUCT 怎样平衡 Q 和探索。",
    why: "棋力不只来自网络；搜索怎样把先验、胜负估计和探索预算合成，才是落子的直接依据。",
    coreConcepts: ["MCTS 四阶段", "回传逐层取反", "PUCT = Q + 探索奖励", "访问分布 π、温度、根噪声"],
    exercise: "给一棵两层树手算一次回传，再指出访问最多的子节点为什么不一定是最终落子。",
    output: "能用根访问分布解释一次实际选点。",
    reviewQuestions: [
      "一次 MCTS 模拟的 select、expand、evaluate、backup 各做什么？",
      "叶节点是终局和非终局时，搜索分别读什么值？",
      "回传每退一层为什么要换一次视角？",
      "PUCT 的选择分数里，Q、P 和访问次数各起什么作用？",
      "π 的分母是什么？温度和根噪声分别在哪一步生效？",
    ],
    resource: "第 10–11 课 + `alphagomoku/mcts.py · SearchTree`",
  },
  {
    id: "core-07",
    range: "第 12 – 13 课",
    title: "从自我对弈样本到反向传播",
    lessonIds: ["l12", "l13"],
    hours: 2,
    goal: "知道 (s, π, z) 怎样产生，以及两笔损失怎样改动网络权重。",
    why: "样本、损失、梯度、优化器连起来，才是“自己变强”，而不是只做一次前向演示。",
    coreConcepts: ["(s, π, z) 三件套", "s/π 落子前写、z 终局后补", "策略交叉熵 + 价值均方误差", "反向传播按链式法则分摊"],
    exercise: "写出一条从一手棋到样本的链，再用双权重玩具手算一次梯度。",
    output: "能指出样本、两个头和 backward 之间的责任边界。",
    reviewQuestions: [
      "一条样本的 s、π、z 分别从哪里来？",
      "z 为什么必须站在记录该手时的行棋方视角？",
      "为什么 π 的分母不能只用页面 top-k 的访问数？",
      "策略损失和价值损失各比较哪两个量？",
      "反向传播为什么不是把损失平均分给所有权重？",
    ],
    resource: "第 12–13 课 + `alphagomoku/selfplay.py`、`train.py · train_step`",
  },
  {
    id: "core-08",
    range: "第 14 – 15 课",
    title: "一次训练与一次晋升",
    lessonIds: ["l14", "l15"],
    hours: 2,
    goal: "理解回放池、增广、双损失、优化器，以及竞技场为什么需要受控对局。",
    why: "训练跑得完、输赢判得准、崩溃能恢复，才配谈棋力提升；竞技场是验收，不是装饰。",
    coreConcepts: ["环形回放池与 min_buffer", "八重对称同步增广", "zero_grad → backward → step", "竞技场得分率与 55% 晋升线"],
    exercise: "画出一条训练更新链，再说明竞技场怎样用得分率决定 best。",
    output: "能定位一处会破坏学习目标的不变量。",
    reviewQuestions: [
      "回放池为什么要随机混合新旧样本，而不是按时间顺序学？",
      "旋转棋盘时，棋盘、π、z 分别怎么处理？",
      "一次 train_step 的前向、清梯度、反向、更新是什么顺序？",
      "损失下降为什么不能直接证明棋力上升？",
      "竞技场为什么要换先后手、采不同开局，并且不能只打一局？",
    ],
    resource: "第 14–15 课 + `alphagomoku/train.py`、`arena.py`",
  },
  {
    id: "core-09",
    range: "第 16 – 17 课",
    title: "让整轮训练跑完，并把事实安全留下",
    lessonIds: ["l16", "l17"],
    hours: 2,
    goal: "理解 pipeline 的顺序与恢复，以及 run 目录里快照和追加记录的区别。",
    why: "从日志到权重再到网页都要可追溯；这一层决定你能否定位真实故障，而不是只会看图。",
    coreConcepts: ["pipeline 固定阶段顺序", "预热只积累不训练", "快照原子替换 vs 历史追加", "心跳与 trainer.lock"],
    exercise: "沿一轮 pipeline 标出产物，再推演一次崩溃恢复会读哪个文件。",
    output: "能从现象追到 run 产物和恢复规则。",
    reviewQuestions: [
      "一轮 pipeline 从自我对弈到检查点，固定顺序是什么？",
      "崩溃恢复会带回什么，哪些状态会重新建立？",
      "哪些文件用临时文件加原子替换，哪些用 JSONL 追加？",
      "events.jsonl 的破损尾行应该怎样处理？",
      "心跳和 trainer.lock 分别防止哪两类问题？",
    ],
    resource: "第 16–17 课 + `alphagomoku/pipeline.py`、`storage.py`",
  },
  {
    id: "core-10",
    range: "第 18 课 – 毕业",
    title: "把训练事实送到网页，并独立修一条断链",
    lessonIds: ["l18", "graduation"],
    hours: 2,
    goal: "能追踪 REST 快照、WS 增量和独立对弈会话，并在新局面里找第一处错误。",
    why: "只有沿 REST/WS 和独立对局追到屏幕，才能证明你掌握的是整条系统，不是几张图。",
    coreConcepts: ["REST 完整快照 + WS 增量", "Play 独立会话不写回放池", "网页数字追到 run 文件", "证据边界与受控对战"],
    exercise: "从网页上的一个数字追到 run 文件，再修一个视角或数据来源错误。",
    output: "完成一次可复现的毕业验收，说明证据边界。",
    reviewQuestions: [
      "REST 快照和 WebSocket 增量各解决什么问题？",
      "人机对战为什么使用独立会话，并且不写入回放池？",
      "网页上的一个数字要经过哪些层，才能追到 run 产物？",
      "教学站与生产 Web 为什么不能声称逐位相同？",
      "什么证据比训练损失更能说明模型变强，它又有什么限制？",
    ],
    resource: "第 18 课 + 毕业 + `server/app.py`、`server/play.py`、`learn/src/data/real.ts`",
  },
] as const

export interface SignalResource {
  title: string
  href: string
  kind: string
  level: string
  fit: string
  why: string
  covers: string
  use: string
  avoid: string
}

/** 五个高信号源：先信本地契约和证据，不用收藏夹代替学习。 */
export const SIGNAL_RESOURCES: readonly SignalResource[] = [
  {
    title: "本课程主线",
    href: "#/prologue",
    kind: "教材",
    level: "入门",
    fit: "第一次系统学习，或需要重新建立概念顺序的人。",
    why: "已经把概念顺序、真实数字和源码落点串成一条线性路径。",
    covers: "每课的概念顺序、因果链和最小例子。",
    use: "按当前解锁课读，遇到卡点只问一个最小问题。",
    avoid: "不要先看第 10 个 AlphaZero 视频；先把当前一课的因果讲清。",
  },
  {
    title: "PLAN.md",
    href: "https://github.com/Knove/alpha-gomoku/blob/master/PLAN.md",
    kind: "架构契约",
    level: "中级",
    fit: "已经开始读代码，想知道模块边界和验收口径的人。",
    why: "定义系统边界、文件契约和验收口径，能防止把实现细节当成设计。",
    covers: "跨模块边界、文件契约、验收口径。",
    use: "课程出现说法冲突时，回到对应章节核对契约。",
    avoid: "不要拿旧文章里的术语覆盖当前契约。",
  },
  {
    title: "alphagomoku/",
    href: "https://github.com/Knove/alpha-gomoku/tree/master/alphagomoku",
    kind: "Python 实现",
    level: "进阶",
    fit: "想从机制走到真实调用链，准备自己改系统的人。",
    why: "真实执行路径在这里；教程中的每个核心概念最终都要落到一个入口。",
    covers: "Python 真实调用链和每个函数入口。",
    use: "只追当前课提到的函数，先看输入输出，再看内部。",
    avoid: "不要一上来通读全部模块；先带着本课的问题找落点。",
  },
  {
    title: "learn/tests/ + tests/",
    href: "https://github.com/Knove/alpha-gomoku/tree/master/learn/tests",
    kind: "验证",
    level: "中级",
    fit: "想确认一个说法、排查回归或练习写验收的人。",
    why: "把‘看起来对’变成可复现的数字和边界。",
    covers: "关键不变量、数值对拍和回归边界。",
    use: "学完一课至少找一条对应断言或对拍结果。",
    avoid: "不要把测试通过当成理解；测试只证明这一条行为没坏。",
  },
  {
    title: "learn/src/data/real.ts 与 run 产物",
    href: "https://github.com/Knove/alpha-gomoku/blob/master/learn/src/data/real.ts",
    kind: "真实记录",
    level: "进阶",
    fit: "需要核对真实数字、证据边界或做故障追踪的人。",
    why: "提供真实对局、访问分布和权重来源，能校准正文中的数字。",
    covers: "真实数字、证据等级和追溯路径。",
    use: "核对一个数字时，先确认它来自记录、复现还是教学构造。",
    avoid: "不要把浏览器适配的数值冒充训练归档原值。",
  },
] as const

/** 可选的 7 天冲刺节奏；不替代掌握闸门。 */
export const SEVEN_DAY_PATH = [
  {
    day: "D1",
    range: "核心单元 1–2",
    focus: "闭环、动作、视角、第一次更新",
    resources: ["本课程主线", "alphagomoku/"],
  },
  {
    day: "D2",
    range: "核心单元 3–4",
    focus: "点积、非线性、三输入面、卷积",
    resources: ["本课程主线", "learn/tests/ + tests/"],
  },
  {
    day: "D3",
    range: "核心单元 5",
    focus: "叠层与双头",
    resources: ["本课程主线", "alphagomoku/"],
  },
  {
    day: "D4",
    range: "核心单元 6",
    focus: "MCTS 与 PUCT",
    resources: ["本课程主线", "learn/tests/ + tests/"],
  },
  {
    day: "D5",
    range: "核心单元 7–8",
    focus: "样本、反向传播、训练、竞技场",
    resources: ["本课程主线", "alphagomoku/", "learn/tests/ + tests/"],
  },
  {
    day: "D6",
    range: "核心单元 9",
    focus: "pipeline 与 run 产物",
    resources: ["本课程主线", "PLAN.md", "learn/src/data/real.ts 与 run 产物"],
  },
  {
    day: "D7",
    range: "核心单元 10",
    focus: "服务、综合验收与毕业",
    resources: ["本课程主线", "alphagomoku/", "learn/tests/ + tests/", "learn/src/data/real.ts 与 run 产物"],
  },
] as const

/** 20 小时主线之后用来证明“能迁移”，不是又一张必刷试卷。 */
export const CAPSTONE = {
  title: "换一条规则，保留整条证据链",
  goal: "把 9×9 五子棋改成 9×9 四子棋（或另一种明确规则），从胜负判定、样本、训练、竞技场一直改到网页验收。",
  deliverable: "一份可复现的改动报告：改了哪些契约、哪些测试保护了不变量、一轮训练和对战记录说明了什么。",
  acceptance: [
    "规则改动有单元测试，非法落子与终局不会被旧规则放行",
    "自我对弈样本的 s、π、z 仍站在同一视角，旋转增强保持同步",
    "能跑完一轮 pipeline，并从 run 产物追到网页上的一个数字",
    "用受控对局而不是只看损失，说明改动后的模型确实能下完一盘",
  ],
} as const

export function coreUnitForLesson(lessonId: string): CoreUnit | null {
  return CORE_UNITS.find((unit) => unit.lessonIds.includes(lessonId)) ?? null
}

export function coreUnitMasteryCount(unit: CoreUnit, isMastered: (lessonId: string) => boolean): number {
  return unit.lessonIds.filter(isMastered).length
}

export function coreUnitCompleted(unit: CoreUnit, isMastered: (lessonId: string) => boolean): boolean {
  return coreUnitMasteryCount(unit, isMastered) === unit.lessonIds.length
}

/** 阶段契约中除阶段末课以外的课程都通过，才开放诊断性三问；它不参与放行。 */
export function stageSelfTestReady(
  stage: Pick<CurriculumStage, "lessonIds"> | null,
  isMastered: (lessonId: string) => boolean,
): boolean {
  if (!stage) return false
  return stage.lessonIds
    .filter((lessonId) => lessonId !== stage.lessonIds.at(-1))
    .every(isMastered)
}
