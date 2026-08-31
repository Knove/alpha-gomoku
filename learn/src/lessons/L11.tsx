/** 第 11 课 · 搜索:再想四十遍。
 *  节拍:谜题(第一印象会错)→ 揭晓四小节(模拟 / PUCT / 逐层取负 / 访问数)→
 *  部件(单步模拟器:真引擎 SearchTree + 真权重叶评估,三键单步 select→eval→
 *  expandAndBackup;树图 / 根账本 / F5 收敛 / 根噪声开关)→ 对账(mcts.py)→ 小测。 */
import { useEffect, useRef, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { legalMoves, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { SearchTree, type MctsConfig, type MctsNode } from "../engine/mcts"
import { softmax } from "../engine/nn"
import { loadWeights } from "../lib/weights"

/* 教学手摆局面(archive/mcts.md 手算例):黑四连 (1..4,4)、白堵左端 (0,4)、
 * 白三 (2,1)(3,1)(4,1)、黑闲子 (6,2),轮黑。F5 = (5,4) = action 41 一手成五。 */
const F5 = 41
const POS: GameState = (() => {
  const board = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (const x of [1, 2, 3, 4]) board[4][x] = 1
  board[4][0] = -1
  for (const x of [2, 3, 4]) board[1][x] = -1
  board[2][6] = 1
  return { board, current: 1, winner: 0, moveCount: 9, lastMove: null }
})()
const POS_FLAT = POS.board.flat()

/** 固定种子的确定性随机(mulberry32,与 tests/mcts.test.ts 同款)——噪声可复现。 */
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

const MAX_SIMS = 100
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

export default function L11() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 11 课</div>
      <h1 className="text-2xl font-bold">搜索:再想四十遍</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "网络看一眼棋盘就报答案,快是快,但那只是第一印象——没算过「我下这、对手应那、我再下」的后续。第一印象会错,怎么办?",
            options: [
              "换更大的网络:参数多十倍,看得更准",
              "多想几步:沿「目前最值得看」的路线一次次推演,用统计把直觉磨准",
              "背更多棋谱:见过的局面多了,第一印象自然就对",
            ],
            answer: 1,
            explain:
              "选第二项。第一项和第三项都在给「看一眼」加料——但看一眼终究是看一眼:再大的网络、再多的棋谱,看一眼仍只是第一印象,直觉再强也不会自己推演「我下这、对手应那」——推演是搜索的事,不是直觉的事。第二项不换眼睛,换用法:让网络当向导,顺着它指的方向把「我下这、对手应那」真的走几遍,把每条路的结果记成账,几十次之后统计说了算。这就是本课的搜索——它不换更大的网络,只花固定的几十次「想」的次数。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 四件事:模拟、记账、取负、落子</h3>
        <p>
          <strong>① 模拟 = 一次推演。</strong>推演的产物长成一棵<em>树</em>:
          节点是局面,边是落子,根就是现在要下的局面。一次推演(
          <em>模拟</em>)从根出发,每个岔口挑「目前最值得看」的那条边往下走,
          走到<em>没见过的局面</em>就停(走到头的这个局面叫<em>叶子</em>,树的最末端),
          问网络的看法。老派搜索在这里靠随机乱下到终局
          ——随机下完的那盘,输赢纯靠瞎碰,说明不了哪手好;这里的做法:一撞见新局面就停,
          网络的估值直接当「终局替身」(替身=这盘没下完,先拿网络的打分顶上)。
          一次模拟最多问网络一次,40 次模拟笔记本扛得住。
        </p>
        <p>
          <strong>② 岔口公式(行话叫 PUCT):每条边一本账。</strong>每条边记两个数:<em>N</em>
          (被看过几次)和 <em>W</em>(历次得分总和),商 W/N 记作 <em>Q</em>
          (历史平均)。岔口怎么挑?一行公式两头都照顾:
        </p>
        <div className="formula">
          score(a) = <span className="hl">Q(a)</span>(历史平均,裁判)+
          c · P(a) · √ΣN / (1 + N(a))(没看过的加分,探索)
          (a 指某一条边、某一手:N(a) 就是这条边记的 N,每条边各套一遍这个公式;
          ΣN=各条边看过的次数统统加起来;√ 根号只是让这个数长得慢一点,
          这里不用管怎么算)
        </div>
        <p>
          P 是<em>网络先验</em>——网络说这里值得先看(第 10 课那 81 个分数派上用场了)。
          先验是<em>向导</em>,只管先往哪看;Q 是<em>裁判</em>,管往哪走。
          公式里的 c 是探索强度的旋钮(本站取 1.5):c 越大,越爱试冷门的
          没看过的手;c 越小,越死磕眼下最赚的那条。
          没看过的手(N 小)探索分高,<em>总会轮到</em>;看得多的手探索分自然衰减,
          最后由 Q 说了算。两个都不偏:纯认 Q 是一棵树上吊死,纯均匀是撒胡椒面(每处撒一点,哪处都没看够)。
        </p>
        <p>
          <strong>③ 逐层取负(= 每爬一层,正负号翻一次):账要对得上视角。</strong>所有数值都站在
          「当前轮到谁下」的视角(第 2 课的铁约)。我的大优就是对面的劣势:
          黑白每换一手,符号翻一次。所以叶估值往回记的时候,<em>每爬一层翻一次符号</em>
          ——叶子说「我(行棋方)+1」,记到上一层的边上是 −1(对那边是劣),
          再翻回 +1……这样每条边的 Q 都站在「选这条边的那一方」的视角,账才不自相矛盾。
          真终局不用问网络:<em>终局直传</em>——赢 +1、输 −1、和 0,直接记账,
          这是搜索能拿到的最硬的信号。
        </p>
        <p>
          <strong>④ 访问数说了算。</strong>40 次推演跑完,哪手被反复看最多就下哪。
          为什么不直接挑 Q 最高?一个候选若只被撞见 1 次、碰巧拿了 +1,Q 也是满分,
          和被检验 20 次平均出来的 +1 长得一模一样——<em>Q 分不清底气,N 分得清</em>
          。访问数把先验的方向、Q 的可靠程度、检验的次数炖成一锅,是整个过程的总结算。
        </p>
      </div>

      <Simulator />

      <Ledger title="mcts.py L55(select)、L101-108(PUCT)、L144-148(backup)、L154-176(落子)">
        <div className="codewalk">
          <pre>{`# L55  一次模拟 = 沿 PUCT 降到叶(撞见终局则当场直传)
def select(self) -> None:`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L101-108  岔口公式:Q(裁判)+ U(探索);已占格永远选不到
Q = np.divide(W, N, out=np.zeros_like(W), where=N > 0)
U = self.cfg.c_puct * P * sqrt_total / (1.0 + N)
score = Q + U
score[legal == 0] = -np.inf
return int(np.argmax(score))`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L144-148  回传:每爬一层,符号翻一次
for node, a in reversed(path):
    v = -v  # value flips perspective each ply
    node.N[a] += 1.0
    node.W[a] += v`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L154-176  输出:访问数说了算(π = N/ΣN,训练时当网络的老师)
def root_pi(self, temperature=1.0):
    counts = self.root.N ...   # 访问数分布
def best_action(self):
    masked = np.where(legal > 0, self.root.N, -np.inf)
    return int(np.argmax(masked))`}</pre>
        </div>
        <p className="mt-3">
          上面这几段代码是给大人对账用的——看不懂可以直接跳过,不影响学。部件的三键{" "}
          <span className="mono">①选择 → ②展开 → ③回传</span> 走的正是
          <span className="mono">select → needsEval/leafInput → expandAndBackup</span>
          这同一套流程;本站引擎 <span className="mono">learn/src/engine/mcts.ts</span>{" "}
          和这份 Python 一行一行对得上(Ledger 行号可对账)。唯一的小差别:两边把
          softmax(把分数变成概率那一步)放在先后不同的位置做——算法一字不差。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 12 课"
        onAllCorrect={() => pass("l11")}
        questions={[
          {
            q: "PUCT 里先验 P 和 Q 各是什么角色?",
            options: [
              "P 管落子,Q 只管展示——最终下哪看 P",
              "P 是向导(网络说先往哪看),Q 是裁判(几十次推演的历史平均,管往哪走)",
              "两个都是裁判,谁大听谁的",
            ],
            answer: 1,
            explain:
              "先验只负责「先看哪」,一次都没被看过的候选完全由 P 领路;但看过之后,账本(Q)越攒越厚,探索分衰减,最终谁被反复访问由 Q 和检验次数决定。全信 P 是被第一印象锁死,全信 Q 是一棵树上吊死。",
          },
          {
            q: "手算例:叶估值 −1(叶子行棋方要输),为什么记到根的边上变成了 +1?",
            options: [
              "记账时出了正负号错误,实现上一直没改",
              "黑白换手视角翻一次:叶子的「我输」正是根行棋方的「我赢」——每爬一层符号翻一次,账才站在每条边自己那一方的视角",
              "因为终局直传把 −1 换成了 +1",
            ],
            answer: 1,
            explain:
              "所有数值都站在「当前轮到谁」的视角:叶子轮到白,白输 −1;往上一层是黑的账,黑赢当然记 +1。回传每爬一层就把 v 的正负号翻一次(代码记作 v = −v——那个等号是「变成」的意思,不是「两边相等」),整条链每条边的 Q 才都站在「选这条边的那一方」视角,不自相矛盾。",
          },
          {
            q: "40 次推演跑完,为什么按访问数 N 落子,而不是挑 Q 最高的?",
            options: [
              "因为 N 计算起来更简单",
              "因为 Q 分不清底气:只被看过 1 次、碰巧 +1 的候选,和被检验 20 次平均出来的 +1 长得一模一样;N 把先验方向、Q 的可靠程度、检验次数炖成一锅",
              "因为 Q 有正有负,N 永远是正数",
            ],
            answer: 1,
            explain:
              "Q 是平均,平均分不清「一次的运气」和「二十次的底气」。访问数高的手,是被先验领来、又被 Q 留下的手——三种信息它都收到。训练时干脆拿 N/ΣN 当老师(π;意思是「这一手占全部次数的几分之几」——这个 π 不是圆周率,只是给这个比例起的名字)。第 12 课的飞轮(自己下棋→训练→再下,像轮子越转越快)就从这里起转。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 · 单步模拟器(真引擎 + 真权重叶评估) ============ */

type NetFn = (planes: number[][][]) => { logits: number[]; value: number }

interface LeafView {
  path: number[]
  leaf: GameState
}
interface NetAns extends LeafView {
  logits: number[] // 原样存着,③ 回传交给 expandAndBackup(softmax 在引擎内做)
  value: number
  top: { a: number; p: number }[]
  ms: number
}

function Simulator() {
  const [net, setNet] = useState<NetFn | null>(null)
  const [eps, setEps] = useState<0 | 0.25>(0) // 根噪声开关
  const [sims, setSims] = useState(0)
  const [stage, setStage] = useState<0 | 1 | 2>(0) // 0 可①;1 已选可②;2 已评估可③
  const [leaf, setLeaf] = useState<LeafView | null>(null)
  const [ans, setAns] = useState<NetAns | null>(null)
  const [termMsg, setTermMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ver, setVer] = useState(0)
  const treeRef = useRef<SearchTree | null>(null)
  // 切噪声开关时换种子:同一粒种子下噪声走向固定,换粒让读者多试几次
  const seedRef = useRef(42)

  // 真权重就位 / 噪声切换 → 重建树,一切归零(种子取自 seedRef,可复现)
  useEffect(() => {
    let alive = true
    loadWeights().then((w: WeightsJson) => {
      if (!alive) return
      setNet(() => loadNet(w))
    })
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (!net) return
    const cfg: MctsConfig = { cPuct: 1.5, dirichletEps: eps, dirichletAlpha: 0.3 }
    treeRef.current = new SearchTree(POS, cfg, net, mulberry32(seedRef.current))
    setSims(0)
    setStage(0)
    setLeaf(null)
    setAns(null)
    setTermMsg(null)
    setVer((v) => v + 1)
  }, [net, eps])

  const stepSelect = () => {
    const tree = treeRef.current
    if (!tree || stage !== 0) return
    tree.select()
    setTermMsg(null)
    if (tree.needsEval()) {
      const path = tree.pendingActions() ?? []
      const lf = tree.pendingState()
      if (lf) setLeaf({ path, leaf: lf })
      setStage(1)
    } else {
      // 终局:select 内部已按 ±1/0 直传记账
      setLeaf(null)
      setAns(null)
      setSims((s) => s + 1)
      setTermMsg("这次推演直接撞见终局:输赢已定,不用问网络——赢 +1 / 输 −1 / 和 0,直接记账(终局直传)。")
    }
    setVer((v) => v + 1)
  }

  const stepExpand = () => {
    const tree = treeRef.current
    if (!tree || stage !== 1 || !leaf) return
    const t0 = performance.now()
    const { logits, value } = net!(tree.leafInput()) // 问真网络(策略头+价值头)
    const ms = performance.now() - t0
    const legal = legalMoves(leaf.leaf)
    const probs = softmax(logits)
    let sum = 0
    const masked = probs.map((p, a) => p * legal[a])
    for (const p of masked) sum += p
    const top = masked
      .map((p, a) => ({ a, p: sum > 1e-9 ? p / sum : p }))
      .sort((x, y) => y.p - x.p)
      .slice(0, 3)
    setAns({ ...leaf, logits, value, top, ms })
    setStage(2)
  }

  const stepBackup = () => {
    const tree = treeRef.current
    if (!tree || stage !== 2 || !ans) return
    tree.expandAndBackup(ans.logits, ans.value)
    setAns(null)
    setLeaf(null)
    setStage(0)
    setSims((s) => s + 1)
    setVer((v) => v + 1)
  }

  const run = (k: number) => {
    const tree = treeRef.current
    if (!tree || stage !== 0 || busy) return
    const n = Math.min(k, MAX_SIMS - sims)
    if (n <= 0) return
    setBusy(true)
    setTermMsg(null)
    setTimeout(() => {
      tree.run(n) // 协议与三键单步同一份代码
      setSims((s) => s + n)
      setVer((v) => v + 1)
      setBusy(false)
    }, 30)
  }

  const tree = treeRef.current
  const shown = ans ?? leaf
  const rootN = tree ? Array.from(tree.root.N) : []
  const rootW = tree ? Array.from(tree.root.W) : []
  const rootPrior = tree?.root.prior ?? null
  const rootV = tree ? tree.rootValue() : 0
  let sumN = 0
  for (const n of rootN) sumN += n
  const topRows = rootN
    .map((n, a) => ({ a, n }))
    .filter((r) => r.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, 5)
  const f5n = rootN[F5] ?? 0
  const f5Share = sumN > 0 ? (f5n / sumN) * 100 : 0

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 单步模拟器:真引擎一步一步走</span>
        <span className="num text-sm" style={{ color: "var(--fg-faint)" }} data-qa="sim-count-wrap">
          已推演 <span data-qa="sim-count">{sims}</span> 次(40 次够下结论,最多 100 次)
        </span>
      </div>

      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        {/* 左:局面 + 步进控制 + 当前一步 */}
        <div className="min-w-0 flex-1 md:max-w-[23rem]">
          <div data-qa="pos-board">
            <Board board={POS_FLAT} marks={[{ x: 5, y: 4, anchor: true }]} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            教学手摆局面:黑 5 白 4 却轮黑。真实对局里,黑=白才轮黑;黑恰好多一,
            是黑刚落完、该白走——这盘不合规矩,搜索照样跑。
            红圈标的是 F5 = (5,4) = action 41:黑落这里,横排 (1,4)…(5,4) 成五,
            一手赢棋。
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!net || stage !== 0 || busy} onClick={stepSelect} data-qa="step-select">
              ① 选择
            </button>
            <button type="button" className="btn" disabled={stage !== 1} onClick={stepExpand} data-qa="step-expand">
              ② 展开
            </button>
            <button type="button" className="btn" disabled={stage !== 2} onClick={stepBackup} data-qa="step-backup">
              ③ 回传
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={!net || stage !== 0 || busy || sims + 10 > MAX_SIMS} onClick={() => run(10)} data-qa="run10">
              连跑 10 次
            </button>
            <button type="button" className="btn" disabled={!net || stage !== 0 || busy || sims >= 40} onClick={() => run(40 - sims)} data-qa="run40">
              跑到 40 次
            </button>
            <button
              type="button"
              className="btn"
              disabled={!net || busy}
              onClick={() => {
                const cfg: MctsConfig = { cPuct: 1.5, dirichletEps: eps, dirichletAlpha: 0.3 }
                seedRef.current += 1
                treeRef.current = new SearchTree(POS, cfg, net!, mulberry32(seedRef.current))
                setSims(0)
                setStage(0)
                setLeaf(null)
                setAns(null)
                setTermMsg(null)
                setVer((v) => v + 1)
              }}
              data-qa="reset"
            >
              ↺ 重置
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>
              根噪声:先验掺 25% 随机
            </span>
            <span className="seg" data-qa="noise-toggle">
              <button type="button" className={`seg-btn ${eps === 0 ? "active" : ""}`} disabled={busy} onClick={() => { seedRef.current += 1; setEps(0) }}>
                关
              </button>
              <button type="button" className={`seg-btn ${eps === 0.25 ? "active" : ""}`} disabled={busy} onClick={() => { seedRef.current += 1; setEps(0.25) }}>
                开
              </button>
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            做个对照实验,看「偏见锁死」:关噪声时,搜索全信网络先验,只在它偏爱的
            几个点打转——偏见喂偏见。开了噪声,根的先验里掺 25% 随机(这招行话叫
            Dirichlet 噪声,掺多少记作 ε=0.25——ε 是个希腊字母,读「艾普西隆」,
            只是「掺多少」的记号;只掺根,整棵树都乱抖就没章法了)。
            对照着看账本的 <strong>P 列</strong>(先验):关噪声时 F5 永远是 1.3%
            ——同一网络同一局面,先验是死的;开了噪声,每次搜索的先验都不一样
            (F5 在 1.0%~1.6% 间波动,别的点同理有涨有落)。这就是「多样性」的本义:
            不是单方向抬高冷门点,而是让每局走不同的路。但 <strong>N 列</strong>(访问)
            未必跟着摊——这局 Q 的历史账太强势,40 次「想」的名额仍会集中。噪声防的是
            另一个坑:自我对弈几千盘,每盘都走同一条路,等于反复学同一招;噪声让每盘
            换条路走。一切换开关就整盘重来:换一粒新种子(种子=随机路线的起头),
            路线跟着换,可多试几次。
          </p>

          {busy && (
            <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
              推演中(每次模拟问一次网络,约 16 毫秒——1 毫秒是千分之一秒)……
            </p>
          )}
          {stage === 0 && !busy && sims === 0 && (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              按「① 选择」:模拟器从根按岔口公式(PUCT)挑一条路走到叶子;
              「② 展开」问真网络要先验和估值;「③ 回传」记账、树长大一节。
              三键连着按完一轮,才是揭晓里说的「一次模拟」。
            </p>
          )}

          {shown && (
            <div className="reveal-box mt-3" data-qa="leaf-box">
              <div className="mini-label">
                本次推演{stage === 1 ? "· 已选到叶,待问网络" : "· 网络已答,待记账"}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                路线:根{shown.path.length === 0 ? "(根自身)" : shown.path.map(coord).join(" → ")}
                ,停在没见过的局面(轮到{shown.leaf.current === 1 ? "黑" : "白"}):
              </p>
              <div className="mt-2 flex items-start gap-3">
                <div className="w-28 flex-none">
                  <Board board={shown.leaf.board.flat()} />
                </div>
                {ans ? (
                  <div className="min-w-0 flex-1 text-xs" style={{ color: "var(--fg-muted)" }}>
                    <p className="num" style={{ color: "var(--accent-deep)" }}>
                      v = {ans.value >= 0 ? "+" : ""}{ans.value.toFixed(3)}
                      <span className="ml-2 font-normal" style={{ color: "var(--fg-faint)" }}>
                        ({ans.leaf.current === 1 ? "黑" : "白"}方视角,{ans.ms.toFixed(1)} 毫秒)
                      </span>
                    </p>
                    <p className="mt-1.5">先验 top3(这局面的向导):</p>
                    <ol className="mt-1 space-y-1">
                      {ans.top.map((t) => (
                        <li key={t.a} className="l00-top-row" data-qa="prior-row">
                          <span className="mono">{coord(t.a)}</span>
                          <span className="prob-track">
                            <span className="prob-fill" style={{ width: `${Math.min(100, t.p * 600)}%` }} />
                          </span>
                          <span className="num">{(t.p * 100).toFixed(1)}%</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1.5" style={{ color: "var(--fg-faint)" }}>
                      回传时每爬一层翻一次符号,记进沿途每条边。
                    </p>
                  </div>
                ) : (
                  <p className="flex-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                    网络还没看这个局面——按「② 展开」。
                  </p>
                )}
              </div>
            </div>
          )}
          {termMsg && (
            <div className="reveal-box mt-3 text-sm leading-relaxed" data-qa="term-msg">
              {termMsg}
            </div>
          )}
        </div>

        {/* 右:树图 + 根账本 */}
        <div className="min-w-0 flex-1">
          <div className="mini-label">搜索树(节点=局面,边=落子;边上 N/W/Q)</div>
          <div className="mt-2 overflow-x-auto" data-qa="tree-wrap">
            {!net || !tree ? (
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                正在加载真权重(weights-best.json,约 1.2 MB)……
              </p>
            ) : (
              <TreeView root={tree.root} ver={ver} path={shown?.path ?? []} />
            )}
          </div>

          <div className="mt-5 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <div className="mini-label">
              根账本 · top 候选(最右一列 = 访问占比,即 N/ΣN)
              {tree && sims > 0 && (
                <span className="num ml-2" style={{ color: "var(--fg-faint)" }}>
                  ΣN={sumN}(首次推演只展开根,不记边)v̄={rootV >= 0 ? "+" : ""}
                  {rootV.toFixed(2)}(v̄=历次 v 的平均,黑方视角)
                </span>
              )}
            </div>
            {sims === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                还没有账。第一次推演只把根展开(问一次网络,拿到 81 个先验);
                从第二次起,每条边开始记 N 和 W。
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {topRows.map((r) => (
                  <RootRow key={r.a} a={r.a} n={r.n} q={rootW[r.a] / r.n} share={r.n / sumN} prior={rootPrior?.[r.a] ?? 0} />
                ))}
                {f5n === 0 && <RootRow a={F5} n={0} q={0} share={0} prior={rootPrior?.[F5] ?? 0} f5 />}
              </div>
            )}
          </div>

          {sims >= 40 && (
            <div className="reveal-box mt-4 text-sm leading-relaxed" data-qa="f5-box">
              <div className="mini-label">真网络实测:40 次为什么还没轮到 F5</div>
              <p className="mt-1.5">
                40 次推演后,F5((5,4),一手成五)的访问占比:{" "}
                <span className="num font-bold" style={{ color: "var(--accent-deep)" }} data-qa="f5-share">
                  {f5Share.toFixed(1)}%
                </span>
                <span className="num" style={{ color: "var(--fg-muted)" }}>
                  (N={f5n}/ΣN={sumN})
                </span>
              </p>
              <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
                老实交代:这里站着的是真网络——它才训到第 3 轮,F5 在它的先验里
                只有 1.2%,排它前面的还有 56 个点(最高的点才 2.1%),40 次
                「想」的名额全被网络偏爱的点借走,一次也没轮到 F5。实测把次数拉到
                770 次(先验原样、种子固定),「没看过的加分」才第一次把它送进来
                ——进来之后终局直传,Q 立刻 +1。
                <strong>搜索放大直觉:直觉强,越想才越准;直觉弱,给的次数再多也追不回</strong>
                ——这笔债,第 12 课的飞轮来还(飞轮=自己下棋→训练→再下,
                像轮子越转越快,下课细讲)。
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 11-1</span>
        这段图注给大人对账,看不懂直接跳过。真引擎 <span className="mono">SearchTree</span>(mcts.ts)三键走的是 select →
        leafInput/evalFn → expandAndBackup 这套真流程;叶评估器是{" "}
        <span className="mono">loadNet</span>(真权重,weights-best.json)——
        这是对最早那版演示页(explainer)的升级:那边打分的还是人手写规则的
        简易替身,不是真网络(那版讲稿里,50 次就能把 93.9% 的次数收到 F5 上)。
        随机数用固定序列(mulberry32,初始种子 42,重置
        一次换下一粒),同一局面重放同一步,结果一致。
      </figcaption>
    </figure>
  )
}

function RootRow({
  a,
  n,
  q,
  share,
  prior,
  f5 = false,
}: {
  a: number
  n: number
  q: number
  share: number
  prior: number
  f5?: boolean
}) {
  return (
    <div className={`l00-top-row${f5 ? " opacity-70" : ""}`} data-qa={f5 ? "f5-row" : "root-row"}>
      <span className="mono text-sm" style={{ minWidth: "3.4rem" }}>
        {coord(a)}
        {f5 && <span className="ml-1 text-[0.62rem]">(F5)</span>}
      </span>
      <span className="num text-xs" style={{ color: "var(--fg-faint)", minWidth: "3.2rem" }}>
        P {(prior * 100).toFixed(1)}%
      </span>
      <span className="num text-xs" style={{ color: "var(--fg-faint)", minWidth: "2.6rem" }}>
        N {n}
      </span>
      <span className="num text-xs" style={{ color: "var(--fg-faint)", minWidth: "3.4rem" }}>
        Q {n > 0 ? (q >= 0 ? "+" : "") + q.toFixed(2) : "—"}
      </span>
      <span className="prob-track">
        <span className="prob-fill" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="num w-10 flex-none text-right text-xs" style={{ color: "var(--accent-deep)" }}>
        {(share * 100).toFixed(1)}%
      </span>
    </div>
  )
}

/* ============ 树图:DFS 布局,节点 ≤ 推演数 + 1 ============ */

interface LNode {
  node: MctsNode
  action: number | null // 从父节点过来的落子
  parent: LNode | null
  depth: number
  children: LNode[]
  x: number
}

const XGAP = 66
const YGAP = 84
const PADX = 58
const PADY = 34

function TreeView({ root, path }: { root: MctsNode; ver: number; path: number[] }) {
  // 布局:叶子按 DFS 序排 x,父亲居子女中点(ver 仅为触发重渲染)
  const all: LNode[] = []
  let leafX = 0
  const walk = (node: MctsNode, action: number | null, parent: LNode | null, depth: number): LNode => {
    const t: LNode = { node, action, parent, depth, children: [], x: 0 }
    all.push(t)
    for (const a of Array.from(node.children.keys()).sort((p, q) => p - q))
      t.children.push(walk(node.children.get(a)!, a, t, depth + 1))
    t.x = t.children.length ? (t.children[0].x + t.children[t.children.length - 1].x) / 2 : leafX++
    return t
  }
  walk(root, null, null, 0)

  // 当前推演路径上的边(parent→child)集合
  const onPath = new Set<LNode>()
  let cur = all[0]
  for (const a of path) {
    const next = cur.children.find((c) => c.action === a)
    if (!next) break
    onPath.add(next)
    cur = next
  }

  const width = Math.max(1, leafX) * XGAP + PADX * 2
  const height = (Math.max(...all.map((n) => n.depth)) + 1) * YGAP + PADY * 2
  const cx = (t: LNode) => PADX + t.x * XGAP
  const cy = (t: LNode) => PADY + t.depth * YGAP

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block", minWidth: 320 }}
      role="img" aria-label="蒙特卡洛搜索树">
      {all
        .filter((t) => t.parent)
        .map((t) => {
          const p = t.parent!
          const a = t.action!
          const N = p.node.N[a]
          const W = p.node.W[a]
          const on = onPath.has(t)
          return (
            <g key={`e${t.depth}-${t.action}`}>
              <line
                x1={cx(p)} y1={cy(p)} x2={cx(t)} y2={cy(t)}
                style={{ stroke: on ? "var(--accent)" : "var(--hairline-strong)" }}
                strokeWidth={on ? 2.6 : 1.4}
              />
              <text
                x={(cx(p) + cx(t)) / 2 + 4} y={(cy(p) + cy(t)) / 2 - 2}
                fontSize={9.5} fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: on ? "var(--accent-deep)" : "var(--fg-faint)" }}>
                {coord(a)} N={N}
              </text>
              <text
                x={(cx(p) + cx(t)) / 2 + 4} y={(cy(p) + cy(t)) / 2 + 9}
                fontSize={9} fontFamily="ui-monospace, SF Mono, Menlo, monospace"
                style={{ fill: "var(--fg-faint)" }}>
                W={W >= 0 ? "+" : ""}{W.toFixed(1)} Q={N > 0 ? (W / N >= 0 ? "+" : "") + (W / N).toFixed(2) : "—"}
              </text>
            </g>
          )
        })}
      {all.map((t, i) => {
        const expanded = t.node.expanded
        return (
          <g key={`n${i}`} data-qa="tree-node">
            {t.depth === 0 ? (
              <>
                <circle cx={cx(t)} cy={cy(t)} r={13} style={{ fill: "var(--board)" }} />
                <text x={cx(t)} y={cy(t)} fontSize={11} textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: "var(--board-line)" }} fontWeight={700}>
                  根
                </text>
              </>
            ) : (
              <circle
                cx={cx(t)} cy={cy(t)} r={expanded ? 8.5 : 6}
                style={{
                  fill: expanded ? "var(--board-line)" : "var(--paper)",
                  stroke: "var(--board-line)",
                  strokeWidth: 1.6,
                }}
              />
            )}
            {onPath.has(t) && (
              <circle cx={cx(t)} cy={cy(t)} r={t.depth === 0 ? 17 : 13}
                fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2.4} />
            )}
          </g>
        )
      })}
    </svg>
  )
}
