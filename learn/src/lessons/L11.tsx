/** 第 10 课 · 搜索：一次模拟怎样来回走一遍。
 *  节拍：思考题（第一印象会错）→ 根到叶的选择/求值/扩展 → 逐层取负回传 →
 *  N/W/Q 与 root_value → 例 10-1 一次模拟 / 例 10-2 子树复用 → 对证 → 习题。 */
import { useEffect, useRef, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig } from "../engine/mcts"
import { loadWeights } from "../lib/weights"

/* 教学局面是合法交替落子后的 6 手，轮黑。它只负责演示一趟搜索，
 * 第 11 课用专门局面研究 PUCT、噪声、温度和有限预算失败。 */
const POS: GameState = (() => {
  const board = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (const [x, y, p] of [
    [4, 4, 1], [3, 4, -1], [5, 4, 1], [4, 3, -1], [4, 5, 1], [5, 5, -1],
  ] as [number, number, number][]) board[y][x] = p
  return { board, current: 1, winner: 0, moveCount: 6, lastMove: 5 * 9 + 5 }
})()

const CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 }
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

type NetFn = (planes: number[][][]) => { logits: number[]; value: number }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function L11() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 10 课</div>
      <h1 className="text-2xl font-bold">搜索：一次模拟怎样来回走一遍</h1>

      <LessonGuide
        question="网络给出第一眼判断后，一次搜索模拟怎样沿棋路前进，再把结果正确地带回根？"
        why="只看眼前棋盘会漏掉对手回应。搜索要真的走到后续局面；但如果回传时搞错黑白视角，再多模拟也只会把输赢记反。"
        chain={[
          "从根沿已经展开的边走到一个叶节点",
          "终局叶直接给答案；普通新叶交给网络，得到 v_net",
          "扩展新叶，并沿原路径逐层取负回传（negamax）",
          "每条边更新 N、W、Q，根另记搜索汇总 root_value",
        ]}
        takeaway="一次模拟只有一趟往返：向前选择到叶，取得一个值，再逐层换视角记回统计。"
        boundary="本课只学搜索分哪几步、每步按什么顺序做、怎样把结果记回来。下一课才完整手算 PUCT，并解释（下一课的）访问配比 π、根噪声、温度和实际落子。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "搜索走到一个从未展开、又没有结束的局面后，下一步应该做什么？",
            options: [
              "立刻把它当成胜局，给所有边加一分",
              "让网络评价这个叶局面，再展开并沿来路回传",
              "删除整棵树，从根重新随机落子",
            ],
            answer: 1,
            explain: "选第二项。非终局的新叶没有真实输赢，网络先给出各着点概率（先验 prior，搜索开始前网络给出的各着点概率 P），再给一个局面分数 v_net；随后叶节点展开，这个分数才沿选择路径逐层换视角记回。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一次模拟是一趟向前、一趟向后的往返</h3>
        <p>
          网络给出第一眼判断之后，搜索还要真的走到后续局面再把结果带回来。
          「沿树选择、叶处求值、逐层回传」这套算法有正式名字：蒙特卡洛树搜索。
          AlphaGo 系列让它出了名，本项目的搜索就是它的一个实现。
          一次模拟走一趟：向前选择到叶，取得一个值，再逐层换视角记回统计。
        </p>
        <Def term="蒙特卡洛树搜索" en="Monte Carlo Tree Search,缩写 MCTS">
          沿树选择到叶、在叶处取得一个评价、再把评价逐层记回的搜索算法。
          「蒙特卡洛」来自用随机模拟估计答案的传统；引入神经网络评价后，
          随机模拟被一次前向取代，记回的形式不变（N/W/Q 照写；但值的来源从真终局换成网络估值，Q 的含义随之改变）。
        </Def>
        <Def term="节点、根、边、叶" en="node, root, edge, leaf node">
          搜索记录下来的每个局面叫一个节点；当前局面是根；局面之间的一手棋是边；
          沿边走到的那个尚未展开的节点叫叶节点。一次模拟的路径就是一串「节点，边」交替的链条。
        </Def>

        <h3>选择沿已展开的边走到一个叶</h3>
        <p>
          向下走时只经过已经有子节点的边，停在尚未展开的叶节点；
          岔口上比较候选边的那条规则叫 PUCT。PUCT 的打分下一课再算，本课先看选择之后发生的数据变化。
        </p>
        <Def term="选择" en="selection">
          从根沿已经展开的边向下走，直到到达终局或尚未展开的叶节点。
          走过的每一手都记下「从哪个节点、选了哪条边」，供回传时按原路写回。
        </Def>
        <Def term="PUCT" en="Predictor + UCT" see="第 11 课">
          给每条候选边打分的选择规则。它把网络给的先验和边上已有的成绩合成一个分数，
          既不放弃已见好成绩的路，也不长期忽略访问不足的候选。
        </Def>

        <h3>叶处取得一个值</h3>
        <p>
          若叶局面已经终局，就按叶节点轮走方的视角直接给值（对方刚成五则记 −1，自己成五记 +1，和记 0），不再询问网络。
          若棋还没结束，网络对该叶从头到尾算一遍前向，给出
          <span className="mono">v_net</span>。这个数站在
          <strong>叶节点当前行棋方</strong>的视角。更早的做法是随机走子到终局、
          用真实输赢当评价；一盘随机棋噪声极大，要很多次 rollout 才抵得上网络一眼的判断。
          网络把「看过的成千上万盘」压缩进一次前向，所以本系统用
          <span className="mono">v_net</span> 代替随机下完，搜索则负责修正网络的漏看。
        </p>
        <Def term="求值" en="evaluation">
          在叶节点取得一个局面分的动作。终局叶直接读真实输赢；非终局叶交给网络前向，
          得到当前行棋方视角的 <span className="mono">v_net</span>。
        </Def>
        <Def term="先验" en="prior,代码里是 P">
          与第 9 课 softmax 后的比例是同一批数。搜索开始前网络给出的各着点概率。它来自策略头，是「第一眼觉得该下哪」，
          还没有叠加任何后续推演；搜索会在这个基础上继续检验和修正。
        </Def>
        <Def term="随机走子" en="rollout">
          从叶局面开始双方随机落子直到终局，用真实输赢当评价的旧做法。
          一盘随机棋噪声极大，要很多次 rollout 才抵得上网络一次前向的判断，
          所以本系统用 <span className="mono">v_net</span> 取代它。
        </Def>

        <h3>扩展新叶，沿原路径逐层取负回传</h3>
        <p>
          普通新叶收到网络策略后，才拥有可以继续向下选择的边。
          一次模拟最多展开一个新叶，下一次模拟才能利用这次新长出的树枝。
          一次只长一片叶，一是让每片新叶都先拿到网络评价、再参与下一次选择；二是统计对得上证据量：一次模拟只产生一个新评价、只给一条路径的边记一笔 N/W，展开多个新叶会让新边的计数与真实访问脱节，或迫使一次模拟调用多次网络。
          若一口气把整条路径全展开，后面的节点没有网络先验，只好用均匀先验
          （uniform prior，各着点等概率）乱选。
        </p>
        <Def term="扩展" en="expansion">
          在叶节点上按网络给出的先验长出各条候选边，使它从「叶」变成可以继续向下选择的节点
          （相对于叶，可称内部节点）。
        </Def>
        <p>
          从叶回到根时，每退一层就换到另一方，所以先把值变成相反数再写进那条边。
          先看数字：叶方 <span className="mono">v_net</span> = +0.6，上一层边记 −0.6，
          再上一层边记 +0.6。
        </p>
        <Def term="回传" en="backup">
          从叶回到根，把这次取得的值按原路径写回每条经过的边。
          每写一条边就更新它的 N、W，Q 由 W/N 现算。
        </Def>
        <Def term="negamax" en="negamax,负极大值搜索">
          回传时「每退一层先取负」的符号约定。五子棋的终局值严格零和（一方所得就是另一方所失），所以同一结果对对手就是它的相反数，逐层取负合法；非零和的计分不能这样回传。具体到符号：
          叶方的「我赢」是上一层对手的「我输」，所以退一层必须换一次视角。
        </Def>
        <p>
          每写回一条边，就更新它上面的 N、W 两笔（Q=W/N 现算）。一条边经过 4 次，累计
          <span className="mono">W=+2</span>，则 <span className="mono">Q=+0.5</span>。
          <span className="mono">N</span> 说明证据量，<span className="mono">W</span>
          是累计结果，<span className="mono">Q</span> 才是平均成绩。
        </p>
        <Def term="N、W、Q" en="visit count, total action value, mean action value">
          记在每条边上的 3 个数：<span className="mono">N</span> 是这条边被走过的次数，
          说明证据量；<span className="mono">W</span> 是由选这手的一方所见的累计结果；
          <span className="mono">Q=W/N</span> 是平均成绩。
        </Def>
        <p>
          根上还另记一个搜索汇总 <span className="mono">root_value</span>：
          它把每次模拟最终换算到根方视角的值求平均，所以可能混合许多叶的
          <span className="mono">v_net</span> 和真实终局结果。它只是搜索过程的记录值，
          用来展示；训练答案 <span className="mono">z</span> 则来自整盘真实终局。
          <span className="mono">v_net</span>、
          <span className="mono">root_value</span>、
          <span className="mono">z</span> 是 3 个不同的量。
        </p>

        <h3>落子后把搜过的子树提作新根</h3>
        <p>
          真实对局里，一方落子之后局面才往前走一步。这一步之下的许多变化，
          刚才那阵搜索多半已经查过；整棵丢掉重来，等于把做过的搜索扔了。
          所以落子后把已选动作的子节点提作新根，它下面的 N、W、Q 原样保留，
          只有上一根的 <span className="mono">root_value</span> 展示统计清零。
          保留下来的访问数使新根的访问总数不等于这一步新增的模拟次数，
          读访问配比 π（下一课定义）的分母时要记在心上。
        </p>
      </div>

      <SimulationStepper />

      <ReuseProbe />

      <Ledger title="mcts.py · SearchTree.select / expand_and_backup / _backup / update_root">
        <div className="codewalk">
          <pre>{`# 向前：沿树走到终局或未展开叶
while node.expanded:
    action = self._puct_select(node, game)
    path.append((node, action))
    game.play(action)
# （节选省略：途中创建子节点；若到达终局则直接回传真实 ±1/0，见上方提示）
if game.outcome() is None:
    self._pending_game = game`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# 向后：每退一层先换视角，再更新该边
for node, action in reversed(path):
    value = -value
    node.N[action] += 1
    node.W[action] += value
# 最后把 v 累计进 root_value 展示统计（根汇总值的分子和分母）
self._root_value_sum += value
self._root_value_count += 1`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# 落子后复用已经存在的子树
child = self.root.children.get(action)
self.root_game.play(action)
self.root = child if child is not None else new_node
self._root_value_sum = 0.0
self._root_value_count = 0  # 展示统计整体清零；新根若已展开且开噪声，还会重混一次（第 11 课）`}</pre>
        </div>
        <p className="mt-3">
          例 10-1 的 3 个按钮与源码一一对应：「选择」按钮就是 select，走到等待评价的叶子；
          「求值」把叶局面交给网络；合起来对应
          <span className="mono">expand_and_backup</span>，其中逐边记回统计的一段是
          <span className="mono">_backup</span>。
          浏览器使用单树顺序执行和舍入权重；真正训练时还能把多盘棋等待评价的叶子
          合成一批一起算，但每棵树内部仍然一次走一步，顺序不变。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "一次模拟是一趟往返：向前选择到叶，叶处求值，扩展新叶，再沿原路径逐层取负回传(negamax)。",
          "叶处的答案分 2 种：终局读真实 ±1/0，非终局读网络的 v_net；更早的 rollout 随机下完一整盘，噪声大，已被一次前向取代。",
          "边上记 N、W、Q=W/N；根另记 root_value，它是模拟值的平均，与 v_net、终局标签 z 是 3 个不同的量。",
          "落子后把已搜过的子树提作新根，只清零 root_value 展示统计，已积累的 N、W、Q 保留下来。",
        ]}
        next={
          <>
            有了「一次模拟」，还要回答岔口上「下一次该查哪条路」。下一章完整手算 PUCT
            的打分与选边，再看全部根访问数怎样归一成 π、根噪声与温度怎样影响实际落子，
            以及有限预算下这套选择规则会怎样失败。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 11 课"
        onAllCorrect={() => pass("l10")}
        questions={[
          {
            q: "叶节点站在白方视角给出 v_net=+1，回到上一层黑方选择的边时为什么记 −1？",
            options: [
              "因为网络输出只能保留一位小数",
              "因为同一结果对白方是赢，对上一层黑方就是输；每退一层必须换一次视角",
              "因为 N 增加后 W 必须变成负数",
            ],
            answer: 1,
            explain: "黑白每走一手交换一次。叶方的「我赢」就是上一层对手的「我输」，所以回传先取负（negamax）再写入那条边。",
          },
          {
            q: "一条边经过 4 次，累计 W=+2，它的 Q 是多少？",
            options: ["+0.5", "+2", "+8"],
            answer: 0,
            explain: "Q=W/N=2/4=0.5。",
          },
          {
            q: "v_net、root_value 和 z 的来源分别是什么？",
            options: [
              "三者都是同一个网络输出，只是显示位置不同",
              "v_net 是单个叶的网络输出；root_value 是搜索模拟在根方视角的平均；z 是整盘终局结果",
              "root_value 是训练标签，z 只用于网页动画",
            ],
            answer: 1,
            explain: "三者来自不同时间和过程。训练会重新计算 v_net 并与 z 比较；搜索过程留下的 root_value 只是记录，不是训练标签。",
          },
        ]}
      />
    </section>
  )
}

