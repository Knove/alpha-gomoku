/** 第 7 课 · 卷积核：在全盘滑动的一组权重。
 *  节拍：思考题(结构先给什么)→ 正文(卷积核=3×3 加权求和 / 同一个扫全盘=权重共享 /
 *  归纳偏置 / 48 个是训练学出来的)→ 例 7-1(滑窗 + 扫全盘热力图，conv2d 真算)→
 *  例 7-2(真卷积核墙：weights-best.json 前 8 个)→ 对证(model.py L33)→ 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { MiniGrid9 } from "../lib/minigrid"
import { conv2d, type Tensor } from "../engine/nn"
import type { WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 横三连卷积核(同第 6 课三个输入平面):中间一行 1 1 1。 */
const KERNEL = [0, 0, 0, 1, 1, 1, 0, 0, 0]
/* 教学局面(同 archive/network.md 手算例):己方三连横排在 y=4,x=2..4。 */
const THREE: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
]
const OWN81: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of THREE) b[y * 9 + x] = 1
  return b
})()

/** 81 个窗口分数：真引擎 conv2d(与 model.py stem 同一算子，pad=1 界外补 0)。 */
const SCORES: number[] = (() => {
  const own: Tensor = { data: Float64Array.from(OWN81), shape: [1, 9, 9] }
  const tmpl: Tensor = { data: Float64Array.from(KERNEL), shape: [1, 1, 3, 3] }
  return Array.from(conv2d(own, tmpl, null, 1).data)
})()

