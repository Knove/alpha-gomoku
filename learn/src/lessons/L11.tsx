/** 第 11 课 · 搜索：下一次该查哪条路。
 *  节拍：选择分数(Q+U)→ 例 11-1 三行手算 → π/根噪声/温度 → 例 11-2 真权重预算 →
 *  源码与验证 → 本章小结 → 习题。 */
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

const F5 = 41
const POS: GameState = (() => {
  const board = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (const x of [1, 2, 3, 4]) board[4][x] = 1
  board[4][0] = -1
  for (const x of [2, 3, 4]) board[1][x] = -1
  board[2][6] = 1
  board[7][7] = -1
  return { board, current: 1, winner: 0, moveCount: 10, lastMove: null }
})()

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

const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

export default function L11() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 11 课</div>
      <h1 className="text-2xl font-bold">搜索：下一次该查哪条路</h1>

      <LessonGuide
        question="一棵树有很多候选路，搜索怎样决定下一次把思考机会花在哪里，并把访问次数变成落子？"
        why="第 10 课已经会让一次模拟向前走、再把结果向后回传；现在必须解决预算分配，否则搜索会只盯热门路，或把时间平均浪费在所有路上。"
        chain={[
          "PUCT 把历史成绩（第 10 课的平均成绩 Q）和探索奖励放在一起",
          "多次模拟把每条根边的访问次数记成 N",
          "把全部根访问数换算成比例（加起来等于 1），得到策略目标 π",
          "根噪声改的是搜索期的根先验，温度管的是搜索完之后的落子",
        ]}
        takeaway="你能按 PUCT 手算下一次选边，把根访问数归一成 π，并指出根噪声、π 与温度各自落在自我对弈的哪一段。"
        boundary="F5 是刻意构造的失败诊断局面，不是训练记录。演示使用浏览器复现、真正导出的权重和固定随机序列；它和真正训练用的是同一套规则，但预算、精度和执行方式经过浏览器适配。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一棵树有 3 条候选路：一条 Q 最高但只看过 1 次，一条成绩略低却已看过 20 次。若只按「谁的 Q 最大」来选下一次模拟，长期会出什么问题？",
            options: [
              "没有问题，Q 最大的那条永远最优",
              "早期一次好运就能把 Q 抬高，之后每次模拟都投给它，别的路再也没机会被查证",
              "Q 会自己越用越准，不需要记录访问次数",
            ],
            answer: 1,
            explain:
              "Q 是平均成绩，不带证据量信息：一条只看过一次的路赢一局就能拿 Q=+1，压过看过 20 次、平均 +0.6 的路。只认 Q 最大，模拟会全押给它，没有机制回头验证。下一次选择必须同时看已有成绩、先验和访问次数，这正是正文要逐项拼出的 PUCT。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>选择分数把已有成绩和探索奖励相加</h3>
        <p>
          每条候选边都有三项：已有平均成绩 <span className="mono">Q</span>、
          网络先验 <span className="mono">P</span> 和访问次数 <span className="mono">N</span>。
          只挑 Q 最大，早期一次好运就可能霸占全部预算；只挑 N 最小，又会反复浪费在已经证明平庸的路上。
          下一次选择要把两者合成一个分数。
        </p>
        <p>
          把两者写成一条可计算的规则，先看它对 3 条候选边算出什么，再看公式。
          例 11-1 的 A、B、C 3 条边在同一个岔口上，已知数据是
          A：<span className="mono">P=0.40、N=10、Q=0.55</span>，
          B：<span className="mono">P=0.40、N=5、Q=0.45</span>，
          C：<span className="mono">P=0.20、N=1、Q=0.10</span>。
          A 的成绩最好但已经看了 10 次，B 成绩不差、看得少，C 又少又差。
          打分时把已有成绩和一份补偿相加：
        </p>
        <PuctBreakdown />
        <p>
          探索补贴 <span className="mono">U</span> 里，先验 P 决定起跑位置，
          <span className="mono">√ΣN</span> 随总预算增长，
          <span className="mono">1+N(a)</span> 让常走的边逐渐失去补贴。
          本项目固定 <span className="mono">c=1.5</span>；非法动作直接排除。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="按 PUCT 公式计算各候选边的 Q + U 并选出最高分合法动作"
          source="alphagomoku/mcts.py · SearchTree._puct_select"
        >
          <div className="codewalk">
            <pre>{`    def _puct_select(self, node: _Node, game: Game) -> int:
        legal = game.legal_moves()
        N, W, P = node.N, node.W, node.prior
        assert P is not None
        sqrt_total = math.sqrt(float(N.sum()) + 1e-8)
        Q = np.divide(W, N, out=np.zeros_like(W), where=N > 0)
        U = self.cfg.c_puct * P * sqrt_total / (1.0 + N)
        score = Q + U
        score[legal == 0] = -np.inf
        return int(np.argmax(score))`}</pre>
          </div>
        </EvidenceCard>
        <Def term="PUCT 与探索奖励" en="Predictor + UCT, exploration bonus">
          节点选择分数 <span className="mono">score(a)=Q(a)+U(a)</span>。
          Q 负责利用已知战果，<span className="mono">U(a)=c·P(a)·√ΣN/(1+N(a))</span> 负责探索。
          一条边访问越多，补贴越小；先验很低的边，即使没访问过也不会凭空胜出。
        </Def>
        <p>
          这套打分先在例 11-1 的三条边上过一遍手算。例 11-1 的三行使用同一个{" "}
          <span className="mono">c=1.5、ΣN=16</span>，逐行计算后选择总分最高的一条。
        </p>
      </div>

      <PuctTable />

      <div className="prose mt-10">
        <h3>访问次数归一化成 π，温度决定实际落子</h3>
        <p>
          搜索跑完后，策略目标使用<strong>全部根动作</strong>的累计访问数，写成式子是：
        </p>
        <div className="formula">π(a) = N(a) / Σ<sub>全部根动作</sub>N</div>
        <p>
          用 3 条边的访问 10、5、1 举例，分母是全部根访问 16，不是候选动作个数 3，
          得到的比例加起来等于 1。P 是网络第一眼的把握，π 是搜索走出来的访问比例。
          树还没跑过模拟时 ΣN=0，此时按合法着均匀给出 π。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="将根访问计数归一为分布 π，含零访问兜底与低温取最大分支"
          source="alphagomoku/mcts.py · SearchTree.root_pi"
        >
          <div className="codewalk">
            <pre>{`    def root_pi(self, temperature: float = 1.0) -> np.ndarray:
        """Visit-count distribution at the root (the training target)."""
        counts = self.root.N
        total = counts.sum()
        if total <= 0:
            legal = self.root_game.legal_moves()
            s = legal.sum()
            return legal / s if s > 0 else legal
        if temperature <= 1e-3:
            pi = np.zeros_like(counts)
            pi[self.best_action()] = 1.0
            return pi
        c = counts.astype(np.float64) ** (1.0 / temperature)
        return (c / c.sum()).astype(np.float32)`}</pre>
          </div>
        </EvidenceCard>
        <Def term="访问分布" en="visit distribution">
          搜索跑完后，按各根动作的累计访问数算出的比例分布：
          <span className="mono">π(a) = N(a) / ΣN</span>，分母是全部根动作访问数之和，
          不是预算次数，也不是候选动作个数。它与先验 P 回答同一个问题（「哪里该下」），
          区别只在答案来源：P 来自网络一眼，π 来自搜索推演。
        </Def>
        <p>
          分母既不是本轮预算，也不是 top 5 的访问合计，而是当前根上全部边的真实累计访问。
          复用子树后，这个数还可能包含上一手留下的旧访问。
        </p>
        <p>
          最终落子看 N 不看 Q。Q 会被早期一次好运抬高，而 N 大说明 PUCT 在知道成绩后
          仍反复把预算投给它：访问最多，就是搜索最信任的结论。从访问分布到实际动作还有一道控制，
          决定前期多试、后期果断。
        </p>
        <p>
          温度决定实际落子怎么从 π 里选。按 <span className="mono">π^(1/τ)</span>
          重新归一后，τ=1 按原分布抽样；τ 越低越偏向大访问，τ→0 退化为取最大。
          自我对弈只在开局前 <span className="mono">temp_threshold</span> 手抽样，
          之后直接取访问最多的动作。默认门槛 12，演示配置 10。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="自我对弈前 temp_moves 手按 π 抽样，之后直接取最大访问动作"
          source="alphagomoku/selfplay.py · play_games"
        >
          <div className="codewalk">
            <pre>{`            pi = s.tree.root_pi(temperature=1.0)
            if sample_temperature and s.game.move_count < temp_moves:
                a = int(rng.choice(n * n, p=pi / pi.sum()))
            else:
                a = s.tree.best_action()`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          门槛 <span className="mono">temp_moves</span> 读取配置项{" "}
          <span className="mono">temp_threshold</span>：默认配置（<span className="mono">alphagomoku/config.py</span>）为 12，演示配置（<span className="mono">configs/fast.json</span>）为 10。
        </p>
        <p>
          搜索开始前，根节点还会把先验 P 与一份狄利克雷随机配比 η 混合：
          自我对弈取 <span className="mono">ε=0.25、α=0.3</span>，
          相当于掺入 25% 的随机视野，让开局不只沿同一条路重复。
          每次换新根若已展开，会重新混一次；竞技场与人机对弈关闭根噪声。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="在根节点按比例混合网络先验与狄利克雷噪声"
          source="alphagomoku/mcts.py · SearchTree._mix_noise"
        >
          <div className="codewalk">
            <pre>{`    def _mix_noise(self, node: _Node, legal: np.ndarray) -> None:
        eps = self.cfg.dirichlet_epsilon
        if eps <= 0:
            return
        idx = np.flatnonzero(legal)
        noise = self.rng.dirichlet(np.full(len(idx), self.cfg.dirichlet_alpha))
        mixed = (1.0 - eps) * node.prior
        mixed[idx] += eps * noise.astype(np.float32)
        node.prior = mixed`}</pre>
          </div>
        </EvidenceCard>
        <Def term="根噪声与温度" en="root Dirichlet noise & temperature">
          根噪声只改搜索开始前的根先验：
          <span className="mono">(1−ε)·P+ε·η</span>，ε=0.25、α=0.3。
          温度只改搜索结束后的落子：前 <span className="mono">temp_threshold</span> 手按 π 抽样制造分叉（默认 12，演示配置 10），之后取最大访问。
          一个在搜索前，一个在搜索后，互不替代。
        </Def>
      </div>

      <DecisionTimeline />
      <BudgetLab />

      <Ledger title="alphagomoku/mcts.py · best_action 与 alphagomoku/config.py">
        <p className="mb-3 text-sm">
          正文中已经完整展示了选边函数 <span className="mono">_puct_select</span>、访问分布函数{" "}
          <span className="mono">root_pi</span> 与根噪声函数 <span className="mono">_mix_noise</span>。
          下面补充展示低温或后期落子调用的 <span className="mono">best_action</span>，以及{" "}
          <span className="mono">Config</span> 中集中定义的五项搜索超参数：
        </p>
        <div className="codewalk">
          <pre>{`    def best_action(self) -> int:
        """Argmax visit count among LEGAL actions (all-zero counts fall back to
        the first legal move, mirroring root_pi's uniform-legal fallback)."""
        legal = self.root_game.legal_moves()
        if legal.sum() == 0:
            return 0
        masked = np.where(legal > 0, self.root.N, -np.inf)
        return int(np.argmax(masked))`}</pre>
        </div>
        <div className="codewalk mt-3">
          <pre>{`    # MCTS
    mcts_simulations: int = 100
    c_puct: float = 1.5
    dirichlet_alpha: float = 0.3
    dirichlet_epsilon: float = 0.25
    temp_threshold: int = 12`}</pre>
        </div>
        <p className="mt-3 text-sm">
          运行 <span className="mono">python -m pytest tests/test_mcts.py -q</span>{" "}
          可验证 PUCT 选边、根访问分布 <span className="mono">π</span> 归一与狄利克雷根噪声混合。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "PUCT 用 Q 加探索奖励决定下一次查哪条边：已有成绩好、访问不太满的候选容易胜出，c=1.5 控制探索强度。",
          "π 由全部根动作的访问数归一化得到，分母是当前根的真实 ΣN，既不是本轮预算，也不是 top 5 的合计。",
          "根噪声只在根掺随机以增加路线多样性，温度决定按 π 抽样还是取最大访问；两者帮助探索，不构成必然正确的保证。",
        ]}
        next={
          <>
            下一课把一局棋变成一批训练样本。落子当时还不知道输赢，终局才把 z 补进每条记录；
            顺带分清搜索用过的 v_net、记下的 root_value 和终局结果 z 各自的角色，以及真训练怎样跨多棵树
            批量评估、逐树顺序搜索。样本积累好之后，才轮到网络从这些样本里学。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "一条边 Q 很高，但只访问过 1 次；另一条边 Q 稍低，却已访问 20 次。为什么 PUCT 不直接永远选择第一条？",
            options: [
              "Q 只能显示正数，无法比较 2 条边",
              "一次高 Q 可能只是好运；PUCT 同时利用 Q、先验 P 和访问次数，让已有成绩与尚未充分检查的候选共同决定下一次选择",
              "搜索规定每条边必须轮流走，不能使用历史成绩",
            ],
            answer: 1,
            explain: "Q 是平均成绩，却不单独表达证据量。PUCT 让好成绩有吸引力，同时给访问较少、先验不低的候选补偿；补偿会随着该边 N 增大而下降。",
          },
          {
            q: "某次搜索预算是 40，但根边访问总数 ΣN 显示 47。哪个解释正确？",
            options: [
              "一定是程序把七次访问重复相加了",
              "根可能复用了上一手留下的已搜索子树；预算表示本轮新增模拟数，π 的分母使用当前根全部累计访问数",
              "π 的分母应该强制改回 40，才能和配置一致",
            ],
            answer: 1,
            explain: "子树复用会保留子节点已有的 N。相反，一棵全新的树第一次模拟可能只展开根，让根边总数比预算少 1。π 永远按当前根真实 N 总和归一化。",
          },
          {
            q: "根噪声、温度和 π 分别做什么？",
            options: [
              "三者都是同一个随机数，只是名字不同",
              "根噪声改变自我对弈根先验以增加路线多样性；π 总结访问分布；温度决定实际动作是按分布抽样还是接近取最大",
              "根噪声证明冷门动作更好，π 证明访问最多的动作一定正确",
            ],
            answer: 1,
            explain: "三者位于不同环节：噪声先影响根 P，搜索后 N 归一化成 π，最后温度控制如何从访问分布选实际动作。它们帮助探索，不提供必然正确的保证。",
          },
        ]}
      />
    </section>
  )
}

