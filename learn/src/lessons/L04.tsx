/** 第 4 课 · 加权求和：乘和加，不多不少(地基篇 2/4)。
 *  节拍：思考题 → 正文(九对配对/加权和/线性的能耐与不能，定义框命名)→
 *  例 4-1(三输入加权求和演示：真权重，拖缩放系数)→
 *  例 4-2(线性的单调性：直线画不出 V)→ 对证(model.py stem)→ 小结与预告 → 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { dot } from "../lib/foundations"
import { loadWeights } from "../lib/weights"
import type { WeightsJson } from "../engine/model"

/* 玩具教学局面(另设的三颗子局面,不是第 2 课那局 9 手):横三连 (2,4)(3,4)(4,4),轮黑走。
 * 加权求和窗口罩在三连正中 (3,4),三个输入平面的窗口值全在此。 */
const THREE: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
]
const BOARD81: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of THREE) b[y * 9 + x] = 1
  return b
})()

/** 三个输入平面在窗口 (中心 (3,4)) 里的九个值：己 / 敌 / 色(轮己方=黑 → 整张 1)。 */
const WIN: number[][] = [
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
]
const wIdx = (filter: number, plane: number, i: number) =>
  (filter * 3 + plane) * 9 + i

export default function L04() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 4 课</div>
      <h1 className="text-2xl font-bold">加权求和：乘和加，不多不少</h1>

      <LessonGuide
        question="一张 3×3 小窗里，每个格子问一个问题、各得一个答案，9 个问题就是 9 个特征，机器怎样把它们合成一个能调节、能传给下一层的分数？"
        why="第 3 课只调过一个权重，学会了它怎样沿错误下降。真实判断要靠许多个特征；本课把一个变成九个，每个特征各配一个权重，看它们怎样合成一个分数。"
        chain={[
          "每个特征乘上自己的可调重要程度",
          "把九项贡献相加，得到一个数",
          "这个数可以原样交给下一层继续加工",
          "训练通过误差调整每个重要程度",
        ]}
        takeaway="乘法负责「这个特征算多重」，加法负责「把特征汇总」；本页只用九个特征的小题练清这条规则。"
        boundary="乘加是本模型选择的基础运算：权重数可控、易于叠层、硬件也擅长算。它不是在宣称其他数学运算都不能学习。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "看这张 3×3 小窗：对 9 个格子各问一遍「这个交叉点上有我的子吗」，9 个问题就是 9 个特征，答案各是 1 或 0。现在要用一个数概括这 9 个特征，用来判断「中间的三连值多少」。这个数要满足两点：每个特征的影响能单独调（第 3 课的权重），算完还能继续参与后续计算。你会选哪种运算？",
            options: [
              "排序取大：九个特征里挑最大的当分",
              "乘一乘再加起来：每个特征乘上自己的权重，九个乘积相加",
              "连乘：九个特征乘成一个积",
            ],
            answer: 1,
            explain:
              "选第二项：对应相乘再相加。每个特征各配一个权重，调哪一个权重，只改变它对应那个特征的贡献，互不干扰。这样合成的数简单、稳定，也能原样交给下一层继续加工。取最大只留一个特征，其余八个全丢；连乘让九个特征缠在一起，一处为零全盘归零，没法单独调。它们不是不能用，只是不适合当逐层学习的基础运算。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>从一对摊到九对</h3>
        <p>
          第 3 课把「特征 × 权重」缩到一对来看，那一个特征问的是「己方三连有几条」；
          本课把问题拆细：一扇 3×3 小窗里，每个格子问一遍「这个交叉点有子还是空、是谁的子」，
          九个格子九个问题。特征的单位没有变，一个问题、一个数字，变的只是问题的粗细：
          从一个全盘计数，换成九个细到格子的问题。9 个问题就是 9 个特征，
          配 9 个权重，每个特征值配一个权重，谁也不共用谁。
          严格说「是谁的子」要两个平面分工才答得清，本窗先取己方平面。
          这不是完整棋盘网络，是一道放大看的小题：看清「每个特征各有一个重要程度，
          再合成一个数」的规则，九项算清了，真实机器只是把同一规则用于更多输入。
        </p>
        <p>
          乘法负责定每个特征的重要程度。第 i 个特征写作
          <span className="mono">xᵢ</span>，它的权重写作 <span className="mono">wᵢ</span>。
          <span className="mono">wᵢ</span> 就是第 3 课那个 <span className="mono">w</span>，
          只是从一个变成了九个，每个管一个特征。第 3 课解决「这个权重往哪边调」，
          本课解决「九个怎样一起算出分数」。<span className="mono">wᵢ=1</span> 时原样通过，
          0 时完全压掉，0.5 时只留一半。权重为负时特征越大总分反而越低：
          不是重要程度更小，而是方向反了。
        </p>
        <p>
          特征的尺度也不必拉齐：计数类特征（取值 0、1、2、…）和 0/1 特征同台时，训练会自己抵消尺度差：
          同一个特征若整体放大 c 倍，进损失的只有乘积 wx：想让乘积不变，收敛后的 w 就缩到 1/c（忽略权重衰减时成立；权重衰减是第 3 课点名的那个把权重往零轻拽的机制）。
          这是收敛后的结果，不是初始状态；在此之前大尺度特征的梯度天然更大，早期更新被它主导。
          乘积 wᵢxᵢ 才是特征对结论的实际贡献。
        </p>
        <p>
          尺度差真正的代价落在训练上：损失梯度经链式带着 xᵢ 因子（与 ∂s/∂wᵢ 的区别见例 4-1 注），尺度差二十倍，两个权重的步子就差二十倍，
          共用一个学习率便两头难顾。损失地形沿大尺度方向更陡，学习率得按最陡方向的稳定上限来定，
          这个学习率对平缓方向就是龟速；反过来照顾平缓方向，大尺度方向就过冲振荡。
          稳定性与收敛速度对学习率的要求互相打架，衡量这件事的量叫条件数（见下方定义框）。
          对策有两道：输入端把特征整理到相近尺度（本项目的输入特征全是 0/1），
          层与层之间交给批标准化（见下方定义框）。
        </p>
        <Def term="条件数" en="condition number">
          损失地形曲率最大方向与最小方向之比（想象谷里横陡竖缓，曲率就是陡缓程度；马鞍形那种曲率有正有负的地方谈不上最陡与最缓之比，就不定义这件事），单位是「倍」。它衡量共用一个学习率时
          「两头难顾」的严重程度：条件数越大，按最陡方向定的学习率对平缓方向越慢。
          本项目输入特征全是 0/1，尺度已经拉齐。
        </Def>
        <Def term="批标准化" en="batch normalization" see="第 8 课">
          在层与层之间把数值拉回相近尺度的整理手续，用来压住尺度漂移。
        </Def>
        <p>
          加法负责把贡献汇总。九个乘积相加得到
          <span className="mono">s = w₁x₁ + w₂x₂ + … + w₉x₉</span>：
        </p>
        <Def term="加权和" en="weighted sum, dot product">
          每个特征乘上自己的权重、再把所有乘积相加的运算，亦称点积。它是这一层的答案，
          不必换算打包就能交给下一层当输入（参见：第 5 课），一层接一层传下去。交给下一层时，这个分数的角色就换了：它同样在回答一个固定的问题（「这九格合起来有多强」），因此它就是下一层眼里的一个特征值。同一串数字：在上一层是输出分数，在下一层是特征值。小下标只是编号，不是新的运算。
          <span className="mono">s</span> 是本层刚算出的分数；终局结果
          <span className="mono">z</span> 是训练章节会用到的标签，那局棋下完才知道。看到「点积」就读成：
          相同位置逐项相乘，再把乘积全部加起来。
        </Def>
        <p>
          这套做法的好处是每个权重只管自己那一项：<span className="mono">wᵢ</span> 调一点，
          总分改变多少正好由 <span className="mono">xᵢ</span> 决定，和第 3 课的规则一模一样，
          只是现在有九个各自独立。反向传播（第 3 课定义的算法名）要算的「每个权重各担多少错」，
          走的正是这条一目了然的路。
        </p>

        <h3>为什么是乘和加：线性的能耐与不能</h3>
        <p>
          朴素的乘加能用有限的权重把许多特征合成分数，容易并排、叠层，也很适合计算硬件。
          更复杂的互动不必硬塞进一层，可以交给多层「加权求和，再接一道非线性变换」去接力。
        </p>
        <Def term="线性" en="linear">
          只做乘加、不含其他运算的变换。它的局限是画不出会拐弯的分类边界
          （把「是 / 否」两类分开的线）：每个输入各走一条直线，权重为正时，输入涨、分数不跌；为负时，输入涨、分数不升，唯独不会先跌后涨。想要「敌、己两头分数都高、空 0 在中间」
          的 V 形，得让直线会拐弯。
        </Def>
        <p>
          例 4-2 把这条限制摆成一张图：横轴格子值用第 2 课的 ±1 记法（敌 −1、空 0、己 +1；那是格子的写法，不是本模型 0/1 的输入特征）。
          拖动权重把直线转到任何角度，仍只朝一个方向走。这不是权重数量的问题，是线性天生的单调性（monotonicity，
          直线只会朝一个方向走）。
        </p>
        <Def term="卷积核" en="kernel" see="第 6 课、第 7 课">
          专给一种局部棋形打分的权重表：一个 3×3 窗口 9 格 × 3 个输入平面 = 27 项，每项一个权重。
          例 4-1 滑杆换的就是不同的卷积核（本课只截取其中一个平面的 9 个权重来看）。
        </Def>
      </div>

      <VoteCounter />

      <MonotoneLine />

      <Ledger title="点积怎样进入真实网络第一层">
        <div className="codewalk">
          <pre>{`# model.py L32-36  第一层(stem):48 组「27 个乘积加成一个分」
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),  # 3 个输入平面进来，48 组 3×3×3 权重
    nn.BatchNorm2d(channels),                           # 批标准化(Batch Normalization,第 8 课):把数值拉回正常范围
    nn.ReLU(),                                          # 求和之后的非线性变换(第 5 课)
)`}</pre>
        </div>
        <p className="mt-3">
          本课程的演示权重里，<span className="mono">stem.0.weight</span> 的形状是 [48, 3, 3, 3]，
          即 <strong className="num">48 × 27 = 1296</strong> 个权重住在第一层。
          把形状 <span className="mono">[48,3,3,3]</span> 从右往左读：一个卷积核的 27 个权重
          算一次「27 项点积得到一个分」；演示模型有 48 个卷积核。合算可以分组看：三个平面各 9 项先各求一和，再把三个组和相加，与直接加 27 个乘积得到同一个数（例如 1.2 +（−0.3）+ 0.5 = 1.4）。
          代码里卷积核的个数叫<strong>通道数</strong>（参见：第 7 课），这里的 48 属于
          <strong>fast 演示配置</strong>，不是算法常数，默认配置是 64 通道。
          三个输入平面和滑动位置的展开（参见：第 6 课、第 7 课）不改变此处的计算；必须逐项吻合的真实计算，
          就是这 27 项点积。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "第 3 课的一对「特征 × 权重」摊成九对：每个特征值乘自己的权重，九个乘积相加得加权和（点积）。",
          "加权和是本层的答案，可以原样交给下一层；每个权重只影响自己那一项，梯度因此一目了然。",
          "只做乘加的变换叫线性；线性有单调性限制，画不出会拐弯的分类边界。",
        ]}
        next={
          <>
            下一课给线性补上会拐弯的能力：在加权求和之后插一道非线性变换（激活函数，最常用的是 ReLU）。
            两个镜像的折痕能拼出 V 形，「两头分数都高、中间安静」的形状由此可学；
            四个点的异或难题，就是被这样两道折痕切开的。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 5 课"
        onAllCorrect={() => pass("l04")}
        questions={[
          {
            q: "本模型为什么用「对应相乘再相加」做基础运算？",
            options: [
              "算得更快，硬件友好",
              "每个特征有自己的权重，贡献能清楚相加，便于逐层训练和堆叠",
              "因为乘法和加法是最早发明运算",
            ],
            answer: 1,
            explain:
              "关键不是「别的运算不可能学习」，而是这套基础运算很适合大量重复：每个特征有自己的可调重要程度，合成方式简单，层层叠起来也容易管理。硬件友好也是事实（边界句点过它），但那是顺带的好处，不是第一理由。它的梯度也清楚：某个权重改一点时，s 的变化速度恰好就是它对应的那个特征值 xᵢ（这个变化率的记号与链式计算见第 13 课）。",
          },
          {
            q: "权重从 +0.5 调到 −0.5，那个特征发生了什么？",
            options: [
              "影响从一半降到零",
              "反相：从「抬一半分」变成「压一半分」：负号是反向贡献，不是调小",
              "没有变化，只是符号习惯",
            ],
            answer: 1,
            explain:
              "权重按比例缩放特征，但调过 0 会反相：特征本身不变，它在总分里的角色从加分变成减分。",
          },
          {
            q: "线性的单调性(monotonicity：直线只会朝一个方向走，这是线性天生的限制)说的是什么？",
            options: [
              "输出永远不会变小",
              "每个输入各走一条直线：权重为正输入涨、分数不跌；权重为负输入涨、分数不升，唯独不会先跌后涨。「敌、己两头分数都高、空 0 在中间」的 V 形永远画不出",
              "权重只能取正值",
            ],
            answer: 1,
            explain:
              "负权重就是跌的，但那是条方向不变的直线。想要「先跌后涨」（敌 −1 和己 +1 两头分数都高、空 0 在中间）得让直线会拐弯（参见：第 5 课）。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 4-1 · 三输入加权求和演示：真权重，拖缩放系数 ============ */

/** 数字九宫格(cells 为字符串；on 给非零格上底色，hot 给负数标朱砂)。 */
function NumGrid9({ cells, on, hot }: { cells: string[]; on: boolean[]; hot?: boolean[] }) {
  return (
    <div className="l04-grid">
      {[0, 1, 2].map((r) => (
        <div key={r} className="l04-row">
          {[0, 1, 2].map((c) => {
            const i = r * 3 + c
            return (
              <span key={c} className={`l04-cell ${on[i] ? "on" : ""} ${hot?.[i] ? "hot" : ""}`}>
                <span className="num">{cells[i]}</span>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const fmt2 = (v: number) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(2)}`

function VoteCounter() {
  const [w, setW] = useState<WeightsJson | null>(null)
  const [filter, setFilter] = useState(0)
  const [k, setK] = useState(1) // 当前组的缩放：权重 × k

  useEffect(() => {
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [])

  const row = useMemo(() => {
    if (!w) return null
    const flat = w.tensors["stem.0.weight"]
    // 这里只拿真实卷积核的第一个输入平面，故意维持本课“9 个特征”的范围。
    // 三个输入平面的完整计算见第 6 课。
    const xs = WIN[0]
    const ws = Array.from({ length: 9 }, (_, i) => k * flat[wIdx(filter, 0, i)])
    const ps = ws.map((wv, i) => wv * xs[i])
    return { xs, ws, ps, sum: dot(ws, xs) }
  }, [w, filter, k])

  const total = row?.sum ?? 0

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 4-1 · 九个特征的加权求和演示：真实权重，亲手调整</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[15rem]" data-qa="counter-board">
          <Board board={BOARD81} lastMove={{ x: 3, y: 4 }} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            教具摆出的三连（黑棋三颗、轮黑走；这是照教学需要摆的局面，不是轮流下出来的）。这里的「己方」就是黑方。想象一个 3×3 的方框罩住正中间那颗子：框里九个点，
            就是九个特征。右边把<strong>一个输入平面</strong>（参见：第 6 课）
            的窗口值、九个权重和九个乘积并排；
            一格对一格地乘。数字发红、加粗的那些是负数，它们的贡献是反向的。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                浏览器复现 · 换一个导出的真实卷积核：第 <span className="num">{filter + 1}</span> 个
              </div>
              <input type="range" min={0} max={47} step={1} value={filter}
                onChange={(e) => setFilter(Number(e.target.value))} aria-label="卷积核编号"
                style={{ ["--fill" as string]: `${(filter / 47) * 100}%` }}
                data-qa="filter-slider" />
            </div>
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                这组权重 × k:<span className="num">{k.toFixed(1)}</span>
              </div>
              <input type="range" min={-2} max={2} step={0.1} value={k}
                onChange={(e) => setK(Number(e.target.value))} aria-label="这组权重缩放"
                style={{ ["--fill" as string]: `${((k + 2) / 4) * 100}%` }}
                data-qa="volume-slider" />
            </div>
          </div>

          {!row ? (
            <p className="mt-4 text-sm" style={{ color: "var(--fg-muted)" }}>
              正在加载真权重(weights-best.json，约 1.2 MB)……
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2" data-qa="counter-rows">
                <span className="w-14 flex-none text-xs" style={{ color: "var(--fg-faint)" }}>
                  输入平面
                </span>
                <NumGrid9 cells={row.xs.map((v) => (v === 1 ? "1" : "0"))}
                  on={row.xs.map((v) => v !== 0)} />
                <span style={{ color: "var(--fg-faint)" }}>×</span>
                <NumGrid9 cells={row.ws.map(fmt2)} on={row.ws.map((v) => Math.abs(v) > 0.005)}
                  hot={row.ws.map((v) => v < 0)} />
                <span style={{ color: "var(--fg-faint)" }}>=</span>
                <NumGrid9 cells={row.ps.map(fmt2)} on={row.ps.map((v) => Math.abs(v) > 0.005)}
                  hot={row.ps.map((v) => v < 0)} />
              </div>
              <div className="reveal-box mt-4">
                <p className="num">
                  加权和 s = 9 个乘积相加 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }} data-qa="counter-sum">
                    {total.toFixed(3)}
                  </strong>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  拖缩放系数看三件事：① k=0 这组输出归零，k 拖过 0，总分正负号掉头（反相）。
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  ② 你一拖，权重全变，「窗口值」一列纹丝不动。这一列
                  正好是每个权重的局部变化率（不是第 3 课定义的损失梯度；损失对 wᵢ 的梯度还要再乘损失对 s 的变化率，参见：第 13 课）：调整 wᵢ 时，s 的变化速度恰好等于 xᵢ
                  （记作 ∂s/∂wᵢ = xᵢ，∂ 就读作「对…的变化速度」）。∂s/∂wᵢ = xᵢ
                  里没有 wᵢ，所以权重调多大，∂s/∂wᵢ 都不变。
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  ③ 哪一格窗口值是 0，它对应的乘积必是 0：那个特征取了 0，就不会给分；它对应的权重也收不到梯度（∂s/∂wᵢ=xᵢ=0），但这不代表该权重没用：别的样本会教（权重共享时一个权重还受许多位置供养，见第 7 课），只是这一条样本教不了。
                  只有某特征处处恒为 0 时，该权重才收不到任何样本梯度，只有权重衰减会把它慢慢拽向 0。这样的特征叫死特征，它的权重等于白带着。
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                这 9 个权重不是编的：它们是{" "}
                <span className="mono">weights-best.json</span> 里{" "}
                <span className="mono">stem.0.weight</span> 第 {filter + 1} 个卷积核的己方平面真值
                （训练学出来的）。同类卷积核会各学各的局部反应。
                现在先把一个输入平面的九项加权求和练熟。
              </p>
            </>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 4-1</span>
        <strong>浏览器复现：</strong>导出的真实权重经过五位小数舍入；这里截取其中一个输入平面的九项，
        与窗口值逐项相乘再相加。
        本课先练熟「每个特征各有自己的贡献，一条条加起来」的
        基本运算。真网络里每个权重各自调，那正是训练干的活。
      </figcaption>
    </figure>
  )
}

/* ============ 例 4-2 · 线性的单调性：直线画不出 V ============ */

const MW = 280, MH = 168, MPL = 34, MPR = 10, MPT = 26, MPB = 30
const mxOf = (t: number) => MPL + ((t + 1) / 2) * (MW - MPL - MPR) // t∈[−1,1]
const myOf = (zv: number) => MH - MPB - ((zv + 2) / 4) * (MH - MPT - MPB) // s∈[−2,2]

function MonotoneLine() {
  const [w, setW] = useState(1)

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 4-2 · 线性的单调性：直线只会朝一个方向走</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${MW} ${MH}`} data-qa="mono-chart"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 320 }}>
            {/* z=0 横轴与 x 轴 */}
            <line x1={MPL} y1={myOf(0)} x2={MW - MPR} y2={myOf(0)}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            <line x1={mxOf(0)} y1={MPT} x2={mxOf(0)} y2={MH - MPB}
              style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
            {/* 轴标签：竖轴是分 s,横线是 0 */}
            <text x={2} y={14} fontSize={9} className="num"
              style={{ fill: "var(--fg-faint)" }}>分 s</text>
            <text x={MPL - 6} y={myOf(0) + 3} fontSize={9} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>0</text>
            {/* 格子值刻度：敌 / 空 / 己 */}
            {[-1, 0, 1].map((t) => (
              <text key={t} x={mxOf(t)} y={MH - MPB + 14} fontSize={10} textAnchor="middle"
                style={{ fill: "var(--fg-faint)" }}>
                {t === -1 ? "敌 −1" : t === 0 ? "空 0" : "己 +1"}
              </text>
            ))}
            <text x={MW - MPR} y={MH - MPB + 14} fontSize={9} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>格子值 x</text>
            {/* 想要的 V 形：s=|x|(敌、己都分数高，空 0 安静) */}
            <polyline points={`${mxOf(-1)},${myOf(1)} ${mxOf(0)},${myOf(0)} ${mxOf(1)},${myOf(1)}`}
              fill="none" strokeDasharray="5 4" style={{ stroke: "var(--fg-faint)" }}
              strokeWidth={1.6} />
            <text x={mxOf(0.62)} y={myOf(0.86)} fontSize={9.5} style={{ fill: "var(--fg-faint)" }}>
              想要的：敌、己都分数高，空 0 安静
            </text>
            {/* 当前的直线 s = w·x */}
            <line x1={mxOf(-1)} y1={myOf(-w)} x2={mxOf(1)} y2={myOf(w)}
              style={{ stroke: "var(--accent)" }} strokeWidth={2.4} data-qa="mono-line" />
            {[-1, 0, 1].map((t) => (
              <circle key={t} cx={mxOf(t)} cy={myOf(w * t)} r={4.5}
                style={{ fill: "var(--accent-deep)" }} />
            ))}
          </svg>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[18rem]">
          <div className="mini-label">权重 w(−2 → 2)</div>
          <input type="range" min={-2} max={2} step={0.1} value={w}
            onChange={(e) => setW(Number(e.target.value))} aria-label="w 滑杆"
            style={{ ["--fill" as string]: `${((w + 2) / 4) * 100}%` }}
            data-qa="mono-slider" />
          <div className="reveal-box mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>格子值 x</th>
                  <th>敌 −1</th>
                  <th>空 0</th>
                  <th>己 +1</th>
                </tr>
              </thead>
              <tbody className="num">
                <tr>
                  <td>分 s = w·x</td>
                  <td style={{ color: "var(--accent-deep)" }}>{fmt2(-w)}</td>
                  <td>0.00</td>
                  <td style={{ color: "var(--accent-deep)" }}>{fmt2(w)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              {w > 0
                ? "w 为正：己的分变高、敌的分变低，「空」永远夹在中间。"
                : w < 0
                  ? "w 为负：反相了：敌高己低，「空」还是夹在中间。"
                  : "w 为 0：整条线水平，输出全为 0。"}
              拖到任何值，那条线都是直的：<strong>「先跌后涨」的 V 形，线性永远画不出</strong>。想要它，得让直线会拐弯。
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            三个点就是同一条直线上 x=−1、0、+1 三处：格子的三种取值被约束在同一条
            数轴（就是图里那条标好数的横线），s 只能沿直线走。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 4-2</span>
        每个输入各走一条直线：权重为正输入涨它不跌、为负输入涨它不升，唯独不会
        先跌后涨。想要的「敌、己两头分高、空 0 安静」，直线画不出。
        直线的「直」是乘加的内在性质。
      </figcaption>
    </figure>
  )
}
