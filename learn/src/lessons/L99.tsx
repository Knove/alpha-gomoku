/** 毕业 · 在新局面里找出第一处错误。
 *  人机对弈：导出真权重 + 浏览器 SearchTree 每手 20 次模拟；
 *  系统图：18 课重新接成一条证据链；毕业诊断验证迁移而非背案例。 */
import { useEffect, useMemo, useRef, useState } from "react"
import Board from "../lib/board"
import { emptyBoard, outcome, play, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig } from "../engine/mcts"
import { Quiz } from "../framework/quiz"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { loadWeights } from "../lib/weights"

const SIMS = 20 // 每手 20 次模拟（比训练时的 40 少一半，网页上 <1 秒）
const CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 }
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

// 毕业诊断检验迁移：每题换一个情境，首次作答就显示完整因果解释。
const GRADUATION_DIAGNOSTIC = [
  {
    q: "同一个网络面对同一局面，甲只搜索 20 次，乙搜索 80 次。关于乙的落子，最稳妥的说法是？",
    options: [
      "一定更强，因为 80 比 20 大",
      "它多检查了分支，通常有更多机会发现问题，可能改选别处；但网络的先验仍可能错，80 次也不是保证",
      "两者一定相同，因为网络权重没有变",
    ],
    answer: 1,
    explain: "搜索预算像多给一点思考时间：它会带来更多访问分布 π，常能纠正第一印象，却不能把错误的先验（网络第一眼给出的判断 P，参见：第 10 课）或漏看的变化变成必然正确。比较棋力仍要看受控对战的累积证据。",
  },
  {
    q: "把一条训练样本的棋盘顺时针转 90°，却把策略目标 π 原封不动。最先出了什么问题？",
    options: [
      "没有问题，π 的 81 个数加起来仍是 1",
      "样本和答案的坐标错位：棋盘上的好点已经转走，π 却还指向转前的位置",
      "只有终局结果 z 会错，π 不受坐标影响",
    ],
    answer: 1,
    explain: "π 不是抽象的 81 个数；每个数都回答「这个格子该下的概率」。棋盘旋转时，π 必须把每个概率搬到对应的新格子。z 只表示胜负，是一个数，不随旋转移动。",
  },
  {
    q: "一局棋最后黑胜。轮到白方的那一步样本，价值目标 z 应记什么？",
    options: [
      "+1，因为整局棋由黑方赢了",
      "−1，因为每条样本都站在「轮到谁」的视角；对白方这一步，「我」输了",
      "0，因为白方没有走到终局",
    ],
    answer: 1,
    explain: "这是视角约定的延续：输入里的「己方/敌方」和价值头里的「我会不会赢」必须指同一个行棋方。黑白轮流时，「我」换人，所以同一终局的 z 会逐手取负。",
  },
  {
    q: "新网络的训练损失下降，并在 6 局受控对战中略胜现任 best。现在最合理的结论是？",
    options: [
      "已经证明它永远更强，可以停止检验",
      "损失下降说明更贴合训练目标；受控对战是更直接的实战证据，但 6 局样本很少，仍应保留余地或继续赛",
      "损失和对战都没有信息，完全不必看",
    ],
    answer: 1,
    explain: "损失回答「样本做得像不像」，不是棋力的充分证据。受控对战更接近真正目标，却仍会受局数、开局和运气影响；证据会随更公平、更多局的比赛而变强。",
  },
]

/** moves → 局面：逐手重放（引擎状态不可变，悔棋只需回退数组）。 */
function replayState(moves: number[]): GameState {
  let st = emptyBoard()
  for (const a of moves) st = play(st, a, st.current)
  return st
}

