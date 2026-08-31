/** 毕业 · 沙盒:和它下一盘(无谜题无小测,自由玩)。
 *  人机对弈:真权重 loadNet + SearchTree 每手 20 次模拟,AI 回应显示访问 top3;
 *  全系统图:每个节点可点,跳回教它的那课;毕业词呼应序的承诺。 */
import { useEffect, useMemo, useRef, useState } from "react"
import Board from "../lib/board"
import { emptyBoard, outcome, play, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig } from "../engine/mcts"
import { loadWeights } from "../lib/weights"

const SIMS = 20 // 每手 20 次模拟(比训练时的 40 少一半,网页上 <1 秒)
const CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 }
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

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
        它用你看着长大的网络(真权重)和第 11 课的搜索,一手一手跟你下。
        这一页没有谜题也没有小测,随便下、随便玩。
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
              <strong>能砌进结构的常识,别留给数据学。</strong>
              「三连要堵」写进棋盘和模板,网络就不用从几千盘棋里自己悟
              (<a href="#/l08">第 8 课</a>)。
            </li>
            <li>
              <strong>视角统一,一份功夫当两份用。</strong>
              所有数都站在「轮到谁」的视角,同一条棋理黑白只学一遍
              (<a href="#/l02">第 2 课</a>)。
            </li>
            <li>
              <strong>老师必须比学生强,飞轮才转得动。</strong>
              拿学生自己的答案当教材,它只能学到自己的偏见,飞轮原地空转
              (<a href="#/l12">第 12 课</a>)。
            </li>
            <li>
              <strong>损失会撒谎,对战才算数。</strong>
              判卷的分数量不出棋力,涨没涨要擂台上见
              (<a href="#/l13">第 13 课</a>)。
            </li>
            <li>
              <strong>对称性是免费的数据。</strong>
              转一下棋盘,一份棋谱当八份用,存储一分不花
              (<a href="#/l12">第 12 课变换台</a>)。
            </li>
            <li>
              <strong>答错了能找账。</strong>
              误差沿网络逐层摊回每个旋钮,谁影响大谁多改——
              所有『可训练』系统都用这套账法:认得出照片里的猫、
              听得懂你说话的,也是这种能拧旋钮的机器(<a href="#/l06">第 6 课</a>)。
            </li>
          </ul>
        </div>
      </div>

      <div className="card mt-12 p-6">
        <h3 className="text-lg font-bold">毕业词</h3>
        <p className="prose mt-3">
          序里承诺过:15 节课之后,由你自己考一考它——序、十三课、这页毕业,正好凑满 15 节。
          现在你已经知道它每个零件为什么长这样——81 个数怎么装下一盘棋、
          一条视角铁约怎么从头贯到尾、模板怎么滑、层怎么叠、账怎么摊。
          两个头怎么分工、四十遍怎么想、飞轮怎么转、晋升凭什么算数。
          它下得还很臭(才训到第 3 轮),但每一步烂棋,
          你都能说出它<em>为什么</em>这么烂——这比会下好棋更难得。
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
      : out === human ? "你赢了!验收通过——它才训到第 3 轮,别骄傲"
      : "它赢了——把第 8 课的模板讲给它听"
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
                第 11 课的账本,原样搬来。看它把预算押在哪,你就知道它的「直觉」长在哪。
              </p>
            </>
          )}
          <div className="reveal-box mt-4 text-xs leading-relaxed">
            提个醒:它才训到第 3 轮,策略损失还贴着乱猜线——它大概率会让你,
            但偶尔会走出你看不懂的臭棋。臭得诚实。
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
  { x: 572, name: "搜索", sub: "再想 40 遍", href: "#/l11" },
].map((n) => ({ ...n, y: 34 }))

const LOOP: SysNode[] = [
  { x: 300, y: 132, name: "自我对弈", sub: "左右互搏(L12)", href: "#/l12" },
  { x: 492, y: 132, name: "(s, π, z)", sub: "每手三条记录(L12)", href: "#/l12" },
  { x: 584, y: 222, name: "经验池", sub: "攒着混着批(L12)", href: "#/l12" },
  { x: 404, y: 296, name: "训练", sub: "交叉熵+平方差(L12)", href: "#/l12" },
  { x: 196, y: 296, name: "竞技场", sub: "6 局至少赢 55%(L13)", href: "#/l13" },
  { x: 16, y: 222, name: "best", sub: "现任冠军(L13)", href: "#/l13" },
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

          <text x={12} y={18} fontSize={11} className="mini-label">上半 · 造大脑(第 1、7-11 课;脚下的数学是第 3-6 课地基篇)</text>
          <text x={12} y={114} fontSize={11} className="mini-label">下半 · 飞轮(第 12-13 课,转个不停)</text>

          {BRAIN.slice(0, -1).map((n, i) => (
            <line key={`b${i}`} x1={n.x + 92} y1={n.y + 22} x2={BRAIN[i + 1].x - 2} y2={n.y + 22}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1.4}
              markerEnd="url(#sys-arrow)" />
          ))}

          {/* 大脑 → 自我对弈(搜索产 π,飞轮起转) */}
          <path d="M 618 78 C 618 100, 560 96, 505 122"
            fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.6}
            strokeDasharray="5 4" markerEnd="url(#sys-arrow)" />
          <text x={563} y={96} fontSize={10} style={{ fill: "var(--accent-deep)" }}>给它直觉</text>

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
        上半是零件(第 1、7-11 课亲手造的;脚下垫着的数学是第 3-6 课地基篇),下半是飞轮(第 12-13 课拧上的)。
        小字里的 L12、L13 就是第 12、13 课;「交叉熵+平方差」=两个头各算一笔错账。
        12 个零件,每个你都拆过。点进去随便复习——门已全开。
      </figcaption>
    </figure>
  )
}
