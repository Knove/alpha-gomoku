/** 毕业 · 沙盒:和它下一盘(不设门槛;附一组可回看的诊断题)。
 *  人机对弈:真权重 loadNet + SearchTree 每手 20 次模拟,AI 回应显示访问 top3;
 *  全系统图:每个节点可点,跳回教它的那课;毕业词呼应序的承诺。 */
import { useEffect, useMemo, useRef, useState } from "react"
import Board from "../lib/board"
import { emptyBoard, outcome, play, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig } from "../engine/mcts"
import { Quiz } from "../framework/quiz"
import { loadWeights } from "../lib/weights"

const SIMS = 20 // 每手 20 次模拟(比训练时的 40 少一半,网页上 <1 秒)
const CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 }
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

// 毕业诊断不接 onAllCorrect：选错会立刻显示因果解释，也不会拦住自由试玩。
const GRADUATION_DIAGNOSTIC = [
  {
    q: "同一个网络面对同一局面，甲只搜索 20 次，乙搜索 80 次。关于乙的落子，最稳妥的说法是？",
    options: [
      "一定更强，因为 80 比 20 大",
      "它多检查了分支，通常有更多机会发现问题，可能改选别处；但网络的先验仍可能错，80 次也不是保证",
      "两者一定相同，因为网络权重没有变",
    ],
    answer: 1,
    explain: "搜索预算像多给一点思考时间：它会带来更多访问记录，常能纠正第一印象，却不能把错误的先验或漏看的变化变成必然正确。比较棋力仍要看受控对战的累积证据。",
  },
  {
    q: "把一条训练样本的棋盘顺时针转 90°，却把策略目标 π 原封不动。最先出了什么问题？",
    options: [
      "没有问题，π 的 81 个数加起来仍是 1",
      "题目和答案的坐标错位：棋盘上的好点已经转走，π 却还指向转前的位置",
      "只有终局结果 z 会错，π 不受坐标影响",
    ],
    answer: 1,
    explain: "π 不是抽象的 81 个数；每个数都回答“这个格子该下的概率”。棋盘旋转时，π 必须把每个概率搬到对应的新格子。z 只表示胜负，是一个数，不随旋转移动。",
  },
  {
    q: "一盘棋最后黑胜。轮到白方的那一步样本，价值目标 z 应记什么？",
    options: [
      "+1，因为整盘棋由黑方赢了",
      "−1，因为每条样本都站在“轮到谁”的视角；对白方这一步，“我”输了",
      "0，因为白方没有走到终局",
    ],
    answer: 1,
    explain: "这是视角铁约的延续：输入里的“己方/敌方”和价值头里的“我会不会赢”必须指同一个行棋方。黑白轮流时，“我”换人，所以同一终局的 z 会逐手换号。",
  },
  {
    q: "新网络的训练损失下降，并在 6 局受控对战中略胜现任冠军。现在最合理的结论是？",
    options: [
      "已经证明它永远更强，可以停止检验",
      "损失下降说明更贴合训练目标；受控对战是更直接的实战证据，但 6 局样本很少，仍应保留余地或继续赛",
      "损失和对战都没有信息，完全不必看",
    ],
    answer: 1,
    explain: "损失回答“作业做得像不像”，不是棋力的充分证据。受控对战更接近真正目标，却仍会受局数、开局和运气影响；证据会随更公平、更多局的比赛而变强。",
  },
]

/** moves → 局面:逐手重放(引擎状态不可变,悔棋只需回退数组)。 */
function replayState(moves: number[]): GameState {
  let st = emptyBoard()
  for (const a of moves) st = play(st, a, st.current)
  return st
}

