/** 第 6 课 · 三个输入平面(地基篇 4/4)。
 *  节拍：思考题(一个 ±1 平面够吗)→ 正文(正负抵消 → 拆两个 0/1 平面 + 颜色平面)→
 *  例 6-1(正负抵消计算器：同一个横三连卷积核，不同窗口内容，亲手验证 3 > 2 > 1)→
 *  例 6-2(同一局面三个输入平面并排，点格联动)→
 *  为什么刚好选三个 → 对证(game.py encode + replay.py 重建)→ 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { MiniGrid9 } from "../lib/minigrid"

/* 教学局面：与第 2 课同一局(5 黑 4 白共 9 手，轮白),
 * 例 6-2 用它渲染「网络眼里的三个输入平面」。 */
const BLACK_POS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 5],
  [3, 5],
]
const WHITE_POS: [number, number][] = [
  [5, 4],
  [4, 3],
  [5, 3],
  [6, 4],
]
const OBJ: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of BLACK_POS) b[y * 9 + x] = 1
  for (const [x, y] of WHITE_POS) b[y * 9 + x] = -1
  return b
})()

/* 例 6-2 的三个输入平面(轮白：canonical 里白的变 +1,即「己方」)。
 * 与 game.ts encode() 同一套切法，数据在本组件里现算，改动棋盘即联动。 */
const PLANE_OWN = OBJ.map((v) => (v === -1 ? 1 : 0)) // 轮白：白子 = 己方
const PLANE_OPP = OBJ.map((v) => (v === 1 ? 1 : 0))
const PLANE_COLOR = new Array<number>(81).fill(0) // 轮白 → 整张 0

