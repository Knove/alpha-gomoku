/** 第 7 课 · 三张平面。
 *  节拍:谜题(一张 ±1 面够吗)→ 揭晓(正负抵消 → 拆两张 0/1 面 + 颜色面)→
 *  部件 1(正负抵消计算器:同一张横三连模板,不同窗口内容,亲手验证 3 > 2 > 1)→
 *  部件 2(同一局面三张平面并排,点格联动)→
 *  地基篇的判决(必单调/拆面=手工 ReLU/空格面与颜色面/状态完备性)→
 *  对账(game.py encode)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
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

export default function L03() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 7 课</div>
      <h1 className="text-2xl font-bold">三张平面</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "己方子记 +1、对方子记 −1、空记 0——第 2 课那张 canonical 数组已经这么记了。现在要把它喂给网络的第一层:一群只会做「对应相乘再求和」的小算子。这三个数挤在一张面里,够吗?",
            options: [
              "够了:三种身份三个数,信息一点没丢",
              "不够:己方子和对方子要分开放——正负混在一张面里会坏事",
              "不够:光有当前棋盘还不行,还得把之前每一步的历史都记进去",
            ],
            answer: 1,
            explain:
              "选 B。先给 A 记半分:信息确实一点没丢——丢的不是信息,是计算上的好用性。坏在哪儿,这课亲手算一遍就见分晓:求和的时候,对方的 −1 会把己方的 +1 抵消掉。至于 C——五子棋没有吃子、没有提子再放回的循环,当前棋盘就是全部状态,不用背历史(围棋才要,后面「状态完备性」算这笔账)。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 正负会在求和里抵消</h3>
        <p>
          先用一句话认识网络第一层的干法(第 4 课推过它的账,下一课看它怎么滑):
          一张张 3×3 的<strong>模板</strong>——9 个数,盖在棋盘某个 3×3 的小窗上,
          对应格子相乘,再把 9 个乘积加成一个数。比如这张「横三连模板」:
          中间一行是 1、1、1,其余是 0,它量的是「这个窗口的中间一横排,
          是不是我的子」。
        </p>
        <p>
          现在拿它去算一张 ±1 面。同一张模板,盖在「己、敌、己」三格上:
          1×1 + 1×(−1) + 1×1 = <strong>1</strong>;盖在「己、空、己」上:
          1 + 0 + 1 = <strong>2</strong>。看出问题了吗——
          <strong>贴身缠斗、最该报警的地方,得分反而比太平无事还低</strong>。
          对方那颗子在求和里永远在做<em>负功</em>,把警报往小里压;
          要是盖在「敌、敌、敌」上更糟:得分 −3,同一张模板对 +3 和 −3
          没法用同一个阈值报警。
        </p>
        <p>
          解法:<strong>一种身份一张面,每张只放 0 和 1</strong>。
          平面 0「己方子」:我的子在哪些格子,是 1、不是 0;平面 1「对方子」:
          对手的子在哪些格子。空格不用单独一张——两张同为 0 的地方就是空。
          拆开之后,每张面上「1 越多 = 这个事实越成立」:「己方横三连」就是
          「己方面上这张模板得 3」,一个阈值就报警,谁也不抵消谁。
        </p>
        <p>
          还差最后一张「<strong>颜色面</strong>」:整张填同一个数——轮黑走全 1,
          轮白走全 0。canonical 把黑白抹平了,可「我执黑还是执白」是要紧事
          (先手可以下得更凶):这个信息理论上读得出来——轮黑走时双方子数相等,
          轮白走时黑多一子——但「数一遍全盘的子」恰恰是 3×3 小窗干不动的活。
          颜色面就是把这个全局事实直接贴到每个格子上。三张叠起来,形状
          <span className="mono">(3, 9, 9)</span>,读作「3 张 9×9」。
        </p>
      </div>

      <CancelCalc />

      <ThreePlanes />

      <div className="prose mt-12">
        <h3>揭晓 · 地基篇的判决</h3>
        <p>
          三张平面看完,回头清算第 3-6 课埋的账——地基篇的每一门课,
          都在这三张面上留了判决:
        </p>
        <p>
          <strong>① 必单调的判决(±1 强加排序)。</strong>第 4 课判过:每个输入
          各走一条直线。把己/敌/空记成 +1/−1/0,等于把三种<em>无序</em>的身份
          钉上同一条数轴:权重为正时,己(+1)的分 &gt; 空(0)的分 &gt; 敌(−1)
          的分——「空」永远夹在「己」「敌」中间,可棋理上没有这个次序。
          抵消只是它的症状之一;病根是排序。
        </p>
        <p>
          <strong>② 拆面的判决:手工 ReLU。</strong>那拆成两张 0/1 面算什么?
          在格子值 x 只取 +1、0、−1 时:己面 = ReLU(x)、敌面 = ReLU(−x),
          <em>逐值精确</em>——ReLU(+1)=1、ReLU(0)=0、ReLU(−1)=0。
          拆两张面,正是给 x 手工过了正、反两个 ReLU(第 5 课的正半波与
          负半波)。「一种身份一张面」的行话叫 one-hot——三种身份各占一张面,
          谁也不给谁排序。暗线:ReLU(t)+ReLU(−t)=|t|,和第 5 课切开 XOR 的
          是同一根恒等式。
        </p>
        <p>
          <strong>③ 空格面可删,颜色面必须留。</strong>空格不用单独一张面,
          除了「两张都是 0 的地方就是空」,还有更深一层:空格 = 1−己−敌,
          给它配的任何权重,效果都能并进己、敌两张面的权重里,多出来的只剩
          一个恒定零头。带偏置的网络,零头由偏置一口吞掉;本网络的卷积不带
          偏置,由下一道工序 BN 的「减均值」原样抹掉——零头对每个局面都
          一样,均值里就有它,减掉正好,网络输出一个比特都不变。对照:
          颜色面的零头随轮到谁在 0 与 Σw₃ 之间翻转,随局面而变,谁也抹不掉
          ——这就是「空格面可删、颜色面必须留」的全部道理。
        </p>
        <p>
          <strong>④ 状态完备性:三张为什么够。</strong>输入面要装的是
          「做对下一个决策需要的全部信息」。AlphaGo Zero 下围棋要用 17 张
          输入平面,因为围棋有「打劫」——同一张棋盘图对应不同的合法走法,
          必须回看历史;五子棋没有吃子,当前棋盘 + 轮到谁,就是全部状态,
          两张面加一张颜色面,三张够,一张也不多余。
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
        title="小测 · 过关解锁第 8 课"
        onAllCorrect={() => pass("l07")}
        questions={[
          {
            q: "一张 ±1 面(己 +1、敌 −1、空 0)到底哪里不够?",
            options: [
              "数不够精确,应该改用小数",
              "模板求和时,对方的负数会抵消己方的正数——最该报警的缠斗区得分反而被压低",
              "一张面装不下 81 个格子,内存会溢出",
            ],
            answer: 1,
            explain:
              "格子还是那 81 个,信息也没少——坏在求和这道工序上:1 + (−1) + 1 = 1,比 1 + 0 + 1 = 2 还小。混在一张面里的敌我信号会互相拆台,拆开才能各报各的警。",
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
              "要点是「一个事实一张面」:己方三连 = 己方面得 3,对方三连 = 对方面得 3,一个阈值通吃两张面。空格不需要第三张——两张都是 0 的地方就是空,省一张是一张。",
          },
          {
            q: "颜色面整张填同一个数,它补的是什么模板算不出来的东西?",
            options: [
              "下一手该谁走(合法落点的位置)",
              "「我执黑还是执白」这个全局身份——判断它要数全盘的子,3×3 小窗干不动",
              "最近三手的落子历史",
            ],
            answer: 1,
            explain:
              "轮到谁走,encode 之前就知道,不用猜;历史,五子棋用不上。颜色面补的是身份:执黑执白下法该不一样,而「数子判断身份」恰恰是只看局部的小窗做不到的事——直接把答案贴进输入,不让网络自己去数。",
          },
          {
            q: "地基篇回头看:把 ±1 拆成己/敌两张 0/1 面,用第 5 课的话说,相当于给格子值做了什么?",
            options: [
              "把数变小,网络算得更快",
              "手工过了两个 ReLU:己面=ReLU(x)、敌面=ReLU(−x),在 x∈{+1,0,−1} 上逐值精确——三种身份各归各面,不再被钉上同一条数轴",
              "把输入加一倍,网络参数也跟着翻倍",
            ],
            answer: 1,
            explain:
              "ReLU(+1)=1、ReLU(0)=0、ReLU(−1)=0——拆面正是把第 5 课的正、负两个半波手工做在输入端。±1 的病根在必单调:三种无序身份被钉上数轴,「空」永远夹在中间;拆面把「次序」拆没了,一个事实一张面。暗线:ReLU(t)+ReLU(−t)=|t|,和第 5 课切开 XOR 的是同一根恒等式。",
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

/** 九宫格小表已提取到 lib/minigrid(第 8 课滑窗共用)。 */


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
        右侧三张 0/1 面与 <span className="mono">encode()</span> 的输出逐格一致
        ——这就是网络每次「看到」的东西,叠成 (3, 9, 9)。
      </figcaption>
    </figure>
  )
}
