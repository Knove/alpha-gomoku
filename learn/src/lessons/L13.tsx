/** 第 13 课 · 反向传播：两种错误怎样改动所有权重。
 *  节拍：双头损失 → 双权重链式手推 → 三行更新 → 例 13-1 联动 → 真实 train_step。 */
import { useEffect, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import { twoLayer, twoLayerStep } from "../lib/foundations"

/* 手推例固定：x=2(窗口里己方子数)、z=+1(假设这局训练对局后来由我赢);
 * w₁、w₂ 可拖，默认正例 0.5 / 1.5。 */
const X = 2
const Z = 1
const W1_0 = 0.5
const W2_0 = 1.5

export default function L13() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 13 课</div>
      <h1 className="text-2xl font-bold">反向传播：两种错误怎样改动所有权重</h1>

      <LessonGuide
        question="第 3 课算过 1 个权重的梯度 2(r−z)·x；现在网络有层层权重和两个输出，梯度怎样回到每一个权重？"
        why="双头的策略与价值各有一笔错误，却共用同一段主干。只有沿真实计算路径把两笔反馈拆回各层，才知道每个权重该往哪边改。"
        chain={[
          "先由 π 与 z 算出策略损失和价值损失",
          "两笔损失相加，沿共享计算图反向",
          "每层把局部变化率逐环相乘",
          "zero_grad → backward → step 更新权重",
        ]}
        takeaway="你能写出双头总损失，手算两层权重的链式梯度，并对应到 train_step 的三行更新。"
        boundary="双权重玩具只演示价值侧的一条链；策略侧形状更多，但反向规则相同。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "策略目标 π 和终局目标 z 各指出一种错误。两笔损失要怎样改变全部权重？",
            options: [
              "平摊：每个权重各记一半，听起来最公平",
              "按影响反向传播：谁对两笔答案影响大，谁收到的更新信号就大",
              "重置：把所有权重都设回随机数，重新来",
            ],
            answer: 1,
            explain:
              "选第二项。平摊并不公平：一个权重可能只顺路参与，另一个才大幅改变答案。训练要问的是「我把这个权重调一点，两笔损失会怎样变？」第 3 课已经定义过梯度；本课先在双权重玩具里把这条链走一遍，再看它在真实网络里怎么走。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>先算两笔损失，再一起反向</h3>
        <p>
          第 3 课的更新式 <span className="mono">w←w−lr·梯度</span> 没变；
          难点是网络有很多 <span className="mono">w</span>，而且有两份答案要同时学。
          训练从回放池抽到样本后，先让当前网络重新前向一次，得到策略 logits 和价值估计
          <span className="mono">v_net</span>；再用 <span className="mono">π</span> 与
          <span className="mono">z</span> 计算两笔损失。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="对当前批次重新执行前向计算，取得策略 logits 与价值估计 v"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    logits, v = net(x)`}</pre>
          </div>
        </EvidenceCard>
        <p>
          为了把「错多少」写成可比较的标量，训练分别用交叉熵比较网络给出的落子概率{" "}
          <span className="mono">p</span> 与目标 <span className="mono">π</span>，用均方误差比较网络价值估计{" "}
          <span className="mono">v_net</span> 与终局结果 <span className="mono">z</span>。
        </p>
        <Def term="双头损失" en="policy cross-entropy + value mean squared error">
          策略损失是交叉熵 <span className="mono">−Σπᵢ ln pᵢ</span>：
          π 看重的落点若 p 很小，惩罚会迅速增大。价值损失是均方误差
          <span className="mono">(v_net−z)²</span>：猜高猜低都为正。
          两笔在一批样本上取平均后等权相加，就是总损失。
        </Def>
        <div className="formula">
          L<sub>策略</sub> = −Σπᵢ ln pᵢ（交叉熵）　　L<sub>价值</sub> = (v_net−z)²（均方误差）
          <br />L<sub>总</sub> = L<sub>策略</sub> + L<sub>价值</sub>
        </div>
        <EvidenceCard
          fidelity="runtime-exact"
          title="分别计算价值均方误差与策略交叉熵，并等权相加为总损失"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss`}</pre>
          </div>
        </EvidenceCard>
        <p>
          <span className="mono">p</span> 是 softmax 后的 81 格落子概率；
          <span className="mono">ln</span> 是以 e 为底的对数。代码用
          <span className="mono">log_softmax</span> 一步算出 ln p，避免先得到极小的 p 再取对数。
          两个头共享主干，所以两笔损失的梯度最后会在主干上相加。
        </p>
        <h3>从损失倒着走：四段变化率接力</h3>
        <p>
          反向传播要解决的不是「有没有错」，而是「该改谁、改哪边」。第 4 课已经看过：
          一个权重改一点，它所乘的特征会决定分数改多少。现在从总损失倒着走，沿实际计算路径
          逐段追问「这一处小变化会传多远」。
        </p>
        <Def term="反向传播" en="backpropagation">
          从总损失出发，沿实际计算路径倒着走，按链式法则把各段局部变化率逐环相乘，
          算出总损失对每个权重的梯度。谁对两笔答案影响大，谁收到的更新信号就大，
          不是把损失平分给每个权重。
        </Def>
        <p>
          先用两个权重看清规则。令 <span className="mono">x=2</span> 是一个教学特征，
          <span className="mono">w₁=0.5、w₂=1.5</span>，并假设终局结果是 <span className="mono">z=+1</span>。
          这台玩具先不经过 tanh，前向依次算加权和 <span className="mono">s=w₁·x=1</span>、过 ReLU 门得到中间数 <span className="mono">h=1</span>、再乘 <span className="mono">w₂</span> 得到原始分数 <span className="mono">r=1.5</span>（代码形参写作 <span className="mono">v</span>），所以平方损失是
          <span className="mono">(1.5−1)²=0.25</span>。
        </p>
        <div className="formula">
          w₁ 的梯度 = <span className="hl">3</span>　　w₂ 的梯度 = <span className="hl">1</span>
        </div>
        <p>
          这里 <span className="mono">w₁</span> 的梯度更大，因为它的影响会继续穿过
          <span className="mono">w₂</span> 和输入 <span className="mono">x</span>；两个权重不是各分一半。
          沿梯度的反方向调，足够小的一步内损失才会减小：梯度为正就减小权重，为负则增大。例 13-1 让你亲手拖动，
          看前向答案、两个梯度和「一步更新」同时变化。
        </p>
        <p>
          0.25 这笔损失，怎么导出 3 和 1 两个梯度？靠的是沿路径逐段相乘。∂损失/∂w₁ 读作「损失对 w₁ 的变化率」，
          四段依次回答：平方损失怎样响应 r、r 怎样响应 h、ReLU 门是否让变化通过、s 怎样响应 w₁(∂s/∂w₁ = x)。
        </p>
        <Def term="链式法则" en="chain rule">
          复合函数求导时沿路径逐段相乘的规则。它把同一条路径上的局部变化率乘起来：
          每一环回答「那边调一点点，这边变多少」。
        </Def>
        <div className="formula mt-3">
          ∂损失/∂w₁ = <span className="hl">2(r−z)</span> × <span className="hl">w₂</span> ×
          <span className="hl">门</span> × <span className="hl">x</span> = 1 × 1.5 × 1 × 2 =
          <span className="hl">3</span>
          <br />∂损失/∂w₂ = 2(r−z) × h = 1 × 1 = <span className="hl">1</span>
        </div>
        <EvidenceCard
          fidelity="constructed"
          title="双权重教学模型：前向求损失与反向链式法则求梯度"
          source="learn/src/lib/foundations.ts · twoLayer"
        >
          <div className="codewalk">
            <pre>{`export function twoLayer(w1: number, w2: number, x: number, z: number): TwoLayer {
  const s = w1 * x
  const h = relu(s)
  const v = w2 * h
  const loss = quadLoss(v, z)
  const dv = 2 * (v - z)
  const gate: 0 | 1 = s > 0 ? 1 : 0
  return {
    s,
    h,
    v,
    loss,
    dv,
    dW2: dv * h,
    dW1: dv * w2 * gate * x,
    gate,
  }
}`}</pre>
          </div>
        </EvidenceCard>
        <p>
          两个梯度算出后，一次权重更新的次序是固定的：先清旧梯度，再沿这次总损失反向传播，
          最后由优化器把每个权重挪一步。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="清空旧梯度、沿总损失反向传播并执行一步参数更新"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    optimizer.zero_grad()
    loss.backward()
    optimizer.step()`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          在玩具里把 <span className="mono">w₁</span> 调成负数，ReLU 门关上，
          <span className="mono">h=0、gate=0</span>，这条路径的两个梯度都会变成 0。
          真实网络还有其他通道，不能据此断言整张网络都收不到信号；它只说明门关上时，这条路径不会更新。
        </p>
      </div>

      <TwoLayerBook />

      <Ledger title="alphagomoku/train.py · train_step">
        <p className="mb-3 text-sm">
          下面完整展示 <span className="mono">train_step</span> 从增广、重新前向、双损失到反向传播与更新权重的实现：
        </p>
        <div className="codewalk">
          <pre>{`def train_step(
    net: AlphaGomokuNet,
    optimizer: torch.optim.Optimizer,
    batch,
    device: str,
    rng: np.random.Generator,
) -> dict:
    """One SGD update on a batch from ReplayBuffer.sample(). Returns metrics."""
    inputs, pis, zs = batch
    B = inputs.shape[0]
    n = inputs.shape[-1]
    ks = rng.integers(0, 8, size=B)
    aug_in = np.empty_like(inputs)
    aug_pi = np.empty_like(pis)
    for i in range(B):
        k = int(ks[i])
        aug_in[i] = dihedral_transform(inputs[i], k)
        aug_pi[i] = dihedral_transform_pi(pis[i], n, k)

    x = torch.from_numpy(aug_in).to(device)
    target_pi = torch.from_numpy(aug_pi).to(device)
    target_z = torch.from_numpy(zs.astype(np.float32)).to(device)

    net.train()
    logits, v = net(x)
    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    with torch.no_grad():
        entropy = -(logp.exp() * logp).sum(dim=-1).mean()
    return {
        "loss": float(loss.item()),
        "policy_loss": float(policy_loss.item()),
        "value_loss": float(value_loss.item()),
        "policy_entropy": float(entropy.item()),
        "lr": float(optimizer.param_groups[0]["lr"]),
    }`}</pre>
        </div>
        <p className="mt-3 text-sm">
          运行 <span className="mono">python -m pytest tests/test_train.py -q</span>{" "}
          可验证单步训练损失计算、梯度反向传播与参数更新。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "两笔损失各有自己的训练目标：策略用交叉熵 −Σπᵢ ln pᵢ 比较 p 与 π，价值用均方误差 (v_net−z)² 比较 v_net 与 z，相加成总损失后一次反向。",
          "链式法则沿计算路径把局部变化率逐环相乘：手推例里 w₁ 的梯度是 3、w₂ 的梯度是 1、损失是 0.25，按影响分摊，不是平分。",
          "真实训练最后落到 zero_grad() → backward() → step()；ReLU 门关死时该路径梯度为 0。",
        ]}
        next={
          <>
            下一课看许多样本怎样形成一次更新：环形回放池怎样覆盖旧样本、
            为什么要攒够 min_buffer 再随机抽批，以及棋盘与 π 怎样同步做八种旋转镜像。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "反向传播（backpropagation）在干什么？",
            options: [
              "把损失平分给每个权重",
              "变化率接力：两笔损失对答案的影响，沿网络反向逐环相乘，摊到每个权重。谁影响大，谁的更新信号大",
              "把算错的局面存起来下次再算",
            ],
            answer: 1,
            explain:
              "核心不是平摊，而是沿实际路径计影响：某个权重调一点会怎样改变输出，输出又会怎样改变总损失。两笔训练目标最后一起形成更新信号；双权重的公式只是把这条规则放大给你看。",
          },
          {
            q: "在双权重玩具里，w₁ 调成负的（s≤0）时，为什么两个梯度都变 0？",
            options: [
              "因为负权重不许训练",
              "在这个双权重玩具里，ReLU 门关死：h=0，而 w₂ 的梯度恰好乘 h；w₁ 的路径也断在门上，所以两个权重的梯度都为 0",
              "因为损失太小，四舍五入成 0",
            ],
            answer: 1,
            explain:
              "在这个玩具中：往 w₂ 的方向，r=w₂·h 里 h=0，调 w₂ 不改变原始分数；往 w₁ 的方向，门的影响是 0，接力断链。真实网络还有其他路径，不能直接推出整张网络都没有信号。这个例子只让你看清「门关上时，这条路径不会更新」。",
          },
          {
            q: "为什么真实训练会把策略和价值两笔损失加成总损失，再一起反向传播？",
            options: [
              "因为只要把两个数字相加，训练速度一定翻倍",
              "同一组权重同时影响「下哪」和「谁优」；把两份反馈合起来，主干才能同时朝两种目标调整",
              "因为终局结果 z 和搜索 π 本来就是同一个数",
            ],
            answer: 1,
            explain:
              "双头各有自己的训练目标：π 指出搜索后更值得尝试的落子，z 指出最终输赢。它们读的是同一份主干理解，因此总损失会把两种反馈一起交给同一批权重；这不是把两个目标混为一谈，而是让共享部分同时收到两种信号。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 13-1 · 双权重玩具：前向反向联动 + 走一步 ============ */

const boxStyle = {
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--hairline)",
  borderRadius: 8,
  padding: "0.3rem 0.55rem",
  minWidth: "5.2rem",
  textAlign: "center" as const,
  transition: "opacity 280ms ease, border-color 280ms ease, background 280ms ease",
}
const arrow = <span style={{ color: "var(--fg-faint)" }}>→</span>

function TwoLayerBook() {
  const [w1, setW1] = useState(W1_0)
  const [w2, setW2] = useState(W2_0)
  const [pulse, setPulse] = useState<number | null>(null)
  const [last, setLast] = useState<{
    b1: number
    b2: number
    n1: number
    n2: number
    before: ReturnType<typeof twoLayer>
    after: ReturnType<typeof twoLayer>
  } | null>(null)

  const g = twoLayer(w1, w2, X, Z)
  const dead = g.gate === 0

  useEffect(() => {
    if (pulse === null) return
    const maxStep = dead ? 7 : 9
    if (pulse > maxStep) {
      setPulse(null)
      return
    }
    const id = window.setTimeout(() => setPulse((p) => (p === null ? null : p + 1)), 320)
    return () => window.clearTimeout(id)
  }, [pulse, dead])

  const hi = (idx: number) =>
    pulse === idx
      ? { borderColor: "var(--accent)", background: "var(--accent-wash)" }
      : undefined

  const stepOnce = () => {
    const before = twoLayer(w1, w2, X, Z)
    const n = twoLayerStep(w1, w2, X, Z)
    const after = twoLayer(n.w1, n.w2, X, Z)
    setLast({ b1: w1, b2: w2, n1: n.w1, n2: n.w2, before, after })
    setW1(n.w1)
    setW2(n.w2)
  }
  const reset = () => {
    setW1(W1_0)
    setW2(W2_0)
    setLast(null)
  }

  const f2 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2)
  const f3 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3)
  const dim = dead ? { opacity: 0.45 } : undefined
  const w1Lo = Math.min(-1, w1)
  const w1Hi = Math.max(1, w1)
  const w2Lo = Math.min(0, w2)
  const w2Hi = Math.max(3, w2)

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 13-1 · 双权重玩具：一层看子数，一层看输赢分</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[17rem]">
          <div className="mini-label">第一层 w₁ = {f2(w1)}（把子数变成中间数 h）</div>
          <input type="range" min={w1Lo} max={w1Hi} step={0.05} value={w1}
            onChange={(e) => {
              setW1(Number(e.target.value))
              setLast(null)
            }} aria-label="w1 滑杆"
            style={{ ["--fill" as string]: `${((w1 - w1Lo) / (w1Hi - w1Lo)) * 100}%` }}
            data-qa="w1-slider" />
          <div className="mini-label mt-3">第二层 w₂ = {f2(w2)}（把中间数读成输赢分 r）</div>
          <input type="range" min={w2Lo} max={w2Hi} step={0.05} value={w2}
            onChange={(e) => {
              setW2(Number(e.target.value))
              setLast(null)
            }} aria-label="w2 滑杆"
            style={{ ["--fill" as string]: `${((w2 - w2Lo) / (w2Hi - w2Lo)) * 100}%` }}
            data-qa="w2-slider" />
          <p className="mt-1 text-[0.68rem] leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            滑杆范围随当前值扩展，只用于选起点，不是训练约束；更新后的真实数值照实显示。
          </p>

          <div className="reveal-box mt-4">
            <p className="text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              x = 2（这扇窗里有 2 颗己方子）。x 是窗内己方子数，与第 3 课的三连条数数值同为 2。z = +1（假设训练对局后来我赢）。拖 w₁
              <strong>穿过 0</strong>：看这道<strong>双权重玩具题</strong>的反向梯度列全部变为 0。
              ReLU 门关上后，这条路径不会更新。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn primary" onClick={stepOnce} data-qa="step-btn-two">
              走一步(lr = 0.1)
            </button>
            <button type="button" className={`btn ${pulse !== null ? "active" : ""}`}
              onClick={() => setPulse((p) => (p === null ? 0 : null))}>
              {pulse !== null ? "⏸ 停" : "▶ 演示前向与反传"}
            </button>
            <button type="button" className="btn" onClick={reset}>↺ 回到手推例</button>
          </div>
          {last && (
            <div className="reveal-box mt-3 text-xs leading-relaxed" data-qa="step-readout">
              <div className="mini-label">刚走的一步</div>
              <p className="num mt-1">
                w₁ {f3(last.b1)} → {f3(last.n1)}、w₂ {f3(last.b2)} → {f3(last.n2)}
              </p>
              <p className="num mt-0.5">
                玩具原始分数 r {f2(last.before.v)} → {f2(last.after.v)}
                {last.after.v < Z && last.before.v > Z ? "（跨过了 z=1）" : ""}、
                损失 {last.before.loss.toFixed(3)} → {last.after.loss.toFixed(3)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                {last.after.gate === 0 ? (
                  <>这一步后 w₁ = {f2(last.n1)}，已落在 ReLU 关门区（≤0）；后续单步不会再沿这条路径更新。把 w₁ 拖回 0 以上可继续。</>
                ) : (
                  <>这次更新让损失从 {last.before.loss.toFixed(3)} 变到 {last.after.loss.toFixed(3)}。继续走会沿当前梯度更新；最终是靠近、来回摆还是越过，由两个权重共同决定。</>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">前向：x → s → h → r（玩具原始分数） → 损失</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="fwd-chain">
            <div style={{ ...boxStyle, ...hi(0) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>x 子数</div>
              <div className="num font-bold">{X}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, ...hi(1) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>s = w₁·x</div>
              <div className="num font-bold">{g.s.toFixed(2)}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, borderColor: dead ? "var(--accent)" : "var(--hairline)", ...hi(2) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>h = ReLU(s)</div>
              <div className="num font-bold" style={{ color: dead ? "var(--accent-deep)" : undefined }}>
                {g.h.toFixed(2)}
              </div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, ...hi(3) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>r = w₂·h</div>
              <div className="num font-bold">{g.v.toFixed(2)}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...hi(4) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>损失 (r−z)²</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.loss.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="mini-label mt-5">反向：损失 → 接力四环 → w₁ 的梯度</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="bwd-chain">
            <div style={{ ...boxStyle, ...dim, ...hi(5) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>① 损失对 r</div>
              <div className="num font-bold">2(r−z) = {g.dv.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, ...dim, ...hi(6) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>② r 对 h</div>
              <div className="num font-bold">w₂ = {w2.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...hi(7) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>③ 门(s&gt;0 才开)</div>
              <div className="num font-bold" style={{ color: dead ? "var(--accent-deep)" : undefined }}>
                {g.gate}
              </div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, ...dim, ...hi(8) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>④ s 对 w₁</div>
              <div className="num font-bold">x = {X}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>=</span>
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...dim, ...hi(9) }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>w₁ 的梯度</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.dW1.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" data-qa="bwd-w2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>
              w₂ 的梯度（只两环：① × h） =
            </span>
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...dim }}>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.dW2.toFixed(2)}
              </div>
            </div>
          </div>

          {dead ? (
            <div className="reveal-box mt-4 text-sm leading-relaxed" data-qa="dead-banner"
              style={{ borderColor: "var(--accent)", color: "var(--accent-deep)" }}>
              <strong>门关死：梯度全灭。</strong>s 掉到 0 或 0 以下（记号写作
              s ≤ 0），h=0。w₂ 的梯度恰好乘它前面的 h(0),w₁ 的接力断在
              第③环（门=0）。在这道<strong>双权重玩具题</strong>里，两个权重都
              <strong>收不到梯度</strong>：损失明明是 {g.loss.toFixed(2)}，却没有一个权重知道该动。
              演示里的「拖回」是你在拖滑杆。
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              接力链四环相乘：{g.dv.toFixed(2)} × {w2.toFixed(2)} × 1 ×{" "}
              {X} = {g.dW1.toFixed(2)}(w₁ 的梯度)。每一环都是「那边调一点点，
              这边变多少」。反向传播就是把第 3、4 课的变化率沿网络
              反向乘了一遍。
            </p>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 13-1</span>
        前向与反向同一套数(learn/src/lib/foundations.ts 的{" "}
        <span className="mono">twoLayer</span>)：拖任何一个权重，两个梯度同时更新。
        「走一步」走的是真训练的同一条主线 w ← w − lr×梯度（真训练还带动量与权重衰减），玩具把 lr 取 0.1
        （真实配置是 0.01）；滑杆只选起点，不是权重约束。手推例的数字(3、1、0.25)和正文里的算式一个数都不差。
      </figcaption>
    </figure>
  )
}
