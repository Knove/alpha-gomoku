/** 第 4 课 · 加权求和：乘和加，不多不少(地基篇 2/3)。
 *  节拍：思考题 → 正文(九对配对/加权和/线性的能耐与不能，定义框命名，落点码 dot/linGrad/stem)→
 *  例 4-1(教学卷积核起步，可切换真实训练核)→
 *  例 4-2(线性的单调性：直线画不出 V)→ 交付物与验证 → 小结与预告 → 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { EvidenceCard } from "../framework/evidence"
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
        takeaway="你能按「乘法定每个特征的重要程度、加法做汇总」手算任意窗口的点积，并认出它在真实第一层（stem）里的写法。"
        boundary="本课聚焦乘加这一种基础运算：它让权重数可控、方便逐层组合，也便于训练分别调整每个权重。"
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
              "选第二项：对应相乘再相加。每个特征各配一个权重，调哪一个权重，只改变它对应那个特征的贡献，互不干扰。这样合成的数简单、稳定，也能原样交给下一层继续加工。取最大只留一个特征，其余八个全丢；连乘让九个特征缠在一起，一处为零全盘归零，没法单独调。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>1. 一个格子一个特征，一个特征一个权重</h3>
        <p>
          把 3×3 小窗里的九个交叉点摊开看：每个点问一句「这里有没有我的子」，
          答案是 <span className="mono">1</span> 或 <span className="mono">0</span>。
          九个答案就是九个特征，每个特征配一个自己的权重。
        </p>
        <p>
          先给一张能徒手核对的横三连核：中间一行三个权重是 1，其余是 0。
          窗口里正好三颗己方子，于是三个 <span className="mono">1×1</span> 相加，得分是 3。
        </p>
      </div>

      <VoteCounter />

      <div className="prose mt-12">
        <h3>2. 点积：九份贡献汇成一个分数</h3>
        <p>
          计算公式只有两步：对应位置先相乘，再把九个乘积相加。
          第 <span className="mono">i</span> 个特征记作 <span className="mono">xᵢ</span>，
          它的权重记作 <span className="mono">wᵢ</span>；这个加权和就是这一层的输出。
        </p>
        <div className="formula">
          s = <span className="hl">w₁x₁</span> + w₂x₂ + … + w₉x₉
        </div>
        <Def term="加权和" en="weighted sum, dot product">
          每个特征乘上自己的权重，再把所有乘积相加，也叫点积。
          权重为 1 时原样通过，为 0 时贡献归零，为负数时把分数往反方向推。
          下一层会把这里的输出 <span className="mono">s</span> 当作新的输入特征。
        </Def>
        <EvidenceCard
          fidelity="constructed"
          title="逐项相乘再累加得到点积"
          source="learn/src/lib/foundations.ts · dot"
        >
          <div className="codewalk">
            <pre>{`export function dot(ws: readonly number[], xs: readonly number[]): number {
  let s = 0
  for (let i = 0; i < ws.length; i++) s += ws[i] * xs[i]
  return s
}`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          循环每转一圈只处理一对 <span className="mono">ws[i]</span> 与 <span className="mono">xs[i]</span>：
          乘法决定这一格贡献多少，加法把九格汇总成一个数。
        </p>

        <h3>3. 只会乘加，就画不出 V 形</h3>
        <p>
          乘加能并行处理很多特征，也方便一层层叠加。但它有一个硬限制：
          每个输入对总分的影响方向固定，直线不会先降后升。
          棋盘想要的却是「敌方 −1 和己方 +1 都该得高分，空位 0 保持低分」，
          也就是一个 V 形。
        </p>
        <Def term="线性" en="linear">
          只做乘加、不含其他变换的运算。它的分界线永远是直线：
          权重为正时，输入涨、分数不会跌；权重为负时方向相反，但也不会折返。
          因此 V 形、异或这类「先跌后涨」的形状，靠一层线性运算画不出来。
        </Def>
      </div>

      <MonotoneLine />

      <Ledger title="alphagomoku/model.py · AlphaGomokuNet.__init__ 的 stem">
        <p className="mb-3">
          真实网络把同一条规则扩大到 3 张输入平面。第一层 <span className="mono">stem</span> 用
          3×3×3 的卷积核，一次做 27 项加权和；演示配置并排 48 个卷积核，
          因而第一层共有 <strong className="num">48 × 27 = 1296</strong> 个权重。
        </p>
        <div className="codewalk">
          <pre>{`        self.stem = nn.Sequential(
            nn.Conv2d(3, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )`}</pre>
        </div>
        <ul className="ml-5 list-disc">
          <li>本课只取其中一个卷积核的己方平面，先把 9 项点积算熟。</li>
          <li>运行 <span className="mono">npm test</span> 核对 <span className="mono">dot</span>；运行 <span className="mono">pytest tests/test_model.py::test_forward_shapes_and_ranges</span> 核对真实形状。</li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "第 3 课的一对「特征 × 权重」摊成九对：每个特征值乘自己的权重，九个乘积相加得加权和（点积）。",
          "加权和是本层的答案，可以原样交给下一层；每个权重只影响自己那一项，梯度因此一目了然。",
          "只做乘加的变换叫线性；线性有单调性限制，画不出会拐弯的分类边界。",
        ]}
        next={
          <>
            下一课给线性补上会拐弯的能力：在加权求和之后插一道非线性变换，正式名叫激活函数；
            最常用的叫线性整流单元（Rectified Linear Unit，缩写 ReLU）。
            两个镜像的折痕能拼出 V 形，「两头分数都高、中间安静」的形状由此可学；
            四个点的异或难题，就是被这样两道折痕切开的。
          </>
        }
      />

      <Quiz
        title="习题"
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
              "这套基础运算很适合大量重复：每个特征有自己的可调重要程度，合成方式简单，层层叠起来也容易管理。硬件友好是顺带的好处，不是第一理由。自己实现时必须逐项吻合的就是「对应相乘、再全部相加」这条规则。",
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
              "负权重就是跌的，但那是条方向不变的直线。想要「先跌后涨」（敌 −1 和己 +1 两头分数都高、空 0 在中间），得让直线会拐弯。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 4-1 · 九格加权和：教学核与真实训练核 ============ */

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
const TEACHING_KERNEL = [0, 0, 0, 1, 1, 1, 0, 0, 0]

