/** 第 10 课 · 搜索：一次模拟怎样来回走一遍。
 *  节拍：思考题（第一印象会错）→ 根到叶的选择/求值/扩展 → 逐层取负回传 →
 *  N/W/Q 与 root_value → 例 10-1 一次模拟 / 例 10-2 子树复用 → 对证 → 习题。 */
import { useEffect, useRef, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import Board from "../lib/board"
import { type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig, type MctsNode } from "../engine/mcts"
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

export default function L10() {

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
          "扩展新叶，并沿原路径逐层取负回传",
          "每条边更新访问次数 N、累计结果 W、平均成绩 Q，根另记搜索汇总 root_value",
        ]}
        takeaway="你能手推一次模拟（选择→求值→扩展→回传），对拍树上的 N、W、Q 与 root_value，并写出换根复用的实现（保留子树的 N、W、Q，清零 root_value 展示统计）。"
        boundary="本课只学搜索分哪几步、每步按什么顺序做、怎样把结果回传。下一课才完整手算 PUCT，并解释访问分布 π、根噪声、温度和实际落子。"
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
            explain: "选第二项。非终局的新叶没有真实输赢，网络先给出各着点概率 P（即下文的先验），再给一个价值估计 v_net；随后叶节点展开，这个价值估计才沿选择路径逐层换视角回传。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一次模拟是一趟向前、一趟向后的往返</h3>
        <p>
          网络一眼看完棋盘给了个判断，为什么不能直接信它落子？因为看漏一步就可能踩进对手的四连陷阱，所以要顺着候选点往后试走几步。
          搜索从当前局面出发，沿棋路走到后续局面，再把沿途见到的结果带回来；这套「沿树选择、叶处求值、逐层回传」的算法叫蒙特卡洛树搜索。
        </p>
        <Def term="蒙特卡洛树搜索" en="Monte Carlo Tree Search">
          沿搜索树选择到叶、在叶处取得价值、再把结果逐层回传的算法（缩写 MCTS）。
          本项目用网络前向代替随机走子，但「选择 → 求值 → 回传」的骨架不变。
        </Def>
        <p>
          搜索记录每个推演过的局面：当前局面叫<strong>根</strong>，一手棋是一条<strong>边</strong>，
          尚未继续展开的末端叫<strong>叶</strong>。每趟模拟只做一件事：
          <span className="mono">select</span> 走到叶，调用方用网络评价叶，
          <span className="mono">expand_and_backup</span> 长出这手棋的候选边并沿原路回传。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="一次搜索模拟的主循环：选择、求值、扩展并回传"
          source="alphagomoku/mcts.py · 模块文档字符串"
        >
          <div className="codewalk">
            <pre>{`    for _ in range(cfg.mcts_simulations):
        tree.select()                      # descend to a leaf (may need eval)
        if tree.needs_eval():
            policy, value = net(tree.leaf_input())   # batched across trees by caller
            tree.expand_and_backup(policy, value)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          例 10-1 的三个按钮按这个次序接力，其中按钮③「扩展并回传」调用{" "}
          <span className="mono">expand_and_backup</span>，其内部由{" "}
          <span className="mono">_backup</span> 完成逐边回传。
        </p>

        <h3>选择沿已展开的边走到一个叶</h3>
        <p>
          第一步是<strong>选择</strong>：从根沿已经展开的边向下走，直到终局或尚未展开的叶。
          每走一手都记下「从哪个节点、选了哪条边」，回传时才能原路返回。
          岔口按 PUCT 选边：既看已有平均成绩，也给访问不足的候选留机会。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="沿已展开边下探至叶节点，缺子节点时当场创建"
          source="alphagomoku/mcts.py · SearchTree.select"
        >
          <div className="codewalk">
            <pre>{`        while node.expanded:
            a = self._puct_select(node, game)
            path.append((node, a))
            child = node.children.get(a)
            if child is None:
                child = _Node(game.n * game.n)
                node.children[a] = child
            game.play(a)
            node = child`}</pre>
          </div>
        </EvidenceCard>
        <p>
          叶拿到网络输出后，先遮掉非法落点，再把剩下概率归一到 1，得到边的
          <strong>先验</strong> <span className="mono">P</span>。它只提供搜索的起跑顺序，
          之后是否值得继续查，由回传累积的成绩与访问次数决定。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="遮住非法落点后将先验重新归一，全零时退化为合法格均匀分布"
          source="alphagomoku/mcts.py · SearchTree.expand_and_backup"
        >
          <div className="codewalk">
            <pre>{`        legal = game.legal_moves()
        prior = policy.astype(np.float64) * legal
        s = prior.sum()
        prior = (prior / s) if s > 1e-8 else (legal / legal.sum()).astype(np.float64)`}</pre>
          </div>
        </EvidenceCard>

        <h3>叶处取得一个价值估计</h3>
        <p>
          第二步是<strong>求值</strong>。终局叶不再询问网络：按叶节点行棋方的视角，
          对手刚成五记 −1，和棋记 0。普通叶则把局面编码后送进网络，
          取回一个站在<strong>该叶行棋方</strong>视角的价值估计 <span className="mono">v_net</span>。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="走到终局叶节点时直接按胜负定值并回传"
          source="alphagomoku/mcts.py · SearchTree.select"
        >
          <div className="codewalk">
            <pre>{`        if out is not None:
            if out == 0:
                v = 0.0
            else:
                v = 1.0 if out == game.current_player else -1.0
            self._backup(path, v)
            return`}</pre>
          </div>
        </EvidenceCard>
        <h3>扩展新叶，沿原路径逐层取负回传</h3>
        <p>
          第三步是<strong>扩展</strong>：普通叶收到先验后，长出各条候选边，
          从叶变成可继续选择的内部节点。一次只展开一个新叶，
          这样每次网络评价都和一条真实模拟对应，下一次选择也能用上刚长出的边。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="暂存待求值的叶局面、路径与叶节点"
          source="alphagomoku/mcts.py · SearchTree.select"
        >
          <div className="codewalk">
            <pre>{`        self._pending_game = game
        self._pending_path = path
        self._pending_leaf = node`}</pre>
          </div>
        </EvidenceCard>
        <p>
          第四步是<strong>回传</strong>：从叶往根走，每退一层先取负。
          叶方看到的 <span className="mono">v_net=+0.6</span>，在它上一层的对手眼里就是
          <span className="mono">−0.6</span>，再上一层又翻回 <span className="mono">+0.6</span>。
          这样每笔成绩都记在「走这手棋的人」视角上。
        </p>
        <Def term="N、W、Q" en="visit count, total action value, mean action value">
          记在每条边上的 3 个数：<span className="mono">N</span> 是这条边被走过的次数；
          <span className="mono">W</span> 记的是这手棋的行棋方所见的累计结果；
          <span className="mono">Q=W/N</span> 是平均成绩。若一条边经过 4 次、W=+2，则 Q=+0.5。
        </Def>
        <p>
          每次回传到一条边，就让 N 加 1、W 加上换视角后的值。
          回传走完整条路径后，最终值已经翻回根方视角，并被累加进{" "}
          <span className="mono">_root_value_sum</span> 与{" "}
          <span className="mono">_root_value_count</span>；两者的商就是
          <span className="mono">root_value</span>。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="沿路径倒序回传：每退一层先取反，再累加边统计与根汇总"
          source="alphagomoku/mcts.py · SearchTree._backup"
        >
          <div className="codewalk">
            <pre>{`    def _backup(self, path: list[tuple[_Node, int]], v: float) -> None:
        for node, a in reversed(path):
            v = -v  # value flips perspective each ply
            node.N[a] += 1.0
            node.W[a] += v
        self._root_value_sum += v
        self._root_value_count += 1`}</pre>
          </div>
        </EvidenceCard>
        <Def term="搜索汇总" en="root value">
          <span className="mono">root_value</span> 是每次模拟换算到根方视角后的平均值。
          它可能混合许多叶的 <span className="mono">v_net</span> 和真实终局结果，
          只用于展示搜索过程。
        </Def>
      </div>

      <SimulationStepper />

      <ThreeValues />

      <div className="prose mt-12">
        <h3>落子后把搜过的子树提作新根</h3>
        <p>
          真实落子后，刚搜过的子树不该整棵丢掉：把对应子节点提作新根，
          它下面的 N、W、Q 原样保留，只清零上一根的 <span className="mono">root_value</span> 展示统计；
          若新根已经展开且开启根噪声，换根时还会重新混一次根噪声，而已有的 N、W、Q 不动。
          因此新根的 ΣN 可能大于本轮新增模拟数。
          对手若走了搜索里没有的着，就新建空节点当新根。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="落子后将对应子节点提作新根，并清零根汇总统计"
          source="alphagomoku/mcts.py · SearchTree.update_root"
        >
          <div className="codewalk">
            <pre>{`        child = self.root.children.get(action)
        self.root_game.play(action)
        self.root = child if child is not None else _Node(self.root_game.n * self.root_game.n)
        self._root_value_sum = 0.0
        self._root_value_count = 0`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <ReuseProbe />

      <Ledger title="alphagomoku/mcts.py · _Node / select / expand_and_backup">
        <p className="mb-3 text-sm">
          下面连贯展示搜索树节点的数据结构 <span className="mono">_Node</span>，以及一次模拟中负责向下走叶的{" "}
          <span className="mono">select</span> 与负责扩展并触发回传的{" "}
          <span className="mono">expand_and_backup</span> 完整实现：
        </p>
        <div className="codewalk">
          <pre>{`class _Node:
    __slots__ = ("prior", "children", "N", "W", "expanded")

    def __init__(self, num_actions: int):
        self.prior: np.ndarray | None = None  # (num_actions,) masked + normalized
        self.children: dict[int, "_Node"] = {}
        self.N = np.zeros(num_actions, dtype=np.float32)  # visit counts per action
        self.W = np.zeros(num_actions, dtype=np.float32)  # total value per action
        self.expanded = False`}</pre>
        </div>
        <div className="codewalk mt-3">
          <pre>{`    def select(self) -> None:
        """Run one simulation: descend PUCT to a leaf.

        Terminal leaves are backed up immediately; otherwise the leaf is stashed
        as pending and must be resolved with expand_and_backup().
        """
        assert self._pending_game is None, "previous leaf not resolved"
        node = self.root
        game = self.root_game.clone()
        path: list[tuple[_Node, int]] = []
        while node.expanded:
            a = self._puct_select(node, game)
            path.append((node, a))
            child = node.children.get(a)
            if child is None:
                child = _Node(game.n * game.n)
                node.children[a] = child
            game.play(a)
            node = child
        out = game.outcome()
        if out is not None:
            if out == 0:
                v = 0.0
            else:
                v = 1.0 if out == game.current_player else -1.0
            self._backup(path, v)
            return
        self._pending_game = game
        self._pending_path = path
        self._pending_leaf = node`}</pre>
        </div>
        <div className="codewalk mt-3">
          <pre>{`    def expand_and_backup(self, policy: np.ndarray, value: float) -> None:
        """Expand the pending leaf with network prior and back up its value.

        value: from the perspective of the player to move at the leaf.
        """
        node = self._pending_leaf
        game = self._pending_game
        assert node is not None and game is not None
        legal = game.legal_moves()
        prior = policy.astype(np.float64) * legal
        s = prior.sum()
        prior = (prior / s) if s > 1e-8 else (legal / legal.sum()).astype(np.float64)
        node.prior = prior.astype(np.float32)
        node.expanded = True
        if node is self.root and self.add_noise:
            self._mix_noise(node, legal)
        self._backup(self._pending_path, float(value))
        self._pending_game = None
        self._pending_path = []
        self._pending_leaf = None`}</pre>
        </div>
        <p className="mt-3 text-sm">
          运行 <span className="mono">python -m pytest tests/test_mcts.py -q</span>{" "}
          可验证访问计数守恒、终局直接回传与子树换根复用。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "一次模拟是一趟往返：向前选择到叶，叶处求值，扩展新叶，再沿原路径逐层取负回传。",
          "叶处的答案分 2 种：终局读真实 ±1/0，非终局读网络的价值估计 v_net；更早的做法是随机走子一整盘，噪声大，已被一次前向取代。",
          "边上记 N、W、Q=W/N；根另记 root_value，它是模拟值的平均，与价值估计 v_net、终局结果 z 是 3 个不同的量。",
          "落子后把已搜过的子树提作新根，只清零 root_value 展示统计，已积累的 N、W、Q 保留下来。",
        ]}
        next={
          <>
            有了「一次模拟」，还要回答岔口上「下一次该查哪条路」。下一课完整手算 PUCT
            的打分与选边，再看全部根访问数怎样归一成 π、根噪声与温度怎样影响实际落子，
            以及有限预算下这套选择规则会怎样失败。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "叶节点站在白方视角给出 v_net=+1，回到上一层黑方选择的边时为什么记 −1？",
            options: [
              "因为网络输出只能保留一位小数",
              "因为同一结果对白方是赢，对上一层黑方就是输；每退一层必须换一次视角",
              "因为 N 增加后 W 必须变成负数",
            ],
            answer: 1,
            explain: "黑白每走一手交换一次。叶节点行棋方的「我赢」就是上一层对手的「我输」，所以回传先取负再写入那条边。",
          },
          {
            q: "一条边经过 4 次，累计 W=+2，它的 Q 是多少？",
            options: ["+0.5", "+2", "+8"],
            answer: 0,
            explain: "Q=W/N=2/4=0.5。",
          },
          {
            q: "有人把搜索的 root_value 直接当 z 写进训练样本，断在哪一环？",
            options: [
              "没断：root_value 想得更远，是更好的 z",
              "断在样本出生这一环：z 必须是终局事实，root_value 是估计；拿估计当标签等于自己教自己，搜索与网络的偏差会被固化回权重",
              "断在搜索：应该多跑几次模拟再取平均",
            ],
            answer: 1,
            explain: "z 在终局才补，是事实；root_value 是搜索留下的估计，只作展示记录。把它当标签，训练目标就从「终局事实」降成「自己的旧判断」，偏差会被固化回权重。训练时仍会重新计算 v_net 并与 z 比较。",
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

interface EdgeTrace {
  action: number
  n: number
  w: number
  sent: number
}

interface BackupTrace {
  path: number[]
  leafPlayer: 1 | -1
  value: number
  edges: EdgeTrace[]
  rootValue: number
}

function traceEdges(tree: SearchTree, path: number[]): EdgeTrace[] {
  let node: MctsNode = tree.root
  return path.map((action) => {
    const n = node.N[action]
    const w = node.W[action]
    const child = node.children.get(action)
    if (child) node = child
    return { action, n, w, sent: 0 }
  })
}

const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`

function SimulationStepper() {
  const [net, setNet] = useState<NetFn | null>(null)
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const [leaf, setLeaf] = useState<LeafView | null>(null)
  const [answer, setAnswer] = useState<NetAnswer | null>(null)
  const [simulations, setSimulations] = useState(0)
  const [version, setVersion] = useState(0)
  const [terminalNote, setTerminalNote] = useState<string | null>(null)
  const [autoTrip, setAutoTrip] = useState(false)
  const [lastTrace, setLastTrace] = useState<BackupTrace | null>(null)
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
    setLastTrace(null)
    tree.select()
    setTerminalNote(null)
    if (tree.needsEval()) {
      const pending = tree.pendingState()
      if (pending) setLeaf({ path: tree.pendingActions() ?? [], leaf: pending })
      setStage(1)
    } else {
      setSimulations((n) => n + 1)
      setTerminalNote("这次选择直接到达终局：SearchTree 已把真实 ±1/0 沿路径回传，不需要网络。")
      setAutoTrip(false)
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
    const path = answer.path
    tree.expandAndBackup(answer.logits, answer.value)
    const edges = traceEdges(tree, path).map((edge, i) => ({
      ...edge,
      sent: answer.value * (-1) ** (path.length - i),
    }))
    setLastTrace({
      path,
      leafPlayer: answer.leaf.current,
      value: answer.value,
      edges,
      rootValue: tree.rootValue(),
    })
    setLeaf(null)
    setAnswer(null)
    setStage(0)
    setAutoTrip(false)
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
    setAutoTrip(false)
    setLastTrace(null)
    setVersion((v) => v + 1)
  }

  useEffect(() => {
    if (!autoTrip || !net) return
    const id = window.setTimeout(() => {
      if (stage === 0) select()
      else if (stage === 1) evaluate()
      else if (stage === 2) backup()
    }, 420)
    return () => window.clearTimeout(id)
  }, [autoTrip, stage, net, leaf, answer])

  const pending = answer ?? leaf
  const chainPath = lastTrace?.path ?? pending?.path ?? []
  const chainLeafPlayer = lastTrace?.leafPlayer ?? pending?.leaf.current ?? null
  const chainValue = lastTrace?.value ?? answer?.value ?? null
  const activePath = chainPath
  const pathMarks = activePath.map((a, idx) => ({
    x: a % 9,
    y: Math.floor(a / 9),
    anchor: idx === activePath.length - 1,
  }))

  const tree = treeRef.current
  const rootRows = tree
    ? Array.from(tree.root.N)
      .map((n, action) => ({ action, n, w: tree.root.W[action] }))
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
    : []
  const rootValue = tree?.rootValue() ?? 0
  const chainEdges = lastTrace?.edges ?? (tree ? traceEdges(tree, chainPath) : [])
  const resolved = lastTrace !== null
  void version

  return (
    <figure className="figure mt-8" data-qa="simulation-stepper">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 10-1 · 一次模拟分三键完成</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[21rem]">
          <Board board={POS.board.flat()} lastMove={{ x: 5, y: 5 }} marks={pathMarks} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!net || stage !== 0}
              onClick={select} data-qa="step-select">① 选择</button>
            <button type="button" className="btn" disabled={stage !== 1}
              onClick={evaluate} data-qa="step-evaluate">② 求值（网络评价）</button>
            <button type="button" className="btn" disabled={stage !== 2}
              onClick={backup} data-qa="step-backup">③ 扩展并回传</button>
            <button type="button" className={`btn ${autoTrip ? "active" : ""}`} disabled={!net}
              onClick={() => setAutoTrip((v) => !v)}>
              {autoTrip ? "⏸ 停" : "▶ 自动走一趟"}
            </button>
            <button type="button" className="btn" disabled={!net} onClick={reset}>↺ 重置</button>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            已完成 <span className="num">{simulations}</span> 次模拟。每个等待评价的叶子，
            必须先让网络评价完、把结果回传，才能开始下一次选择；同一棵树一次只处理一个这样的叶子。
          </p>
          {terminalNote && <div className="reveal-box mt-3 text-sm">{terminalNote}</div>}
          {(answer ?? leaf) && (
            <div className="reveal-box mt-3 text-sm" data-qa="leaf-state">
              <p>路径：根{(answer ?? leaf)!.path.map((a) => ` → ${coord(a)}`).join("") || "（根自身）"}</p>
              <p className="mt-1">叶节点的行棋方：{(answer ?? leaf)!.leaf.current === 1 ? "黑" : "白"}</p>
              {answer ? (
                <p className="num mt-1" style={{ color: "var(--accent-deep)" }}>
                  v_net={answer.value >= 0 ? "+" : ""}{answer.value.toFixed(3)}（{answer.ms.toFixed(1)} ms）
                </p>
              ) : <p className="mt-1">叶子尚未询问网络。</p>}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="sim-chain-panel" data-qa="sim-tree">
            <div className="mini-label">
              {resolved ? "这一趟的路径与回传" : "这一趟的路径"} · 根 → 叶
            </div>
            <div className="sim-chain-track">
              <div className="sim-chain-node root">
                <span className="sim-chain-node-tag">根</span>
                <strong>{POS.current === 1 ? "黑" : "白"}</strong>
              </div>
              {chainPath.map((action, i) => {
                const edge = chainEdges[i]
                const isLeaf = i === chainPath.length - 1
                const player = isLeaf && chainLeafPlayer !== null
                  ? chainLeafPlayer
                  : i % 2 === 0 ? -1 : 1
                return (
                  <div className="sim-chain-hop" key={`${action}-${i}`}>
                    <span className="sim-chain-arrow" aria-hidden="true">→</span>
                    <div className={`sim-chain-edge${resolved ? " resolved" : ""}${isLeaf ? " leaf" : ""}`}>
                      <div className="sim-chain-edge-head">
                        <span className="sim-chain-action mono">{coord(action)}</span>
                        <span className="sim-chain-player">{isLeaf ? "叶" : "节点"} · {player === 1 ? "黑" : "白"}</span>
                      </div>
                      <span className="sim-chain-stat mono">
                        N {resolved ? `${edge.n - 1}→${edge.n}` : edge.n}
                      </span>
                      <span className="sim-chain-stat mono">
                        W {resolved ? `${signed(edge.w - edge.sent)}→${signed(edge.w)}` : signed(edge.w)}
                      </span>
                      {resolved && (
                        <span
                          className="sim-chain-sent mono"
                          style={{ animationDelay: `${(chainPath.length - 1 - i) * 170}ms` }}
                        >
                          {signed(edge.sent)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {chainPath.length === 0 && (
              <p className="sim-chain-empty">
                {pending || resolved ? "这一趟停在根自身：根就是待展开的新叶。" : "按「① 选择」从根出发。"}
              </p>
            )}
            {chainPath.length > 0 && (
              <div className="sim-chain-readout">
                <span>{chainValue === null ? "叶值待网络评价" : `叶节点 v_net ${signed(chainValue)}`}</span>
                {resolved && (
                  <span className="sim-chain-values">
                    <span className="sim-chain-values-label">逐层取负</span>
                    <b>{signed(lastTrace!.value)}</b>
                    {[...lastTrace!.edges].reverse().map((edge, i) => (
                      <span key={edge.action} style={{ animationDelay: `${i * 170}ms` }}>
                        → <b>{signed(edge.sent)}</b>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mini-label mt-4">根节点统计 · 每条边记 N、W、Q</div>
          {rootRows.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
              第一趟只展开根本身，路径为空，所以还没有根边统计。继续做第二趟才会经过一条根边。
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {rootRows.map((row) => (
                <div key={row.action} className="l00-top-row" data-qa="root-ledger-row">
                  <span className="mono">{coord(row.action)}</span>
                  <span className="prob-track">
                    <span className="prob-fill" style={{ width: `${Math.min(100, (row.n / Math.max(1, simulations)) * 100)}%` }} />
                  </span>
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
              它是每次模拟换算到根方视角后的平均；不等于任何一次叶处的价值估计，也不是终局结果 z。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 10-1</span>
        三键直接调用 alphagomoku/mcts.py 的 SearchTree.select 与 SearchTree.expand_and_backup（站内镜像名 leafInput、expandAndBackup）；权重舍入和 JavaScript 数值属于浏览器适配。
        root_value 面板按模拟次数求平均，每次模拟贡献换算到根方视角的一笔。
      </figcaption>
    </figure>
  )
}

function ThreeValues() {
  return (
    <figure className="figure mt-8" data-qa="three-values">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">一张表分清 3 个最易混的值</span>
      </div>
      <div className="overflow-x-auto p-4 sm:p-5">
        <table className="l09-table value-compare">
          <thead>
            <tr><th>量</th><th>谁产生</th><th>站在谁的视角</th><th>用在哪里</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="mono">v_net</span></td>
              <td>网络对叶局面的一次前向</td>
              <td>叶节点的当前行棋方</td>
              <td>搜索的叶值；训练时再算价值损失</td>
            </tr>
            <tr>
              <td><span className="mono">root_value</span></td>
              <td>这次搜索所有模拟的最终值求平均</td>
              <td>当前根的行棋方</td>
              <td>展示搜索过程；不进训练目标</td>
            </tr>
            <tr>
              <td><span className="mono">z</span></td>
              <td>整局下完后的真实结果</td>
              <td>记录该手时的行棋方</td>
              <td>价值头的终局训练目标</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          一句话：<span className="mono">v_net</span> 是网络对一片叶的第一眼，
          <span className="mono">root_value</span> 是整次搜索的平均记录，
          <span className="mono">z</span> 是棋局结束后才拿到的事实。
        </p>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">对照表</span>
        三个量都可能落在 −1…+1 内，但产生方式、视角与用途不同，不能互相替换。
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