export default function Graduation() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">毕业</div>
      <h1 className="text-2xl font-bold">沙盒:和它下一盘</h1>
      <p className="prose mt-4">
        十三课走完,图纸全在你手里了。最后一件事:坐到棋盘对面——你执子,
        它用你看着长大的网络(真权重)和搜索课里的搜索,一手一手跟你下。
        先随便下、随便玩；最后还有四个不计分的情境题,用来把整条因果链再对一遍。
      </p>

      <PlayGround />
      <SystemMap />

      <div className="card mt-12 p-6">
        <h3 className="text-lg font-bold">带走的六件事</h3>
        <div className="prose mt-3">
          <p>
            全系统图收它的十二个零件。这张单子收你的六件思维——
            散在各课,换个舞台照样带得走。括号里,是教会你它的那一课。
          </p>
          <ul>
            <li>
              <strong>结构给线索,不替你手写棋理。</strong>
              模板把“相邻格子常要一起看”和“同一检测器可在各处复用”写进结构；
              它没有把「三连要堵」这条规则塞进网络,那仍要靠数据和训练学出来
              (<a href="#/l08">模板课</a>)。
            </li>
            <li>
              <strong>视角统一,一份功夫当两份用。</strong>
              所有数都站在「轮到谁」的视角,同一条棋理黑白只学一遍
              (<a href="#/l02">视角课</a>)。
            </li>
            <li>
              <strong>训练目标要带来新增、尽量可靠的信息。</strong>
              搜索后的 π 记下了裸网络一眼看不见的推演过程,通常是更丰富的目标；
              但预算有限、先验会错,它不是永远更强的老师
              (<a href="#/l12">飞轮课</a>)。
            </li>
            <li>
              <strong>损失测作业贴合,对战给更直接但有限的证据。</strong>
              判卷分数下降并不充分说明棋力上涨；控制先后手和开局的对战更接近实战,
              但少量对局仍会受运气影响
              (<a href="#/l13">竞技场课</a>)。
            </li>
            <li>
              <strong>对称性让同一事实换八个等价视角。</strong>
              棋盘和 π 一起旋转或镜像,训练能从不同朝向复习同一条棋谱；
              它们不是八盘互不相关的新棋
              (<a href="#/l12">飞轮课的变换台</a>)。
            </li>
            <li>
              <strong>答错了能找账。</strong>
              误差沿网络逐层摊回每个旋钮,计算轻推它会让错误往哪边变——
              许多能认照片、听语音的可训练系统,也靠这种办法拧旋钮
              (<a href="#/l06">回摊课</a>)。
            </li>
          </ul>
        </div>
      </div>

      <Quiz
        title="毕业诊断 · 四个情境，不计分也不设门槛"
        questions={GRADUATION_DIAGNOSTIC}
      />

      <div className="card mt-12 p-6">
        <h3 className="text-lg font-bold">毕业词</h3>
        <p className="prose mt-3">
          序里承诺过:15 节课之后,由你自己考一考它——序、十三课、这页毕业,正好凑满 15 节。
          现在你已经知道这条因果链为什么能跑起来——81 个数怎样装下一盘棋、
          视角怎样从输入贯到目标、网络怎样先给判断、搜索怎样在有限预算里补推演。
          终局和 π 怎样成为两种作业,误差怎样回到旋钮,飞轮怎样一圈圈尝试改进,
          又为什么还要用受控对战检查它。它只训到第 3 轮；一盘输赢不够给它下棋力结论。
          但每一步你都能追问它<em>为什么</em>这么下——这比背一个结论更难得。
        </p>
        <p className="prose mt-3">
          往下走:<a href="../explainer/">介绍站(explainer)</a>有一篇更长的图文漫游;
          另有四篇更深的讲义(写给大人的版本),点下面四个门进去:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["game.md", "棋盘:81 个数与一条铁约"],
            ["network.md", "策略-价值网络"],
            ["mcts.md", "树搜索:再想四十遍"],
            ["flywheel.md", "飞轮:数据转成棋力"],
          ].map(([f, t]) => (
            <a key={f} className="btn" href={`archive/${f}`}>{t}</a>
          ))}
        </div>
        <p className="prose mt-4" style={{ color: "var(--fg-muted)" }}>
          这套讲的不是五子棋,是一种「让 AI 从零教会自己」的方法——舞台换了,飞轮不换。
        </p>
      </div>
    </section>
  )
}

