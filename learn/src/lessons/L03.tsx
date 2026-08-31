/** 第 3 课 · 旋钮:自己变准的机器(地基篇 1/4)。
 *  节拍:谜题(棋力从哪来)→ 揭晓(查表破产/旋钮 vs 开关/三个数从哪来/账目/下山/串回来)→
 *  部件 1(打靶器:双三局面 v=w·x,连续旋钮的抛物线 vs 开关档位没坡)→
 *  部件 2(下山步进器:lr 滑杆真实梯度步,双刻度线 0.125/0.25)→
 *  对账(train.py optimizer)→ 小测。 */
import { useEffect, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { linGrad, linStep } from "../lib/foundations"

/* 教学局面:己方双三——横 (2,4)(3,4)(4,4) + 竖 (4,4)(4,5)(4,6),
 * 盘面读数 x=2(我方已成三连的个数),真答案 z=+1(双活三几乎必赢)。
 * 一个旋钮的玩具估价器:v = w·x,罚分 (v−z)²。 */
const X = 2
const Z = 1
const W0 = 0 // 下山起点:旋钮随机初始位置
const STOPS = [-1, -0.4, 0.2, 0.8, 1.4, 2] // 开关版的六个档位(故意躲开谷底 0.5)

const DUAL: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of [
    [2, 4], [3, 4], [4, 4], [4, 5], [4, 6],
  ] as [number, number][])
    b[y * 9 + x] = 1
  return b
})()

const loss = (w: number) => (w * X - Z) * (w * X - Z)