function VoteCounter() {
  const [w, setW] = useState<WeightsJson | null>(null)
  const [mode, setMode] = useState<"teaching" | "real">("teaching")
  const [filter, setFilter] = useState(0)

  useEffect(() => {
    if (mode !== "real" || w) return
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [mode, w])

  const row = useMemo(() => {
    const xs = WIN[0]
    if (mode === "teaching") {
      const ws = TEACHING_KERNEL
      const ps = ws.map((wv, i) => wv * xs[i])
      return { xs, ws, ps, sum: dot(ws, xs) }
    }
    if (!w) return null
    const flat = w.tensors["stem.0.weight"]
    const ws = Array.from({ length: 9 }, (_, i) => flat[wIdx(filter, 0, i)])
    const ps = ws.map((wv, i) => wv * xs[i])
    return { xs, ws, ps, sum: dot(ws, xs) }
  }, [mode, w, filter])

  const teaching = mode === "teaching"

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="mini-label">例 4-1 · 九个特征怎样汇成一个分数</span>
          <span className="seg" data-qa="kernel-mode">
            <button type="button" className={`seg-btn ${teaching ? "active" : ""}`}
              onClick={() => setMode("teaching")}>教学核</button>
            <button type="button" className={`seg-btn ${!teaching ? "active" : ""}`}
              onClick={() => setMode("real")}>真实训练核</button>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[15rem]" data-qa="counter-board">
          <Board board={BOARD81} lastMove={{ x: 3, y: 4 }} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            3×3 方框罩住三连正中，框里九个点就是九个特征。
            右边把它们逐格乘以权重，再加起来。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          {teaching ? (
            <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              横三连核只看中间一行：三个 <span className="mono">1</span> 对上三颗己方子，
              贡献 <span className="mono">1+1+1=3</span>；其余六格权重为 0，不投票。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-[14rem] flex-1">
              <div className="mini-label">
                导出的真实卷积核：第 <span className="num">{filter + 1}</span> 个
              </div>
              <input type="range" min={0} max={47} step={1} value={filter}
                onChange={(e) => setFilter(Number(e.target.value))} aria-label="卷积核编号"
                style={{ ["--fill" as string]: `${(filter / 47) * 100}%` }}
                data-qa="filter-slider" />
            </div>
            </div>
          )}

          {!row ? (
            <p className="mt-4 text-sm" style={{ color: "var(--fg-muted)" }}>
              正在加载真权重(weights-best.json，约 1.2 MB)……
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2" data-qa="counter-rows">
                <span className="w-10 flex-none text-xs" style={{ color: "var(--fg-faint)" }}>
                  窗口
                </span>
                <NumGrid9 cells={row.xs.map((v) => (v === 1 ? "1" : "0"))}
                  on={row.xs.map((v) => v !== 0)} />
                <span style={{ color: "var(--fg-faint)" }}>×</span>
                <NumGrid9 cells={row.ws.map((v) => (teaching ? String(v) : fmt2(v)))}
                  on={row.ws.map((v) => Math.abs(v) > 0.005)}
                  hot={row.ws.map((v) => v < 0)} />
                <span style={{ color: "var(--fg-faint)" }}>=</span>
                <NumGrid9 cells={row.ps.map((v) => (teaching ? String(v) : fmt2(v)))}
                  on={row.ps.map((v) => Math.abs(v) > 0.005)}
                  hot={row.ps.map((v) => v < 0)} />
              </div>
              <div className="reveal-box mt-4">
                <p className="num">
                  加权和 s ={" "}
                  <strong style={{ color: "var(--accent-deep)" }} data-qa="counter-sum">
                    {row.sum.toFixed(teaching ? 0 : 3)}
                  </strong>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {teaching
                    ? "三份 1 分相加得 3。改成真实训练核后，权重会变成连续小数，有正有负。"
                    : `第 ${filter + 1} 个核是训练学出来的 9 个小数；红色负权重会把对应格子的贡献往反方向拉。`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 4-1</span>
        {teaching
          ? "教学核让结果一眼可算：三个 1×1 相加得 3。"
          : `真实权重取自 weights-best.json 的 stem.0.weight 第 ${filter + 1} 个核（己方平面）。`}
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
