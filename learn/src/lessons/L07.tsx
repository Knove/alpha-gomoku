/** 第 6 课 · 三张平面。
 *  节拍:谜题(一张 ±1 面够吗)→ 揭晓(正负抵消 → 拆两张 0/1 面 + 颜色面)→
 *  部件 1(正负抵消计算器:同一张横三连模板,不同窗口内容,亲手验证 3 > 2 > 1)→
 *  部件 2(同一局面三张平面并排,点格联动)→
 *  地基篇的判决(必单调/拆面=手工 ReLU/空格面与颜色面/状态完备性)→
 *  对账(game.py encode)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board from "../lib/board"
import { MiniGrid9 } from "../lib/minigrid"

/* 教学局面:与第 2 课同一盘(5 黑 4 白共 9 手,轮白),
 * 部件 2 用它渲染「网络眼里的三张平面」。 */
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

/* 部件 2 的三张平面(轮白:canonical 里白的变 +1,即「己方」)。
 * 与 game.ts encode() 同一套切法,数据在本组件里现算,改动棋盘即联动。 */
const PLANE_OWN = OBJ.map((v) => (v === -1 ? 1 : 0)) // 轮白:白子 = 己方
const PLANE_OPP = OBJ.map((v) => (v === 1 ? 1 : 0))
const PLANE_COLOR = new Array<number>(81).fill(0) // 轮白 → 整张 0

