/** 第 3 课 · 旋钮:自己变准的机器(地基篇 1/4)。
 *  节拍:谜题(棋力从哪来)→ 揭晓(查表破产/旋钮 vs 开关/三个数从哪来/账目/下山/串回来)→
 *  部件 1(打靶器:双三局面 r=w·x,连续旋钮的抛物线 vs 开关档位没坡)→
 *  部件 2(下山步进器:lr 滑杆真实梯度步,双刻度线 0.125/0.25)→
 *  对账(train.py optimizer)→ 小测。 */
import { useEffect, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board from "../lib/board"
import { linGrad, linStep } from "../lib/foundations"

/* 教学局面:己方双三——横 (2,4)(3,4)(4,4) + 竖 (4,4)(4,5)(4,6)。
 * 本课故意把棋局缩成读数 x=2(我方已成三连的个数)，并假设这盘训练对局后来赢了，
 * 所以终局标签 z=+1。一个旋钮的玩具估价器:r = w·x,罚分 (r−z)²。 */
const X = 2
const Z = 1
const W0 = 0 // 教学玩具的固定起点；真实训练只在开始时随机初始化一次
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

      <LessonGuide
        question="为什么机器不必背下每一种棋局，也能从输赢里越练越会下？"
        why="先弄清机器里什么能改、何时改、改了为什么会影响判断，后面的细节才不会只剩一串名词。"
        chain={[
          "棋盘进入固定的计算骨架",
          "许多可调数字决定它怎样看重棋形，给出判断",
          "训练结果指出判断错了多少，告诉数字该微调哪边",
          "更准的判断配合搜索变成更好的走法，长期表现为棋力",
        ]}
        takeaway="“旋钮”不是棋力本身；它们共同改变机器的判断。训练时才调旋钮，下棋时只使用已经调好的旋钮。"
        boundary="本课把真实网络缩成“一个旋钮 + 一个简单读数”的显微镜。真实机器有约 14.5 万个旋钮，并同时学习落子偏好和胜负判断；后续课程会逐层补全它。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "要让机器从没见过的棋局里也能学会下棋，最关键的设计是什么？",
            options: [
              "背棋谱:把每种局面的最好一步都存进一张大表,下棋时查表",
              "写完所有规则:请高手把每种棋形和应手都列成「如果…就…」",
              "固定的计算骨架 + 大量可微调的数字:让输赢不断把这些数字调得更合适",
            ],
            answer: 2,
            explain:
              "选第三个。查表装不下、也不会举一反三；规则可以写出一部分棋理，但人很难把无数局面及其轻重全列完。第三种把人最擅长的事和机器最擅长的事分开：人规定计算骨架，机器从结果中调数字。那些数字的正式名字叫“参数”或“权重”。它们不是棋力本身，而是决定机器如何判断棋局的原因。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 先搭机器，再看它怎样自己变准</h3>
        <p>
          <strong>先看机器由什么组成。</strong>把它想成一台固定的判题机：输入是眼前
          的棋盘；中间是人先搭好的计算骨架；骨架里装着很多可以调的数字；输出是
          两个判断——<em>哪里更值得下</em>、<em>这局谁更可能赢</em>。本课把这些可调数字
          叫作<strong>旋钮</strong>。它们的正式名字是参数或权重，但先把它们当成
          “不同证据有多重要”的刻度就够了。
        </p>
        <p>
          <strong>为什么不查表，也不把所有棋理写死？</strong>9×9 棋盘的每格有空、黑、
          白三种可能，组合有 3<sup>81</sup> 种，约是 4 后面跟 38 个 0；表根本装不下。
          即使假装装得下，新局面也没有现成一行可查。把见过的例子用到没见过的例子上，
          叫<em>泛化</em>；查表没有这种能力。手写规则能给出一些提示，却无法由人逐一
          决定所有局面、所有棋形各该有多重要。旋钮的办法是：人只规定“怎样计算”，
          大量对局自己决定“每件事该看重多少”。
        </p>
        <p>
          <strong>一个旋钮到底做什么？</strong>先故意把真实机器缩成一道小题：图中<strong>规定</strong>
          横一条、竖一条，共两条「己方三连」，所以教学读数是 <span className="mono">x = 2</span>。
          这一步是我们暂时替机器做的，只为放大看一个旋钮的工作；真实网络不会先请人把「三连数」
          写好。本节先只保留「这局最后谁占优」这一种判断。令 <span className="mono">w</span> 是这条读数的
          权重，<span className="mono">r = w × x</span> 是玩具机器给出的<strong>原始分数</strong>。它的意思很具体：
          每多一条三连，总分就改变 <span className="mono">w</span>；<span className="mono">w</span> 为正就抬高，
          <span className="mono">w</span> 为负就压低。<span className="mono">w = 0</span> 时，这条线索不计入；
          <span className="mono">w = 0.5</span> 时，两条三连一共给 <span className="mono">r = 1</span>。
          在这个玩具里，<span className="mono">r</span> 越高，暂时就表示越偏向「我方最后会赢」。
        </p>
        <p>
          这里的 <span className="mono">w</span> 不是一条「见三连就怎样下」的规则，也不是棋力本身；
          它只决定<strong>一条证据对一个分数的影响</strong>。真实机器不会请人先数「三连数」；
          它会从棋盘中逐层形成许多内部读数，再由许多旋钮共同处理。现在不需要知道这些读数怎样产生。
          眼下只追踪一件事：原始分数和训练答案不符时，怎样把 <span className="mono">w</span>
          微调得更合适。
        </p>
        <p>
          <strong>训练和下棋是两件事。</strong>训练开始时，真实机器会随机设好一次
          旋钮的位置；之后它在一批批对局之间持续微调，绝不会每盘棋重新乱猜。
          对局结束后才知道真答案 <span className="mono">z</span>：赢记 +1，输记 −1，和记 0。
          在这个玩具里，它把原始分数 <span className="mono">r</span> 同 <span className="mono">z</span> 比较。
          差 <span className="mono">r−z</span> 是<em>误差</em>；把它平方得到<em>损失</em>
          <span className="mono">(r−z)²</span>，无论猜高还是猜低都会扣分，错得越远扣得越多。
          真实系统还会学习“哪些落子更值得尝试”的答案；这里先只讲胜负这一笔，
          后面再把两笔训练目标合起来。
        </p>
        <p>
          <strong>错了以后，为什么知道该往哪调？</strong>关键不是“知道答案”本身，
          而是连着算两本账：<em>旋钮改一点，预测会变多少</em>；<em>预测变一点，罚分会变多少</em>。
          把两本账接起来，就得到“这个旋钮改一点，罚分会怎样变”。教科书把这叫
          导数或梯度；本课把它叫<strong>方向账</strong>。在下面这道平滑的一旋钮小题里，
          方向账为负就向右调，为正就向左调；等于 0 表示已到这道小题的最好位置。
        </p>
        <p>
          <strong>为什么旋钮要能连续微调？</strong>若每个设置只能选几个档位，少数档位
          可以逐个试；但 14.5 万个档位组合起来，根本无法穷举。连续数字让“轻轻调一点”
          成为可能：在这个玩具里，预测和罚分会平滑改变，于是方向账能提供局部线索。
          这不是说所有 <span className="mono">if</span> 规则都不能出现在程序里；而是
          <strong>用来学习的数字</strong>要能从小变化中得到更新方向。
        </p>
        <p>
          <strong>把因果链串回棋局。</strong>训练时：棋局 → 预测 → 终局或搜索给出的答案
          → 算损失 → 按方向账微调旋钮。下棋时：棋局 → 已调好的旋钮给出判断 → 搜索把判断
          变成走法。许多轮自动纠错后，判断更准、搜索更少被带偏，长期的赢棋能力才提高。
          这就是“自己变准”，不是魔法，也不是把棋力塞进某一颗旋钮。
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
          本课部件里你拧的是<strong>一个</strong>旋钮；真训练一次会更新约 14.5 万个，
          每个都按自己的方向账挪一点。这条“先算错多少，再沿能减小罚分的方向更新”
          的主线没有变。<span className="mono">SGD</span>、动量、权重衰减是让实际训练
          更稳的工程细节；第 11 课会在你看见完整双头与搜索后，展开“每颗旋钮的方向账怎样算出来”。
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
              "连续数可以小调一点并观察罚分怎样变，提供局部更新方向；少数离散档位能逐个试，但大量档位组合无法穷举",
              "开关写代码更难",
            ],
            answer: 1,
            explain:
              "六个档位当然可以全试一遍；难点在真实机器有约 14.5 万个可学数字，组合数会爆炸。连续旋钮让训练能问“轻轻往这边调，罚分是升还是降？”——在平滑的局部里得到方向，而不是枚举所有组合。程序中的条件判断并不因此错误；可学习的数字才需要这种微调能力。",
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
              "在这个单旋钮例子里：lr=0 完全不动；0.05 稳步靠近；0.125 恰好一步到谷底；0.2 来回跨谷但误差会缩；0.25 永久来回；0.35 越荡越高。这些具体边界由 x=2 这道玩具题算出，不能照搬到真实网络；它们只说明学习率就是“每次改多大一步”。",
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

  const r = w * X
  const l = loss(w)
  const g = linGrad(w, X, Z) // 脚下的账(坡)
  const sw = STOPS[stop]
  const swLoss = loss(sw)

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 一个旋钮的显微镜:它怎样改变一个判断</span>
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
            <div className="mini-label">本页规定的读数 x 与训练答案 z</div>
            <p className="num mt-1.5">
              x = <strong>2</strong>(本页规定:横一条 + 竖一条)
              <br />z = <strong>+1</strong>(这里<strong>假设</strong>这盘训练对局后来由「我」赢了)
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              这是只用一条线索的显微镜，不是完整棋力。它只让我们看清：玩具旋钮
              <span className="mono">w</span> 怎样改变原始分数 <span className="mono">r = w·x</span>
              和罚分。<span className="mono">x</span> 与 <span className="mono">z</span> 在本页固定；
              拖动的只有 <span className="mono">w</span>。
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
              想让原始分数等于训练答案:w×2=1,所以最好 w=0.5
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
                  r = w·x = {(w).toFixed(2)}×2 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{r.toFixed(2)}</strong>
                  {"   "}罚分 = (r−z)² ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{l.toFixed(3)}</strong>
                </p>
                <p className="num mt-1.5">
                  方向账(罚分对 w 的变化率) ={" "}
                  <strong>{g >= 0 ? "+" : ""}{g.toFixed(1)}</strong>
                  <span className="ml-2 font-normal" style={{ color: "var(--fg-muted)" }}>
                    {g < 0 ? "是负的 → 往右调一点，罚分会降" : g > 0 ? "是正的 → 往左调一点，罚分会降" : "是 0 → 这道小题已到最好位置"}
                  </span>
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                在这道平滑的小题里，除谷底外每个位置都有方向。连续旋钮让“小调一点”
                真的会留下可测的变化；这就是训练能利用的局部线索。
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
                  站在 {sw} 档:r = {(sw * X).toFixed(2)}、罚分 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{swLoss.toFixed(3)}</strong>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  最好的两档(0.2 档和 0.8 档)并列，罚分都是 0.36；连续旋钮能调到
                  0.5，罚分为 0。六个档位还能逐个试，但真实机器有约 14.5 万个
                  可学数字，所有档位组合无法穷举。离散档位之间没有“调 0.01 格”这条
                  路，也就没有可用的局部方向账。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 3-1</span>
        同一题的两种设定：连续旋钮可以沿曲线小步调整；六个档位只能挨个比较。
        这个玩具说明的是为什么<strong>可学习的数字</strong>通常设为连续值，不是在说程序里不能有条件判断。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 3-2 · 下山步进器:lr 与三种走法 ============ */

