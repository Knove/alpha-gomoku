/** 第 9 课 · 双头：一次前向两个答案。
 *  节拍：思考题（两个问题两个网络？）→ 正文（共用主干 / 两种读法 / softmax+tanh）→
 *  例 9-1（自由摆子真前向：问网络 → 81 分数热力图 + top5 + 价值估计条，
 *  对照开关换 weights-untrained 未训练网：baseline，训练前冻结的随机初始化）
 *  → 对证（model.py 双头 + forward）→ 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { encode, legalMoves, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { softmax } from "../engine/nn"
import { loadWeights, loadWeightsUntrained } from "../lib/weights"

/* 初始局面沿用第 6/7 课的三连(己方 (2,4)(3,4)(4,4)，轮黑)，换你随手摆。 */
const INIT: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const x of [2, 3, 4]) b[4 * 9 + x] = 1
  return b
})()

interface AskResult {
  probs: number[] // 空格上重新归一的 81 概率
  top: { a: number; p: number }[] // top5
  vNet: number // 网络直接前向的价值头输出，当前行棋方视角
  ms: number
}

/** 一次真前向：encode → loadNet 的函数（与本站引擎同一形状）。 */
function askNet(
  net: (input: number[][][]) => { logits: number[]; value: number },
  st: GameState,
): AskResult {
  const t0 = performance.now()
  const { logits, value } = net(encode(st))
  const ms = performance.now() - t0
  const legal = legalMoves(st)
  const raw = softmax(logits)
  let sum = 0
  const probs = raw.map((p, a) => p * legal[a])
  for (const p of probs) sum += p
  if (sum > 1e-9) for (let a = 0; a < 81; a++) probs[a] /= sum
  const top = probs
    .map((p, a) => ({ a, p }))
    .filter((t) => t.p > 0)
    .sort((x, y) => y.p - x.p)
    .slice(0, 5)
  return { probs, top, vNet: value, ms }
}

