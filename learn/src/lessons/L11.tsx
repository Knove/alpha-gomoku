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
          沿树选择到叶、在叶处取得一个价值估计、再把它逐层回传的搜索算法（缩写 MCTS）。
          「蒙特卡洛」来自用随机模拟估计答案的传统；引入神经网络评价后，
          随机模拟被一次前向计算取代，沿路径回传并累加统计的形式保持不变。
        </Def>
        <p>
          这套算法因 AlphaGo 系列而广为人知，本项目的搜索就是它的一个实现。它把推演过的局面组织成一棵搜索树，并按固定的调用序驱动每一趟模拟：
          先 <span className="mono">select</span> 沿树走到叶，再由调用方把网络算好的策略与价值交回搜索树，
          最后 <span className="mono">expand_and_backup</span> 把新长出的边接上，并把这次取得的值回传到走过的各条边。
        </p>
        <Def term="节点、根、边、叶" en="node, root, edge, leaf node">
          搜索记录下来的每个局面叫一个节点；当前局面是根；局面之间的一手棋是边；
          沿边走到的那个尚未展开的节点叫叶节点。一次模拟的路径就是一串「节点、边」交替的链条。
        </Def>
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
          第一步是<strong>选择</strong>（selection）：从根沿已经展开的边向下走，直到到达终局或尚未展开的叶节点（终局节点不必再展开，直接读真实输赢，也算叶）；走过的每一手都记下「从哪个节点、选了哪条边」，供回传时按原路返回。
          岔口上比较候选边的规则叫 PUCT（把网络给的先验和边上已有的平均成绩合成一个分数，既不放弃已见好成绩的路，也不长期忽略访问不足的候选；下一课完整手算）。
          向下走时沿选出的边前进，边上的子节点没有就当场建一个，直到停在叶节点。
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
        <Def term="先验" en="prior">
          网络给出的各着点概率（代码里是 P），与第 9 课 softmax 后的比例是同一批数，用作先验时只保留合法落点、再重新归一到 1。遮住非法落点后各数之和近于 0 时（策略全压在被禁点上），退化成在合法落点上均匀分布。
          根先验在第一趟模拟展开根时现算，途中每个新叶展开时再各算一次，机制相同。它来自策略头，是「第一眼觉得该下哪」，
          还没有叠加任何后续推演；搜索会在这个基础上继续检验和修正。
        </Def>
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
          第二步是在叶节点<strong>求值</strong>（evaluation），取得一个价值估计。若叶局面已经终局，就按叶节点行棋方的视角直接给值，不再询问网络：
          对方刚成五则记 −1，和记 0。合法对局里成五的必是刚落完子的对方，
          所以叶处直读的这个值不会出现 +1；回传时逐手翻号，「赢」才以 +1 的形式出现在上方的边上。
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
        <p>
          若棋还没结束，网络对该叶从头到尾算一遍前向，给出
          <span className="mono">v_net</span>。这个数站在
          <strong>叶节点当前行棋方</strong>的视角。更早的传统蒙特卡洛做法叫<strong>随机走子</strong>（rollout）：从叶局面开始双方随机落子直到终局，
          用真实输赢当评价；一局随机棋噪声极大，要多走很多局才抵得上网络一眼的判断。
          网络把「看过的成千上万局」压缩进一次前向，所以本系统用
          <span className="mono">v_net</span> 代替随机下完，搜索则负责修正网络的漏看。
          演示在浏览器里单树顺序执行；真正的训练把多局棋等待评价的叶子合成一批一起算，
          但每棵树内部仍然一次走一步，顺序不变。
        </p>

        <h3>扩展新叶，沿原路径逐层取负回传</h3>
        <p>
          第三步是<strong>扩展</strong>（expansion）：普通新叶收到网络给出的先验后，在叶节点上长出各条候选边，使它从叶变成可以继续向下选择的内部节点。
          一次只长一片叶，一是让每片新叶都先拿到网络评价、再参与下一次选择；二是让边上的计数与真实访问对得上：一次模拟只产生一个新评价、只给一条路径的边记一笔 N、W，展开多个新叶会让新边的计数与真实访问脱节，或迫使一次模拟调用多次网络。
          若一口气把整条路径全展开，后面的节点没有网络先验，只好用均匀先验
          （uniform prior，各着点等概率）任选一着。
          因此一次模拟最多展开一个新叶，下一次模拟才能利用这次新长出的边。
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
          第四步是<strong>回传</strong>（backup）：从叶回到根，把这次取得的值按原路径回传到每条经过的边。
          每退一层就换到另一方，所以先把值变成相反数再写进那条边。
          先看数字：叶节点行棋方的 <span className="mono">v_net</span> = +0.6，上一层边记 −0.6，
          再上一层边记 +0.6。
        </p>
        <Def term="负极大值搜索" en="negamax">
          回传时「每退一层先取负」的符号约定（英文原名 negamax）。五子棋的终局值严格零和（一方所得就是另一方所失），所以同一结果对对手就是它的相反数，逐层取负合法；非零和的计分不能这样回传。具体到符号：
          叶节点行棋方的「我赢」是上一层对手的「我输」，所以退一层必须换一次视角。
        </Def>
        <Def term="N、W、Q" en="visit count, total action value, mean action value">
          记在每条边上的 3 个数：<span className="mono">N</span> 是这条边被走过的次数；
          <span className="mono">W</span> 记的是这手棋的行棋方所见的累计结果；
          <span className="mono">Q=W/N</span> 是平均成绩。
        </Def>
        <p>
          每回传到一条边，就更新它上面的 N、W 两笔（Q=W/N 现算）。一条边经过 4 次，累计
          <span className="mono">W=+2</span>，则 <span className="mono">Q=+0.5</span>。
          一次回传的值可能来自真终局结果的 ±1，也可能来自价值估计{" "}
          <span className="mono">v_net</span>。后者带有估计误差：访问次数少时，单次估计值对{" "}
          <span className="mono">Q</span> 的影响大；访问次数增多后，平均成绩{" "}
          <span className="mono">Q</span> 是许多次回传结果的平均（其中也掺着少数真终局结果），单次估计误差就被平均稀释掉了。
          回传走完整条路径后，此时的 <span className="mono">v</span> 已经翻回根节点行棋方的视角，顺手累加进{" "}
          <span className="mono">_root_value_sum</span> 与{" "}
          <span className="mono">_root_value_count</span>，两者的商就是搜索汇总{" "}
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
          根上另记的一个数（代码里写作 <span className="mono">root_value</span>）：
          它把每次模拟最终换算到根方视角的值求平均，所以可能混合许多叶的价值估计{" "}
          <span className="mono">v_net</span> 和真实终局结果。
        </Def>
        <p>
          搜索汇总只是搜索过程的记录值，用来展示。
          它与「根边按访问数加权的 Q 平均」接近，但不相等：首趟只展开根的那次模拟，值只进 root_value、不动任何根边；换新根后 root_value 统计清零，根边却保留旧计数。终局结果 <span className="mono">z</span> 则来自整盘真实终局。
          <span className="mono">v_net</span>、
          <span className="mono">root_value</span>、
          <span className="mono">z</span> 是 3 个不同的量。
        </p>
      </div>

      <SimulationStepper />

      <div className="prose mt-12">
        <h3>落子后把搜过的子树提作新根</h3>
        <p>
          真实对局里，一方落子之后局面才往前走一步。这一步之下的许多变化，
          刚才那阵搜索多半已经查过；整棵丢掉重来，等于把做过的搜索扔了。
          所以落子后把已选动作的子节点提作新根，它下面的 N、W、Q 原样保留，
          只有上一根的 <span className="mono">root_value</span> 展示统计清零。
          保留下来的访问数使新根的访问总数（记作 ΣN）不等于这一步新增的模拟次数；下一课按根下各落点访问数占 ΣN 的比例算出访问分布 π 时，分母正是这个保留并继续累加的 ΣN（而不是新增模拟次数或候选动作个数）。
          若对手走了搜索里没有的着，就走 else 分支新建一个空节点当新根，从头展开。
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

function SimulationStepper() {
  const [net, setNet] = useState<NetFn | null>(null)
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const [leaf, setLeaf] = useState<LeafView | null>(null)
  const [answer, setAnswer] = useState<NetAnswer | null>(null)
  const [simulations, setSimulations] = useState(0)
  const [version, setVersion] = useState(0)
  const [terminalNote, setTerminalNote] = useState<string | null>(null)
  const [autoTrip, setAutoTrip] = useState(false)
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
    tree.expandAndBackup(answer.logits, answer.value)
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

  const activePath = (answer ?? leaf)?.path ?? []
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
          <div className="mini-label">根节点统计 · 每条边记 N、W、Q（N 记访问次数，W 与 Q 记在这手棋行棋方的视角上；根下的边记在当前行棋方视角上）</div>
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