function PuctTable() {
  const initRows = [
    { name: "A", p: 0.40, n: 10, q: 0.55 },
    { name: "B", p: 0.40, n: 5, q: 0.45 },
    { name: "C", p: 0.20, n: 1, q: 0.10 },
  ]
  const [rows, setRows] = useState(initRows)
  const total = rows.reduce((s, r) => s + r.n, 0)
  const scored = rows.map((r) => {
    const u = (1.5 * r.p * Math.sqrt(total)) / (1 + r.n)
    return { ...r, u, score: r.q + u }
  })
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))

  const stepVisit = () => {
    setRows((prev) =>
      prev.map((r) => (r.name === best.name ? { ...r, n: r.n + 1 } : r)),
    )
  }

  return (
    <figure className="figure mt-8" data-qa="fig-budget">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 11-1 · 3 条边下一次选谁</span>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={stepVisit}>
            试走一步（胜出边 {best.name} 的 N+1）
          </button>
          {total > 16 && (
            <button type="button" className="btn" onClick={() => setRows(initRows)}>
              ↺ 回到 ΣN=16
            </button>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="l09-table">
            <thead><tr><th>边</th><th>P</th><th>N</th><th>Q</th><th>U=1.5·P·√{total}/(1+N)</th><th>Q+U</th><th>Q + U 构成</th></tr></thead>
            <tbody>
              {scored.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong>{r.name === best.name ? " ← 下一次" : ""}</td>
                  <td className="num">{r.p.toFixed(2)}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{r.q.toFixed(2)}</td>
                  <td className="num">{r.u.toFixed(2)}</td>
                  <td className="num">{r.score.toFixed(2)}</td>
                  <td style={{ minWidth: "7.5rem" }}>
                    <div className="prob-track" style={{ display: "flex" }}>
                      <span className="motion-bar" style={{ width: `${Math.min(100, r.q * 65)}%`, background: "var(--fg-muted)" }} title={`Q=${r.q.toFixed(2)}`} />
                      <span className="motion-bar" style={{ width: `${Math.min(100, r.u * 65)}%`, background: "var(--accent)" }} title={`U=${r.u.toFixed(2)}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          三行共用同一个 c=1.5 与 ΣN={total}，逐行算出 U（朱砂段）再加 Q（深灰段），总分最高的一行标着「← 下一次」。
          初始 ΣN=16 时 A 的 Q 最高，但已看了 10 次，探索奖励很小；B 成绩不差、访问较少，因此胜出。
          点「试走一步」让当前胜出边的 N 加 1。随着各边访问数变化，U 会被逐渐摊薄，最高分也会在几条边之间轮换。
        </p>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 11-1</span>
        数字专门用于逐项手算 PUCT，不是训练记录。
      </figcaption>
    </figure>
  )
}

function PuctBreakdown() {
  return (
    <div className="puct-breakdown" role="img" aria-label="PUCT 分数由 Q 和 U 相加">
      <div className="puct-term q">
        <span className="puct-symbol">Q(a)</span>
        <strong>已知战绩</strong>
        <span className="mono">W / N</span>
        <small>哪条路已经赢得多</small>
      </div>
      <span className="puct-operator">+</span>
      <div className="puct-term u">
        <span className="puct-symbol">U(a)</span>
        <strong>探索补贴</strong>
        <span className="mono">1.5 · P(a) · √ΣN / (1+N(a))</span>
        <small>先验高、还没看够，就多给机会</small>
      </div>
      <span className="puct-operator">=</span>
      <div className="puct-term score">
        <span className="puct-symbol">score(a)</span>
        <strong>下一次查它</strong>
        <span className="mono">Q + U</span>
        <small>非法动作不参与比较</small>
      </div>
    </div>
  )
}

function DecisionTimeline() {
  return (
    <figure className="figure mt-8" data-qa="decision-timeline">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">一次落子的三个控制点</span>
      </div>
      <div className="p-4 sm:p-5">
        <ol className="decision-timeline">
          <li>
            <span className="decision-when">搜索前</span>
            <span className="decision-no">01</span>
            <strong>根噪声</strong>
            <span className="mono">P → 0.75P + 0.25η</span>
            <small>只在根；自我对弈开启</small>
          </li>
          <li>
            <span className="decision-when">搜索后</span>
            <span className="decision-no">02</span>
            <strong>访问分布 π</strong>
            <span className="mono">π(a) = N(a) / ΣN</span>
            <small>分母是当前根的全部累计访问</small>
          </li>
          <li>
            <span className="decision-when">落子时</span>
            <span className="decision-no">03</span>
            <strong>温度 τ</strong>
            <span className="mono">前 temp_threshold 手抽样 → 之后 argmax N</span>
            <small>默认 12 手，演示配置 10 手；后期选最信任的一手</small>
          </li>
        </ol>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">时序图</span>
        噪声改的是搜索的起点，π 汇总搜索的结果，温度只决定最后从 π 里怎么落子。
      </figcaption>
    </figure>
  )
}

type NetFn = (planes: number[][][]) => { logits: number[]; value: number }

function BudgetLab() {
  const [net, setNet] = useState<NetFn | null>(null)
  const [noise, setNoise] = useState<0 | 0.25>(0)
  const [seed, setSeed] = useState(42)
  const [sims, setSims] = useState(0)
  const [version, setVersion] = useState(0)
  const treeRef = useRef<SearchTree | null>(null)

  useEffect(() => {
    let alive = true
    loadWeights().then((w: WeightsJson) => {
      if (alive) setNet(() => loadNet(w))
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!net) return
    const cfg: MctsConfig = { cPuct: 1.5, dirichletEps: noise, dirichletAlpha: 0.3 }
    treeRef.current = new SearchTree(POS, cfg, net, mulberry32(seed))
    setSims(0)
    setVersion((v) => v + 1)
  }, [net, noise, seed])

  const runTo = (target: number) => {
    const tree = treeRef.current
    if (!tree || target <= sims) return
    tree.run(target - sims)
    setSims(target)
    setVersion((v) => v + 1)
  }

  const tree = treeRef.current
  const counts = tree ? Array.from(tree.root.N) : []
  const total = counts.reduce((a, b) => a + b, 0)
  const rows = counts
    .map((n, a) => ({ a, n, q: n > 0 ? tree!.root.W[a] / n : 0, p: tree?.root.prior?.[a] ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
  const f5n = counts[F5] ?? 0
  const best = tree && total > 0 ? tree.bestAction() : null
  void version

  return (
    <figure className="figure mt-8" data-qa="fig-temp">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 11-2 · 真权重预算实验</span>
        <span className="num text-sm" style={{ color: "var(--fg-faint)" }}>新增模拟 {sims} · 根 ΣN={total}</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[20rem]">
          <Board board={POS.board.flat()} marks={[{ x: 5, y: 4, anchor: true }]} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            轮黑，红圈 F5=(5,4) 是立即成五的胜着，用来检验弱先验与有限预算下搜索能否找到它。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!net || sims >= 1} onClick={() => runTo(1)}>跑 1 次</button>
            <button type="button" className="btn" disabled={!net || sims >= 40} onClick={() => runTo(40)}>跑到 40</button>
            <button type="button" className="btn" disabled={!net || sims >= 100} onClick={() => runTo(100)}>跑到 100</button>
            <button type="button" className="btn" disabled={!net} onClick={() => setSeed((s) => s + 1)}>↺ 换种子重置</button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>自我对弈根噪声</span>
            <span className="seg">
              <button type="button" className={`seg-btn ${noise === 0 ? "active" : ""}`} onClick={() => setNoise(0)}>关</button>
              <button type="button" className={`seg-btn ${noise === 0.25 ? "active" : ""}`} onClick={() => setNoise(0.25)}>开 25%</button>
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">根访问 top5 · π 使用全部 ΣN</div>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
              真权重加载后先跑 1 次：第一次只展开根，会看到预算 1、ΣN=0。
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <div key={r.a} className="l00-top-row">
                  <span className="mono text-sm">{coord(r.a)}</span>
                  <span className="num text-xs" style={{ color: "var(--fg-faint)" }}>P {(r.p * 100).toFixed(1)}%</span>
                  <span className="num text-xs" style={{ color: "var(--fg-faint)" }}>N {r.n}</span>
                  <span className="num text-xs" style={{ color: "var(--fg-faint)" }}>Q {r.q >= 0 ? "+" : ""}{r.q.toFixed(2)}</span>
                  <span className="prob-track"><span className="prob-fill" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} /></span>
                  <span className="num w-12 text-right text-xs">{total ? ((r.n / total) * 100).toFixed(1) : "0.0"}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="reveal-box mt-4 text-sm leading-relaxed">
            <p>当前最多访问：<span className="mono">{best === null ? "—" : coord(best)}</span></p>
            <p className="mt-1">F5：<span className="mono">N={f5n} / ΣN={total}</span></p>
            <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
              若 40 次后 F5 仍未访问，原因是弱网络先验和有限预算先把机会花在别处。
              增加预算只是提高补上漏点的机会，并不保证一定找到。切换噪声后 P 会变化，N 仍由后续 PUCT 和真实回传共同决定。
              「开 25%」就是自我对弈的用法；「关」就是竞技场和人机对战的用法，两处建树都把 add_noise 设为 False
              （alphagomoku/arena.py 与 server/play.py）；同样是这两处，竞技场开局按 π 抽样，人机对战则恒取访问最多、不抽样。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 11-2</span>
        棋盘是教学构造；叶子的评价来自演示用的检查点（checkpoint，训练保存的权重文件；教学站导出的这份只保留五位小数），
        搜索由浏览器 SearchTree 复现。浏览器 SearchTree 使用 Float64、舍入后的导出权重和 JavaScript 随机数，
        规则和 Python 版一致，小数结果不会一模一样。
      </figcaption>
    </figure>
  )
}
