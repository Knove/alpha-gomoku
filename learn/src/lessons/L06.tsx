/** 第 13 课 · 反向传播：两种错误怎样改动所有权重。
 *  节拍：思考题 → 两笔真实损失(落点码 train_step 前向/两笔损失/log_softmax)→ 双权重手推(3 / 1 / 0.25,落点码 twoLayer)→
 *  链式四环与更新三行 → 门关死/梯度消失/残差捷径 → 例 13-1(拖 w₁/w₂ 前向反向联动)→ 对证(整链:train_step)→ 小结 → 习题。 */
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

export default function L06() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 13 课</div>
      <h1 className="text-2xl font-bold">反向传播：两种错误怎样改动所有权重</h1>

      <LessonGuide
        question="搜索给出 π、终局给出 z 后，两笔错误怎样沿真实计算路径回到每一个权重？"
        why="前面已经认识过策略头输出 logits，价值头输出 v_net，搜索制造 π，终局补上 z。完整反向传播必须等这些对象都出现后，才能落到 train_step 里看真实的反向与更新在改什么。"
        chain={[
          "当前网络重新前向得到 logits 与 v_net",
          "π 与 z 分别计算策略损失和价值损失",
          "两笔损失相加后沿共享计算图反向接力",
          "每个权重按自己的梯度和学习率更新",
        ]}
        takeaway="你能手算两笔损失沿实际计算路径逐环相乘的反向传播，并逐步对应 train_step；共享主干会同时收到 π 与 z 的信号，两路梯度在主干上相加。"
        boundary="双权重玩具故意省略真实价值头的 tanh 和策略头，只留下「变化率逐环相乘」这一条；本课随后把它接回真实的双损失和共享网络。"
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
        <h3>两笔损失各自指出一种错误</h3>
        <p>
          策略目标是搜索留下的 <span className="mono">π</span>，
          价值目标是终局补上的 <span className="mono">z</span>，它们扮演「标准答案」的角色。
          对局记录里保存的 <span className="mono">root_value</span> 只是搜索时顺手记下的数值，
          不参与这笔价值损失。训练从存旧样本的回放池（第 6 课引入）抽到局面 s 并把每张棋盘与它的 π 改写成同一个等价视图（第 14 课的数据增强）后，
          会让<strong>当前网络重新做一次前向计算</strong>，
          得到 81 个 <span className="mono">logits</span> 和一个直接价值输出
          <span className="mono">v_net</span>（代码里写作 <span className="mono">v</span>，不经搜索，由网络直接报出）。
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
        <Def term="交叉熵" en="cross-entropy">
          策略损失。写成 <span className="mono">−Σπᵢ ln pᵢ</span>：
          π 大的格子若 p 很小，损失就会增大。不用平方损失 (π−p)²，是因为 p 已经很小时，再把 p 压得更低，
          惩罚也几乎不再涨，而 <span className="mono">−ln p</span> 在 p→0 时损失急剧增大：
          搜索看中的路，网络不许把它打成接近 0。
        </Def>
        <Def term="均方误差" en="mean squared error, MSE">
          逐样本的平方误差在一批样本上取平均（故称「均」方；代码 F.mse_loss 的 mean 就是这一步）；
          本课用它作价值损失，写成 <span className="mono">(v_net−z)²</span>：v_net 离 z 越远，
          损失越大，无论猜高还是猜低都为正。
        </Def>
        <div className="formula">
          L<sub>策略</sub> = −Σπᵢ ln pᵢ（交叉熵）　　L<sub>价值</sub> = (v_net−z)²（均方误差）
          <br />L<sub>总</sub> = L<sub>策略</sub> + L<sub>价值</sub>（等权 1:1 是本项目起点配置，权重可调，见下行）
        </div>
        <p>
          以上两条公式算的是<strong>单条样本</strong>的量。两笔的天然尺度并不相同：
          策略损失在 81 格上求和，价值损失只是一个平方，等权不等于同等影响；
          把价值权重调大，主干偏向读输赢、落子变粗，反之亦然。
          一次更新在一批样本上各自取平均，总损失是一批一个标量，本项目固定 1:1。
        </p>
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
          <span className="mono">p</span> 是网络在 81 个格子上的落子概率（softmax 的输出，按惯例记小写 p；进搜索充当先验时还要先遮掉已占格、重新归一，那时才叫先验 P，见第 10 课）：logits 先过第 9 课的
          softmax，凑成和为 1 的 p。<span className="mono">ln</span> 是以 e 为底的对数，
          softmax 用的是它的反函数 exp。两个头读同一个主干（两头共用的那段网络），所以两份目标信号必须一起进入同一笔总损失；
          代码不先算 p 再取对数，而是一步算出 ln p，
          这一步合起来叫对数归一化，代码里写作 <span className="mono">log_softmax</span>。
        </p>
        <Def term="对数归一化" en="log_softmax">
          把 logits 变成落子概率 p 并一步算出 ln p 的运算，代码里写作 log_softmax。先算出可能极小的 p 再取对数
          容易数值不稳；合成一步更稳。
        </Def>

        <h3>四段变化率相乘得到两个梯度</h3>
        <p>
          反向传播要解决的不是「有没有错」，而是「该改谁、改哪边」。第 4 课已经看过：
          一个权重改一点，它所乘的特征会决定分数改多少。现在从总损失倒着走，沿实际计算路径
          逐段追问「这一处小变化会传多远」。
        </p>
        <Def term="反向传播" en="backpropagation" see="第 3 课">
          从总损失出发，沿实际计算路径倒着走，按链式法则把各段局部变化率逐环相乘，
          算出总损失对每个权重的梯度。谁对两笔答案影响大，谁收到的更新信号就大，
          不是把损失平分给每个权重。
        </Def>
        <p>
          先用两个权重看清规则。令 <span className="mono">x=2</span> 是一个教学特征，
          <span className="mono">w₁=0.5、w₂=1.5</span>，并假设终局结果是 <span className="mono">z=+1</span>。
          这台玩具故意省略 tanh（定义见第 9 课），前向先算加权和 <span className="mono">s=w₁·x=1</span>，过 ReLU 门得到中间数 <span className="mono">h=1</span>，再乘 <span className="mono">w₂</span> 得到原始分数 <span className="mono">r=1.5</span>（代码形参写作 <span className="mono">v</span>），所以平方损失是
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
          其中 <span className="mono">optimizer.step()</span> 在按梯度迈步之外，还会叠加上动量（把最近几次更新方向合成惯性）、Nesterov 预探（先按惯性探一步再算梯度）与权重衰减（每步给权重乘小于 1 的正因子{" "}
          <span className="mono">1−lr·weight_decay</span>，往零轻拽）；这三项优化器配套只改变「怎么调」，不改变「算什么损失」，将在第 14 课正式展开。
        </p>

        <h3>门关死、梯度消失与残差捷径</h3>
        <p>
          在上方 <span className="mono">twoLayer</span> 代码中，若把 <span className="mono">w₁</span> 调到 −0.5，
          加权和 <span className="mono">s ≤ 0</span>，玩具中的 ReLU 会让{" "}
          <span className="mono">h=0</span>，同时条件 <span className="mono">s &gt; 0</span> 让{" "}
          <span className="mono">gate=0</span>。
          因为 <span className="mono">w₂</span> 的梯度式里乘了因子 <span className="mono">h</span>，
          <span className="mono">w₁</span> 的路径也乘了 <span className="mono">gate</span>，
          所以门一关，这条路径上的两个权重都收不到更新。真实网络还有其他通道，
          不能因此断言整张网络都收不到信号；这个例子只说明门关上时该路径不会更新。
        </p>
        <p>
          梯度为 0 是不动点，纯梯度下降不会把这条路径救活；这族整条路径停摆的现象叫
          死亡 ReLU（dying ReLU）。真实网络里可能翻案的是带泄漏的线性整流单元
          （Leaky Rectified Linear Unit，简称 LeakyReLU，负区仍留梯度）、卷积权重共享下
          其他位置的梯度，或其他路径的扰动。权重衰减救不活死门：它每步只给 <span className="mono">w₁</span> 乘正因子 <span className="mono">1−lr·weight_decay</span>，只会保持符号把 <span className="mono">w₁</span> 慢慢拉向 0，
          到 0 处门仍然关着。
        </p>
        <p>
          深层里很多小于 1 的影响连续相乘，会让靠前的层更新变弱。第 8 课定义的残差块（输出 = 输入 + 修正量）用{" "}
          <span className="mono">x+F(x)</span> 在出口 ReLU 之前留下一条梯度为 1 的捷径：
          输入 <span className="mono">x</span> 那一支不经过卷积与批标准化，以系数 1 直通到加法，用来缓解这种变弱。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块前向计算：在出口激活前将输入 x 与卷积支路 h 直接相加"
          source="alphagomoku/model.py · ResBlock.forward"
        >
          <div className="codewalk">
            <pre>{`    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)`}</pre>
          </div>
        </EvidenceCard>
        <Def term="梯度消失" en="vanishing gradient">
          深层网络里若许多局部变化率的绝对值小于 1，连乘就会消失（大于 1 则相反地爆炸，exploding gradient），靠前的层各权重的梯度极小，几乎不更新。
          残差捷径这一段的总梯度是 <span className="mono">1+F′</span>（F′ 是修正量 F 那条路的梯度）
          （出口还有一次 ReLU，总梯度还要再乘那道门），能缓解信号变弱，
          却不是永不消失的保证。
        </Def>
      </div>

      <TwoLayerBook />

      <Ledger title="alphagomoku/train.py · train_step">
        <p className="mb-3 text-sm">
          下面完整展示 <span className="mono">train_step</span> 从批次对称增广、张量搬运、重新前向、计算价值与策略损失到反向传播并一步更新权重的全部实现：
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
          "ReLU 门关死时该路径收不到梯度；残差捷径给出 1+F′ 的缓解，不是永不消失的保证。",
        ]}
        next={
          <>
            下一课看许多样本怎样形成一次更新。回放池用环形缓冲区装旧样本，攒够
            min_buffer 后均匀有放回地抽小批；棋盘与 π 同步做八种旋转镜像而 z 不转；
            然后接上真实优化器的动量、Nesterov、权重衰减，并接上检查点（checkpoint）与 latest
            的恢复口径。到那里，一次 train_step 才在完整的样本流水线上落位。
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
  border: "1px solid var(--hairline)",
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
    const raw = twoLayerStep(w1, w2, X, Z)
    const n = {
      w1: Math.max(-1, Math.min(1, raw.w1)),
      w2: Math.max(0, Math.min(3, raw.w2)),
    }
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
  const dim = dead ? { opacity: 0.45 } : undefined

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 13-1 · 双权重玩具：一层看子数，一层看输赢分</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[17rem]">
          <div className="mini-label">第一层 w₁（把子数变成中间数 h）范围：−1 → 1</div>
          <input type="range" min={-1} max={1} step={0.05} value={w1}
            onChange={(e) => {
              setW1(Number(e.target.value))
              setLast(null)
            }} aria-label="w1 滑杆"
            style={{ ["--fill" as string]: `${((w1 + 1) / 2) * 100}%` }}
            data-qa="w1-slider" />
          <div className="mini-label mt-3">第二层 w₂（把中间数读成输赢分 r）范围：0 → 3</div>
          <input type="range" min={0} max={3} step={0.05} value={w2}
            onChange={(e) => {
              setW2(Number(e.target.value))
              setLast(null)
            }} aria-label="w2 滑杆"
            style={{ ["--fill" as string]: `${(w2 / 3) * 100}%` }}
            data-qa="w2-slider" />

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
                w₁ {f2(last.b1)} → {f2(last.n1)}、w₂ {f2(last.b2)} → {f2(last.n2)}
              </p>
              <p className="num mt-0.5">
                玩具原始分数 r {f2(last.before.v)} → {f2(last.after.v)}
                {last.after.v < Z && last.before.v > Z ? "（跨过了 z=1）" : ""}、
                损失 {last.before.loss.toFixed(3)} → {last.after.loss.toFixed(3)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                第 3 课的「步子大，跨过最低点」就在这儿：从手推例出发，一步
                就从 {f2(last.before.v)} 跨到 {f2(last.after.v)}，
                {last.after.loss < last.before.loss ? "损失降了" : "损失反而升了"}
                {last.after.v < Z && last.before.v > Z ? "，而且跨过头了" : ""}。多走几步会自己荡回来。
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
            <div style={{ ...boxStyle, border: dead ? "1px solid var(--accent)" : "1px solid var(--hairline)", ...hi(2) }}>
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
            <div style={{ ...boxStyle, border: "1px solid var(--accent)", ...hi(7) }}>
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
        （真实配置是 0.01）；手推例的数字(3、1、
        0.25)和正文里的算式一个数都不差。
      </figcaption>
    </figure>
  )
}