export default function L03() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 3 课</div>
      <h1 className="text-2xl font-bold">旋钮:自己变准的机器</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "要造一台会下棋的机器,「棋力」从哪来?",
            options: [
              "背棋谱:把每种局面的最好一步都存进一张大表,下棋时查表",
              "写规则:请高手把棋理一条条写成「如果…就…」的代码",
              "长旋钮:造一台带一排可以连续拧动的旋钮的机器,让它自己把旋钮拧到对",
            ],
            answer: 2,
            explain:
              "选第三个(长旋钮)。第一个马上算给你看:存不下,存得下也没见过的局面照样不会(泛化=没见过的局面也答得靠谱,下面马上讲);第二个是老一代棋类 AI 的路,能写几条,写不全,而且「这个棋形值几分」它答不了;第三个把「棋力」变成「旋钮的位置」——本站 14.5 万个旋钮,没有一个位置是人设的,全是机器自己从输赢里拧出来的。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 四步:存不下、旋钮、账目、下山</h3>
        <p>
          <strong>① 查表法,存不下也没泛化。</strong>81 格每格三种填法,光格子
          组合就有 3<sup>81</sup>≈4×10<sup>38</sup> 种——右上角那个小 81 是
          「81 个 3 连乘」,小 38 的意思是「4 的后面跟着 38 个 0」:把全世界
          每一粒沙子都编上号,也用不完这么多个号。合法局面只是其中一部分
          (黑白轮流落子:黑子数等于白子数、或恰好多一),数目也小不到哪去:
          查表存不下。更要命的是就算存得下——<em>泛化</em>,白话说是没见过的
          局面也<strong>答得靠谱</strong>,就像认过一次狗,再见到没见过的狗
          也认得;查表法每条记录是孤岛,没见过的局面上只能瞎猜。不是泛化差,
          是没有泛化这回事。
        </p>
        <p>
          <strong>② 长旋钮:与其背局面,不如拧旋钮。</strong>与其记住每个局面,
          不如装一台「只会少数几种运算、带一群可拧旋钮」的机器,让几千盘棋把
          旋钮从随机位置拧到对(几千盘棋就是「样本」;教科书的说法:用「结构
          假设」换「样本效率」——机器的构造先替你猜了一大半,要背的棋谱就省
          多了)。旋钮的行话叫<strong>权重、参数</strong>——序里「14.5 万参数」
          说的就是 14.5 万个旋钮。旋钮必须是<em>连续</em>的:对照「如果…就…」
          那种<em>开关</em>——开关的参数是一档一档断开的,拧半格,机器报出来
          的数(行话叫「输出」)纹丝不动;你站在一档上,不知道旁边一档更高
          还是更低,只能挨个试。连续旋钮不一样:拧一点点,输出就变一点点,
          而且变多少有数——「往哪边拧更好」永远有答案。(注意:坏的不是开关
          这道工序,是把开关<em>当旋钮拧</em>。第 5 课会见到 ReLU——一个零件
          的名字,肚子里也装着一道「如果」,可拧它的仍是连续旋钮,到时再讲。)
        </p>
        <p>
          <strong>先弄清:机器的三个数,都从哪来。</strong>机器没有眼睛,
          但它会数数:x 是你替它从局面上读出来的数(比如「我方有几条三连」),
          v 是它拧出来的分数(它自己估「我优不优」),z 是终局才揭晓的真答案
          (赢 +1、输 −1、和 0)。机器自己学,靠的就是这三个数都能自己拼出来
          ——为什么能「看一眼局面就说个输赢」,下面正好拿手边最小的一道题
          算给你看。
        </p>
        <p>
          <strong>③ 账目:拧一点点,变多少。</strong>拧一点点 Δw(Δ 念「德尔塔」,
          意思是「变了一点」;w 就是旋钮指着的数),输出就变一点点 Δv;
          Δv 除以 Δw,就是「v 对 w 的账」,记作{" "}
          <span className="mono">∂v/∂w</span>(那个像反写 6 的符号念「偏」)
          ——教科书叫导数,本站叫账目,因为它回答的正是「这一格拧多少,账变
          多少」。再立一对词:{""}
          <em>误差</em>是差值 v−z(机器说 v,真答案 z):机器说多了,差是正的;
          说少了,差是负的——负数就是「倒着减」,机器说 0、真答案 +1,差是
          0−1=−1。<em>损失</em>是罚分 (v−z)²——平方一乘,正差负差都变罚分,
          差得越远罚得越狠。v 和 z 用的是序里那把尺子(+1 稳赢、−1 稳输);
          z 要终局才揭晓(第 12 课正式讲它怎么来),本课先当已知数用。
        </p>
        <p>
          <strong>④ 下山:蒙着眼找谷底。</strong>损失对 w 是一条开口向上的抛物线
          (抛物线:斜着扔出去的球划出的那条弧;开口向上,就是弧变成一只碗),
          谷底就是「拧到这,罚分最小」。训练就是蒙眼下山:看不见整条曲线,
          只摸得着脚下的坡(账目),每一步沿坡向下的方向挪一点,挪多少乘上一个
          <em>学习率 lr</em>。步子太小,磨蹭;步子太大,一步跨过谷底来回弹,
          甚至越弹越高——多大算太大,下面部件里亲手拖。
        </p>
        <p>
          <strong>⑤ 把四步串回来,谜题就通了。</strong>回到开头的问题:
          没人教,它凭什么能自己练出来?——因为每一盘对局,都是一次免费的
          「题目+教练」:乱猜一个 w,算出 v;终局一出,真答案 z 揭晓,差多少
          机器自己知道;账目再告诉每个旋钮「该往那边挪一点」;挪一点点,
          下一题再来。几千盘棋,就是几千次自动纠错——这就是它能自己变准的
          全部秘诀。用一句更白的话总结:它不靠人讲得对,
          它靠答错给自己当老师。
        </p>
      </div>

      <TargetRange />

      <Descender />

      <Ledger title="train.py L13-20(optimizer:真训练的下山器)">
        <div className="codewalk">
          <pre>{`# train.py L13-20  真训练用的「下山器」:SGD + 动量
def make_optimizer(net: AlphaGomokuNet, cfg: Config) -> torch.optim.Optimizer:
    return torch.optim.SGD(
        net.parameters(),          # 全部旋钮(14.5 万个)
        lr=cfg.lr,                 # 步子大小:0.01(config.py)
        momentum=0.9,              # 顺着既有方向多稳一步
        weight_decay=1e-4,         # 拉住权重的野蛮生长(1e-4 就是 0.0001)
        nesterov=True,
    )`}</pre>
        </div>
        <p className="mt-3">
          本课部件里你拧的是<strong>一个</strong>旋钮;真训练一次拧 14.5 万个——
          每个都按自己的账目挪一点,算法还是同一个下山(教科书叫 SGD、梯度下降
          ——「梯度」就是账目的学名)。动量、权重衰减是工程上的加固,不改变
          「沿账目下山」这个主旋律。每一步具体怎么算,第 6 课摊开。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 4 课"
        onAllCorrect={() => pass("l03")}
        questions={[
          {
            q: "查表法(把每种局面的答案都存起来)的两个死穴是?",
            options: [
              "存不下(局面多到「4 后面跟 38 个 0」),而且没有泛化——没见过的局面上只能瞎猜",
              "查表太慢,和存不下",
              "表格会坏,而且要人工维护",
            ],
            answer: 0,
            explain:
              "存不下是硬件账,没泛化是机制账:每条记录是孤岛,记录之间互不相干——局面稍微没见过,表帮不上任何忙。泛化=没见过的局面也答得靠谱,查表法连「泛化差」都算不上,是没有泛化这回事。",
          },
          {
            q: "为什么参数要做成「连续旋钮」,而不能是开关档位?",
            options: [
              "连续的数在计算机里存得更省",
              "开关拧半格输出纹丝不动——账目处处为 0,「往哪边拧更好」没有答案;连续旋钮拧一点点变一点点,坡永远有方向",
              "开关写代码更难",
            ],
            answer: 1,
            explain:
              "部件里对照过:开关版只有六个孤零零的档位,站在这档看不见隔壁的高低;连续版的抛物线处处有坡,账目负就往右拧、正就往左拧,蒙着眼也走得下山。顺带:开关永远差着一截——最好的档位罚分 0.36,连续旋钮能拧到 0。",
          },
          {
            q: "学习率(lr)调大会怎样?",
            options: [
              "只会更快到谷底,越大越好",
              "步子大了会跨过谷底、来回弹;再大一点(过了 0.25 那条线),误差反而越弹越大——一路上天",
              "没有影响,只是一个写法习惯",
            ],
            answer: 1,
            explain:
              "下山步进器拖过:lr=0.05 稳步;0.125 恰好一步到谷底;0.2 跨谷来回但误差在缩;0.25 永久来回;0.35 越荡越高。说穿了:每一步都把误差乘上同一个数,这个数不到 1 就越乘越小、超过 1 就越乘越大。公式给大人:这个数是 1−2·lr·x²,「绝对值」小于 1 才收敛(绝对值=不管正负号,只看离 0 多远)。学习率是「步子大小」四个字的全部数学。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 3-1 · 打靶器:连续旋钮 vs 开关档位 ============ */

/** 抛物线图几何(L 上限 9.5,谷底 w*=Z/X=0.5) */
const CW = 300, CH = 176, CPL = 38, CPR = 12, CPT = 12, CPB = 30
const WMIN = -1, WMAX = 2, LMAX = 9.5
const xOf = (w: number) => CPL + ((w - WMIN) / (WMAX - WMIN)) * (CW - CPL - CPR)
const yOf = (l: number) => CH - CPB - (Math.min(l, LMAX) / LMAX) * (CH - CPT - CPB)
const CURVE = Array.from({ length: 61 }, (_, i) => {
  const w = WMIN + (i / 60) * (WMAX - WMIN)
  return `${xOf(w).toFixed(1)},${yOf(loss(w)).toFixed(1)}`
}).join(" ")

function TargetRange() {
  const [mode, setMode] = useState<"knob" | "switch">("knob")
  const [w, setW] = useState(0) // 连续旋钮位置
  const [stop, setStop] = useState(2) // 开关档位下标(默认 0.2)

  const v = w * X
  const l = loss(w)
  const g = linGrad(w, X, Z) // 脚下的账(坡)
  const sw = STOPS[stop]
  const swLoss = loss(sw)

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 打靶器:一个旋钮的估价器</span>
        <span className="seg" data-qa="range-mode">
          <button type="button" className={`seg-btn ${mode === "knob" ? "active" : ""}`}
            onClick={() => setMode("knob")}>
            连续旋钮
          </button>
          <button type="button" className={`seg-btn ${mode === "switch" ? "active" : ""}`}
            onClick={() => setMode("switch")}>
            开关档位
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[19rem]">
          <div data-qa="dual-board">
            <Board board={DUAL} lastMove={{ x: 4, y: 6 }} />
          </div>
          <div className="reveal-box mt-3 text-sm leading-relaxed">
            <div className="mini-label">盘面读数 x 与真答案 z</div>
            <p className="num mt-1.5">
              x = <strong>2</strong>(我方已成三连的个数:横一条 + 竖一条)
              <br />z = <strong>+1</strong>(一横一竖两条三连,两头都没堵——
              这样的「双活三」几乎必赢,这盘「我」赢)
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              玩具估价器只有一个旋钮:v = w·x(读数乘权重)。x、z 固定,
              能拧的只有这一个 w——拧它,看罚分 (v−z)² 怎么变。
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${CW} ${CH}`} data-qa="target-curve"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 340 }}>
            <line x1={CPL} y1={CH - CPB} x2={CW - CPR} y2={CH - CPB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[1, 4, 9].map((p) => (
              <g key={p}>
                <line x1={CPL} y1={yOf(p)} x2={CW - CPR} y2={yOf(p)}
                  style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
                <text x={CPL - 5} y={yOf(p) + 3} fontSize={9} textAnchor="end"
                  className="num" style={{ fill: "var(--fg-faint)" }}>{p}</text>
              </g>
            ))}
            {[-1, 0, 0.5, 1, 2].map((t) => (
              <text key={t} x={xOf(t)} y={CH - CPB + 13} fontSize={9.5} textAnchor="middle"
                className="num" style={{ fill: "var(--fg-faint)" }}>
                w={t > 0 ? "+" + t : t}
              </text>
            ))}
            {/* 谷底标线:w* = z/x = 0.5 */}
            <line x1={xOf(0.5)} y1={yOf(0)} x2={xOf(0.5)} y2={yOf(9)}
              strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <text x={xOf(0.5)} y={CPT + 8} fontSize={9.5} textAnchor="middle" className="num"
              style={{ fill: "var(--fg-faint)" }}>
              谷底 w* = z/x = 0.5(w* 是最好的 w;z/x 就是 1÷2)
            </text>
            <polyline points={CURVE} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2} />

            {mode === "knob" ? (
              <g data-qa="knob-dot">
                <circle cx={xOf(w)} cy={yOf(l)} r={6} style={{ fill: "var(--accent-deep)" }} />
                <text x={xOf(w)} y={yOf(l) - 10} fontSize={10} textAnchor="middle" className="num"
                  style={{ fill: "var(--accent-deep)" }}>
                  {l.toFixed(2)}
                </text>
              </g>
            ) : (
              <g data-qa="switch-dots">
                {STOPS.map((s, i) => (
                  <circle key={s} cx={xOf(s)} cy={yOf(loss(s))} r={i === stop ? 6 : 4}
                    style={{
                      fill: i === stop ? "var(--accent-deep)" : "var(--fg-faint)",
                    }} />
                ))}
                <text x={xOf(sw)} y={yOf(swLoss) - 10} fontSize={10} textAnchor="middle"
                  className="num" style={{ fill: "var(--accent-deep)" }}>
                  {swLoss.toFixed(2)}
                </text>
              </g>
            )}
          </svg>

          {mode === "knob" ? (
            <div data-qa="knob-panel">
              <div className="mini-label mt-2">拧 w(−1 → 2)</div>
              <input type="range" min={-1} max={2} step={0.01} value={w}
                onChange={(e) => setW(Number(e.target.value))} aria-label="w 滑杆"
                style={{ ["--fill" as string]: `${((w + 1) / 3) * 100}%` }}
                data-qa="knob-slider" />
              <div className="reveal-box mt-3">
                <p className="num">
                  v = w·x = {(w).toFixed(2)}×2 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{v.toFixed(2)}</strong>
                  {"   "}罚分 = (v−z)² ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{l.toFixed(3)}</strong>
                </p>
                <p className="num mt-1.5">
                  脚下的账 ∂罚/∂w ={" "}
                  <strong>{g >= 0 ? "+" : ""}{g.toFixed(1)}</strong>
                  <span className="ml-2 font-normal" style={{ color: "var(--fg-muted)" }}>
                    {g < 0 ? "账是负的 → 往右拧,罚分降" : g > 0 ? "账是正的 → 往左拧,罚分降" : "账是 0 → 你正踩在谷底"}
                  </span>
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                拖到任何位置,账目都告诉你下一步该往哪边拧——这就是「连续」买的
                东西:整条曲线处处有坡,蒙眼也走得下山。
              </p>
            </div>
          ) : (
            <div data-qa="switch-panel">
              <div className="mini-label mt-2">档位(只能整档跳,没有中间)</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STOPS.map((s, i) => (
                  <button key={s} type="button"
                    className={`btn ${i === stop ? "active" : ""}`}
                    onClick={() => setStop(i)} data-qa="stop-btn">
                    {s > 0 ? "+" + s : s}
                  </button>
                ))}
              </div>
              <div className="reveal-box mt-3">
                <p className="num">
                  站在 {sw} 档:v = {(sw * X).toFixed(2)}、罚分 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{swLoss.toFixed(3)}</strong>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  最好的两档(0.2 档和 0.8 档)并列,罚分都是 0.36——连续旋钮
                  能拧到的 0.5(罚分 0)它们永远差一截。更糟的是:站在 0.2 档,
                  不跳过去试,你不知道 0.8 档更好还是更糟——<strong>档位之间
                  没有坡,账是 0</strong>。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 3-1</span>
        同一条罚分曲线,两种机器:连续旋钮处处有坡(账目=坡),开关只有六个孤点。
        训练要的「自己变准」,买的是「连续旋钮」那种机器。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 3-2 · 下山步进器:lr 与三种走法 ============ */

const MAX_STEPS = 200
/** 发散时 w 可能到 10^95 量级(200 步封顶永不溢出)——大数用科学计数法 */
const fmtW = (v: number) => (Math.abs(v) < 1000 ? v.toFixed(3) : v.toExponential(2))

function zoneOf(lr: number): string {
  if (lr < 0.125) return "稳步下山(误差一步比一步小)"
  if (Math.abs(lr - 0.125) < 1e-9) return "一步到谷底(每步乘的数恰好是 0)"
  if (lr < 0.25) return "跨谷来回弹:误差每步换一次正负号,但一直在变小"
  if (Math.abs(lr - 0.25) < 1e-9) return "每步乘的数是 −1:永久来回,卡死在谷两侧"
  return "上天了:每步乘的数大小超过 1,误差越乘越大"
}

function Descender() {
  const [lr, setLr] = useState(0.05)
  const [hist, setHist] = useState<number[]>([W0])
  const [running, setRunning] = useState(false)

  // 换 lr 就从头走:因子变了,旧轨迹混在一起看不清形态
  const setLrReset = (v: number) => {
    setLr(v)
    setHist([W0])
    setRunning(false)
  }
  const stepOnce = () => {
    setHist((h) =>
      h.length >= MAX_STEPS ? h : [...h, linStep(h[h.length - 1], X, Z, lr)],
    )
  }
  const reset = () => {
    setHist([W0])
    setRunning(false)
  }

  useEffect(() => {
    if (!running) return
    if (hist.length >= MAX_STEPS) {
      setRunning(false)
      return
    }
    const t = setTimeout(stepOnce, 110)
    return () => clearTimeout(t)
  })

  const n = hist.length - 1
  const wNow = hist[hist.length - 1]
  const factor = 1 - 2 * lr * X * X
  const flew = Math.abs(wNow) > WMAX + 0.5 || wNow < WMIN - 0.5

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 下山步进器:蒙眼下山的三种走法</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${CW} ${CH}`} data-qa="descend-curve"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 340 }}>
            <line x1={CPL} y1={CH - CPB} x2={CW - CPR} y2={CH - CPB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[1, 4, 9].map((p) => (
              <line key={p} x1={CPL} y1={yOf(p)} x2={CW - CPR} y2={yOf(p)}
                style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
            ))}
            <line x1={xOf(0.5)} y1={yOf(0)} x2={xOf(0.5)} y2={yOf(9)}
              strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <text x={xOf(0.5)} y={CPT + 8} fontSize={9.5} textAnchor="middle" className="num"
              style={{ fill: "var(--fg-faint)" }}>
              谷底 0.5
            </text>
            <polyline points={CURVE} fill="none" style={{ stroke: "var(--accent)" }}
              strokeWidth={2} opacity={0.55} />
            {/* 轨迹:相邻步连线(飞出画面的点由 svg 根部裁掉) */}
            <polyline data-qa="descend-trace"
              points={hist
                .map((wv) => `${xOf(wv).toFixed(1)},${yOf(loss(wv)).toFixed(1)}`)
                .join(" ")}
              fill="none" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            {hist.map((wv, i) =>
              wv >= WMIN - 0.4 && wv <= WMAX + 0.4 ? (
                <circle key={i} cx={xOf(wv)} cy={yOf(loss(wv))} r={i === n ? 5 : 1.6}
                  style={{ fill: i === n ? "var(--accent-deep)" : "var(--fg-faint)" }} />
              ) : null,
            )}
            {flew && (
              <text x={CW - CPR - 4} y={CPT + 10} fontSize={10} textAnchor="end"
                style={{ fill: "var(--accent-deep)" }}>
                已飞出画面 →
              </text>
            )}
          </svg>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            还是打靶器那道题(x=2、z=+1,起点 w=0):每按一步,w ← w − lr×账
            (← 念「变成」)。第 1 步替你算好:0 − 0.05×(−4) = 0.2——账是
            负的,旋钮就往右挪。小圆点是走过的位置,线是相邻两步的连线——
            lr=0.2 时那条来回跨谷的折线,就是「步子太大」的样子。
          </p>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[19rem]">
          <div className="mini-label">学习率 lr(0 → 0.5)</div>
          <input type="range" min={0} max={0.5} step={0.005} value={lr}
            onChange={(e) => setLrReset(Number(e.target.value))} aria-label="lr 滑杆"
            style={{ ["--fill" as string]: `${(lr / 0.5) * 100}%` }}
            data-qa="lr-slider" />
          {/* 双刻度线:0.125(一步到谷底)与 0.25(临界) */}
          <div className="num relative mt-1 h-7 text-xs" style={{ color: "var(--fg-faint)" }}>
            <span className="absolute" style={{ left: `${(0.125 / 0.5) * 100}%`, top: 0, transform: "translateX(-50%)" }}>
              |<br />0.125
            </span>
            <span className="absolute" style={{ left: "0.5%" }}>0</span>
            <span className="absolute" style={{ left: `${(0.25 / 0.5) * 100}%`, top: 0, transform: "translateX(-50%)", color: "var(--accent-deep)" }}>
              |<br />0.25
            </span>
            <span className="absolute" style={{ right: 0 }}>0.5</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>预设</span>
            {[0.05, 0.2, 0.35].map((p) => (
              <button key={p} type="button"
                className={`btn ${Math.abs(lr - p) < 1e-9 ? "active" : ""}`}
                onClick={() => setLrReset(p)} data-qa="lr-preset">
                {p}
              </button>
            ))}
            <span className="ml-auto" />
            <button type="button" className="btn" disabled={n >= MAX_STEPS}
              onClick={stepOnce} data-qa="step-btn">
              走一步
            </button>
            <button type="button" className={`btn ${running ? "active" : ""}`}
              onClick={() => setRunning((r) => !r)} data-qa="auto-btn">
              {running ? "⏸ 暂停" : "▶ 自动"}
            </button>
            <button type="button" className="btn" onClick={reset}>↺ 重置</button>
          </div>
          <div className="reveal-box mt-3">
            <p className="num">
              第 <strong>{n}</strong> 步:w ={" "}
              <strong style={{ color: "var(--accent-deep)" }}>{fmtW(wNow)}</strong>
              {"   "}罚分 = <strong>{fmtW(loss(wNow))}</strong>
            </p>
            <p className="num mt-1.5">
              误差每步乘这个数:1 − 2·lr·x² ={" "}
              <strong>{factor >= 0 ? "+" : ""}{factor.toFixed(3)}</strong>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" data-qa="zone"
              style={{ color: "var(--fg-muted)" }}>
              {zoneOf(lr)}
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            两条刻度线的来历:x=2 时,lr 在 0 到 0.125 之间,每步乘的数在 0
            和 1 之间(稳步);lr=0.125,乘的数恰好是 0(一步到谷);0.125
            到 0.25,乘的数是负的、但大小不到 1(来回弹,误差在缩);0.25,
            乘的数是 −1(永久来回);再大,误差就越乘越大。真实训练 lr=0.01,
            深深踩在「稳步」区——稳,但慢,几千盘棋慢慢磨。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 3-2</span>
        每一步都是真账目(教科书叫真梯度):w ← w − lr·2x(wx−z),就是正文那句
        「lr×账」(lib/foundations.ts 的{" "}
        <span className="mono">linStep</span>)。学习率的全部数学就是那个每步
        乘的数 |1−2·lr·x²|(两根竖线=只看大小、不管正负号):不到 1,误差
        越乘越小;正好 1,卡死;超过 1,上天。
      </figcaption>
    </figure>
  )
}