export default function Graduation() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">毕业</div>
      <h1 className="text-2xl font-bold">毕业：在新局面里找出第一处错误</h1>

      <LessonGuide
        question="换一个没讲过的局面，你能不能指出整条因果链断在哪一环？"
        why="复述看过的案例只证明记性；把同一套因果用在新局面上，才算把这台机器真正看懂。"
        chain={[
          "和一台机器下一局：权重是真实导出的，搜索也真实跑在浏览器里，记录它的决策痕迹",
          "沿系统图逐环说明每个数从哪里来、经过了谁",
          "分清 v_net、root_value、z 各自回答什么问题",
          "在四道换了情境的诊断题里，用「因为……所以……」说出断链位置",
        ]}
        takeaway="每个箭头都能找到原因和证据：结构给归纳偏置，训练目标带来新信息，损失测的是贴合程度，对战给实战证据，运行文件把事实安全留下。"
        boundary="本章不再引入新机制，只做三件事：下完一局、查清一条链、指出四个断点。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "网络直接给出的 v_net 与搜索汇总的 root_value，可以当成同一个数使用吗？",
            options: [
              "可以，都是「谁优」的估计，只是叫法不同",
              "不可以：来源不同。v_net 是网络不搜索只看一眼的输出，root_value 是许多次模拟回传后的汇总；混用会把两条证据链接错",
              "可以，但只在胜局可以",
            ],
            answer: 1,
            explain:
              "两者的产生过程不同：一个是单次前向，一个是搜索统计。终局结果 z 更是第三种来源，只在棋下完后才有。三个数各自回答不同的问题，不能互相顶替。",
          },
        ]}
      />

      <PlayGround />
      <SystemMap />

      <div className="card mt-12 p-6">
        <h3 className="text-lg font-bold">六条结论随身带走</h3>
        <div className="prose mt-3">
          <p>
            全系统图把十三个环节收在一张图上。下面这张单子收下你的六个结论：它们散在各课，换个场景照样用得上。
            括号里是教会你它的那一课。
          </p>
          <Def term="归纳偏置" en="inductive bias" see="第 7 课">
            结构里事先写死的「答案大概长什么样」的假设。它没有把「三连要堵」这条规则塞进网络，
            那仍要靠数据和训练学出来。第一条结论说的就是这件事。
          </Def>
          <Def term="先验" en="prior" see="第 10 课">
            网络第一眼给出的各着点判断，搜索从它出发继续检验。
          </Def>
          <ul>
            <li>
              <strong>结构只给归纳偏置，不替你手写棋理。</strong>
              卷积核只把「相邻格子一起看、同一组权重各处复用」写进结构，
              「三连要堵」仍要靠数据学出来
              (<a href="#/l07">卷积核课</a>)。
            </li>
            <li>
              <strong>视角统一，一份功夫当两份用。</strong>
              所有数都站在「轮到谁」的视角，同一条棋理黑白只学一遍
              (<a href="#/l02">视角课</a>)。
            </li>
            <li>
              <strong>训练目标要带来新增、尽量可靠的信息；价值目标还要是真值。</strong>
              搜索后的 π 记下了推演过程，那是「不搜索、只看一眼」的网络看不见的。它通常是更丰富的目标；
              但预算有限、先验（见上方定义框）会错，它不是永远更准的答案。
              价值标签更挑剔：z 是终局事实，root_value 和 v_net 都只是估计，拿估计当标签等于自己教自己，
              估计里的偏差会被原样写进权重
              (<a href="#/l12">自我对弈样本课</a>)。
            </li>
            <li>
              <strong>损失测样本贴合，对战给更直接但有限的证据。</strong>
              损失分数下降，并不足以说明棋力上涨；控制先后手和开局的对战更接近实战，
              但少量对局仍会受运气影响
              (<a href="#/l15">竞技场课</a>)。
            </li>
            <li>
              <strong>对称性让同一事实换八个等价视角。</strong>
              棋盘和 π 一起旋转或镜像，训练能从不同朝向复习同一条棋谱；
              它们不是八局互不相关的新棋
              (<a href="#/l14">训练课</a>)。
            </li>
            <li>
              <strong>反向传播让答错了能追查。</strong>
              误差沿网络逐层反向传播回每个权重，梯度只给每个权重一个局部方向：这一步往哪边挪损失会小一点。
              许多能认照片、听语音的可训练系统，也靠这种办法调整权重
              (<a href="#/l13">反向传播课</a>)。
            </li>
          </ul>
        </div>
      </div>

      <section className="mt-10">
        <div className="eyebrow mb-3">对证</div>
        <div className="card p-6">
          <p className="font-semibold">一步一步核对这局棋</p>
          <ol className="prose mt-3">
            <li>在沙盒落一手，记录 action、当前行棋方和 AI 搜索访问前三名。</li>
            <li>指出网络直接给出的 <span className="mono">v_net</span>、搜索汇总的
              <span className="mono">root_value</span> 与终局结果 <span className="mono">z</span> 为什么不能混用。</li>
            <li>沿系统图说明这局实时浏览器对局与训练器的差别：这里预算更小、权重只留五位小数、没有根噪声、单局顺序搜索、没有训练写盘。</li>
            <li>完成下方四个诊断，并用「因为……所以……」说出断链位置。</li>
          </ol>
        </div>
      </section>

      <div className="prose mt-10">
        <h3>毕业词</h3>
        <p>
          序里承诺过，走完十八课后由你亲自检查整台机器。现在你已经知道：棋盘怎样成为
          当前方视角的三个输入平面，网络怎样给出 <span className="mono">P</span> 和
          <span className="mono">v_net</span>，搜索怎样留下 <span className="mono">root_value</span>
          与 <span className="mono">π</span>，终局怎样补上 <span className="mono">z</span>，
          π 与 z 两种误差怎样改权重，又为什么必须用竞技场而不是训练损失判断棋力。
          你还能够从 checkpoint、运行文件、REST 与 WebSocket 一直追到浏览器上的画面。
          本课模型出自只训了 4 轮（iteration 0–3）的 run，上场的 best 在第 2 轮晋升；
          一局输赢仍不够给它下棋力结论；真正的毕业标准，是每个箭头都能找到原因和证据。
          这门课讲的不是五子棋，而是「让 AI 从零自教自学」的方法。舞台换了，那个
          「自己下棋、自己出样本、自己变强」的自我改进循环不换。
        </p>
      </div>

      <ChapterEnd
        summary={[
          "一局沙盒棋可以把 action、v_net、root_value、π、z 全部现场对上：网络给第一眼判断，搜索给汇总，终局给答案。",
          "全系统图上半是局面到搜索结果，下半是样本到证据；每个节点都能回到教它的那一课。",
          "六个结论随身带走：归纳偏置、视角约定、训练目标的信息量、损失与对战的分工、对称性、反向传播。",
        ]}
        next={
          <>
            全书正文到此结束。仓库中的介绍站（explainer/）与 learn/archive/ 下的讲义是同一套事实的长文版
            （讲义按主题命名，与十八课不一一对应），不再补新知识，只方便日后按主题查找。
          </>
        }
      />

      <Quiz
        title="习题 · 毕业诊断：四个新情境，逐题解释断链位置"
        questions={GRADUATION_DIAGNOSTIC}
      />
    </section>
  )
}

