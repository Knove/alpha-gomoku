/** 第 11 课 · 搜索：下一次该查哪条路。
 *  节拍：选择分数(Q+U)→ 例 11-1 三行手算 → π/根噪声/温度 → 例 11-2 真权重预算 →
 *  对证(SearchTree)→ 本章小结 → 习题。 */
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

export default function L14() {
  const pass = usePassLesson()
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 11 课</div>
      <h1 className="text-2xl font-bold">搜索：下一次该查哪条路</h1>

      <LessonGuide
        question="一棵树有很多候选路，搜索怎样决定下一次把思考机会花在哪里，并把访问次数变成落子？"
        why="第 10 课已经会让一次模拟向前走、再把结果向后回传；现在必须解决预算分配，否则搜索会只盯热门路，或把时间平均浪费在所有路上。"
        chain={[
          "PUCT 把历史成绩 Q 和探索奖励放在一起",
          "多次模拟把每条根边的访问次数记成 N",
          "把全部根访问数换算成比例（加起来等于 1），得到策略目标 π",
          "根噪声改的是搜索期的根先验，温度管的是搜索完之后的落子",
        ]}
        takeaway="P 引路、Q 记成绩、N 记证据量；PUCT 决定下一次查哪里。π 总结整次搜索；实际动作再按对局前后期采样，或取最大访问数。"
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
          每条边扩展时写入先验 <span className="mono">P</span>；此后每次模拟沿路径记一笔：
          <span className="mono">N</span> 加 1、<span className="mono">W</span> 加这次换视角后的值，
          <span className="mono">Q=W/N</span> 现算。
          Q 的每个记分都来自叶处 v_net 或终局 z 的回传<span className="def-see">参见：第 10 课</span>。
          只选 Q 最大的路，会让早期一次好运把后面的次数全占掉；只追求没见过的路（比如永远选 N 最小），
          又会忽略已经发现的好路。
          下一次选择必须同时顾及已有成绩 Q 和访问次数 N，才能把有限的模拟预算分得合理。
        </p>
        <Def term="利用与探索" en="exploitation and exploration">
          利用（exploit）指沿已知成绩好的路继续走；探索（explore）指把次数分给没看够的路。
          这一对权衡是搜索预算分配的核心：只利用会锁死在早期偶然的好成绩上，只探索会把时间浪费在已经证明平庸的路上。
        </Def>
        <p>
          把两者写成一条可计算的规则，先看它对 3 条候选边算出什么，再看公式。
          例 11-1 的 A、B、C 3 条边在同一个岔口上，已知数据是
          A：<span className="mono">P=0.40、N=10、Q=0.55</span>，
          B：<span className="mono">P=0.40、N=5、Q=0.45</span>，
          C：<span className="mono">P=0.20、N=1、Q=0.10</span>。
          A 的成绩最好但已经看了 10 次，B 成绩不差、看得少，C 又少又差。
          打分时把已有成绩和一份补偿相加：
        </p>
        <div className="formula">
          score(a) = <span className="hl">Q(a)</span> +
          c · P(a) · √ΣN / (1 + N(a))
        </div>
        <p>
          公式右边第一项是已有成绩，第二项就是探索奖励。
          <span className="mono">ΣN</span> 是这个岔口全部候选被走过的总次数；两项各有来历：探索幅度用 √ΣN，是 UCB 置信半径的变体（标准 UCB1 用 √(ln ΣN / N)，这里改用先验 P 定各边权重、用 √ΣN 作随预算增长的幅度）；分母 1+N 保证没走过的边（N=0）探索分有限且最大，并随访问递减。平方根让
          探索奖励随总预算缓慢增加；分母 <span className="mono">1+N(a)</span>
          让已经常走的路逐渐失去这份奖励。
          <span className="mono">c</span> 是探索强度权重：越大越偏爱少走的路；本项目配置固定为 1.5。
          例 11-1 的三行使用同一个 <span className="mono">c=1.5、ΣN=16</span>，逐行计算后选择总分最高的一条。
        </p>
        <Def term="探索奖励" en="exploration bonus">
          选择分数里补偿「去查没看够的路」的那一项，大小随该边访问次数增加而减小。
          走过足够多次后补偿自然消失，分数回到只看成绩；它不是「永远选冷门」的指令。
        </Def>
        <Def term="PUCT" en="Predictor + UCT">
          带预测网络的上置信界树搜索，本项目的选择规则。名字来自 UCT
          （Upper Confidence bounds applied to Trees）；UCT 又源自 UCB
          （Upper Confidence Bound，上置信界）思想：对不确定的选项保持乐观，迫使搜索去查证。
          PUCT 在这个骨架上用网络先验 P 决定每条边探索奖励的权重。
        </Def>
      </div>

      <PuctTable />

      <div className="prose mt-10">
        <h3>访问次数归一化成 π，温度决定实际落子</h3>
        <p>
          搜索跑完后，策略目标使用<strong>全部根动作</strong>的累计访问数。用 3 条边的访问
          10、5、1 举例，分母是全部根访问 16，不是候选动作个数 3，得到的比例加起来等于 1：
        </p>
        <div className="formula">π(a) = N(a) / Σ<sub>全部根动作</sub>N</div>
        <p>
          与先验 P 不同：P 是网络一眼给出的把握，π 是搜索访问配比 N/ΣN。
        </p>
        <p>
          不能用 top 5 的访问数当总数，也不能把「预算 40 次」直接写成分母。
          新树第一次模拟只展开根，可能还没有任何根边访问；落子后若复用已经搜索过的子树，
          新根还可能带着旧访问。因此「新跑了多少次」「根上累计多少次」和「top 5 展示多少次」是
          3 件不同的事。例 11-2 会同时显示预算和真实 <span className="mono">ΣN</span>。
        </p>
        <p>
          最终落子看 N 不看 Q。Q 会被早期一次好运抬高，而 N 大说明 PUCT 在知道成绩后
          仍反复把预算投给它：访问最多，就是搜索最信任的结论。从访问分布到实际动作还有一道控制，
          决定前期多试、后期果断。
        </p>
        <Def term="温度" en="temperature">
          决定实际落子是按分布抽样，还是近似取最大。按 π^(1/τ) 采样，τ=1 时按 π 本身抽样，
          τ 越低越偏向大访问，τ→0 退化为取最大。自我对弈的前 12 手（演示配置为前 10 手）温度高，按 π 抽样，
          让高访问候选更常出现、冷门候选也有机会；残局每手都可能直接定胜负，
          抽样等于把胜势随手送掉，所以后期温度低，改为直接选访问最多的动作。
        </Def>
        <p>
          根节点还会把网络先验 P 和一份随机配比 η 混在一起，让自我对弈走出更多样的路线。
          随机配比从狄利克雷分布抽出：
        </p>
        <Def term="狄利克雷分布" en="Dirichlet distribution">
          在「和为 1 的非负配比」上取样的分布，抽出的一份配比 η 非负且和为 1。浓度参数 α 小于 1 且越小，
          抽样越偏向少数几路、其余接近 0；本项目取 α=0.3。
        </Def>
        <Def term="根噪声" en="root Dirichlet noise">
          只在根节点把网络先验 P 和随机配比 η 混合的做法，新先验为
          (1−ε)·P + ε·η。ε 控制掺多少，自我对弈取 ε=0.25，即 25%。
        </Def>
        <p>
          只在根掺，一处扰动会贯穿这手棋的整次搜索，把整盘棋引向不同路线；
          若每个节点都掺，统计里到处是没有意义的随机偏差，反而冲淡真实成绩。
          竞技场和人机对弈关闭根噪声。开局按 π 抽样属于温度的安排，是另一道独立的控制。
        </p>
      </div>

      <BudgetLab />

      <Ledger title="SearchTree._puct_select / root_pi / update_root">
        <div className="codewalk">
          <pre>{`# 选下一条边：历史平均 + 探索奖励；非法动作永远不选
Q = np.divide(W, N, out=np.zeros_like(W), where=N > 0)
U = cfg.c_puct * P * sqrt(N.sum() + 1e-8) / (1 + N)
score = Q + U
score[legal == 0] = -np.inf
return int(np.argmax(score))  # 并列时取第一个合法最大值`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# 全部根访问数形成 π；落子后保留已经搜索过的子树
counts = root.N
pi = counts / counts.sum()
root = root.children.get(action, new_node)
# 新根若已展开，自我对弈会重新混入根噪声`}</pre>
        </div>
        <p className="mt-3">
          两段代码里，<span className="mono">P/Q/N</span> 合成下一次选择，
          <span className="mono">π</span> 的分母取全部根访问，
          <span className="mono">update_root</span> 复用子树后，ΣN 可能带着旧访问数。
          浏览器 <span className="mono">SearchTree</span> 使用 Float64、舍入后的导出权重和
          JavaScript 随机数，规则和 Python 版一致，小数结果不会一模一样。
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
            下一节把一盘棋变成一批训练样本。落子当时还不知道输赢，终局才把 z 补进每条记录；
            顺带分清搜索时记下的 v_net、root_value 和终局 z 各自的角色，以及真训练怎样跨多棵树
            批量评估、逐树顺序搜索。样本积累好之后，才轮到网络从这些样本里学。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 12 课"
        onAllCorrect={() => pass("l11")}
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
  const rows = [
    { name: "A", p: 0.40, n: 10, q: 0.55 },
    { name: "B", p: 0.40, n: 5, q: 0.45 },
    { name: "C", p: 0.20, n: 1, q: 0.10 },
  ]
  const total = rows.reduce((s, r) => s + r.n, 0)
  const scored = rows.map((r) => {
    const u = (1.5 * r.p * Math.sqrt(total)) / (1 + r.n)
    return { ...r, u, score: r.q + u }
  })
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a))

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 11-1 · 3 条边下一次选谁</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="l09-table">
            <thead><tr><th>边</th><th>P</th><th>N</th><th>Q</th><th>U=1.5·P·√16/(1+N)</th><th>Q+U</th></tr></thead>
            <tbody>
              {scored.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong>{r.name === best.name ? " ← 下一次" : ""}</td>
                  <td className="num">{r.p.toFixed(2)}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{r.q.toFixed(2)}</td>
                  <td className="num">{r.u.toFixed(2)}</td>
                  <td className="num">{r.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          A 的 Q 最高，但已经看了 10 次，探索奖励很小；B 的成绩不差、访问较少，因此本轮总分最高。
          C 虽然最少看，P 和 Q 都低，这份探索奖励还不足以让它领先。公式不是「永远选冷门」，而是在证据和探索之间分预算。
        </p>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 11-1</span>
        数字专门用于逐项手算 PUCT，不是训练记录。
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
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 11-2 · 真权重预算实验</span>
        <span className="num text-sm" style={{ color: "var(--fg-faint)" }}>新增模拟 {sims} · 根 ΣN={total}</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[20rem]">
          <Board board={POS.board.flat()} marks={[{ x: 5, y: 4, anchor: true }]} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            教学构造：轮黑，红圈 F5=(5,4) 是立即成五的动作。它专门检验弱先验和有限预算是否会漏掉明显胜着。
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
              若 40 次后 F5 仍未访问，结论不是「搜索代码错了」，而是弱网络先验和有限预算先把机会花在别处。
              增加预算只是提高补上漏点的机会，并不保证一定找到。切换噪声后 P 会变化，N 仍由后续 PUCT 和真实回传共同决定。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 11-2</span>
        棋盘是教学构造；叶子的评价来自演示用的 checkpoint（检查点，训练中保存的一组已四舍五入的权重），
        搜索由浏览器 SearchTree 复现。
      </figcaption>
    </figure>
  )
}
