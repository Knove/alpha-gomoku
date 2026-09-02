/** 第 7 课 · 模板:会滑的检测器。
 *  节拍:谜题(常识怎么白送)→ 揭晓(模板=3×3 加权求和 / 同一张扫全盘=权重共享 /
 *  为什么 3×3 / 48 张是训练拧出来的)→ 部件 1(滑窗 + 扫全盘热力图,conv2d 真算)→
 *  部件 2(真模板墙:weights-best.json 前 8 张)→ 对账(model.py L33)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { MiniGrid9 } from "../lib/minigrid"
import { conv2d, type Tensor } from "../engine/nn"
import type { WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 横三连模板(同 L07 三张平面课):中间一行 1 1 1。 */
const TEMPLATE = [0, 0, 0, 1, 1, 1, 0, 0, 0]
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

/** 81 个窗口得分:真引擎 conv2d(与 model.py stem 同一算子,pad=1 界外补 0)。 */
const SCORES: number[] = (() => {
  const own: Tensor = { data: Float64Array.from(OWN81), shape: [1, 9, 9] }
  const tmpl: Tensor = { data: Float64Array.from(TEMPLATE), shape: [1, 1, 3, 3] }
  return Array.from(conv2d(own, tmpl, null, 1).data)
})()

export default function L08() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 7 课</div>
      <h1 className="text-2xl font-bold">模板:会滑的检测器</h1>

      <LessonGuide
        question="机器怎样在棋盘每个位置都寻找同一种局部棋形，而不用把同一条棋理学 81 遍？"
        why="三张平面只是把棋盘摆好；网络还需要一套方法，在任意位置发现“这里像三连”“那里像威胁”这样的局部图案。"
        chain={[
          "一个 3×3 模板为局部格子分别打分",
          "同一模板滑过全盘，处处产生一张得分地图",
          "同一套数字在各位置共用，避免重复学习",
          "许多训练得到的模板一起工作，提供后续层需要的证据",
        ]}
        takeaway="结构只预先给出“棋形是局部的、同一棋形可在各处出现”；模板具体长什么样、各格多重要，仍由训练决定。"
        boundary="模板不是人手写的“见三连就堵”规则。它只是可学习的局部检测器，真正的走法还要靠更深的网络和搜索。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "不用人手写“见三连就堵”的规则，仍能让网络少走弯路。结构最适合先白送它什么？",
            options: [
              "多喂棋谱:见的局面够多,自然就悟出来了",
              "把“棋形常由附近格子组成、同一种棋形会在各处出现”砌进结构：让可学习模板在全盘滑动",
              "手写一条规则代码:「见到三连就堵」",
            ],
            answer: 1,
            explain:
              "选第二项。结构没有白送“哪种棋形一定该堵”这条棋理；它只白送两项常识：棋形先看附近格子，同一种局部图案无论出现在何处都该用同一套检测方式。模板具体长什么样、发现后有多重要，仍由训练决定。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 模板、扫描，以及为什么先看小窗口</h3>
        <p>
          <strong>① 模板是什么。</strong>一张 3×3 的九个数,盖在棋盘某个 3×3 的小窗上,
          对应格子相乘、九个乘积相加(第 4 课推的账、第 6 课算抵消用的就是它)。拿横三连模板手算:
          盖在己方三连正上方,得 <strong className="num">3</strong>;往右挪一格,
          得 <strong className="num">2</strong>;盖到全空的窗上,得{" "}
          <strong className="num">0</strong>。哪里得数大,哪里就有「横排三个己方子」的嫌疑
          ——这样一张会滑动找图案的模板,行话就叫一个<em>检测器</em>(标题里
          「检测器」三个字,说的就是它)。
        </p>
        <p>
          <strong>② 同一张模板,扫全盘。</strong>模板不是挑一个位置盖一次,而是
          <em>每个位置都盖一次</em>:81 个得数排成一张 9×9 的「嫌疑地图」。
          (棋盘外围虚拟补一圈 0——「界外无子」,于是 81 个格子每个都能当一次窗口中心,
          地图不缩水。)这就是<strong>权重共享</strong>:天元的活三(两头还空着的三连)和边角的活三,
          用<em>同一套权重</em>发现。要是每个位置单配一套,一张模板从 9 个数膨胀成
          81 套,而且同一条棋理学 81 遍——省的不只是参数,是重复的学习。
        </p>
        <p>
          <strong>③ 为什么这里选 3×3。</strong>它能捕捉短短的局部片段：例如连续三子，
          也能在横、竖、两种斜线方向上发现小图案。但要注意，3×3 看不到三连两端是否都空，
          所以单个模板不能单独判定“活三”。窗口大小是取舍：2×2 更省却看得更少；5×5 或 9×9
          看得更多，却需要更多参数、也更少利用“先局部、后整体”的层次。此模型选 3×3，再靠叠层扩大视野。
        </p>
        <p>
          最后一句要紧话：本课程演示快照的网络第一层（代码里叫 stem）就是 <strong className="num">48</strong>{" "}
          张这样的模板<em>同时</em>在 9×9 上扫（48 是本快照配置，不是永恒常数）——但这 48 张没有一张是人按棋理画的:
          每个权重都是训练从「网络自己跟自己下的棋」(自我对弈)里拧出来的旋钮
          (旋钮是第 3 课立过的词;一共 <strong className="num">48 × 27 = 1296</strong>{" "}
          个,第 4 课计票器拖过的那 27 个就藏在这 48 张里)。
          部件二带你看真家伙。
        </p>
      </div>

      <SlideWindow />

      <RealTemplates />

      <Ledger title="model.py L33(stem:第一层卷积)+ game.py L111-117(它吃的输入)">
        <div className="codewalk">
          <pre>{`# model.py L32-36  第一层(stem):48 张 3×3 模板同时在 9×9 上扫
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),  # L33
    nn.BatchNorm2d(channels),
    nn.ReLU(),
)`}</pre>
        </div>
        <p className="mt-3">
          行话对照:<span className="mono">Conv2d(3, 48, 3, padding=1)</span> 读作
          「3 张输入面进来、48 张 3×3 模板扫一遍、界外补一圈 0」。
          <strong>卷积 = 模板扫描,卷积核 = 模板</strong>——你在部件里按的每一下,
          都是这行代码在做的事。那行{" "}
          <span className="mono">nn.ReLU()</span> 也不再是天书:它是第 5 课的
          弯折——先计票(卷积求和),再整体掰弯,一行不缺。本站引擎{" "}
          <span className="mono">learn/src/engine/nn.ts</span> 的{" "}
          <span className="mono">conv2d</span> 与它逐条对齐(部件的热力图就是它算的)。
        </p>
        <div className="codewalk">
          <pre>{`# game.py L111-117  喂进第一层的,正是第 6 课那三张面
canon = game.canonical_board()          # 我方 = +1
cur  = (canon == 1).astype(np.float32)  # 平面 0 己方子
opp  = (canon == -1).astype(np.float32) # 平面 1 对方子
color = np.full_like(cur, ...)          # 平面 2 颜色面`}</pre>
        </div>
        <p className="mt-3">
          (完整版在第 6 课对过账。)注意每个探测器其实是「3 张一套」:己方面、对方面、
          颜色面各配一张 3×3,<strong className="num">27</strong> 个乘积一起相加——
          所以部件二的每张真模板画了三个小格阵。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 8 课"
        onAllCorrect={() => pass("l08")}
        questions={[
          {
            q: "横三连模板盖在己方三连正上方得 3;窗口往右挪一格只得 2。为什么?",
            options: [
              "因为挪动之后模板变短了",
              "因为窗口右边缘落在空格 (5,4) 上——那一格乘出来是 0,三个 1 只剩两个",
              "因为 (4,4) 上的子被挡住了",
            ],
            answer: 1,
            explain:
              "模板没变、子也没动,变的只是窗口罩住哪些格:右边缘那格从「己方子(1)」换成「空(0)」,乘积从 1 变 0。每个得数都能像这样一格一格指认——部件里亲手挪一遍。",
          },
          {
            q: "权重共享(同一张模板扫全盘)省下的到底是什么?",
            options: [
              "省内存:棋盘可以存得更紧",
              "省扫描时间:扫一遍更快",
              "省参数并复用经验：教学单平面模板有 9 个数（真实三平面模板有 27 个），同一套数字在全盘各处使用",
            ],
            answer: 2,
            explain:
              "核心是参数与经验复用：教学里一张单平面模板只带 9 个数，真实三平面模板带 27 个，而不是每个位置各配一套。只要棋理不因位置而变，天元和边角都能用同一套权重检测。这样一处学到的局部图案可以迁到其他位置。",
          },
          {
            q: "真模型第一层的 48 张模板,是谁设计的?",
            options: [
              "工程师按棋理手绘的:横三连、竖三连、斜三连……各画一张",
              "没有人设计——48×27 个权重全是训练从自我对弈数据里拧出来的旋钮",
              "网络自己写的代码生成的",
            ],
            answer: 1,
            explain:
              "部件二看过:它们更像噪声,不像人画的图案。结构只送了两条天性(局部、处处通用),「该有哪些探测器、每个权重多大」全部交给训练——这正是谜题那句「常识砌进结构」的另一半:结构给的是空白的模板,内容自己长。第 4 课你在计票器里拖过的那 27 个旋钮,就藏在这 1296 个里;谁拧的?训练的下山器(train.py optimizer,第 3 课对过账)。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 1 · 模板滑窗 + 扫全盘 ============ */

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
/** 扫描顺序:逐列(先扫完 x=0 一列,再 x=1……)。i 格的扫描序号。 */
const ORD = (i: number) => (i % 9) * 9 + Math.floor(i / 9)

function SlideWindow() {
  const [cx, setCx] = useState(3)
  const [cy, setCy] = useState(4)
  // null = 未扫;0..80 = 正在扫第几个;81 = 扫完
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

  // 窗口内容(己方面视角;界外按 0 算)
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
  const products = TEMPLATE.map((t, i) => t * winVals[i])

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
        <span className="mini-label">部件 · 模板滑窗:一张模板,81 次盖章</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <div
            tabIndex={0}
            role="application"
            aria-label="模板滑窗:方向键移动窗口"
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
              role="img" aria-label="9×9 棋盘上的模板窗口与嫌疑地图">
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

              {/* 嫌疑地图:每个窗口的得数,得分越高越红 */}
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
                    窗口出界:界外按 0(空)算
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
              {scanning ? `正在扫第 ${scanIdx} / 81 格…` : done ? "↺ 再扫一遍" : "扫全盘:81 格逐列盖过去"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            内置局面:己方三连 (2,4)(3,4)(4,4)。本页坐标是(列,行):前一个数是列号,
            第 1 课写的是(行,列)。用棋盘下方的箭头按钮(或键盘方向键)逐格挪窗口。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">当前窗口的账</div>
          <div className="mt-2 flex flex-wrap items-start gap-4">
            <MiniGrid9 label="窗口(己方面)" cells={winLabels} tint={winVals.map((v) => v === 1)} />
            <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>×</span>
            <MiniGrid9 label="模板" cells={TEMPLATE.map(String)} tint={TEMPLATE.map((t) => t !== 0)} />
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
              「界」= 窗口伸出棋盘外,那一格按 0 算(棋盘外虚拟补一圈 0)。
            </p>
          </div>
          {done && (
            <div className="reveal-box mt-4 text-sm leading-relaxed" data-qa="scan-done">
              81 格盖完,得数落成一张「嫌疑地图」:<strong>3</strong> 只出现在三连正上方
              (一处窗口),<strong>2</strong> 跟在两头,<strong>1</strong> 沿着这条线铺开,
              其余全 0——同一张模板、同一套 9 个数,一次扫描把整条横排的嫌疑全标了出来。
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 8-1</span>
        每个得数都由本站引擎 <span className="mono">conv2d</span>(model.py stem 同款算子)
        现算——不是预录的动画。「扫全盘」= 权重共享:一张模板走遍 81 格。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 2 · 真家伙:训练拧出来的模板 ============ */

const REAL_TPL_SHOWN = 8

function RealTemplates() {
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
        <span className="mini-label">部件 · 真家伙:第一层的前 {REAL_TPL_SHOWN} 张真模板</span>
      </div>
      <div className="p-4 md:p-5">
        {!tpl ? (
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            正在加载真权重:weights-best.json,约 1.2 MB,训练存档(英文叫 checkpoint)导出……
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {Array.from({ length: REAL_TPL_SHOWN }, (_, ch) => (
                <RealTemplate key={ch} ch={ch} flat={tpl.flat} maxAbs={tpl.maxAbs} />
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              这些不是示意图:每一格灰度都是{" "}
              <span className="mono">weights-best.json</span> 里{" "}
              <span className="mono">stem.0.weight</span> 的真权重(悬停可看数值)。
              每张模板是「3 张一套」,分别作用在己方面 / 对方面 / 颜色面上;
              越黑 = 正权重越大,越白 = 负权重越大,中灰 = 0。人眼看它们像噪声
              (像没信号的电视上一片乱雪花)——
              因为没有一张是人画的:<strong>全网络第一层共 48 张,48 × 27 = 1296
              个权重,每一个都是训练拧出来的</strong>(第 4 课计票器拖过的那 27 个,
              就在这里)。结构只承诺「局部 + 处处通用」,长出什么样的探测器(=模板,标题的「检测器」也是它),
              是训练的事。
            </p>
          </>
        )}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 8-2</span>
        真数据:weights-best.json 由 scripts/export_weights.py 从训练存档(英文叫 checkpoint)导出;
        此处展示前 8 张 / 共 48 张。
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
        模板 <span className="num">{ch}</span>
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
                    const l = Math.round(128 - n * 115) // 1→黑,−1→白
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