/* ============ 沙盒 · 人机对弈（真权重 + 真搜索） ============ */

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

  // AI 落子：同步算 20 次模拟（<1s），setTimeout 让「思考中」先渲染出来。
  // busyRef 防重入：不把 thinking 放进依赖、不设 cleanup，清理会 cancel 掉自己的定时器
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
      // 先掉「最后一手不是你下的」那些（AI 的应手），再掉你刚才那手
      while (m.length && (((m.length - 1) % 2 === 0) !== (human === 1))) m.pop()
      if (m.length) m.pop()
      return m
    })
  }

  const reset = (h: 1 | -1 = human) => {
    // 思考中禁止重开：挂起的定时器会在空盘上落下旧局面的子
    if (thinking) return
    setHuman(h)
    setMoves([])
    setAiTop(null)
  }

  const last = moves.length ? moves[moves.length - 1] : null
  const status = out !== null
    ? out === 0 ? "和棋。盘满，握手言和。"
      : out === human ? "你赢了。这是一局体验，别急着据此给谁下棋力结论。"
      : "它赢了。这也只是一局；看看右边，它把搜索预算主要花在哪些候选上。"
    : thinking ? "它正在搜索（每手 20 次模拟，其中非终局叶各问网络一回）……"
    : humanTurn ? `轮到你（执${human === 1 ? "黑" : "白"}）落子`
    : "轮到它……"

  return (
    <figure className="figure mt-8" data-qa="fig-play">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-5">
        <span className="mini-label">例 G-1 · 人机对弈，真权重 weights-best + 真搜索</span>
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
                onClick={() => reset(1)} data-qa="pick-black">我执黑（先行，会重开）</button>
              <button type="button" className={`seg-btn ${human === -1 ? "active" : ""}`}
                onClick={() => reset(-1)} data-qa="pick-white">我执白（会重开）</button>
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
              ? "AI = SearchTree（搜索树）+ loadNet（装网络），每手真算一遍；落子取访问数最大。和训练时同一份权重（导出时保留五位小数）：自我对弈每手 40 次模拟（演示配置；竞技场 30 次），这里 20 次，省一半。"
              : "正在加载真权重（weights-best.json，约 1.2 MB）……"}
          </p>
        </div>

        <aside className="w-full sm:w-64 sm:flex-none">
          <div className="mini-label">它的思考 · 最近一手访问数前三名</div>
          {!aiTop ? (
            <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
              {thinking ? "20 次模拟跑着，马上回来……" : "它落一子，这里就亮出搜索支持哪一手。"}
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
                      N={r.n} Q={r.q >= 0 ? "+" : "−"}{Math.abs(r.q).toFixed(2)}
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
                条的长短 = 访问数 N（第一名占满全长）；Q 是每条边（候选落子）的平均成绩，
                搜索课的统计原样搬来。看它把预算花在哪些候选上；N 受先验 P、成绩 Q 与探索的共同影响。
              </p>
            </>
          )}
          <div className="reveal-box mt-4 text-xs leading-relaxed">
            这份权重出自只训了 4 轮的演示 run，上场的 best 在第 2 轮晋升。这里的一局胜负只让你观察搜索和网络怎样配合，
            不是你或它的棋力结论；要比较模型，得回到竞技场课那样的受控对战。
          </div>
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 G-1</span>
        每一步都是现场真算：点击 → play(game.ts)落子；它那手 = new SearchTree
        （建棵搜索树）→ run(20)（真跑 20 次模拟）→ bestAction（挑访问数最大的）。
        判胜用 game.ts 的 outcome，悔棋只是回退重放。
      </figcaption>
    </figure>
  )
}

