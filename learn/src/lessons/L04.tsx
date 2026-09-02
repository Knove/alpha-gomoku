/** 第 4 课 · 计票:乘和加,不多不少(地基篇 2/4)。
 *  节拍:谜题(九份证据怎么并成一个分)→ 揭晓(乘=音量/加=累加+账目分明/
 *  为什么不加别的/点积·矩阵/收尾命名「线性」)→
 *  部件 1(三证人计票器:真权重 stem.0.weight 一组 27 个,拖音量看乘积与账单)→
 *  部件 2(必单调:直线画不出 V)→ 对账(model.py stem 预告式)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board from "../lib/board"
import { dot } from "../lib/foundations"
import { loadWeights } from "../lib/weights"
import type { WeightsJson } from "../engine/model"

/* 教学局面(全站同一手):己方三连 (2,4)(3,4)(4,4),轮己方走。
 * 计票窗口罩在三连正中 (3,4)——三张面的窗口值全在此。 */
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

/** 三张面在窗口 (中心 (3,4)) 里的九个值:己 / 敌 / 色(轮己方=黑 → 整张 1)。 */
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
      <h1 className="text-2xl font-bold">计票:乘和加,不多不少</h1>

      <LessonGuide
        question="一小块棋盘里有很多证据时，机器怎样把它们合成一个可学习的判断？"
        why="第 3 课有了旋钮，却还没说明旋钮怎样参与计算。这里先回答最小的问题：许多证据怎样合成一个能被旋钮调节的分数。"
        chain={[
          "每份证据乘上自己的可调重要程度",
          "把贡献相加，得到一个特征分数",
          "许多分数经过弯折和叠层，形成更复杂的棋形判断",
          "训练通过误差调整每个重要程度",
        ]}
        takeaway="乘法负责“这份证据有多响”，加法负责“把证据汇总”；本页只用九项显微镜练清这条规则。"
        boundary="乘加是本模型选择的基础积木：参数量可控、易于叠层、硬件也擅长算。它不是在宣称其他数学运算都不能学习。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "本课把一张 3×3 平面缩成九份证据。这个模型要把它们合成一个可反复堆叠、可训练的特征分，选哪种基础积木？",
            options: [
              "排序取大:九份证据里挑最大的当分",
              "乘一乘再加起来:每份证据乘上自己的权重,九个乘积相加",
              "连乘:九份证据乘成一个积",
            ],
            answer: 1,
            explain:
              "本模型选“对应相乘再相加”。每份证据都有自己的旋钮，合成规则简单、可以堆很多层，也方便训练逐项调整。排序、连乘等运算并非绝对不能用；只是它们会更容易丢掉信息、让不同证据强烈耦合，或增加实现和训练的负担，不是这里的基础积木。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 先给每份证据定音量，再把它们相加</h3>
        <p>
          <strong>先说范围。</strong>下面只看<strong>一张</strong> 3×3 小窗，所以有 9 份证据。
          这不是完整棋盘网络，只是一把显微镜：先看清“每份证据各有一个重要程度，再合成一个分”
          的规则。真实机器会把同一规则用于更多输入；现在先把九项算清。
        </p>
        <p>
          <strong>乘法 = 每份证据的音量。</strong>第 i 份证据写作
          <span className="mono">xᵢ</span>，它的旋钮写作 <span className="mono">wᵢ</span>。
          <span className="mono">wᵢ=1</span> 时原样通过，0 时不出声，0.5 时只响一半。
          旋钮若为负，证据越强，总分反而越低——不是“音量更小”，而是它在唱反调。
        </p>
        <p>
          <strong>加法 = 把贡献汇总。</strong>九个乘积相加，得到一个特征分数：
          <span className="mono">s = w₁x₁ + w₂x₂ + … + w₉x₉</span>。小下标只是编号，
          不是新的运算。<span className="mono">s</span> 是这一层刚算出的分数，和第 3 课的
          终局答案 <span className="mono">z</span> 不是一回事。
        </p>
        <p>
          这套做法的好处是，每个旋钮只管自己那一项：把 <span className="mono">wᵢ</span>
          调一点，总分改变多少，正好由 <span className="mono">xᵢ</span> 决定。这会给后面的
          “责任怎么回摊”留下一条清楚的路。对应相乘再相加有个名字，叫<em>点积</em>；
          不必死记，见到它时只要认出“逐项计票”。
        </p>
        <p>
          为什么先选这样朴素的积木？它能用有限的旋钮把许多证据合成分数，容易并排、
          叠层，也很适合计算硬件。更复杂的互动不必硬塞进一层：后面让多层“计票 → 弯折”
          接力去组合。只做乘加的这一层叫<em>线性</em>；它有局限——单靠它画不出会拐弯的
          分类边界。下一课正是为这条限制补上一道折痕。
        </p>
      </div>

      <VoteCounter />

      <MonotoneLine />

      <Ledger title="想深挖 · 这条计票规则后来怎样进入真实第一层">
        <div className="codewalk">
          <pre>{`# model.py L32-36  第一层(stem):48 组「27 个乘积加成一个分」
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),  # 3 张面进来,48 组 3×3 权重
    nn.BatchNorm2d(channels),                           # 校准数值的稳定器(第 8 课)
    nn.ReLU(),                                          # 求和之后的弯折(第 5 课)
)`}</pre>
        </div>
        <p className="mt-3">
          本课程演示权重里，<span className="mono">stem.0.weight</span> 的形状是 [48, 3, 3, 3]——
          <strong className="num">48 × 27 = 1296</strong> 个旋钮住在第一层。
          这一层的详细形状先不用记。到第 6 课，你会看到三张输入面；到第 7 课，
          会看到模板如何在棋盘上滑动。那时再回来读这一段：演示快照的每个模板其实会把
          3 张 3×3 面的 27 个乘积加成一个分。这里的 48 只是这份演示权重的配置，
          不同训练可以改。BN 和 ReLU 也各有专门的一课。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 5 课"
        onAllCorrect={() => pass("l04")}
        questions={[
          {
            q: "本模型为什么用“对应相乘再相加”做基础计票？",
            options: [
              "算得更快,硬件友好",
              "每份证据有自己的旋钮，贡献能清楚相加，便于训练和叠层；排序、连乘也能用于别处，但不是这里兼顾简单、稳定和可扩展性的基础积木",
              "因为乘法和加法是最早发明运算",
            ],
            answer: 1,
            explain:
              "关键不是“别的运算不可能学习”，而是这套基础积木很适合大量重复：每项有自己的可调重要程度，合成方式简单，层层叠起来也容易管理。它的方向账也清楚：某个旋钮改一点时，先看它对应的那份证据；第 11 课会把这条思路接回整张网络。",
          },
          {
            q: "权重从 +0.5 拧到 −0.5,那份证据发生了什么?",
            options: [
              "音量从一半调到零",
              "反相:从「抬一半分」变成「压一半分」——负号是唱反调,不是调小",
              "没有变化,只是符号习惯",
            ],
            answer: 1,
            explain:
              "乘是音量旋钮,但拧过 0 会反相:证据本身不变,它在总分里的角色从帮腔变成拆台。第 6 课会看到，把己方和对方拆到不同输入面，能避免让一个简单模板把两种事实混在同一次求和里。",
          },
          {
            q: "必单调(线性天生的限制)说的是什么?",
            options: [
              "输出永远不会变小",
              "每个输入各走一条直线:权重为正输入涨它不跌、权重为负输入涨它不升,唯独不会先跌后涨——「敌、己两头都报警、空 0 在中间」的 V 形永远画不出",
              "权重只能取正值",
            ],
            answer: 1,
            explain:
              "注意别读成「输出永远涨」:负权重就是跌的——但那是条方向不变的直线。想要「先跌后涨」(敌 −1 和己 +1 两头都报警、空 0 在中间)得让直线会拐弯,那是第 5 课弯折的事。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 4-1 · 三证人计票器:真权重,拖音量 ============ */

/** 数字九宫格(cells 为字符串;on 给非零格上底色,hot 给负数标朱砂)。 */
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
  const [k, setK] = useState(1) // 整层音量:权重 × k

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
    // 这里只拿真实模板的第一张教学面，故意维持本课“9 份证据”的范围。
    // 三张输入面为何存在、怎样一起算，留到第 6 课再完整揭晓。
    const xs = WIN[0]
    const ws = Array.from({ length: 9 }, (_, i) => k * flat[wIdx(filter, 0, i)])
    const ps = ws.map((wv, i) => wv * xs[i])
    return { xs, ws, ps, sum: dot(ws, xs) }
  }, [w, filter, k])

  const total = row?.sum ?? 0

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 九份证据计票器:真权重,亲手拧音量</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[15rem]" data-qa="counter-board">
          <Board board={BOARD81} lastMove={{ x: 4, y: 4 }} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            教学局面的三连。想象一个 3×3 的方框罩住正中间那颗子：框里九个点，
            就是九份证据。右边把<strong>一张教学面</strong>的窗口值、九个权重和九个乘积并排；
            一格对一格地乘。数字发红、加粗的那些是负数——它们在唱反调。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                换一组真实权重（不必记总数）:第 <span className="num">{filter + 1}</span> 组
              </div>
              <input type="range" min={0} max={47} step={1} value={filter}
                onChange={(e) => setFilter(Number(e.target.value))} aria-label="模板编号"
                style={{ ["--fill" as string]: `${(filter / 47) * 100}%` }}
                data-qa="filter-slider" />
            </div>
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                整层音量 k(权重 × k):<span className="num">{k.toFixed(1)}</span>
              </div>
              <input type="range" min={-2} max={2} step={0.1} value={k}
                onChange={(e) => setK(Number(e.target.value))} aria-label="音量"
                style={{ ["--fill" as string]: `${((k + 2) / 4) * 100}%` }}
                data-qa="volume-slider" />
            </div>
          </div>

          {!row ? (
            <p className="mt-4 text-sm" style={{ color: "var(--fg-muted)" }}>
              正在加载真权重(weights-best.json,约 1.2 MB)……
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2" data-qa="counter-rows">
                <span className="w-14 flex-none text-xs" style={{ color: "var(--fg-faint)" }}>
                  教学面
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
                  教学分 s = 9 个乘积相加 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }} data-qa="counter-sum">
                    {total.toFixed(3)}
                  </strong>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  拖音量看三件事：① k=0 整层静音，k 拖过 0，总分正负号掉头
                  (反相);② 你一拖,权重全变,「窗口值」一列纹丝不动。这一列
                  正好就是每个权重的账 ∂s/∂wᵢ = xᵢ——账里没有 w,拧多大声
                  都不变；③ 哪一格窗口值是 0，它对应的乘积就是 0，说明没有证据就不会给分。
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                这 9 个权重不是编的：它们是{" "}
                <span className="mono">weights-best.json</span> 里{" "}
                <span className="mono">stem.0.weight</span> 第 {filter + 1} 组其中一张面的真值
                （训练拧出来的）。同类权重组会各学各的局部反应；第 6 课会把完整的输入面接回来，
                现在先把一张面的九项计票练熟。
              </p>
            </>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 4-1</span>
        一张教学面的真权重 × 九个窗口值：乘积（音量×证据）再相加（累加）。
        第 6 课会把三张输入面接回同一模板；本课先练熟“每份证据各有分量，一张张加起来”的
        基本计票。真网络里每个权重各自拧，那正是训练干的活。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 4-2 · 必单调:直线画不出 V ============ */

const MW = 280, MH = 168, MPL = 34, MPR = 10, MPT = 26, MPB = 30
const mxOf = (t: number) => MPL + ((t + 1) / 2) * (MW - MPL - MPR) // t∈[−1,1]
const myOf = (zv: number) => MH - MPB - ((zv + 2) / 4) * (MH - MPT - MPB) // z∈[−2,2]

function MonotoneLine() {
  const [w, setW] = useState(1)

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 必单调:一条直线的能耐与不能</span>
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
            {/* 轴标签:竖轴是分 s,横线是 0 */}
            <text x={2} y={14} fontSize={9} className="num"
              style={{ fill: "var(--fg-faint)" }}>分 s</text>
            <text x={MPL - 6} y={myOf(0) + 3} fontSize={9} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>0</text>
            {/* 格子值刻度:敌 / 空 / 己 */}
            {[-1, 0, 1].map((t) => (
              <text key={t} x={mxOf(t)} y={MH - MPB + 14} fontSize={10} textAnchor="middle"
                style={{ fill: "var(--fg-faint)" }}>
                {t === -1 ? "敌 −1" : t === 0 ? "空 0" : "己 +1"}
              </text>
            ))}
            <text x={MW - MPR} y={MH - MPB + 14} fontSize={9} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>格子值 x</text>
            {/* 想要的 V 形:z=|x|(敌、己都报警,空安静) */}
            <polyline points={`${mxOf(-1)},${myOf(1)} ${mxOf(0)},${myOf(0)} ${mxOf(1)},${myOf(1)}`}
              fill="none" strokeDasharray="5 4" style={{ stroke: "var(--fg-faint)" }}
              strokeWidth={1.6} />
            <text x={mxOf(0.62)} y={myOf(0.86)} fontSize={9.5} style={{ fill: "var(--fg-faint)" }}>
              想要的:敌、己都报警,空安静
            </text>
            {/* 当前的直线 z = w·x */}
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
                ? "w 为正:己的分变高、敌的分变低——「空」永远夹在中间。"
                : w < 0
                  ? "w 为负:反相了——敌高己低,「空」还是夹在中间。"
                  : "w 为 0:整条线躺平,谁都静音。"}
              拖到任何值,那条线都是直的:<strong>「先跌后涨」的 V 形,线性永远画不出</strong>
              ——想要它,得让直线会拐弯(第 5 课)。
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            三个点就是同一条直线上 x=−1、0、+1 三处:格子的三种身份被钉上同一条
            数轴(就是图里那条标好数的横线),s 只能沿直线走。这个「钉」的
            代价，第 6 课再来算总账。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 4-2</span>
        每个输入各走一条直线:权重为正输入涨它不跌、为负输入涨它不升,唯独不会
        先跌后涨。图里那句「报警」=分蹿高:敌、己两头的分高,空 0 安静。
        直线的「直」,是乘加的命;弯折是第 5 课的活。
      </figcaption>
    </figure>
  )
}
