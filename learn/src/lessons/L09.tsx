/** 第 9 课 · 双头：一次前向两个答案。
 *  节拍：思考题（两个问题两个网络？）→ 正文（共用主干 / 两种读法 / softmax+tanh）
 *  → 例 9-1（自由摆子真前向：问网络 → 81 分数热力图 + top5 + 价值估计条，
 *  对照开关换 weights-untrained 未训练网：baseline，训练前冻结的随机初始化）
 *  → 源码索引与验证 → 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { NetPipeline } from "../framework/net-pipeline"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
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

export default function L09() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 9 课</div>
      <h1 className="text-2xl font-bold">双头：一次前向两个答案</h1>

      <NetPipeline step={5} />

      <LessonGuide
        question="同一局棋既要回答「哪里该下」，又要回答「谁更占优」，为什么不用两台完全分开的机器？"
        why="2 个问题虽然答案形状不同，却都依赖同一批棋形和全盘形势。先共享理解，再分别读出答案，能少学重复的内容。"
        chain={[
          "主干（前几课那 7 层卷积）把棋盘变成许多张特征图，装着棋形与整盘形势",
          "策略头保留每个格子的差别，给 81 个落点打分",
          "价值头把整盘信息汇成一个价值估计",
          "搜索把「落点建议 + 形势估计」组合成实际走法",
        ]}
        takeaway="你能把 logits（81 个落点各自的分数）走完 softmax 与 tanh 得到 p 与 v_net，写出 v_net 的范围与视角（tanh 压进 −1 到 +1、站在当前行棋方一边），并写出双头 forward 的形状流转（共用主干输出的 48 张特征图，末端各读各的）。"
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
              "选第二项。第一项等于把认棋形学两遍：判断「这里该下」和「这局我优」，看的是同一批棋形，认棋形这件事只该学一次。第三项也不行：81 个分数和 1 个数，读出的方式不同，得各配各的读出层（头）；主干仍共享同一份主干输出。所以第一项错在把主干拆成两份，第三项错在不肯配两种读法。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一份棋盘理解，按 2 种问题读出答案</h3>
        <p>
          把输入从第一层往末层算一遍、直接得到输出，这样的计算叫一次<strong>前向</strong>（forward pass，下棋只走前向，训练才在前向之后接上误差与梯度）。网络看完棋盘要同时回答「哪里该下」和「谁更占优」：
          这 2 个问题读的是同一局棋里的棋形与形势。若完全分开做成两套网络，
          就可能重复学习「怎样认棋形」。共用主干让主干输出的 48 张特征图同时服务 2 个训练目标，
          通常更省权重，2 个任务的训练信号也都更新同一主干。这是一种常见设计取舍，
          不保证 2 个任务永远互相帮助：两目标打架时，两路梯度在主干上互相抵消，损失会难降；本项目两笔损失等权 1:1，没有再调这个比例。
        </p>
        <Def term="双头" en="dual-head">
          一份主干加 2 个末端读法层的结构。主干（第 8 课那 7 层卷积）把棋盘变成
          48 张 9×9 的特征图，装着棋形与整盘形势；2 个头各自把这份特征图读成自己的答案。
          代码里「一份理解」就是一个变量 <span className="mono">h</span>，2 个头都从它出发。
        </Def>
        <HeadBranch />
        <p>
          <strong>策略头</strong>逐点读出「哪里该下」：1×1 卷积把 48 通道压到 2 通道，
          摊平成 162 个数，再由全连接层读出 81 个动作分。1×1 卷积逐点计算、
          不混合相邻格，保留每个位置的独立信息。
        </p>
        <p>
          <strong>价值头</strong>把整盘读成 1 个数：1×1 卷积压到 1 通道，
          摊平成 81 个数，经 81→64→1 的全连接层收成一个价值估计，
          最后用 tanh 压进 −1…+1。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="双头层定义与前向计算：同一份主干特征 h 分路读出 81 个动作分与 1 个价值估计"
          source="alphagomoku/model.py · AlphaGomokuNet.__init__ 与 forward"
        >
          <div className="codewalk">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <pre className="min-w-0 flex-1">{`        # policy head
        self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)
        self.p_bn = nn.BatchNorm2d(2)
        self.p_fc = nn.Linear(2 * self.n * self.n, self.n * self.n)
        # value head
        self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)
        self.v_bn = nn.BatchNorm2d(1)
        self.v_fc1 = nn.Linear(self.n * self.n, 64)
        self.v_fc2 = nn.Linear(64, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.blocks(self.stem(x))
        p = F.relu(self.p_bn(self.p_conv(h)))
        p = self.p_fc(p.reshape(-1, 2 * self.n * self.n))
        v = F.relu(self.v_bn(self.v_conv(h)))
        v = F.relu(self.v_fc1(v.reshape(-1, self.n * self.n)))
        v = torch.tanh(self.v_fc2(v)).squeeze(-1)
        return p, v`}</pre>
              <div className="text-xs leading-relaxed sm:w-56" style={{ color: "var(--fg-faint)" }}>
                <div>h：主干输出的 48 张 9×9 特征图，p 与 v 两个分支都从它出发。</div>
                <div className="mt-1">策略头：48→2 通道后摊成 162 个数，经 p_fc 读出 81 个动作分。</div>
                <div className="mt-1">价值头：48→1 通道后摊成 81 个数，经 81→64→1 与 tanh 收成一个价值估计。</div>
              </div>
            </div>
          </div>
        </EvidenceCard>
        <h3>分数读成概率，价值估计压进同一把标尺</h3>
        <p>
          策略头先给 81 个格子的分数，这批未归一化的分数就叫 logits。网络本体到 logits 为止，
          不输出概率；归一化在只做前向的封装里补一步，训练时与下棋时各做各的：
          下棋用 softmax，训练用对数归一化（log_softmax，一步算出 ln p 的同一步）。
          softmax 后的这批数称概率 p（小写；进搜索遮格归一后才叫先验 P）。
          <strong>softmax 把这批 logits 改成总和为 1 的概率。</strong>
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="推理封装：前向取得 logits 与价值估计后，对 logits 做 softmax 归一化"
          source="alphagomoku/model.py · Predictor.predict"
        >
          <div className="codewalk">
            <pre>{`logits, v = self.net(x)
probs = torch.softmax(logits, dim=-1)`}</pre>
          </div>
        </EvidenceCard>
        <p>
          logits 可正可负，不能直接除以总和当概率。softmax 先把每个分数取
          <span className="mono">e</span> 的幂变成正数，再除以总和；
          计算时先减去最大分 <span className="mono">m</span>，防止指数溢出。
        </p>
        <div className="formula">
          pᵢ = e^(lᵢ−m) / Σe^(lⱼ−m)　　（e≈2.718）
          <br />分数 <span className="hl">2 / 1 / 0</span> → 概率 <span className="hl">0.67 / 0.24 / 0.09</span>
        </div>
        <Def term="softmax" en="softmax">
          把一组 logits 保序地变成总和为 1 的概率：减去最大分、取 e 的幂、再除以总和。
          例 9-1 的热度会先遮掉已占格，再在空格里归一化，所以展示值不是裸 softmax 输出。
        </Def>
        <p>
          策略头收在概率分布上；价值头的 1 个数不走 softmax，而要过 tanh。
        </p>
        <Def term="双曲正切" en="hyperbolic tangent（缩写 tanh）">
          把任意实数平滑压进 −1 到 +1 的函数：输入越正越靠近 +1，输入越负越靠近 −1，0 停在中间。
          价值头用它收尾，使输出与终局结果 z 共用一把标尺。它不做归一化，压的也不是概率。
        </Def>
        <p>
          和终局结果 z 使用同一把标尺，才能计算误差。价值误差是
          <span className="mono">(v_net−z)²</span> 的平均，z 取赢 +1、输 −1、和 0；
          它再与策略头的交叉熵损失 1:1 相加。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="训练步损失计算：价值头算均方误差，与策略损失等权相加"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    logits, v = net(x)
    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss`}</pre>
          </div>
        </EvidenceCard>
        <p>
          这个直接前向输出记作价值估计 <span className="mono">v_net</span>：
          它站在当前行棋方立场，是分数不是赢的概率；策略头的分数仍对应原棋盘上的 81 个坐标。
        </p>
      </div>

      <div className="prose mt-10">
        <p>
          例 9-1 由浏览器镜像现算：learn/src/engine/model.ts 的 loadNet 载入导出权重，
          权重保留 5 位小数、用 Float64 计算，与 torch 前向逐项对比允许末位误差；
          训练后的权重是 weights-best.json，对照 weights-untrained.json（baseline，单独一份文件，打开开关才下载）。
        </p>
      </div>

      <AskBoard />

      <Ledger title="alphagomoku/model.py · 双头 forward 与 alphagomoku/train.py">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="mono">alphagomoku/model.py · AlphaGomokuNet.__init__ / forward</span>：主干输出{" "}
            <span className="mono">h = self.blocks(self.stem(x))</span> 后分两路，策略头经{" "}
            <span className="mono">p_conv (48→2, 1×1)</span>、<span className="mono">p_bn</span>、{" "}
            <span className="mono">p_fc (162→81)</span> 输出 81 个动作 logits；价值头经{" "}
            <span className="mono">v_conv (48→1, 1×1)</span>、<span className="mono">v_bn</span>、{" "}
            <span className="mono">v_fc1 (81→64)</span>、<span className="mono">v_fc2 (64→1)</span> 与{" "}
            <span className="mono">torch.tanh</span> 输出 <span className="mono">[−1, +1]</span> 范围内的价值估计。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · Predictor.predict</span>：推理阶段调用{" "}
            <span className="mono">torch.softmax(logits, dim=-1)</span> 把 logits 归一化为概率分布。
          </li>
          <li>
            <span className="mono">alphagomoku/train.py · train_step</span>：训练阶段分别计算{" "}
            <span className="mono">F.mse_loss(v, target_z)</span> 与交叉熵{" "}
            <span className="mono">policy_loss</span>，并以 <span className="mono">loss = value_loss + policy_loss</span> 等权相加（完整训练步见 <span className="mono">train_step</span>）。
          </li>
          <li>
            验证命令：<span className="mono">pytest tests/test_model.py::test_forward_shapes_and_ranges</span> 与{" "}
            <span className="mono">cd learn && npm test</span>（运行 <span className="mono">parity.test.ts</span> 对拍 16 份输入的 6 处中间张量）。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "双头共用一份主干：主干把棋盘读成 48 张特征图，策略头逐点读出 81 个分数，价值头整盘读出 1 个价值估计。",
          "softmax 把 logits 改成总和为 1 的概率 p（先减最大分再取 e 的指数）；tanh 把价值压进 −1 到 +1，与 z 共用一把标尺。",
          "价值估计 v_net 是网络直接前向的输出，视角是当前行棋方；它是价值估计，不等于赢的概率。",
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
        title="习题"
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
              "主因是主干只学一次：判断该下哪和判断谁占优都依赖同一批棋形与形势。分开学可能重复做「认棋形」这件事；合在一起，2 个训练目标都能更新同一个主干。省权重、省计算是顺带收益，2 个目标是否总能互相帮助仍取决于训练。",
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
              "逐点的归逐点、整盘的归整盘。策略头把棋盘一格一格的细节全保住（每格 1 个分数，第 1 课的 81 个动作一一对应）。价值头要把整盘收成 1 个价值估计，81→64→1 的隐藏层（全连接层）就是给这个落差修的中间站。要核对这条形状流转，可对拍 learn/tests/parity.test.ts：它用 16 份输入逐层对比 6 处中间结果，浏览器端的复现与 model.py 的 forward 同源。",
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
              "tanh 把任意数平滑压进 −1 到 +1，让 v_net 与终局结果 z 共用一把标尺，才能计算 (v_net−z)²。硬截断在界外梯度为 0，错到界外就学不回来；tanh 在极值处也会饱和，但仍是平滑可导的。它表示价值估计，不是赢的概率。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 结构图 · 共享主干怎样分出两个头 ============ */