const MAX_STEPS = 200
/** 发散时 w 可能到 10^95 量级(200 步封顶永不溢出)——大数用科学计数法 */
const fmtW = (v: number) => (Math.abs(v) < 1000 ? v.toFixed(3) : v.toExponential(2))

function zoneOf(lr: number): string {
  if (Math.abs(lr) < 1e-9) return "原地不动:学习率是 0，旋钮不会更新"
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
        <span className="mini-label">部件 · 下山步进器:方向有了，步子该迈多大</span>
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
            还是那道题(x=2、z=+1，教学起点 w=0)：每按一步，
            <span className="mono">w ← w − lr×方向账</span>（← 念“变成”）。第 1 步：
            0 − 0.05×(−4) = 0.2——方向账是负的，旋钮向右调。小圆点是走过的位置，
            线是相邻两步的连线；lr=0.2 时来回跨过谷底，说明步子虽能前进，却开始摆动。
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
            这两条刻度线只属于当前玩具(x=2、单个旋钮)：lr=0 时完全不动；0 到
            0.125 时稳步靠近；0.125 恰好一步到谷底；0.125 到 0.25 会来回跨过谷底
            但仍在靠近；0.25 会永久来回；更大则越走越远。真实网络有许多旋钮和复杂
            的地形，不能直接套这两个阈值；代码里的 lr=0.01 是经过实验选择的步长。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 3-2</span>
        进阶读法：本玩具每一步算 <span className="mono">w ← w − lr·2x(wx−z)</span>，
        就是“学习率 × 方向账”（<span className="mono">linStep</span>）。它的临界值来自
        <span className="mono">|1−2·lr·x²|</span>；这里只用来解释这个滑杆，不是现实网络的通用安全线。
      </figcaption>
    </figure>
  )
}