export default function L07() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 6 课</div>
      <h1 className="text-2xl font-bold">三张平面</h1>

      <LessonGuide
        question="棋盘已有 0/+1/−1 的记法，为什么送进网络前还要拆成三张 0/1 图？"
        why="网络第一层要用小模板寻找“我方在这里”“对方在这里”这些事实。把它们分开，能让模板更直接地读到各自的证据。"
        chain={[
          "先用第 2 课视角统一我方和对方",
          "我方子、对方子各占一张 0/1 平面",
          "模板可分别检测两类棋形，不让正负号在一次求和中抵消",
          "颜色面补上执黑或执白这一全局身份",
        ]}
        takeaway="三张面是让本模型更容易学习的输入设计：它没有增加棋盘事实，而是把事实拆得更清楚。"
        boundary="直接用一张 ±1 面并非信息丢失或绝对做不到；不同网络可以选不同编码。本课解释的是这一模型为何选三张面。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "己方 +1、对方 −1、空 0 的数组没有丢棋盘信息。本模型仍把它拆成三张面，主要为了什么？",
            options: [
              "因为 ±1 数组缺少棋子位置，必须补更多数据",
              "把“我方在这里”和“对方在这里”拆成两件事，让第一层模板更直接地分别识别它们",
              "因为五子棋必须记住每一步历史才能知道当前局面",
            ],
            answer: 1,
            explain:
              "选第二项。±1 数组的信息并没有丢；这是一种让本模型更好学的改写。一次简单的模板求和中，正负号可能抵消，把双方拆开后，模板可以分别提出“我方棋形”和“对方棋形”的证据。五子棋没有吃子或循环禁手这种要回看历史才能判定合法性的规则，当前棋盘加行棋方已足够描述状态。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 不是信息不够，而是先把两类事实分开</h3>
        <p>
          第 3 课里的 <span className="mono">x</span> 是我们手工规定的教学读数；从现在起，
          不再请人替机器数线索。第一步是把棋盘改写成网络能逐层处理的输入，让后面的计算自己从格子里
          形成读数。
        </p>
        <p>
          先用一句话认识网络第一层的干法(第 4 课推过它的账,下一课看它怎么滑):
          一张张 3×3 的<strong>模板</strong>——9 个数,盖在棋盘某个 3×3 的小窗上,
          对应格子相乘,再把 9 个乘积加成一个数。比如这张「横三连模板」:
          中间一行是 1、1、1,其余是 0,它量的是「这个窗口的中间一横排,
          是不是我的子」。
        </p>
        <p>
          现在拿它去算一张 ±1 面。同一张模板，盖在“己、敌、己”三格上：
          1×1 + 1×(−1) + 1×1 = <strong>1</strong>;盖在「己、空、己」上:
          1 + 0 + 1 = <strong>2</strong>。(乘 −1 就是变号;+1 撞上 −1
          正好归零——第 4 课那笔账。)这不是证明一张 ±1 面“不能用”；它只暴露了
          <strong>一个简单模板</strong>的麻烦：它想找我方横排时，对方的符号会抵消分数。
          当然可以设计更多模板或更深网络来处理，但本模型选择更直接的表示法。
        </p>
        <p>
          解法是<strong>一种身份一张面，每张只放 0 和 1</strong>。
          平面 0「己方子」:我的子在哪些格子,是 1、不是 0;平面 1「对方子」:
          对手的子在哪些格子。空格不用单独一张——两张同为 0 的地方就是空。
          拆开后，每张面上“1 越多，这个事实越成立”。例如“己方横三连”在己方面上
          得 3；对方棋形则由另一张面单独判断。两类证据不用在同一次求和里互相抵消。
        </p>
        <p>
          还差最后一张<strong>颜色面</strong>：轮黑走时整张填 1，轮白走时整张填 0。
          规范视角统一了“我 / 对手”，但没有告诉网络“我拿的是黑还是白”。本模型把这项
          全局身份直接贴进每个位置，而不是让早期局部模板费力推断。三张叠起来，形状是
          <span className="mono">(3, 9, 9)</span>,读作「3 张 9×9」。
        </p>
      </div>

      <CancelCalc />

      <ThreePlanes />

      <div className="prose mt-12">
        <h3>揭晓 · 为什么这里刚好选三张</h3>
        <p>
          这不是唯一正确的输入格式，而是本模型的一次取舍：己面和敌面让局部模板容易
          分别找两类棋形；颜色面保留先后手身份。它们把同一盘棋拆成更容易使用的证据。
        </p>
        <p>
          空格不用单独一张面：同一格在己面和敌面上都为 0，就表示空。这没有丢掉新的
          棋盘事实。若你喜欢用第 5 课的语言看它，己面可写成
          <span className="mono">ReLU(x)</span>，敌面可写成 <span className="mono">ReLU(−x)</span>；
          这是帮助理解的一种等价写法，不是本模型必须经过的运行步骤。
        </p>
        <p>
          五子棋没有吃子或“同一棋盘因历史不同而合法走法不同”的规则；因此在本规则里，
          当前棋盘加上行棋方已经足够描述下一步。三张面满足这个需要，但“够用”不等于
          “永远最优”——更大的模型也可能选别的编码。
        </p>
      </div>

      <Ledger title="game.py(encode,L111-117)">
        <div className="codewalk">
          <pre>{`# L111-117  canonical 数组 → 三张 0/1 平面
def encode(game: Game) -> np.ndarray:
    """(3, n, n) float32: current player's stones, opponent's stones, color plane."""
    canon = game.canonical_board()          # 第 2 课的铁约:我方 = +1
    cur = (canon == 1).astype(np.float32)   # 平面 0:我的子在哪些格子
    opp = (canon == -1).astype(np.float32)  # 平面 1:对手的子在哪些格子
    color = np.full_like(cur, 1.0 if game.current_player == BLACK else 0.0)
    return np.stack([cur, opp, color])      # 平面 2:整张同一个数`}</pre>
        </div>
        <p className="mt-3">
          就这一个函数:先做 canonical(第 2 课),再按「= +1 / = −1」切成两张 0/1
          面,最后垫上颜色面。本站引擎{" "}
          <span className="mono">learn/src/engine/game.ts</span> 的{" "}
          <span className="mono">encode()</span> 与它逐行镜像(Ledger 行号可对账)。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 7 课"
        onAllCorrect={() => pass("l07")}
        questions={[
          {
            q: "本模型为什么不直接把一张 ±1 面交给第一层模板？",
            options: [
              "数不够精确,应该改用小数",
              "信息没有丢，但一次简单模板求和中正负可能抵消；拆面后可分别检测我方和对方的证据",
              "一张面装不下 81 个格子,内存会溢出",
            ],
            answer: 1,
            explain:
              "格子还是那 81 个，信息也没有少。例子里 1 + (−1) + 1 = 1，比 1 + 0 + 1 = 2 小，说明一个简单“找我方横排”的模板会受到对方负号影响。拆面让两种检测各做各的；不是说一张 ±1 面绝对不能被其他架构学会。",
          },
          {
            q: "为什么拆成两张 0/1 面,而不是想办法修正一张 ±1 面?",
            options: [
              "一张面一个事实:己方面上 1 越多「我方在」越成立,对方面同理,谁也不抵消谁",
              "为了把网络撑大一点,多两层参数",
              "因为 0 和 1 在计算机里算得更快",
            ],
            answer: 0,
            explain:
              "要点是“一个事实一张面”：己方面得 3 说明己方三连证据强，对方面同理。空格不需要第三张——两张都是 0 的地方就是空。这样是为了让本模型的第一层更直接，不是因为三张面凭空增加了信息。",
          },
          {
            q: "颜色面整张填同一个数,它补的是什么模板算不出来的东西?",
            options: [
              "下一手该谁走(合法落点的位置)",
              "“我执黑还是执白”这个全局身份——本模型选择直接提供它，不让早期局部模板先去推断",
              "最近三手的落子历史",
            ],
            answer: 1,
            explain:
              "轮到谁走，程序本来就知道；历史在这个五子棋规则中也不需要。颜色面补的是执黑或执白这项身份。本模型把它直接贴进输入，让早期局部模板专注于棋形；更深的网络也许能间接推断部分信息，但没必要强迫它先做这件事。",
          },
          {
            q: "地基篇回头看:把 ±1 拆成己/敌两张 0/1 面,用第 5 课的话说,相当于给格子值做了什么?",
            options: [
              "把数变小,网络算得更快",
              "手工过了两个 ReLU:己面=ReLU(x)、敌面=ReLU(−x),在 x 只取 +1、0、−1 这三个值时逐值精确——三种身份各归各面,不再被钉上同一条数轴",
              "把输入加一倍,网络参数也跟着翻倍",
            ],
            answer: 1,
            explain:
              "ReLU(+1)=1、ReLU(0)=0、ReLU(−1)=0，所以在这三个取值上，己面确实等于 ReLU(x)，敌面等于 ReLU(−x)。这是一种把第 5 课概念连回来的看法：用两张面把正、反两类事实分别亮出来；它不表示实际程序会先运行这两个 ReLU。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 1 · 正负抵消计算器 ============ */

/** 横三连模板:中间一行 1 1 1,其余 0(与 archive/network.md 手算例同一张)。 */
const TEMPLATE = [0, 0, 0, 1, 1, 1, 0, 0, 0]

/** 窗口内容预设:名字描述中间一横排(模板上下两行是 0,乘什么都得 0)。
 *  值:1 己 / −1 敌 / 0 空。 */
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
  const [preset, setPreset] = useState(3) // 默认「己敌己」,直接看抵消
  const [view, setView] = useState<View>("pm1")

  // 3×3 窗口:只有中间一行有内容
  const window9 = (() => {
    const w = new Array<number>(9).fill(0)
    const mid = PRESETS[preset].mid
    w[3] = mid[0]
    w[4] = mid[1]
    w[5] = mid[2]
    return w
  })()

  // 当前视角下窗口显示的值:±1 原样 / 己方面(只有 +1 变 1)/ 对方面(只有 −1 变 1)
  const shown = window9.map((v) =>
    view === "pm1" ? v : view === "own" ? (v === 1 ? 1 : 0) : v === -1 ? 1 : 0,
  )
  const products = TEMPLATE.map((t, i) => t * shown[i])
  const sum = products.reduce((a, b) => a + b, 0)

  const fmt = (v: number) => (v === 0 ? "·" : v > 0 ? `${v}` : `−${Math.abs(v)}`)
  const viewName =
    view === "pm1" ? "一张 ±1 面" : view === "own" ? "己方 0/1 面" : "对方 0/1 面"
  const isPM1 = view === "pm1"

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 正负抵消计算器</span>
        <span className="seg">
          <button type="button" className={`seg-btn ${isPM1 ? "active" : ""}`}
            onClick={() => setView("pm1")}>
            一张 ±1 面
          </button>
          <button type="button" className={`seg-btn ${view === "own" ? "active" : ""}`}
            onClick={() => setView("own")}>
            己方 0/1 面
          </button>
          <button type="button" className={`seg-btn ${view === "opp" ? "active" : ""}`}
            onClick={() => setView("opp")}>
            对方 0/1 面
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="flex min-w-0 flex-1 items-start justify-center gap-5 md:justify-start">
          <MiniGrid9 label="模板" cells={TEMPLATE.map(fmt)} tint={TEMPLATE.map((t) => t !== 0)} />
          <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>×</span>
          <MiniGrid9 label={`窗口(${viewName})`} cells={shown.map(fmt)}
            tint={shown.map((v) => v !== 0)} />
          <span className="mt-[4.7rem] text-lg" style={{ color: "var(--fg-faint)" }}>=</span>
          <MiniGrid9 label="9 个乘积" cells={products.map(fmt)}
            tint={products.map((p) => p !== 0)} hot={products.map((p) => p < 0)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">窗口内容(中间一横排)</div>
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
              <span style={{ color: "var(--accent-deep)" }}>{sum}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              只列中间一行的三项——模板上下两行是 0,乘什么都得 0(乘积格里看得到)。
            </p>
          </div>
          {isPM1 ? (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              在 ±1 面上依次点「己己己 → 己空己 → 己敌己」:{"> "}
              <span className="num font-bold">3</span> {"> "}
              <span className="num font-bold">2</span> {"> "}
              <span className="num font-bold">1</span>
              ——中间那颗子从「空」换成「敌」,得分不升反降。这就是抵消:
              报警器在最需要它的时候最哑。
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              拆到 0/1 面上再看「己敌己」:己方面得 2(敌子不入场),对方面得 1
              ——两个事实各报各的,不再互相拆台。切回「一张 ±1 面」对照。
            </p>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 7-1</span>
        同一张横三连模板、同一批窗口,只换「面怎么切」。抵消发生在求和那一步——
        亲手点一遍,胜过看十遍公式。
      </figcaption>
    </figure>
  )
}

/** 九宫格小表已提取到 lib/minigrid(第 7 课滑窗共用)。 */


/** 「1×1 + 1×(−1) + 1×1」式的中间行展开(模板中间一行全是 1)。 */
function expr(row: number[]): string {
  const w = (v: number) => (v < 0 ? `(−${Math.abs(v)})` : `${v}`)
  return row.map((v) => `1×${w(v)}`).join(" + ")
}

/* ============ 部件 2 · 同一局面,三张平面 ============ */

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
      ? "点棋盘或任何一张面的格子——同一个交叉点在三张面上同时亮起来。"
      : `你点的是 (${sel % 9},${Math.floor(sel / 9)}):己方面 ${
          PLANE_OWN[sel] ? 1 : 0
        }、对方面 ${PLANE_OPP[sel] ? 1 : 0}、颜色面 ${PLANE_COLOR[sel]}。`

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 同一局面,网络吃的三张面</span>
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
            第 2 课的教学局面:5 黑 4 白、轮白。已拨到白方视角(己方 = 白)。
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {selText}
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            数一数:己方面恰有 <strong className="num">4</strong> 个 1(白子),
            对方面恰有 <strong className="num">5</strong> 个 1(黑子),
            颜色面整张 <strong className="num">0</strong>(轮白走;要是轮黑,
            这张面整张变 1)。黑白棋子消失,只剩「事实」本身。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-6 border-t border-[color:var(--hairline)] p-4 md:p-5">
        {plane(PLANE_OWN, "平面 0 · 己方子", "我的子在哪:4 个 1", "own")}
        {plane(PLANE_OPP, "平面 1 · 对方子", "对手的子在哪:5 个 1", "opp")}
        {plane(PLANE_COLOR, "平面 2 · 颜色面", "我执黑?整张同一个数:0", "color")}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 7-2</span>
        下方三张 0/1 面与 <span className="mono">encode()</span>(把局面切成
        三张面的代码,下面对账细看)的输出逐格一致——这就是网络每次
        「看到」的东西,叠成 (3, 9, 9)。
      </figcaption>
    </figure>
  )
}