export default function L10() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 9 课</div>
      <h1 className="text-2xl font-bold">双头：一次前向两个答案</h1>

      <LessonGuide
        question="同一局棋既要回答「哪里该下」，又要回答「谁更占优」，为什么不用两台完全分开的机器？"
        why="2 个问题虽然答案形状不同，却都依赖同一批棋形和全盘形势。先共享理解，再分别读出答案，能少学重复的内容。"
        chain={[
          "主干（前几课那 7 层卷积）把棋盘变成许多张特征图，装着棋形与整盘形势",
          "策略头保留每个格子的差别，给 81 个落点打分",
          "价值头把整盘信息汇成一个价值估计",
          "搜索把「落点建议 + 形势估计」组合成实际走法",
        ]}
        takeaway="「2 个头」不是两份网络：它们共用一份棋盘理解，只是在最后按不同问题读出 81 个分数和 1 个判断。"
        boundary="本课会完整算一次 softmax，并看 tanh 怎样把价值限制在 −1 到 +1。这里的 v_net 是网络直接输出；下一课搜索汇总出的 root_value 是另一个数，不能混称为 v。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "网络看完棋盘，要回答 2 个问题：81 格哪里该下（逐点的分数），和整盘谁优（1 个数）。怎么安排这套问答？",
            options: [
              "2 个网络：一个专门学「下哪」，一个专门学「谁优」",
              "1 个主干带 2 个头：主干看棋，末端分岔，一个头逐点读，一个头整盘读",
              "1 个网络答两次：先把 81 个分数算完，再用同一套权重算一遍价值估计",
            ],
            answer: 1,
            explain:
              "选第二项。第一项等于把认棋形学两遍：判断「这里该下」和「这局我优」，看的是同一批棋形，理解只该学一次。第三项也不行：81 个分数和 1 个数，读出的方式不同，得各配各的读出层（头）；主干仍共享同一份理解。所以第一项错在拆成两份理解，第三项错在不肯配两种读法。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一份棋盘理解，按 2 种问题读出答案</h3>
        <p>
          把输入从第一层往末层算一遍、直接得到输出，这样的计算叫一次前向。网络看完棋盘要同时回答「哪里该下」和「谁更占优」：
          这 2 个问题读的是同一局棋里的棋形与形势。若完全分开做成两套网络，
          就可能重复学习「怎样认棋形」。共用主干让同一份棋盘理解同时服务 2 个训练目标，
          通常更省权重，2 个任务的训练信号也都更新同一主干。这是一种常见设计取舍，
          不保证 2 个任务永远互相帮助：两目标打架时，两路梯度在主干上互相抵消，损失会难降；本项目两笔损失等权 1:1，没有再调这个比例。
        </p>
        <Def term="前向" en="forward pass">
          与训练时回头改权重的那条路是两件事：下棋只走前向，训练才在前向之后接上误差与梯度。
        </Def>
        <Def term="双头" en="dual-head">
          一份主干加 2 个末端读法层的结构。主干（第 8 课那 7 层卷积）把棋盘变成
          48 张 9×9 的特征图，装着棋形与整盘形势；2 个头各自把这份理解读成自己的答案。
          代码里「一份理解」就是一个变量 <span className="mono">h</span>，2 个头都从它出发。
        </Def>
        <p>
          主干吐出 48 张 9×9 的特征图之后，末端分成 2 条读法，一条逐点、一条整盘。
          策略头先用 1×1 卷积把 48 通道压到 2 通道。2 是沿用的工程惯例，不是算出来的；
          关键是 1×1 不看旁边的格子，只在每个交叉点上把 48 个数各乘各的权重再相加，
          这正是第 4 课那套加权求和。1×1 阶段逐点进行、互不合并；最后由一层全连接把整图 162 个数读成 81 个动作分（代码 p_fc：Linear(162, 81)）。这层不再共享权重，是有意的位置相关读出：81 个动作各配一套读出权重，天元和角上允许各读各的。共享适合「同一种局部形状」，而「这个位置该下多少」天然与位置有关，所以读出层不共享。
          价值头压到 1 通道后要把 81 个数收成 1 个数，81→1 的线性读出本身合法，加一层非线性是为了提升容量（64 是代码里写定的数），
          中间先过一层含 64 个隐藏单元的隐藏层，再收成 1。
          逐点的归逐点，整盘的归整盘。
        </p>
        <Def term="策略头" en="policy head">
          双头中逐点读出「哪里该下」的那一头。它保留每个格子的差别，最后给出 81 个落点分数，
          与第 1 课的 81 个动作一一对应。
        </Def>
        <Def term="价值头" en="value head">
          双头中整盘读出「谁更占优」的那一头。它把整盘信息汇成一个价值估计（value estimate），
          输出只是一个数，记作 <span className="mono">v_net</span>。
        </Def>
        <Def term="隐藏层" en="hidden layer">
          介于输入与输出之间的那些层的统称，卷积层也是隐藏层（第 7 课）；二者读输入的方式不同，权重是否共享也不同（卷积共享，全连接不共享）。
          价值头这里的隐藏层是全连接层（fully-connected layer）：每个输出都读全部输入。它含 64 个隐藏单元，
          把 81 个数先收拢到 64，再收成 1（64 是代码里写定的数），给「逐点变成整盘」的落差修了一个中间站。
        </Def>

        <h3>分数读成概率，价值估计压进同一把标尺</h3>
        <p>
          策略头先给 81 个格子的 logits（未归一化的原始分数），再用 softmax 把它们改成总和为 1 的概率。
          softmax 后的这批数称概率 p（小写；进搜索遮格归一后才叫先验 P，第 10 课）。
          不能直接除以总和：分数有正有负，分母可能是 0 或负数；就算分母是正的，负分数除下来还是负数，当不成概率。
          选 e 的幂而不是别的正数化办法，第一关是保序（分数越大，概率一定越大）：绝对值和平方在负半轴都不保序，|−3| 会排到 1 前面去，所以不行。e 的幂严格单调、恒正，顺带把差距拉开，还与 ln 配成好算的梯度。整个做法是：
          先从每个分数减去最大分 <span className="mono">m</span>（softmax 只看分数之差，整体平移不变：e 的 (l−m) 次方之比与 e 的 l 次方之比相同，e 的 −m 次方上下约掉，概率一个也不变，顺带还能防止指数变成装不下的大数），
          再取 e 的指数，最后除以这些指数的和，得到总和为 1 的概率：
          <span className="mono">pᵢ=e^(lᵢ−m)/Σe^(lⱼ−m)</span>（e 是固定常数，约 2.718）。
          原始分数越高，概率一定越大；所有格子的概率加起来恰好是 1。下面用 3 个分数算一次：
        </p>
        <div className="formula">
          分数 <span className="hl">2</span> / 1 / 0 → e^l：7.39 / 2.72 / 1.00
          （和 11.11）→ 除以和 <span className="hl">0.67</span> / 0.24 / 0.09，加起来正好 1
        </div>
        <Def term="softmax" en="softmax">
          把一组原始分数变成总和为 1 的概率 p 的具体做法：每个分数先减去最大分
          <span className="mono">m</span>，再取 e 的指数，最后除以这些指数的和。
          减 <span className="mono">m</span> 不改变彼此大小关系，却能防止指数溢出。
          上面 3 个分数按此法算得 0.67 / 0.24 / 0.09；若先减 m=2，则算 e⁰/e⁻¹/e⁻²，
          归一化后概率一模一样。例 9-1 的 top5 百分比是它的下一步变体：先把已占格丢掉、
          再在空格里重新归一化到 100%，所以展示值不是裸 softmax 输出的 p 本身。训练侧不遮格：网络照样对 81 格出 p，目标 π 在非法格是 0，交叉熵会把这些格的 p 往 0 压。
        </Def>
        <Def term="归一化" en="normalization">
          把一批数改成总和为 1 的概率，同时保持彼此大小关系的收尾动作。
          softmax 是策略头采用的那一种归一化。softmax 不改棋理，只把这批数从原始分数角色换成概率角色。
        </Def>
        <p>
          价值头的一个数不走 softmax，而要过 tanh，压进 −1 到 +1，
          和训练标签使用同一把标尺，才能计算误差
          <span className="mono">(v_net−z)²</span>。<span className="mono">z</span>
          就是那局棋最后的真实结果：赢 +1、输 −1、和 0。这个直接前向输出记作价值估计
          <span className="mono">v_net</span>：它没有按真实战绩核对过准头，
          所以不能直接读成赢的概率。视角也要分开说：<span className="mono">v_net</span>
          站在当前行棋方立场；编码不翻转坐标，策略头的分数仍对应原棋盘上的 81 个坐标。
        </p>
        <Def term="tanh" en="hyperbolic tangent,双曲正切">
          把任意实数平滑压进 −1 到 +1 的函数：输入越正越靠近 +1，输入越负越靠近 −1，0 停在中间。
          价值头用它收尾，使输出与终局标签共用一把标尺。它不做归一化，压的也不是概率。
        </Def>
        <Def term="校准" en="calibration">
          预测值与真实频率的一致性。例如把一批预测「赢的概率 0.7」的局面收集起来，若其中约七成真的赢了，
          这批概率预测才算校准过。<span className="mono">v_net</span> 只是价值估计，没有按真实战绩核对过准头，
          因此 <span className="mono">(v_net+1)/2</span> 也不能当作「赢的概率」：就算完全校准，(v_net+1)/2 = P(胜) + ½P(和)，除非无和棋才等于赢的概率。换算分两步：v_net = P(胜) − P(负)，所以 (v_net+1)/2 = (P(胜) − P(负) + 1)/2；再用 P(胜) + P(和) + P(负) = 1 代入消掉 P(负)，即得 P(胜) + ½P(和)。
        </Def>
      </div>

      <AskBoard />

      <Ledger title="model.py AlphaGomokuNet.forward / Predictor.predict">
        <div className="codewalk">
          <pre>{`# L39-46  末端分岔：两个小头，各接各的读法
self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)  # 策略头：1×1 压到 2 通道
self.p_bn   = nn.BatchNorm2d(2)
self.p_fc   = nn.Linear(2 * self.n * self.n, self.n * self.n)   # 展平 162 → 读成 81 个分数
self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)  # 价值头：1×1 压到 1 通道
self.v_bn   = nn.BatchNorm2d(1)
self.v_fc1  = nn.Linear(self.n * self.n, 64)         # 81 → 64(落差大，先过一层隐藏层)
self.v_fc2  = nn.Linear(64, 1)                      # 64 → 1`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L48-55  forward:一次前向，两个答案
def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    h = self.blocks(self.stem(x))              # 主干：一份理解
    p = F.relu(self.p_bn(self.p_conv(h)))      # 策略头起点：压到 2 通道再过 BN、ReLU
    p = self.p_fc(p.reshape(-1, 2 * self.n * self.n))   # 展平 162 → 读成 81 个 logits
    v = F.relu(self.v_bn(self.v_conv(h)))      # 价值头读同一个 h
    v = F.relu(self.v_fc1(v.reshape(-1, self.n * self.n)))
    v = torch.tanh(self.v_fc2(v)).squeeze(-1)  # → 1 个数，压进 −1..+1
    return p, v`}</pre>
        </div>
        <p className="mt-3">
          有两处能和正文对上。第一，2 个头读的是同一个
          <span className="mono">h</span>，「一份理解」在代码里就是这一个变量。
          第二，forward 里找不到 softmax：归一化这件事训练时和下棋时各做各的。
          训练用 <span className="mono">log_softmax</span>（带对数的同一步归一化）
          <span className="def-see">参见：第 13 课</span>，下棋用
          <span className="mono">softmax</span>，网络只输出裸 logits。
          本站 <span className="mono">model.ts loadNet</span> 复现这条 forward 路径，
          <span className="mono">tests/parity.test.ts</span> 用 16 份输入逐项对比 6 处中间结果。
          浏览器权重保留 5 位小数并用 Float64 计算，与 torch 对比时允许末位误差；
          它证明两边算的是同一套东西，不是说每个小数位都和完整精度的 torch 一模一样。
          例 9-1 里每次「问网络」都由这份浏览器复现当场计算。
          Python 的 <span className="mono">Predictor.predict</span>（预测器：装好网络、只做前向的封装，参见：第 18 课）在 forward 后做 softmax；
          本例也在拿到 logits 后做同一步归一化。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "双头不是两份网络：主干把棋盘读成一份理解，策略头逐点读出 81 个分数，价值头整盘读出 1 个判断。",
          "softmax 把原始分数改成总和为 1 的概率 p（先减最大分再取 e 的指数）；tanh 把价值压进 −1 到 +1，与 z 共用一把标尺。",
          "价值估计 v_net 是网络直接前向的输出，视角是当前行棋方；它没有按真实战绩核对过准头，不能直接当赢的概率。",
        ]}
        next={
          <>
            网络给出的只是第一眼判断。下一课让搜索真的沿棋路走到后面的局面，
            再把结果正确带回树根：一次模拟分几步、每步按什么顺序做、
            访问次数与平均成绩怎样记在边上，以及搜索汇总出的 root_value 为什么和 v_net 不是一回事。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 10 课"
        onAllCorrect={() => pass("l09")}
        questions={[
          {
            q: "为什么「下哪」和「谁优」共用 1 个主干，而不训练 2 个网络？",
            options: [
              "共用省内存，2 个网络存不下",
              "2 个问题都依赖棋形和形势：共享主干可避免把「认棋形」学两遍，并让 2 个训练目标共同给主干提供信号",
              "因为只买得起一份棋谱数据",
            ],
            answer: 1,
            explain:
              "主因是「一份理解」：判断该下哪和判断谁占优都依赖同一批棋形与形势。分开学可能重复做「认棋形」这件事；合在一起，2 个训练目标都能更新同一个主干。省权重、省计算是顺带收益，2 个目标是否总能互相帮助仍取决于训练。",
          },
          {
            q: "策略头和价值头的读法差在哪？",
            options: [
              "策略头整盘读成 1 个数，价值头逐点读成 81 个分数",
              "策略头逐点读：压到 2 通道后读成 81 个分数；价值头整盘读：压到 1 通道，经含 64 个隐藏单元的隐藏层收成 1 个数",
              "没有差别，只是输出的名字不同",
            ],
            answer: 1,
            explain:
              "逐点的归逐点、整盘的归整盘：策略头把棋盘一格一格的细节全保住（每格 1 个分数，第 1 课的 81 个动作一一对应）；价值头要把整盘收成 1 个价值估计，81→64→1 的隐藏层（全连接层）就是给这个落差修的中间站。",
          },
          {
            q: "价值头的输出为什么要过 tanh？",
            options: [
              "为了让它看起来更像概率，加起来等于 1",
              "为了压进 −1 到 +1：和训练目标（赢 +1 / 输 −1 / 和 0）同一把标尺，误差才可比，训练早期也不会飙出天文数字",
              "为了让计算更快",
            ],
            answer: 1,
            explain:
              "tanh 不做归一化（那是策略头 softmax 的活），它管的是标尺：把任意数压进 −1 到 +1（不用硬截断 clip，是因为截断区梯度为 0，错到界外就再也学不回来；tanh 光滑可导，错得离谱时仍给得出梯度；它自己也有饱和区，输入极大极小时梯度同样趋近 0），使其能与训练标签比较，计算 (v_net−z)²。它表示价值估计，不是直接的赢的概率；有和棋、或未校准等情况时，不能把 (v_net+1)/2 当作「赢的概率」。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 9-1 · 自由摆子，问真网络 ============ */

function AskBoard() {
  const [stones, setStones] = useState<number[]>(INIT)
  const [cur, setCur] = useState<1 | -1>(1) // 下一手摆的颜色（也决定网络替谁看）
  const [cmp, setCmp] = useState(false)
  const [wBest, setWBest] = useState<WeightsJson | null>(null)
  const [wUntrained, setWUntrained] = useState<WeightsJson | null>(null)
  const [res, setRes] = useState<{ best: AskResult; untrained: AskResult | null } | null>(null)

  useEffect(() => {
    let alive = true
    loadWeights().then((w) => alive && setWBest(w))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (!cmp || wUntrained) return
    let alive = true
    loadWeightsUntrained().then((w) => alive && setWUntrained(w))
    return () => {
      alive = false
    }
  }, [cmp, wUntrained])

  const netBest = useMemo(() => (wBest ? loadNet(wBest) : null), [wBest])
  const netUntrained = useMemo(() => (wUntrained ? loadNet(wUntrained) : null), [wUntrained])

  const state = useMemo<GameState>(() => {
    const board = Array.from({ length: 9 }, (_, y) => stones.slice(y * 9, y * 9 + 9))
    let n = 0
    for (const v of stones) if (v !== 0) n++
    return { board, current: cur, winner: 0, moveCount: n, lastMove: null }
  }, [stones, cur])

  const place = (x: number, y: number) => {
    setRes(null) // 棋盘一变，旧答案作废：数字永远对得上眼前的局面
    setStones((s) => {
      const next = s.slice()
      next[y * 9 + x] = cur
      return next
    })
  }

  const ask = () => {
    if (!netBest) return
    setRes({
      best: askNet(netBest, state),
      untrained: cmp && netUntrained ? askNet(netUntrained, state) : null,
    })
  }

  const vb = res ? res.best.vNet * cur : 0 // 价值估计条按黑方视角换算

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 9-1 · 亲手摆局面，问真网络</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          <input
            type="checkbox"
            checked={cmp}
            onChange={(e) => {
              setCmp(e.target.checked)
              setRes(null)
            }}
            data-qa="cmp-toggle"
          />
          对照未训练网络（baseline）
        </label>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          <div data-qa="board-main">
            <Board board={stones} onCellClick={place} heat={res?.best.probs} ghostPlayer={cur} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="seg">
              <button type="button" className={`seg-btn ${cur === 1 ? "active" : ""}`} onClick={() => { setCur(1); setRes(null) }}>
                摆黑
              </button>
              <button type="button" className={`seg-btn ${cur === -1 ? "active" : ""}`} onClick={() => { setCur(-1); setRes(null) }}>
                摆白
              </button>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStones(new Array<number>(81).fill(0))
                setRes(null)
              }}
            >
              清空
            </button>
            <button type="button" className="btn primary" disabled={!netBest} onClick={ask} data-qa="ask-btn">
              {netBest ? "问网络 →" : "正在加载真权重……"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            红色热度 = 策略头的概率 p（只在空格里重新归一化到 100%，已占格不参与）。
            序章回放的红色热度是另一样东西：那是搜索访问分布 π。两处都用红色热度呈现，
            本页这块来自网络第一眼，序章那块来自搜索推演。
            这张图是 p 在空格上的展示归一，不是网络输出的 p 本身。
            摆子颜色决定轮到该色行棋；网络替这一方看棋盘、报价值估计。
          </p>
          <p className="misconception mt-3 text-xs leading-relaxed">
            <span className="m-title">使用边界</span>
            这里允许你任意摆黑白子，目的是观察一次真实前向计算。若摆出了不合规则的局面
            （例如双方数量不符合轮流落子），数值仍是网络对这份输入的输出，<strong>不应当解释成
            合法对局中的落子建议或棋力证据</strong>。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          {!res ? (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              初始是第 7 课的三连局面。你可以随手摆子来观察输入怎样改变输出；若想把结果
              当作棋局建议，请自己保持黑白轮流与合法落子。按「问网络」会进行一次真前向计算，
              2 个头同时给出输出。
            </p>
          ) : (
            <>
              <div className="mini-label">策略头 · 下哪：top5（坐标 (x,y)，概率）</div>
              <ol className="mt-2 space-y-1.5">
                {res.best.top.map((t) => (
                  <li key={t.a} className="l00-top-row" data-qa="top-row">
                    <span className="mono text-sm">({t.a % 9},{Math.floor(t.a / 9)})</span>
                    <span className="prob-track">
                      <span className="prob-fill" style={{ width: `${t.p * 100}%` }} />
                    </span>
                    <span
                      className="num w-12 flex-none text-right text-sm"
                      style={{ color: "var(--accent-deep)" }}
                    >
                      {(t.p * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="mini-label">价值头 · 谁优</div>
                <p className="num mt-1.5 text-2xl font-bold" data-qa="v-best" style={{ color: "var(--accent-deep)" }}>
                  v_net = {res.best.vNet >= 0 ? "+" : "−"}{Math.abs(res.best.vNet).toFixed(2)}
                  <span className="ml-2 text-sm font-normal" style={{ color: "var(--fg-faint)" }}>
                    一次前向 {res.best.ms.toFixed(1)} 毫秒
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  v_net 站在{cur === 1 ? "黑" : "白"}方视角，轮到谁就替谁看。条上已换算到黑方视角。
                </p>
                <div className="l00-vbar mt-2">
                  <i className="l00-vbar-zero" />
                  <i className="l00-vbar-needle" style={{ left: `${((vb + 1) / 2) * 100}%` }} />
                </div>
                <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
                  <span>−1 白优</span>
                  <span>0</span>
                  <span>+1 黑优</span>
                </div>
              </div>
            </>
          )}

          {cmp && (
            <div className="mt-5 border-t pt-3" style={{ borderColor: "var(--hairline)" }} data-qa="cmp-panel">
              <div className="mini-label">对照组 · 未训练 baseline</div>
              {!res?.untrained ? (
                <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                  baseline（第 15 课立名）是训练开始前冻住的随机数权重。{wUntrained ? "按「问网络」，2 个网络同题同考。" : "正在加载未训练权重（单独一份文件，约 1.2 MB）……"}
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-4 sm:flex-row">
                  <div className="w-40 flex-none" data-qa="board-untrained">
                    <Board board={stones} heat={res.untrained.probs} />
                    <p className="num mt-1 text-center text-xs" style={{ color: "var(--fg-faint)" }}>
                      未训练的热度
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <ol className="space-y-1.5">
                      {res.untrained.top.slice(0, 3).map((t) => (
                        <li key={t.a} className="l00-top-row" data-qa="top-row-untrained">
                          <span className="mono text-sm">({t.a % 9},{Math.floor(t.a / 9)})</span>
                          <span className="prob-track">
                            <span className="prob-fill" style={{ width: `${t.p * 100}%` }} />
                          </span>
                          <span
                            className="num w-12 flex-none text-right text-sm"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            {(t.p * 100).toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="num mt-3 text-lg font-bold" data-qa="v-untrained" style={{ color: "var(--fg-muted)" }}>
                      v_net = {res.untrained.vNet >= 0 ? "+" : ""}
                      {res.untrained.vNet.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                同一局面、同一副网络骨架，只差训练。未训练 baseline 的策略头几乎把概率均分给 81 格，
                初始三连局面实测最热一格才 1.4%（78 个空格平摊、每格约 1.3%）；价值估计实测 +0.02，换哪个局面都基本贴着 0 小幅漂。
                训练过的（只吃过第 0–2 轮的自我对弈样本）已有态度：同一局面 v_net=−0.31、最热 2.0%，
                离懂棋还远，但已经不是一片均匀的乱数了。
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 9-1</span>
        真引擎 + 真权重：<span className="mono">encode</span>（game.ts）→{" "}
        <span className="mono">loadNet</span>（model.ts）前向，softmax 在站内现算。
        训练后的 weights-best.json；对照 weights-untrained.json（baseline，单独一份文件，打开开关才下载）。
      </figcaption>
    </figure>
  )
}