export default function L08() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 7 课</div>
      <h1 className="text-2xl font-bold">卷积核：在全盘滑动的一组权重</h1>

      <LessonGuide
        question="机器怎样在棋盘每个位置都寻找同一种局部棋形，而不用把同一条棋理学 81 遍？"
        why="三个输入平面只是把棋盘摆好；网络还需要一套方法，在任意位置发现「这里像三连」「那里像威胁」这样的局部图案。"
        chain={[
          "一个 3×3 卷积核为局部格子分别打分",
          "同一卷积核滑过全盘，汇成一张特征图",
          "同一套数字在各位置共用，避免重复学习",
          "许多训练得到的卷积核一起工作，提供后续层需要的特征",
        ]}
        takeaway="结构只预先给出「棋形是局部的、同一棋形可在各处出现」；卷积核具体长什么样、各格多重要，仍由训练决定。"
        boundary="卷积核不是人手写的「见三连就堵」规则。它只是一组可学习的局部权重，真正的走法还要靠更深的网络和搜索。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "不用人手写「见三连就堵」的规则，仍能让网络少走弯路。结构最适合先给它什么？",
            options: [
              "多喂棋谱：见的局面够多，自然就悟出来了",
              "把「棋形常由附近格子组成、同一种棋形会在各处出现」写进结构：让可学习卷积核在全盘滑动",
              "手写一条规则代码：「见到三连就堵」",
            ],
            answer: 1,
            explain:
              "选第二项。结构没有直接给出「哪种棋形一定该堵」这条棋理；它只先给两项常识：棋形先看附近格子，同一种局部图案无论出现在何处都该用同一套检测方式。卷积核具体长什么样、发现后有多重要，仍由训练决定。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一张 3×3 数表给局部格子分别打分</h3>
        <p>
          接着上一课的手算例：横三连卷积核中间一行是 1、1、1，其余是 0，
          盖在某个 3×3 小窗上，对应格子相乘、九个乘积相加（第 4 课推的正是这套乘加）。
          拿它手算一遍：盖在正罩住己方三连的窗口上，得 <strong className="num">3</strong>；
          往右挪一格，得 <strong className="num">2</strong>；盖到全空的窗上，得{" "}
          <strong className="num">0</strong>。哪里分数大，哪里就有「横排三个己方子」的嫌疑。
          这样一张用来找图案的权重表，第 6 课已经把它叫作卷积核；让它滑过全盘、
          处处算一遍的这套运算，正式名字如下。
        </p>
        <Def term="卷积" en="convolution">
          让卷积核滑过全盘、在每个位置都算一遍乘加的这套运算。严格说它算的是互相关
          （cross-correlation），不是数学意义上的卷积：真正的卷积要把核翻转 180°，这里不翻；对称核翻不翻结果相同（本课教学核恰对称），torch 也同样名为 conv、实做互相关，所以两边能逐项对拍。
          机器学习沿用了数学里「卷积」这个名字。每个位置的输出就是该处窗口的分数（第 4 课的加权和）。
        </Def>
      </div>

      <div className="prose mt-10">
        <h3>同一个卷积核扫过全盘，处处产生一张特征图</h3>
        <p>
          卷积核不是挑一个位置盖一次，而是<strong>每个位置都盖一次</strong>：
          81 个分数排成一张 9×9 的图。棋盘外围虚拟补一圈 0，
          含义是「界外按 0 参与计算」。语义上这是拿「空位」近似「界外」：界外那一格像空位一样不挡路，贴边的威胁因此可能被高估一点，是建模近似而非规则事实（颜色平面的贡献在贴边处反而被削掉一圈，方向相反的两个小偏差都会被训练适应）。好处是 81 个格子每个都能当一次窗口中心，特征图不缩水。
        </p>
        <Def term="填充" en="padding">
          在输入外围虚拟补一圈 0。本模型补一圈后，窗口中心可以落在棋盘边缘甚至角上，
          伸出棋盘的部分按 0 参与乘加，特征图与棋盘同大，都是 9×9。
          补 0 对颜色平面的含义也不是「空位」：该平面整图同值（轮黑为 1），界外却补 0，
          贴边窗口里颜色平面的贡献会被削掉一圈，同属实现近似。
        </Def>
        <Def term="通道" en="channel">
          一个卷积核扫全盘得到的那张特征图就叫一个通道；卷积核的个数就是通道数。
        </Def>
        <Def term="特征图" en="feature map">
          一个卷积核扫全盘后得到的那张 9×9 分数图：每个格子放该处窗口的分数。
          分数越高，越像该卷积核在找的局部图案。每个分数本身也是回答一个问题的答案
          （「该卷积核找的图案在此处响应多强」）；到下一层，这 81 个分数就换角色成为下一层的 81 个特征值。
          一个卷积核对应一张特征图，也叫一个输出通道。
        </Def>
        <p>
          棋盘正中心（天元）的横三连和边角的横三连，用<strong>同一套权重</strong>发现。
          要是每个位置单配一套，一个卷积核就要从 1 套 9 个数膨胀成 81 套，
          而且同一条棋理要学 81 遍：省下的不只是权重，还有重复的学习。
        </p>
        <Def term="权重共享" en="weight sharing">
          同一个卷积核的同一套数字在棋盘各处使用。共享的是局部形状检测，不是位置无关的棋理：贴边的三连和天元的三连威胁性质不同（边挡住了延长线），位置带来的差别要靠更深的层或末端读出层去补。
          一处学到的局部图案检测方式可以直接迁到其他位置。教学用的单平面卷积核带 9 个数，
          真实的三平面卷积核带 27 个数，都不是按位置各配一套。
        </Def>
      </div>

      <SlideWindow />

      <div className="prose mt-12">
        <h3>结构先给两条常识，内容由训练长出来</h3>
        <p>
          这种把「答案大概长什么样」的假设事先写进结构、从而限制并偏好某类解法的做法，
          正式名字叫<strong>归纳偏置</strong>。此处写进结构的假设是两条常识：
          棋形先看附近格子（局部性）、同一种局部图案各处通用。
          卷积核具体长什么样、发现后有多重要，仍全部由训练决定：
          结构给空白的卷积核，内容自己长。
        </p>
        <Def term="归纳偏置" en="inductive bias">
          把「答案大概长什么样」的假设事先写进结构，从而限制并偏好某类解法的做法。
          怎么数一条：一条归纳偏置就是结构里一项事先写死的解法偏好；删掉它，网络反而能表达
          更多类函数，只是学习与搜索失去了偏向。卷积结构写进两条：局部性（棋形先看附近格子）、
          同图案各处通用（权重共享）。它不规定哪种棋形一定该堵。
        </Def>
        <p>
          本模型的窗口选 3×3。它能捕捉短短的局部片段，例如连续三子。
          横、竖、两种斜线方向上的小图案，它也都能发现。3×3 看不到三连两端是否都空，
          所以单个卷积核不能单独判定「活三」（还有延伸成五余地的三连）。
          窗口大小是取舍：2×2 更省却看得更少；5×5 或 9×9 看得更多，
          却需要更多权重、也削弱了「先局部、后整体」的好处：大窗每个位置几乎一眼看完一大片（9×9 窗更是一眼看全盘），「先认局部、再组合」的层次没有了，局部发现也无法在各处复用，权重数还随窗面积上涨（即窗边长的平方）。
        </p>
      </div>

      <div className="prose mt-12">
        <h3>第一层的 48 个卷积核全部由训练学出来</h3>
        <p>
          本课程演示模型（小一号的 fast 配置，为了让网页算得快）的网络第一层（代码里叫 stem）是{" "}
          <strong className="num">48</strong>{" "}
          个这样的卷积核<strong>同时</strong>在 9×9 上扫（48 是本快照配置，不是永恒常数）。
          这 48 个没有一个是人按棋理画的：每个权重都是训练从「网络自己跟自己下的棋」里学出来的。
          一共 <strong className="num">48 × 27 = 1296</strong> 个权重。
          第 4 课加权求和演示拖过的那 9 个，就是这 48 个卷积核里某一个的己方平面截取（真实权重，不是另编的教学值）；整套 27 元组合是训练自己长出来的。
          例 7-2 给出真实权重。
        </p>
        <Def term="自我对弈" en="self-play" see="第 12 课">
          同一套网络执黑白互为对手，自动产生训练对局；终局结果再回头调整权重。
        </Def>
      </div>

      <RealKernels />

      <Ledger title="model.py AlphaGomokuNet.stem / game.py encode">
        <div className="codewalk">
          <pre>{`# model.py · AlphaGomokuNet.__init__:通道数由配置传入
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),
    nn.BatchNorm2d(channels),
    nn.ReLU(),
)`}</pre>
        </div>
        <p className="mt-3">
          在本站演示模型的权重里，
          <span className="mono">channels=48</span>（48 通道就是 48 个卷积核，数核就是数通道），所以
          <span className="mono">Conv2d(3,48,3,padding=1)</span> 读作
          「3 个输入平面进来、48 个 3×3 卷积核扫一遍、界外补一圈 0」。默认训练配置是 64 通道；
          代码中的 <span className="mono">channels</span> 才是可改的通用写法。
          卷积核扫全盘就是本课的卷积：你在例 7-1 里按的每一下，
          都是这行代码在做的事。那行 <span className="mono">nn.ReLU()</span>
          是第 5 课的非线性变换。先卷积求和、再整体做非线性变换，这两步一行不缺。
          本站引擎 <span className="mono">learn/src/engine/nn.ts</span> 的{" "}
          <span className="mono">conv2d</span> 与它逐条对齐（例 7-1 的特征图就是它算的）。
        </p>
        <div className="codewalk">
          <pre>{`# game.py · encode  喂进第一层的，正是第 6 课那三个输入平面
canon = game.canonical_board()          # 我方 = +1
cur  = (canon == 1).astype(np.float32)  # 平面 0 己方子
opp  = (canon == -1).astype(np.float32) # 平面 1 对方子
color = np.full_like(cur, 1.0 if game.current_player == BLACK else 0.0)`}</pre>
        </div>
        <p className="mt-3">
          （完整版在第 6 课对过证。）每个卷积核其实是「3 个一套」：己方平面、对方平面、
          颜色平面各配一个 3×3，<strong className="num">27</strong> 个乘积一起相加（也可以按平面分三组各求和、再把三个组和相加，加法可结合，结果相同）
          （第 3 课那「一对特征 × 权重」，这里摊成 27 对：窗口 9 格 × 3 个平面共 27 项，每项各问一遍「这里是什么」），所以例 7-2 的每个真实卷积核画了三张 3×3 小方格图。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "卷积核是一张小数表（本课 3×3），盖在窗口上做乘加；同一卷积核扫过全盘，81 个分数排成一张特征图。",
          "填充（padding）在外围补一圈 0，让每个格子都能当窗口中心；权重共享让天元和边角用同一套数字，同一条棋理不必学 81 遍。",
          "归纳偏置只写进两条常识（局部性、各处通用）；第一层 48 个卷积核共 48 × 27 = 1296 个权重，全部由训练学出来，没有一个是人按棋理手画的。",
        ]}
        next={
          <>
            单个 3×3 卷积核只看得见一小块。下一课把它们一层层叠起来：
            每多叠一层，能回看的输入范围向外扩一圈，深层有机会把局部发现组合成整盘形势。
            叠深之后旧信息怎样留下、各层数值尺度怎样稳住，也在下一课交代。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "横三连卷积核盖在己方三连正上方得 3；窗口往右挪一格只得 2。为什么？",
            options: [
              "因为挪动之后卷积核变短了",
              "因为窗口右边缘落在空格 (5,4) 上：那一格乘出来是 0，三个 1 只剩两个",
              "因为 (4,4) 上的子被挡住了",
            ],
            answer: 1,
            explain:
              "卷积核没变、子也没动，变的只是窗口罩住哪些格：右边缘那格从「有子(1)」换成「空(0)」，乘积从 1 变 0。每个分数都能像这样一格一格指认：在例 7-1 里亲手挪一遍。",
          },
          {
            q: "权重共享（同一个卷积核扫全盘）省下的到底是什么？",
            options: [
              "省内存：棋盘可以存得更紧",
              "省扫描时间：扫一遍更快",
              "省权重并复用经验：教学单平面卷积核有 9 个数（真实三平面卷积核有 27 个），同一套数字在全盘各处使用",
            ],
            answer: 2,
            explain:
              "核心是权重与经验复用：教学里一个单平面卷积核只带 9 个数，真实三平面卷积核带 27 个，而不是每个位置各配一套。只要棋理不因位置而变，天元和边角都能用同一套权重检测。这样一处学到的局部图案可以迁到其他位置。",
          },
          {
            q: "真模型第一层的 48 个卷积核，是谁设计的？",
            options: [
              "工程师按棋理手绘的：横三连、竖三连、斜三连……各画一个",
              "没有人设计：48×27 个权重全是训练从自我对弈数据里学出来的",
              "网络自己写的代码生成的",
            ],
            answer: 1,
            explain:
              "例 7-2 看过：单看数值像噪声，但它们确实在响应棋形，没有人画过图案。48 个卷积核的权重全部由训练学出来。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 7-1 · 卷积核滑窗 + 扫全盘 ============ */

const N = 9
const CELL = 46
const MARGIN = CELL * 1.8
const VB = MARGIN * 2 + (N - 1) * CELL
const px = (x: number) => MARGIN + x * CELL
const STARS: [number, number][] = [
  [2, 2],
  [2, 6],
  [6, 2],
  [6, 6],
  [4, 4],
]
/** 扫描顺序：逐列(先扫完 x=0 一列，再 x=1……)。i 格的扫描序号。 */
const ORD = (i: number) => (i % 9) * 9 + Math.floor(i / 9)

function SlideWindow() {
  const [cx, setCx] = useState(3)
  const [cy, setCy] = useState(4)
  // null = 未扫；0..80 = 正在扫第几个；81 = 扫完
  const [scanIdx, setScanIdx] = useState<number | null>(null)

  useEffect(() => {
    if (scanIdx === null || scanIdx >= 81) return
    const t = setTimeout(() => setScanIdx((k) => (k ?? 0) + 1), 45)
    return () => clearTimeout(t)
  }, [scanIdx])

  const scanning = scanIdx !== null && scanIdx < 81
  const done = scanIdx === 81
  // 扫描时窗口自动跟着走
  const wx = scanning ? Math.floor(scanIdx / 9) : cx
  const wy = scanning ? scanIdx % 9 : cy

  const sum = SCORES[wy * 9 + wx]
  const outside = wx < 1 || wx > 7 || wy < 1 || wy > 7

  // 窗口内容(己方平面视角；界外按 0 算)
  const winVals = [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => {
      const y = wy + r - 1,
        x = wx + c - 1
      return y < 0 || y > 8 || x < 0 || x > 8 ? 0 : OWN81[y * 9 + x]
    }),
  )
  const winLabels = [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => {
      const y = wy + r - 1,
        x = wx + c - 1
      return y < 0 || y > 8 || x < 0 || x > 8 ? "界" : winVals[r * 3 + c] ? "1" : "0"
    }),
  )
  const products = KERNEL.map((t, i) => t * winVals[i])

  const move = (dx: number, dy: number) => {
    if (scanning) return
    setCx((v) => Math.min(8, Math.max(0, v + dx)))
    setCy((v) => Math.min(8, Math.max(0, v + dy)))
  }

  const heatCells: { i: number; v: number }[] = []
  if (scanIdx !== null)
    for (let i = 0; i < 81; i++)
      if (ORD(i) <= scanIdx && SCORES[i] > 0) heatCells.push({ i, v: SCORES[i] })

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 7-1 · 卷积核滑窗：一个卷积核，81 个位置各算一次</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <div
            tabIndex={0}
            role="application"
            aria-label="卷积核滑窗：方向键移动窗口"
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            onKeyDown={(e) => {
              const k = e.key
              if (k === "ArrowLeft") move(-1, 0)
              else if (k === "ArrowRight") move(1, 0)
              else if (k === "ArrowUp") move(0, -1)
              else if (k === "ArrowDown") move(0, 1)
              else return
              e.preventDefault()
            }}
          >
            <svg viewBox={`0 0 ${VB} ${VB}`} style={{ width: "100%", height: "auto", display: "block" }}
              role="img" aria-label="9×9 棋盘上的卷积核窗口与特征图">
              <rect
                x={MARGIN - CELL * 0.62}
                y={MARGIN - CELL * 0.62}
                width={VB - 2 * (MARGIN - CELL * 0.62)}
                height={VB - 2 * (MARGIN - CELL * 0.62)}
                rx={12}
                style={{ fill: "var(--board)" }}
              />
              <g style={{ stroke: "var(--board-line)" }} strokeWidth={1.1} opacity={0.85}>
                {Array.from({ length: N }, (_, i) => (
                  <line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(8)} />
                ))}
                {Array.from({ length: N }, (_, j) => (
                  <line key={`h${j}`} x1={px(0)} y1={px(j)} x2={px(8)} y2={px(j)} />
                ))}
              </g>
              <g style={{ fill: "var(--board-line)" }}>
                {STARS.map(([sx, sy]) => (
                  <circle key={`${sx}-${sy}`} cx={px(sx)} cy={px(sy)} r={Math.max(2.4, CELL * 0.09)} />
                ))}
              </g>

              {/* 特征图：每个窗口的分数，分数越高越红 */}
              <g data-qa="heat">
                {heatCells.map(({ i, v }) => (
                  <g key={i}>
                    <rect
                      x={px(i % 9) - CELL * 0.44}
                      y={px(Math.floor(i / 9)) - CELL * 0.44}
                      width={CELL * 0.88}
                      height={CELL * 0.88}
                      rx={7}
                      style={{ fill: "var(--heat)" }}
                      opacity={0.45 + v * 0.16}
                    />
                    <text
                      x={px(i % 9)}
                      y={px(Math.floor(i / 9))}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={CELL * 0.34}
                      fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                      fill="#fdf6ee"
                    >
                      {v}
                    </text>
                  </g>
                ))}
              </g>

              {/* 己方三连 */}
              {THREE.map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={px(x)} cy={px(y)} r={CELL * 0.36}
                  style={{ fill: "var(--stone-b)", stroke: "var(--stone-b-lo)", strokeWidth: 1.5 }} />
              ))}

              {/* 3×3 窗口 */}
              <g style={{ transform: `translate(${px(wx - 1) - CELL * 0.48}px, ${px(wy - 1) - CELL * 0.48}px)`, transition: "transform 120ms ease" }}>
                <rect
                  width={2 * CELL + 0.96 * CELL}
                  height={2 * CELL + 0.96 * CELL}
                  rx={9}
                  style={{ fill: "var(--accent)", stroke: "var(--accent)", strokeWidth: 2.5 }}
                  fillOpacity={0.06}
                  strokeDasharray={outside ? "8 6" : undefined}
                />
                {outside && (
                  <text x={6} y={-8} fontSize={CELL * 0.26} style={{ fill: "var(--accent-deep)" }}
                    fontFamily="ui-monospace, SF Mono, Menlo, monospace">
                    窗口出界：界外按 0（空）算
                  </text>
                )}
              </g>
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={scanning} onClick={() => move(-1, 0)} aria-label="窗口左移">←</button>
            <button type="button" className="btn" disabled={scanning} onClick={() => move(0, -1)} aria-label="窗口上移">↑</button>
            <button type="button" className="btn" disabled={scanning} onClick={() => move(0, 1)} aria-label="窗口下移">↓</button>
            <button type="button" className="btn" disabled={scanning} onClick={() => move(1, 0)} aria-label="窗口右移">→</button>
            <button type="button" className={`btn ${scanIdx === null ? "primary" : ""}`}
              disabled={scanning}
              onClick={() => setScanIdx(0)}
              data-qa="scan-btn">
              {scanning ? `正在扫第 ${scanIdx + 1} / 81 格…` : done ? "↺ 再扫一遍" : "扫全盘：81 格逐列盖过去"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            内置局面：己方三连 (2,4)(3,4)(4,4)（换成了纯三连的小局面，不是第 6 课那局 9 手）。本页坐标和第 1 课一样写成 (x, y)：
            前一个数是列，后一个是行。用棋盘下方的箭头按钮（或键盘方向键）逐格挪窗口。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">当前窗口的计算</div>
          <div className="mt-2 flex flex-wrap items-start gap-4">
            <MiniGrid9 label="窗口(己方平面)" cells={winLabels} tint={winVals.map((v) => v === 1)} />
            <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>×</span>
            <MiniGrid9 label="卷积核" cells={KERNEL.map(String)} tint={KERNEL.map((t) => t !== 0)} />
            <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>=</span>
            <MiniGrid9 label="乘积" cells={products.map(String)} tint={products.map((p) => p !== 0)} />
          </div>
          <div className="reveal-box mt-4">
            <p className="num text-lg font-bold">
              和 = <span data-qa="win-sum" style={{ color: "var(--accent-deep)" }}>{sum}</span>
              <span className="ml-3 text-sm font-normal" style={{ color: "var(--fg-muted)" }}>
                (窗口中心 ({wx}, {wy}))
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              「界」= 窗口伸出棋盘外，那一格按 0 算（棋盘外虚拟补一圈 0）。
            </p>
          </div>
          {done && (
            <div className="reveal-box mt-4 text-sm leading-relaxed" data-qa="scan-done">
              81 格盖完，分数落成一张「特征图」：<strong>3</strong> 只出现在三连正中
              （一处窗口），<strong>2</strong> 出现在 3 的两侧，<strong>1</strong> 在 2 的外侧再各有一格，
              其余全 0。同一个卷积核、同一套 9 个数，一次扫描把整条横排的嫌疑全标了出来。
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 7-1</span>
        每个分数都由本站引擎 <span className="mono">conv2d</span>（model.py stem 同款算子）
        现算，不是预录的动画。「扫全盘」就是权重共享：一个卷积核走遍 81 格。
      </figcaption>
    </figure>
  )
}

/* ============ 例 7-2 · 真实权重：训练学出来的卷积核 ============ */

const REAL_TPL_SHOWN = 8

function RealKernels() {
  const [w, setW] = useState<WeightsJson | null>(null)
  useEffect(() => {
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [])

  const tpl = useMemo(() => {
    if (!w) return null
    const flat = w.tensors["stem.0.weight"]
    const shape = w.shapes["stem.0.weight"] // [48, 3, 3, 3]
    let maxAbs = 0
    for (const v of flat) maxAbs = Math.max(maxAbs, Math.abs(v))
    return { flat, shape, maxAbs }
  }, [w])

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 7-2 · 真实权重：第一层的前 {REAL_TPL_SHOWN} 个卷积核</span>
      </div>
      <div className="p-4 md:p-5">
        {!tpl ? (
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            正在加载真权重：weights-best.json（约 1.2 MB，由 checkpoint 导出；检查点是训练中保存的一组权重，可随时加载）……
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {Array.from({ length: REAL_TPL_SHOWN }, (_, ch) => (
                <RealTemplate key={ch} ch={ch} flat={tpl.flat} maxAbs={tpl.maxAbs} />
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              这些不是示意图：每一格灰度都是{" "}
              <span className="mono">weights-best.json</span> 里{" "}
              <span className="mono">stem.0.weight</span> 的真权重（悬停可看数值）。
              每个卷积核是「3 个一套」，分别作用在己方平面 / 对方平面 / 颜色平面上；
              越黑 = 正权重越大，越白 = 负权重越大，中灰 = 0。单看数值像噪声
              （像没信号的电视上一片乱雪花），但训练的用意正是让它们响应棋形：没有人画过图案，
              <strong>每一个权重都是训练学出来的</strong>。结构只承诺「局部 + 处处通用」，
              每个卷积核最终认出什么图案，是训练的事。
            </p>
          </>
        )}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 7-2</span>
        真数据：weights-best.json 由 learn/scripts/export_weights.py 从 checkpoint 导出；
        此处展示前 8 个 / 共 48 个。
      </figcaption>
    </figure>
  )
}

const PLANE_TAGS = ["己", "敌", "色"]

function RealTemplate({
  ch,
  flat,
  maxAbs,
}: {
  ch: number
  flat: number[]
  maxAbs: number
}) {
  return (
    <div data-qa="tpl">
      <div className="mini-label mb-1.5">
        卷积核 <span className="num">{ch + 1}</span>
      </div>
      <div className="flex gap-2">
        {PLANE_TAGS.map((tag, p) => (
          <div key={tag}>
            <div className="mb-1 text-center text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>
              {tag}
            </div>
            <div className="l03-rows inline-block">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex">
                  {[0, 1, 2].map((c) => {
                    const v = flat[((ch * 3 + p) * 3 + r) * 3 + c]
                    const n = v / maxAbs // −1..1
                    const l = Math.round(128 - n * 115) // 1→黑，−1→白
                    return (
                      <span key={c} className="l03-gray" title={String(v)}
                        style={{ background: `rgb(${l},${l},${l})` }} />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