/* ============ 全系统图：每个环节都有它那一课 ============ */

interface SysNode {
  x: number
  y: number
  name: string
  sub: string
  href: string
}

const BRAIN: SysNode[] = [
  { x: 12, name: "棋盘", sub: "动作与规则", href: "#/l01" },
  { x: 124, name: "三个输入平面", sub: "当前方视角", href: "#/l06" },
  { x: 236, name: "叠层", sub: "局部到全盘", href: "#/l08" },
  { x: 348, name: "双头", sub: "P + v_net", href: "#/l09" },
  { x: 460, name: "搜索", sub: "PUCT 推演", href: "#/l11" },
  { x: 572, name: "root_value", sub: "搜索根估值·第 10 课", href: "#/l10" },
  { x: 680, name: "π", sub: "访问分布·第 11 课", href: "#/l11" },
].map((n) => ({ ...n, y: 34 }))

const LOOP: SysNode[] = [
  { x: 300, y: 132, name: "自我对弈", sub: "批量产样本", href: "#/l12" },
  { x: 492, y: 132, name: "(s, π, z)", sub: "每手样本", href: "#/l12" },
  { x: 584, y: 222, name: "回放训练", sub: "小批抽样与增广", href: "#/l14" },
  { x: 404, y: 296, name: "竞技场", sub: "挑战 best", href: "#/l15" },
  { x: 196, y: 296, name: "checkpoint", sub: "保存与恢复", href: "#/l16" },
  { x: 16, y: 222, name: "网页", sub: "run 目录 + 实时消息", href: "#/l18" },
]

function SystemMap() {
  return (
    <figure className="figure mt-10">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">例 G-2 · 全系统图，点任何一个环节回到教它的那一课</span>
      </div>
      <div className="overflow-x-auto p-4 sm:p-5" data-qa="sysmap">
        <svg viewBox="0 0 800 356" style={{ minWidth: 560, width: "100%", height: "auto", display: "block" }}>
          <defs>
            <marker id="sys-arrow" viewBox="0 0 10 10" refX="8" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: "var(--fg-faint)" }} />
            </marker>
          </defs>

          <text x={12} y={18} fontSize={11} className="mini-label">上半 · 局面 → 输入 → 网络 → 搜索结果</text>
          <text x={12} y={114} fontSize={11} className="mini-label">下半 · 样本 → 训练 → 验收与保存 → 网页观察 → 下一轮</text>

          {BRAIN.slice(0, -1).map((n, i) => (
            <line key={`b${i}`} x1={n.x + 92} y1={n.y + 22} x2={BRAIN[i + 1].x - 2} y2={n.y + 22}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1.4}
              markerEnd="url(#sys-arrow)" />
          ))}

          {/* 网络 → 自我对弈（搜索产 π，自我改进循环起转） */}
          <path d="M 726 78 C 726 100, 560 96, 505 122"
            fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.6}
            strokeDasharray="5 4" markerEnd="url(#sys-arrow)" />
          <text x={563} y={96} fontSize={10} style={{ fill: "var(--accent-deep)" }}>π 写进样本</text>

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
            latest 网络继续自我对弈，best 网络保持现任；网页读取保存下来的证据
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
        <span className="cap-no">例 G-2</span>
        上半把棋局变成输入，由网络给出 P 与 v_net，再由搜索形成 π 与 root_value。
        下半把一局棋记录成样本，小批抽样训练出挑战者，经竞技场、checkpoint 和 run 目录留下证据，
        最后由服务器送到网页。每个节点都对应前面完成的一课；点击可回到那条因果和真实代码。
      </figcaption>
    </figure>
  )
}