/* ============ 沙盒 · 人机对弈(真权重 + 真搜索) ============ */

function PlayGround() {
  const [human, setHuman] = useState<1 | -1>(1)
  const [moves, setMoves] = useState<number[]>([])
  const [thinking, setThinking] = useState(false)
  const [aiTop, setAiTop] = useState<{ a: number; n: number; q: number }[] | null>(null)
  const [aiMs, setAiMs] = useState<number | null>(null)
  const [weights, setWeights] = useState<WeightsJson | null>(null)
  const netRef = useRef<((p: number[][][]) => { logits: number[]; value: number }) | null>(null)

  useEffect(() => {
    let alive = true
    loadWeights().then((w) => {
      if (!alive) return
      netRef.current = loadNet(w)
      setWeights(w)
    })
    return () => {
      alive = false
    }
  }, [])

  const state = useMemo(() => replayState(moves), [moves])
  const out = outcome(state)
  const humanTurn = out === null && state.current === human

  // AI 落子:同步算 20 次模拟(<1s),setTimeout 让「思考中」先渲染出来。
  // busyRef 防重入:不把 thinking 放进依赖、不设 cleanup——清理会 cancel 掉自己的定时器
  const busyRef = useRef(false)
  useEffect(() => {
    if (!weights || busyRef.current || out !== null || state.current === human) return
    busyRef.current = true
    setThinking(true)
    setAiTop(null)
    setTimeout(() => {
      const tree = new SearchTree(state, CFG, netRef.current!, Math.random)
      const t0 = performance.now()
      tree.run(SIMS)
      const a = tree.bestAction()
      const N = Array.from(tree.root.N)
      const rows = N.map((n, i) => ({ a: i, n, q: n > 0 ? tree.root.W[i] / n : 0 }))
        .filter((r) => r.n > 0)
        .sort((x, y) => y.n - x.n)
        .slice(0, 3)
      setAiTop(rows)
      setAiMs(performance.now() - t0)
      setMoves((ms) => [...ms, a])
      setThinking(false)
      busyRef.current = false
    }, 60)
  }, [weights, state, human, out])

  const click = (x: number, y: number) => {
    if (!humanTurn || thinking) return
    const a = y * 9 + x
    if (state.board[y][x] !== 0) return
    setMoves((ms) => [...ms, a])
    setAiTop(null)
  }

  const undo = () => {
    if (thinking || moves.length === 0) return
    setAiTop(null)
    setMoves((ms) => {
      let m = ms.slice()
      // 先掉「最后一手不是你下的」那些(AI 的应手),再掉你刚才那手
      while (m.length && (((m.length - 1) % 2 === 0) !== (human === 1))) m.pop()
      if (m.length) m.pop()
      return m
    })
  }

  const reset = (h: 1 | -1 = human) => {
    // 思考中禁止重开:挂起的定时器会在空盘上落下旧局面的子
    if (thinking) return
    setHuman(h)
    setMoves([])
    setAiTop(null)
  }

  const last = moves.length ? moves[moves.length - 1] : null
  const status = out !== null
    ? out === 0 ? "和棋——盘满,握手言和"
      : out === human ? "你赢了——这是一局体验,别急着据此给谁下棋力结论"
      : "它赢了——也只是一局;看看右边,它把搜索预算押在哪"
    : thinking ? "它想事情中(每手 20 次模拟 × 每次问一次网络)……"
    : humanTurn ? `轮到你(执${human === 1 ? "黑" : "白"})落子`
    : "轮到它……"

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-5">
        <span className="mini-label">沙盒 · 人机对弈——真权重 weights-best + 真搜索</span>
        <span className="mini-label num">每手 {SIMS} 次模拟</span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1 sm:max-w-[24rem]">
          <div data-qa="play-board">
            <Board
              board={state.board.flat()}
              onCellClick={click}
              lastMove={last !== null ? { x: last % 9, y: Math.floor(last / 9) } : null}
              ghostPlayer={human}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="seg">
              <button type="button" className={`seg-btn ${human === 1 ? "active" : ""}`}
                onClick={() => reset(1)} data-qa="pick-black">我执黑(先行,会重开)</button>
              <button type="button" className={`seg-btn ${human === -1 ? "active" : ""}`}
                onClick={() => reset(-1)} data-qa="pick-white">我执白(会重开)</button>
            </span>
            <button type="button" className="btn" disabled={thinking || moves.length === 0}
              onClick={undo} data-qa="undo">悔棋</button>
            <button type="button" className="btn" onClick={() => reset()} data-qa="restart">重来</button>
          </div>
          <div className="banner mt-3" data-qa="play-status"
            style={out !== null && out === human
              ? { borderColor: "var(--accent)", background: "var(--accent-wash)", color: "var(--accent-deep)" }
              : undefined}>
            {status}
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            {weights
              ? "AI = SearchTree(搜索树)+ loadNet(装网络),每手真算一遍;落子取访问数最大——和训练时同一个大脑:训练时每手想 40 遍,这里想 20 遍,省一半。"
              : "正在加载真权重(weights-best.json,约 1.2 MB)……"}
          </p>
        </div>

        <aside className="w-full sm:w-64 sm:flex-none">
          <div className="mini-label">它的思考 · 最近一手访问数前三名</div>
          {!aiTop ? (
            <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
              {thinking ? "20 次模拟跑着,马上回来……" : "它落一子,这里就亮出那手搜索投给谁。"}
            </p>
          ) : (
            <>
              <ol className="mt-2 space-y-1.5" data-qa="ai-top">
                {aiTop.map((r) => (
                  <li key={r.a} className="l00-top-row">
                    <span className="mono text-sm">{coord(r.a)}</span>
                    <span className="prob-track">
                      <span className="prob-fill"
                        style={{ width: `${(r.n / aiTop[0].n) * 100}%` }} />
                    </span>
                    <span className="num flex-none text-right text-xs" style={{ color: "var(--fg-faint)" }}>
                      N={r.n} Q={r.q >= 0 ? "+" : ""}{r.q.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ol>
              {aiMs !== null && (
                <p className="num mt-2 text-xs" style={{ color: "var(--fg-faint)" }}>
                  20 次模拟共 {aiMs.toFixed(0)} 毫秒
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                条的长短 = 访问数 N(第一名拉满);Q 是每条边的平均得分——
                搜索课的账本,原样搬来。看它把预算押在哪,你就知道它的「直觉」长在哪。
              </p>
            </>
          )}
          <div className="reveal-box mt-4 text-xs leading-relaxed">
            提个醒:它才训到第 3 轮。这里的一盘胜负只让你观察搜索和网络怎样配合，
            不是它或你的棋力报告；要比较模型，得回到竞技场课那样的受控对战。
          </div>
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真家伙</span>
        每一步都是现场真算:点击 → play(game.ts)落子;它那手 = new SearchTree
        (建棵搜索树)→ run(20)(真跑 20 次模拟)→ bestAction(挑访问数最大的)。
        判胜用 game.ts 的 outcome,悔棋只是回退重放。
      </figcaption>
    </figure>
  )
}

/* ============ 全系统图:每个零件都有它那一课 ============ */

interface SysNode {
  x: number
  y: number
  name: string
  sub: string
  href: string
}

const BRAIN: SysNode[] = [
  { x: 12, name: "棋盘", sub: "81 个数", href: "#/l01" },
  { x: 124, name: "三平面", sub: "己/敌/颜色", href: "#/l07" },
  { x: 236, name: "模板", sub: "3×3 滑窗", href: "#/l08" },
  { x: 348, name: "叠层", sub: "7 层看全盘", href: "#/l09" },
  { x: 460, name: "双头", sub: "下哪+谁优", href: "#/l10" },
  { x: 572, name: "搜索", sub: "有限预算推演", href: "#/l11" },
].map((n) => ({ ...n, y: 34 }))

const LOOP: SysNode[] = [
  { x: 300, y: 132, name: "自我对弈", sub: "左右互搏", href: "#/l12" },
  { x: 492, y: 132, name: "(s, π, z)", sub: "每手三条记录", href: "#/l12" },
  { x: 584, y: 222, name: "经验池", sub: "攒着混着批", href: "#/l12" },
  { x: 404, y: 296, name: "训练", sub: "两笔错误", href: "#/l12" },
  { x: 196, y: 296, name: "竞技场", sub: "受控对战", href: "#/l13" },
  { x: 16, y: 222, name: "best", sub: "现任冠军", href: "#/l13" },
]

function SystemMap() {
  return (
    <figure className="figure mt-10">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">全系统图 · 点任何一个零件,回到教它的那一课</span>
      </div>
      <div className="overflow-x-auto p-4 sm:p-5" data-qa="sysmap">
        <svg viewBox="0 0 688 356" style={{ minWidth: 560, width: "100%", height: "auto", display: "block" }}>
          <defs>
            <marker id="sys-arrow" viewBox="0 0 10 10" refX="8" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: "var(--fg-faint)" }} />
            </marker>
          </defs>

          <text x={12} y={18} fontSize={11} className="mini-label">上半 · 局面 → 输入 → 网络 → 搜索</text>
          <text x={12} y={114} fontSize={11} className="mini-label">下半 · 对弈记录 → 训练 → 受控检验 → 下一轮</text>

          {BRAIN.slice(0, -1).map((n, i) => (
            <line key={`b${i}`} x1={n.x + 92} y1={n.y + 22} x2={BRAIN[i + 1].x - 2} y2={n.y + 22}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1.4}
              markerEnd="url(#sys-arrow)" />
          ))}

          {/* 大脑 → 自我对弈(搜索产 π,飞轮起转) */}
          <path d="M 618 78 C 618 100, 560 96, 505 122"
            fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.6}
            strokeDasharray="5 4" markerEnd="url(#sys-arrow)" />
          <text x={563} y={96} fontSize={10} style={{ fill: "var(--accent-deep)" }}>给搜索先验</text>

          {[
            { a: LOOP[0], b: LOOP[1], bend: 0 },
            { a: LOOP[1], b: LOOP[2], bend: 0 },
            { a: LOOP[2], b: LOOP[3], bend: 0 },
            { a: LOOP[3], b: LOOP[4], bend: 0 },
            { a: LOOP[4], b: LOOP[5], bend: 0 },
            { a: LOOP[5], b: LOOP[0], bend: 0 },
          ].map(({ a, b }, i) => {
            const x1 = a.x + 48, y1 = a.y + 22, x2 = b.x + 48, y2 = b.y + 22
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
            const bend = 18
            const dx = x2 - x1, dy = y2 - y1
            const cx = mx - (dy / Math.hypot(dx, dy)) * bend
            const cy = my + (dx / Math.hypot(dx, dy)) * bend
            return (
              <path key={`l${i}`} d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.6}
                markerEnd="url(#sys-arrow)" />
            )
          })}
          <text x={344} y={216} fontSize={10.5} textAnchor="middle" className="mini-label">
            新网络回到自我对弈,转下一圈(产数据的是最新网络,best 只守擂)
          </text>

          {[...BRAIN, ...LOOP].map((n, i) => (
            <a key={i} href={n.href} data-qa="sys-node" className="sys-node">
              <rect x={n.x} y={n.y} width={96} height={44} rx={10} />
              <text className="sys-name" x={n.x + 48} y={n.y + 19} textAnchor="middle">{n.name}</text>
              <text className="sys-sub" x={n.x + 48} y={n.y + 34} textAnchor="middle">{n.sub}</text>
            </a>
          ))}
        </svg>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">毕业地图</span>
        上半让棋局先变成输入,再由网络和搜索给出判断；旋钮、计票、弯折和回摊是支撑它的数学工具。
        下半把一盘棋记录成作业,训练出挑战者,再用受控对战检查是否该换冠军；「交叉熵+平方差」=两个头各算一笔错账。
        12 个零件,每个你都拆过。点进去随便复习——门已全开。
      </figcaption>
    </figure>
  )
}