interface LeafView {
  path: number[]
  leaf: GameState
}

interface NetAnswer extends LeafView {
  logits: number[]
  value: number
  ms: number
}

function SimulationStepper() {
  const [net, setNet] = useState<NetFn | null>(null)
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const [leaf, setLeaf] = useState<LeafView | null>(null)
  const [answer, setAnswer] = useState<NetAnswer | null>(null)
  const [simulations, setSimulations] = useState(0)
  const [version, setVersion] = useState(0)
  const [terminalNote, setTerminalNote] = useState<string | null>(null)
  const treeRef = useRef<SearchTree | null>(null)

  useEffect(() => {
    let alive = true
    loadWeights().then((weights: WeightsJson) => {
      if (!alive) return
      const loaded = loadNet(weights)
      setNet(() => loaded)
      treeRef.current = new SearchTree(POS, CFG, loaded, mulberry32(42))
      setVersion((v) => v + 1)
    })
    return () => { alive = false }
  }, [])

  const select = () => {
    const tree = treeRef.current
    if (!tree || stage !== 0) return
    tree.select()
    setTerminalNote(null)
    if (tree.needsEval()) {
      const pending = tree.pendingState()
      if (pending) setLeaf({ path: tree.pendingActions() ?? [], leaf: pending })
      setStage(1)
    } else {
      setSimulations((n) => n + 1)
      setTerminalNote("这次选择直接到达终局：SearchTree 已把真实 ±1/0 沿路径回传，不需要网络。")
      setVersion((v) => v + 1)
    }
  }

  const evaluate = () => {
    const tree = treeRef.current
    if (!tree || !net || !leaf || stage !== 1) return
    const started = performance.now()
    const result = net(tree.leafInput())
    setAnswer({ ...leaf, ...result, ms: performance.now() - started })
    setStage(2)
  }

  const backup = () => {
    const tree = treeRef.current
    if (!tree || !answer || stage !== 2) return
    tree.expandAndBackup(answer.logits, answer.value)
    setLeaf(null)
    setAnswer(null)
    setStage(0)
    setSimulations((n) => n + 1)
    setVersion((v) => v + 1)
  }

  const reset = () => {
    if (!net) return
    treeRef.current = new SearchTree(POS, CFG, net, mulberry32(42))
    setStage(0)
    setLeaf(null)
    setAnswer(null)
    setSimulations(0)
    setTerminalNote(null)
    setVersion((v) => v + 1)
  }

  const tree = treeRef.current
  const rootRows = tree
    ? Array.from(tree.root.N)
      .map((n, action) => ({ action, n, w: tree.root.W[action] }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
    : []
  const rootValue = tree?.rootValue() ?? 0
  void version

  return (
    <figure className="figure mt-8" data-qa="simulation-stepper">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 10-1 · 一次模拟分三键完成</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[21rem]">
          <Board board={POS.board.flat()} lastMove={{ x: 5, y: 5 }} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!net || stage !== 0}
              onClick={select} data-qa="step-select">① 选择</button>
            <button type="button" className="btn" disabled={stage !== 1}
              onClick={evaluate} data-qa="step-evaluate">② 求值（网络评价）</button>
            <button type="button" className="btn" disabled={stage !== 2}
              onClick={backup} data-qa="step-backup">③ 扩展并回传</button>
            <button type="button" className="btn" disabled={!net} onClick={reset}>↺ 重置</button>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            已完成 <span className="num">{simulations}</span> 次模拟。每个等待评价的叶子，
            必须先让网络评价完、把结果记回，才能开始下一次选择；同一棵树一次只处理一个这样的叶子。
          </p>
          {terminalNote && <div className="reveal-box mt-3 text-sm">{terminalNote}</div>}
          {(answer ?? leaf) && (
            <div className="reveal-box mt-3 text-sm" data-qa="leaf-state">
              <p>路径：根{(answer ?? leaf)!.path.map((a) => ` → ${coord(a)}`).join("") || "（根自身）"}</p>
              <p className="mt-1">叶方：{(answer ?? leaf)!.leaf.current === 1 ? "黑" : "白"}</p>
              {answer ? (
                <p className="num mt-1" style={{ color: "var(--accent-deep)" }}>
                  v_net={answer.value >= 0 ? "+" : ""}{answer.value.toFixed(3)}（{answer.ms.toFixed(1)} ms）
                </p>
              ) : <p className="mt-1">叶子尚未询问网络。</p>}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">根节点统计 · 每条边记 N/W/Q（选边一方视角；根边即根方）</div>
          {rootRows.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
              第一趟只展开根本身，路径为空，所以还没有根边统计。继续做第二趟才会经过一条根边。
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {rootRows.map((row) => (
                <div key={row.action} className="l00-top-row" data-qa="root-ledger-row">
                  <span className="mono">{coord(row.action)}</span>
                  <span className="num">N={row.n}</span>
                  <span className="num">W={row.w >= 0 ? "+" : ""}{row.w.toFixed(2)}</span>
                  <span className="num">Q={(row.w / row.n) >= 0 ? "+" : ""}{(row.w / row.n).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="reveal-box mt-4 text-sm">
            <div className="mini-label">root_value · 搜索汇总</div>
            <p className="num mt-1 text-xl font-bold" style={{ color: "var(--accent-deep)" }}>
              {rootValue >= 0 ? "+" : ""}{rootValue.toFixed(3)}
            </p>
            <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
              它是每次模拟换算到根方视角后的平均；不等于任何一个叶的 v_net，也不是终局标签 z。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 10-1</span>
        三键直接调用 SearchTree 的 select、leafInput、expandAndBackup；权重舍入和 JS 数值属于浏览器适配。
      </figcaption>
    </figure>
  )
}

function ReuseProbe() {
  const [result, setResult] = useState<{
    action: number
    childVisits: number
    keptVisits: number
    newRootValue: number
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    const weights = await loadWeights()
    const net = loadNet(weights)
    const tree = new SearchTree(POS, CFG, net, mulberry32(7))
    tree.run(8)
    const action = tree.bestAction()
    const child = tree.root.children.get(action)
    const childVisits = child ? Array.from(child.N).reduce((sum, n) => sum + n, 0) : 0
    tree.updateRoot(action)
    const keptVisits = Array.from(tree.root.N).reduce((sum, n) => sum + n, 0)
    setResult({ action, childVisits, keptVisits, newRootValue: tree.rootValue() })
    setLoading(false)
  }

  return (
    <figure className="figure mt-8" data-qa="reuse-probe">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 10-2 · 落子后为什么保留子树</span>
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          搜索 8 次后选择访问最多的动作，再调用 <span className="mono">updateRoot</span>。
          若该动作已有子节点，整棵已检查的子树成为新根；只有上一根的 root_value 统计会清零。
        </p>
        <button type="button" className="btn primary mt-4" disabled={loading} onClick={run}>
          {loading ? "正在搜索…" : "搜索并复用子树"}
        </button>
        {result && (
          <div className="reveal-box mt-4 text-sm">
            <p>实际落子：<span className="mono">{coord(result.action)}</span></p>
            <p className="mt-1">子树原有访问总数：<span className="num">{result.childVisits}</span></p>
            <p className="mt-1">成为新根后仍保留：<span className="num">{result.keptVisits}</span></p>
            <p className="mt-1">新根 root_value 统计：<span className="num">{result.newRootValue.toFixed(1)}</span>（已清零）</p>
          </div>
        )}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 10-2</span>
        跑 8 次模拟再落子，对比子树成为新根前后的访问总数；清零的只有 root_value 展示统计。
      </figcaption>
    </figure>
  )
}