export default function L07() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 6 课</div>
      <h1 className="text-2xl font-bold">三个输入平面</h1>

      <LessonGuide
        question="棋盘已有 0/+1/−1 的记法，为什么送进网络前要拆成两个 0/1 平面、再加一个颜色平面？"
        why="网络第一层要用小卷积核寻找「我方在这里」「对方在这里」这些事实。把它们分开，能让卷积核更直接地读到各自的特征。"
        chain={[
          "先用第 2 课的视角约定统一我方和对方",
          "我方子、对方子各占一个 0/1 平面",
          "卷积核可分别检测两类棋形，不让正负号在一次求和中抵消",
          "颜色平面补上执黑或执白这一全局身份",
        ]}
        takeaway="三个输入平面是让本模型更容易学习的输入设计：没有增加棋子分布的事实，补的是规则层已知的状态（轮到谁、执何色）。「不请人」禁止的是代机器算棋理特征，不禁止规定输入编码、提供这类状态事实。"
        boundary="直接用一个 ±1 平面并非信息丢失或绝对做不到。不同网络可以选不同编码。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "己方 +1、对方 −1、空 0 的数组没有丢棋盘信息。本模型仍把它拆成两个 0/1 平面（颜色平面另说是新增的状态），主要为了什么？",
            options: [
              "因为 ±1 数组缺少棋子位置，必须补更多数据",
              "把「我方在这里」和「对方在这里」拆成两件事，让第一层卷积核更直接地分别识别它们",
              "因为五子棋必须记住每一步历史才能知道当前局面",
            ],
            answer: 1,
            explain:
              "选第二项。±1 数组的信息并没有丢；这是一种让本模型更好学的改写。一次简单的卷积核求和中，正负号会冲突：「己、敌、己」和「空、己、空」算出同一个数，两样局面分不出彼此。把双方拆开后，卷积核可以分别提出「我方棋形」和「对方棋形」的特征。五子棋没有吃子，也没有「这步能不能下要翻历史」的规则（围棋的打劫规则就是那种），所以当前棋盘加行棋方已足够描述状态。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一次求和会把两类事实搅在一起</h3>
        <p>
          第 3 课里的 <span className="mono">x</span> 是我们手工规定的教学特征；从现在起，
          不再请人替机器数「三连有几条」这类棋理特征。人仍然规定编码方式（三个平面各记什么），
          但那只是把棋盘事实如实写成数，不是替机器判断棋理。第一步是把棋盘改写成网络能逐层处理的输入，
          让后面的计算自己从格子里形成特征。
        </p>
        <p>
          网络第一层的算法在第 4 课已经推过：一个个 3×3 的数表盖在棋盘某个小窗上，
          对应格子相乘，再把 9 个乘积加成一个数（这是单个平面的九项）。比如这个「横三连卷积核」：
          中间一行是 1、1、1，其余是 0，它量的是「这个窗口的中间一横排，
          是不是我的子」。
        </p>
        <Def term="卷积核" en="kernel，亦称滤波器 filter">
          一张小数表（本课先看单平面教学核：3×3 的九个数），盖在输入的同尺寸小窗上，对应格子相乘再把乘积加成一个数。
          数表里的每个数都是一个权重，沿用第 3 课「特征 × 权重」的配对规则，只是这里一对九，
          且九个格子有固定的空间位置。三个输入平面各有自己的一张九数小表，合起来才是一套完整卷积核
          （9 格 × 3 平面 = 27 个权重）。
        </Def>
        <p>
          现在拿它去算一个 ±1 平面。同一个卷积核，盖在「己、敌、己」三格上：
          1×1 + 1×(−1) + 1×1 = <strong>1</strong>；盖在「己、空、己」上：
          1 + 0 + 1 = <strong>2</strong>。（乘 −1 就是变号；+1 撞上 −1
          正好归零，这是第 4 课那段计算。）更麻烦的是冲突：「己、敌、己」得 1，
          「空、己、空」也得 1。被敌子隔开的两颗己方子，和孤零零一颗己方子，
          在这个平面上是同一个数，一次求和分不出彼此。再盖在「敌、敌、敌」上，
          得 <strong>−3</strong>：对方的子把我方这一项的贡献拖成负的。这一次求和还把「己、敌、己」和「空、己、空」压成同一个数 1，这种不同局面同分的现象叫<strong>混叠</strong>；正负相消则是<strong>抵消</strong>。当然可以设计更多卷积核或更深网络来处理，
          但本模型选择更直接的写法：一种身份一个平面。
        </p>
      </div>

      <CancelCalc />

      <div className="prose mt-12">
        <h3>一种身份一个平面，外加一个颜色平面</h3>
        <p>
          解法是<strong>一种身份一个平面，每个只放 0 和 1</strong>。
          平面 0「己方子」：我的子在哪些格子，是 1、不是 0；平面 1「对方子」：
          对手的子在哪些格子。空格不用单独一个：两个平面同为 0 的地方就是空。
          拆开后，每个平面上「1 越多，这个事实越成立」。例如「己方横三连」在己方平面上
          得 3；对方棋形则由另一个平面单独判断。两类特征不用在同一次求和里互相抵消。
        </p>
        <p>
          还差最后一项全局信息：轮黑走时整张填 1，轮白走时整张填 0。
          规范视角（代码里叫 canonical）统一了「我 / 对手」，但没有告诉网络「我拿的是黑还是白」。本模型把这项
          全局身份直接贴进每个位置，而不是让早期局部卷积核费力推断。
        </p>
        <Def term="颜色平面" en="color plane">
          整张填同一个数的第三个输入平面：轮黑走时全 1，轮白走时全 0。取 1/0 而不是 ±1，是与两个棋子平面同量纲的编码选择，0/1 在乘加里当开关用最直观。
          它把「我执黑还是执白」这项全局身份送进每个位置，补上前两个平面只描述棋子分布时
          没直接给出的颜色信息。严格说，能看全盘的网络可以由子数差推出颜色（黑先行、无吃子：轮黑时双方子数相等，轮白时对方多一子），但早期局部卷积核看不到全局计数；与其让每个样本重新推一遍，不如把这一位直接铺进去。
        </Def>
        <Def term="输入平面" en="input plane">
          送进网络的整张 9×9 数值图。己方子、对方子两个 0/1 平面各是 81 个问题的答案（每格一问「这里有我的子吗」或「有对手的子吗」）；
          颜色平面则是一个全局问题（「现在轮到哪一方走」）广播到 81 格的同一答案。本模型共三个：三个叠起来形状是 <span className="mono">(3, 9, 9)</span>，
          读作「3 个 9×9」。拆分没有增加棋子分布的事实，只是把同一批事实写成更方便卷积核读取的形式（颜色一位属于规则状态）。颜色广播成 81 格是卷积输入的形状约定（H×W 的图），不是要问 81 遍。
        </Def>
      </div>

      <ThreePlanes />

      <div className="prose mt-12">
        <h3>三个平面是一次取舍，不是唯一答案</h3>
        <p>
          己方平面和对方平面让局部卷积核容易分别找两类棋形；颜色平面保留先后手身份。
          它们把同一局棋拆成更容易使用的特征。空格不用单独一个平面：同一格在己方平面和对方平面上
          都为 0，就表示空，没有丢掉棋盘事实。
        </p>
        <p>
          用第 5 课的语言可以把拆分写成一个式子：己方平面是
          <span className="mono">ReLU(x)</span>，对方平面是 <span className="mono">ReLU(−x)</span>。
          这里的 <span className="mono">x</span> 是格子值（第 2 课的 ±1 记法），只有 +1、0、−1 三种取值，一个一个验算全相等。
          这是帮助理解的一种等价写法，不是本模型必须经过的运行步骤。颜色平面用不着这样的拆法：它整图同值，是一张直接写下的常数图。
        </p>
        <p>
          五子棋没有吃子，也没有「同一棋盘因历史不同而合法走法不同」的规则；
          因此在本规则里，当前棋盘加上行棋方已经足够描述下一步。三个输入平面满足这个需要。
        </p>
        <p>
          本课同时对证训练资料的存取：回放池把下过的局面存起来，训练时随机抽取，
          抽到一条样本时再重新拆出同样的三个输入平面。
        </p>
      </div>

      <Def term="回放池" en="replay buffer" see="第 14 课">
        把下过的局面存起来、训练时随机抽取的样本仓库；本课对证展示它的省空间存法与重建。
      </Def>

      <Ledger title="game.py encode / replay.py ReplayBuffer.sample">
        <div className="codewalk">
          <pre>{`# game.py · encode:眼前局面直接变成三个输入平面
canon = game.canonical_board()
cur = (canon == 1).astype(np.float32)
opp = (canon == -1).astype(np.float32)
color = np.full_like(cur, 1.0 if game.current_player == BLACK else 0.0)
return np.stack([cur, opp, color])`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# replay.py · ReplayBuffer.sample:输入侧只存 canonical 棋盘和 player(π、z 另存)
b = self.boards[idx].astype(np.float32)
cur = b == 1.0
opp = b == -1.0
color = np.where(self.players[idx] == 1, 1.0, 0.0).astype(np.float32)
color = np.broadcast_to(color[:, None, None], cur.shape)
inputs = np.stack([cur, opp, color], axis=1).astype(np.float32)`}</pre>
        </div>
        <p className="mt-3">
          两条路线最后必须得到同一种 <span className="mono">(3,9,9)</span> 输入：下棋时从
          <span className="mono">Game</span> 当场编码；训练资料为了省空间，只保存那张 ±1 的规范棋盘
          （代码里叫 canonical）和当时轮到谁（<span className="mono">player</span>）。
          训练目标 π 与 z 也另存。
          随机抽到它时再重建己方平面、对方平面、颜色平面。
          本站 <span className="mono">game.ts encode()</span> 复现第一条路线；它固定为 9×9，
          Python 项目则由配置决定棋盘大小。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "一个 ±1 平面不丢信息，但一次简单求和会出两件事：正负抵消（「己、敌、己」里 1 与 −1 相消，只得 1）与混叠（「己、敌、己」和「空、己、空」得同一个数）。另有「敌、敌、敌」把分拖成负的，那是对方拖分。",
          "解法是一种身份一个平面：己方子、对方子各占一个 0/1 平面，空格是两个同为 0，不另设平面。",
          "颜色平面整张填 0 或 1，补上「我执黑还是执白」这项全局身份；三张叠成 (3, 9, 9) 就是网络每次读入的全部事实。",
        ]}
        next={
          <>
            下一课看这些平面怎样被逐格读取：同一个 3×3 卷积核在棋盘每个位置各算一遍，
            分数排成一张 9×9 的图。同一套数字在各处共用，同一种局部棋形不必学 81 遍；
            真实模型第一层的几十个卷积核长什么样，也由训练决定，而不是人按棋理手画。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "本模型为什么不直接把一个 ±1 平面交给第一层卷积核？",
            options: [
              "数不够精确，应该改用小数",
              "信息没有丢，但一次简单卷积核求和中正负可能抵消；拆成平面后可分别检测我方和对方的特征",
              "一个平面装不下 81 个格子，内存会溢出",
            ],
            answer: 1,
            explain:
              "格子还是那 81 个，信息也没有少。例子里 1 + (−1) + 1 = 1，比 1 + 0 + 1 = 2 小，说明一个简单「找我方横排」的卷积核会受到对方负号影响。拆成平面让两种检测各做各的；不是说一个 ±1 平面绝对不能被其他架构学会。",
          },
          {
            q: "为什么拆成两个 0/1 平面，而不是想办法修正一个 ±1 平面？",
            options: [
              "一个平面一个事实：己方平面上 1 越多「我方在」越成立，对方平面同理，谁也不抵消谁",
              "为了把网络撑大一点，多两层权重",
              "因为 0 和 1 在计算机里算得更快",
            ],
            answer: 0,
            explain:
              "要点是「一个平面一个事实」：己方平面得 3 说明己方三连特征强，对方平面同理。空格不需要第三个：两个平面都是 0 的地方就是空。这样是为了让本模型的第一层更直接，不是因为三个输入平面凭空增加了信息。",
          },
          {
            q: "颜色平面整张填同一个数，它补的是什么卷积核算不出来的信息？",
            options: [
              "每个交叉点上是空还是有子（棋子平面已经回答过的问题）",
              "「现在轮到哪一方走」这项全局身份：本模型选择直接提供它，不让早期局部卷积核先去推断",
              "最近三手的落子历史",
            ],
            answer: 1,
            explain:
              "是第二项。轮到谁走，游戏规则里当然知道；麻烦在于早期局部卷积核从两个棋子平面上看不出来（小窗里看不到全局的轮谁）。颜色平面把这项身份直接贴进输入，让早期局部核专心棋形；更深、能看全盘的网络原则上能从子数差推出颜色，但早期局部核推不出，没必要强迫它先做这件事。空还是有子是棋子平面的事，历史在这套规则里不需要。",
          },
          {
            q: "回头看第 3–5 课：把 ±1 拆成己/敌两个 0/1 平面，用第 5 课的话说，相当于给格子值做了什么？",
            options: [
              "把数变小，网络算得更快",
              "手工过了两个 ReLU：己方平面=ReLU(x)、对方平面=ReLU(−x)，x 只有 +1、0、−1 三种取值，一个一个验算全相等：三种身份各归各平面，不再挤在同一条 −1 到 +1 的线上互相抵消",
              "把输入加一倍，网络权重也跟着翻倍",
            ],
            answer: 1,
            explain:
              "ReLU(+1)=1、ReLU(0)=0、ReLU(−1)=0，所以在这三个取值上，己方平面确实等于 ReLU(x)，对方平面等于 ReLU(−x)。这是一种把第 5 课概念连回来的看法：用两个平面把正、反两类事实分别亮出来；它不表示实际程序会先运行这两个 ReLU。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 6-1 · 正负抵消计算器 ============ */

/** 横三连卷积核：中间一行 1 1 1,其余 0(与 archive/network.md 手算例同一张)。 */
const KERNEL = [0, 0, 0, 1, 1, 1, 0, 0, 0]

/** 窗口内容预设：名字描述中间一横排(卷积核上下两行是 0,乘什么都得 0)。
 *  值：1 己 / −1 敌 / 0 空。 */
const PRESETS: { name: string; mid: number[] }[] = [
  { name: "己己己", mid: [1, 1, 1] },
  { name: "己己空", mid: [1, 1, 0] },
  { name: "己空己", mid: [1, 0, 1] },
  { name: "己敌己", mid: [1, -1, 1] },
  { name: "空己空", mid: [0, 1, 0] },
  { name: "敌敌敌", mid: [-1, -1, -1] },
]

type View = "pm1" | "own" | "opp"

function CancelCalc() {
  const [preset, setPreset] = useState(3) // 默认「己敌己」，直接看抵消
  const [view, setView] = useState<View>("pm1")

  // 3×3 窗口：只有中间一行有内容
  const window9 = (() => {
    const w = new Array<number>(9).fill(0)
    const mid = PRESETS[preset].mid
    w[3] = mid[0]
    w[4] = mid[1]
    w[5] = mid[2]
    return w
  })()

  // 当前视角下窗口显示的值：±1 原样 / 己方平面(只有 +1 变 1)/ 对方平面(只有 −1 变 1)
  const shown = window9.map((v) =>
    view === "pm1" ? v : view === "own" ? (v === 1 ? 1 : 0) : v === -1 ? 1 : 0,
  )
  const products = KERNEL.map((t, i) => t * shown[i])
  const sum = products.reduce((a, b) => a + b, 0)

  const fmt = (v: number) => (v === 0 ? "·" : v > 0 ? `${v}` : `−${Math.abs(v)}`)
  const viewName =
    view === "pm1" ? "一个 ±1 平面" : view === "own" ? "己方 0/1 平面" : "对方 0/1 平面"
  const isPM1 = view === "pm1"

  return (
    <figure className="figure mt-8" data-qa="fig-calc">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 6-1 · 正负抵消计算器</span>
        <span className="seg">
          <button type="button" className={`seg-btn ${isPM1 ? "active" : ""}`}
            onClick={() => setView("pm1")}>
            一个 ±1 平面
          </button>
          <button type="button" className={`seg-btn ${view === "own" ? "active" : ""}`}
            onClick={() => setView("own")}>
            己方 0/1 平面
          </button>
          <button type="button" className={`seg-btn ${view === "opp" ? "active" : ""}`}
            onClick={() => setView("opp")}>
            对方 0/1 平面
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="flex min-w-0 flex-1 items-start justify-center gap-5 md:justify-start">
          <MiniGrid9 label="卷积核" cells={KERNEL.map(fmt)} tint={KERNEL.map((t) => t !== 0)} />
          <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>×</span>
          <MiniGrid9 label={`窗口(${viewName})`} cells={shown.map(fmt)}
            tint={shown.map((v) => v !== 0)} />
          <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>=</span>
          <MiniGrid9 label="9 个乘积" cells={products.map(fmt)}
            tint={products.map((p) => p !== 0)} hot={products.map((p) => p < 0)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">窗口内容（中间一横排）</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <button key={p.name} type="button" className={`btn ${i === preset ? "active" : ""}`}
                onClick={() => setPreset(i)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="reveal-box mt-4">
            <div className="mini-label">求和</div>
            <p className="num mt-1.5 text-lg font-bold" data-qa="calc-sum">
              {expr(products.slice(3, 6))} ={" "}
              <span style={{ color: "var(--accent-deep)" }}>{sum < 0 ? `−${Math.abs(sum)}` : sum}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              只列中间一行的三项：卷积核上下两行是 0，乘什么都得 0（乘积格里看得到）。
            </p>
          </div>
          {isPM1 ? (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              在 ±1 平面上点两组对照：「己敌己」得{" "}
              <span className="num font-bold">1</span>，「空己空」也得{" "}
              <span className="num font-bold">1</span>。
              被敌子隔开的两颗己方子和孤零零一颗己方子，在这个平面上是同一个数，这张核分不出它们。
              再点「敌敌敌」，得 <span className="num font-bold">−3</span>，
              对方的子把分拖成负的。这一次求和把「己、敌、己」和「空、己、空」压成同一个数 1，这就是混叠。
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              拆到 0/1 平面上再看：己方平面只数己方子、对方平面只数对方子，两个平面各算各的加权和，不再抵消。
              两个事实各报各的，不再互相抵消。切回「一个 ±1 平面」对照。
            </p>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 6-1</span>
        同一个横三连卷积核、同一批窗口，只换「平面怎么拆」。抵消发生在求和那一步，
        亲手点一遍就能看清每个数字的来路。
      </figcaption>
    </figure>
  )
}

/** 九宫格小表已提取到 lib/minigrid(第 7 课滑窗共用)。 */


/** 「1×1 + 1×(−1) + 1×1」式的中间行展开(卷积核中间一行全是 1)。 */
function expr(row: number[]): string {
  const w = (v: number) => (v < 0 ? `(−${Math.abs(v)})` : `${v}`)
  return row.map((v) => `1×${w(v)}`).join(" + ")
}

/* ============ 例 6-2 · 同一局面，三个输入平面 ============ */

function ThreePlanes() {
  const [sel, setSel] = useState<number | null>(null)

  const plane = (data: number[], name: string, sub: string, key: string) => (
    <div key={key} className="min-w-0">
      <div className="mini-label mb-1.5">{name}</div>
      <div className="l03-rows inline-block">
        <div className="flex">
          <span className="l01-axis" />
          {Array.from({ length: 9 }, (_, x) => (
            <span key={x} className="l01-axis num w-[1.05rem] text-center">{x}</span>
          ))}
        </div>
        {Array.from({ length: 9 }, (_, y) => (
          <div key={y} className="flex">
            <span className="l01-axis num leading-[1.05rem]">{y}</span>
            {Array.from({ length: 9 }, (_, x) => {
              const i = y * 9 + x
              return (
                <button key={x} type="button" className={`l03-cell ${data[i] ? "on" : ""} ${sel === i ? "sel" : ""}`}
                  aria-label={`(${x},${y}) = ${data[i]}`}
                  onClick={() => setSel(sel === i ? null : i)}>
                  <span className="num">{data[i] ? 1 : "·"}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: "var(--fg-faint)" }}>{sub}</p>
    </div>
  )

  const selText =
    sel === null
      ? "点棋盘或任何一个平面的格子：同一个交叉点在三个输入平面上同时亮起来。"
      : `你点的是 (${sel % 9},${Math.floor(sel / 9)})：己方平面 ${
          PLANE_OWN[sel] ? 1 : 0
        }、对方平面 ${PLANE_OPP[sel] ? 1 : 0}、颜色平面 ${PLANE_COLOR[sel]}。`

  return (
    <figure className="figure mt-12" data-qa="fig-kernel">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 6-2 · 同一局面，网络读入的三个输入平面</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[22rem]">
          <Board
            board={OBJ}
            swap
            lastMove={{ x: 4, y: 4 }}
            onCellClick={(x, y) => setSel(sel === y * 9 + x ? null : y * 9 + x)}
            marks={sel !== null ? [{ x: sel % 9, y: Math.floor(sel / 9) }] : undefined}
          />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            第 2 课的教学局面：5 黑 4 白、轮白。已拨到白方视角（己方 = 白）。
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {selText}
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            数一数：己方平面恰有 <strong className="num">4</strong> 个 1（白子），
            对方平面恰有 <strong className="num">5</strong> 个 1（黑子），
            颜色平面整张 <strong className="num">0</strong>（轮白走；要是轮黑，
            这个平面整张变 1）。黑白棋子消失，只剩「事实」本身。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-6 border-t border-[color:var(--hairline)] p-4 md:p-5">
        {plane(PLANE_OWN, "平面 0 · 己方子", "我的子在哪：4 个 1", "own")}
        {plane(PLANE_OPP, "平面 1 · 对方子", "对手的子在哪：5 个 1", "opp")}
        {plane(PLANE_COLOR, "平面 2 · 颜色平面", "我执黑？整张同一个数：0", "color")}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 6-2</span>
        下方三个 0/1 平面与 <span className="mono">encode()</span>（把局面切成
        三个输入平面的代码，对证区细看）的输出逐格一致：这就是网络每次
        「看到」的东西，叠成 (3, 9, 9)。
      </figcaption>
    </figure>
  )
}