function HeadBranch() {
  return (
    <figure className="figure branch-figure mt-8" aria-label="双头网络结构图">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">结构图 · 一份 h，两条读法</span>
      </div>
      <div className="branch-canvas">
        <div className="branch-trunk">
          <span className="branch-trunk-label">共享主干输出</span>
          <strong className="mono">h</strong>
          <span className="branch-shape mono">48 × 9 × 9</span>
        </div>
        <div className="branch-fork" aria-hidden="true"><i /><i /></div>
        <div className="branch-arms">
          <div className="branch-arm policy">
            <div className="branch-heading">
              <span className="branch-kicker">策略头 · 下哪</span>
              <span className="branch-flow-label">保留每个格子的位置差异</span>
            </div>
            <div className="branch-path">
              <span>1×1 卷积</span><b>→</b>
              <span>2×9×9</span><b>→</b>
              <span>摊平 162</span><b>→</b>
              <span>全连接</span><b>→</b>
              <span>81 logits</span><b>→</b>
              <span className="branch-op">softmax</span>
            </div>
            <div className="branch-result"><strong>p</strong><span>81 个落点概率 · Σp=1</span></div>
          </div>
          <div className="branch-arm value">
            <div className="branch-heading">
              <span className="branch-kicker">价值头 · 谁优</span>
              <span className="branch-flow-label">把整盘收成一个判断</span>
            </div>
            <div className="branch-path">
              <span>1×1 卷积</span><b>→</b>
              <span>1×9×9</span><b>→</b>
              <span>摊平 81</span><b>→</b>
              <span>81→64→1</span><b>→</b>
              <span className="branch-op">tanh</span>
            </div>
            <div className="branch-result"><strong>v_net</strong><span>1 个数 · −1…+1</span></div>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">结构图</span>
        两张头图共用同一个 <span className="mono">h</span>；维度来自 <span className="mono">model.py</span> 的
        <span className="mono">p_conv / p_fc</span> 与 <span className="mono">v_conv / v_fc1 / v_fc2</span>。
      </figcaption>
    </figure>
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
                  baseline 是训练开始前冻住的随机数权重。{wUntrained ? "按「问网络」，2 个网络同题同考。" : "正在加载未训练权重（单独一份文件，约 1.2 MB）……"}
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
        真引擎加真权重：<span className="mono">encode</span>（learn/src/engine/game.ts）→{" "}
        <span className="mono">loadNet</span>（learn/src/engine/model.ts）前向，softmax 在站内现算。
        每次「问网络」都由这份浏览器复现当场计算；top5 坐标即原棋盘坐标，策略头不做视角翻转。
      </figcaption>
    </figure>
  )
}
