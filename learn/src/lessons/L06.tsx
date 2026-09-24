/** 第 13 课 · 反向传播：两种错误怎样改动所有权重。
 *  节拍：思考题 → 两笔真实损失 → 双权重手推(3 / 1 / 0.25)→ 链式四环 →
 *  门关死/梯度消失/残差捷径 → 例 13-1(拖 w₁/w₂ 前向反向联动)→ 对证(train_step)→ 小结 → 习题。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { twoLayer, twoLayerStep } from "../lib/foundations"

/* 手推例固定：x=2(窗口里己方子数)、z=+1(假设这盘训练对局后来由我赢);
 * w₁、w₂ 可拖，默认正例 0.5 / 1.5。 */
const X = 2
const Z = 1
const W1_0 = 0.5
const W2_0 = 1.5

export default function L06() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 13 课</div>
      <h1 className="text-2xl font-bold">反向传播：两种错误怎样改动所有权重</h1>

      <LessonGuide
        question="搜索给出 π、终局给出 z 后，两笔错误怎样沿真实计算路径回到每一个权重？"
        why="前面已经认识过策略头输出 logits，价值头输出 v_net，搜索制造 π，终局补上 z。完整反向传播必须等这些对象都出现后，才能说明真实网络到底在改什么。"
        chain={[
          "当前网络重新前向得到 logits 与 v_net",
          "π 与 z 分别计算策略损失和价值损失",
          "两笔损失相加后沿共享计算图反向接力",
          "每个权重按自己的梯度和学习率更新",
        ]}
        takeaway="反向传播不是平分损失，而是把两笔损失沿实际计算路径逐环相乘；共享主干会同时收到策略目标 π 和价值目标 z 的信号。"
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
              "选第二项。平摊并不公平：一个权重可能只顺路参与，另一个才大幅改变答案。训练要问的是「我把这个权重调一点，两笔损失会怎样变？」第 3 课已经定义过梯度；本课让梯度在真实的多层网络里走一遍。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>两笔损失各自指出一种错误</h3>
        <p>
          训练从存旧样本的回放池（第 12 课定义）抽到局面 s 后，会让<strong>当前网络重新做一次前向计算</strong>，
          得到 81 个 <span className="mono">logits</span> 和一个直接价值输出
          <span className="mono">v_net</span>（不经搜索，网络自己报的价值）。策略目标是搜索留下的 <span className="mono">π</span>，
          价值目标是终局补上的 <span className="mono">z</span>，它们扮演「标准答案」的角色。
          对局记录里保存的 <span className="mono">root_value</span> 只是搜索时顺手记下的数值，
          不参与这笔价值损失。
        </p>
        <Def term="训练目标" en="target, label">
          训练时充当标准答案的量。本课有两个：策略目标 π 是搜索留下的访问分布，
          价值目标 z 是终局补上的结果（赢 +1、输 −1、和 0）。
        </Def>
        <p>
          把「错多少」写成可比较的数，先看下文那台双权重玩具的手推例会得到什么，再看两条公式。
          玩具里网络给出 1.5、答案是 1，误差 0.5，取平方后损失是
          <span className="mono">0.25</span>；真实网络的价值损失也取这种平方，
          策略损失则比较网络给的落子概率 p 和目标 π。
        </p>
        <Def term="交叉熵" en="cross-entropy">
          策略损失。写成 <span className="mono">−Σπᵢ ln pᵢ</span>：
          π 大的格子若 p 很小，损失就会增大。不用平方损失 (π−p)²，是因为 p 已经很小时，再把 p 压得更低，
          惩罚也几乎不再涨，而 <span className="mono">−ln p</span> 在 p→0 时损失急剧增大：
          搜索看中的路，网络不许把它打成接近 0。
        </Def>
        <Def term="均方误差" en="mean squared error, MSE" see="第 14 课">
          逐样本的平方误差在一批样本上取平均（故称「均」方；代码 F.mse_loss 的 mean 就是这一步）；
          本课用它作价值损失，写成 <span className="mono">(v_net−z)²</span>：v_net 离 z 越远，
          损失越大，无论猜高还是猜低都为正。
        </Def>
        <div className="formula">
          L<sub>策略</sub> = −Σπᵢ ln pᵢ（交叉熵）　　L<sub>价值</sub> = (v_net−z)²（均方误差）
          <br />L<sub>总</sub> = L<sub>策略</sub> + L<sub>价值</sub>（两笔等权 1:1 是起点不是真理）
        </div>
        <p>
          以上两条公式算的是<strong>单条样本</strong>的量；一次更新在一批样本上各自取平均，总损失是一批一个标量。两笔的天然尺度并不相同：策略损失在 81 格上求和，价值损失只是一个平方，等权不等于同等影响；把价值权重调大，主干偏向读输赢、落子变粗，反之亦然。本项目固定 1:1。
        </p>
        <p>
          <span className="mono">p</span> 是网络在 81 个格子上的落子概率(即先验 P 的各分量,按惯例记小写 p)：logits 先过第 9 课的
          softmax，凑成和为 1 的 p。代码不先算 p 再取对数，而是一步算出 ln p，
          这一步合起来叫 log_softmax。 <span className="mono">ln</span> 是以 e 为底的对数，
          softmax 用的是它的反函数 exp。两个头读同一个主干（两头共用的那段网络），所以两份目标信号必须一起进入同一笔总损失。
        </p>
        <Def term="log_softmax" en="log-softmax">
          把 logits 变成落子概率 p 并一步算出 ln p 的运算。先算出可能极小的 p 再取对数
          容易数值不稳；合成一步更稳。
        </Def>

        <h3>四段变化率相乘得到两个梯度</h3>
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
          <span className="mono">w₁=0.5、w₂=1.5</span>，并假设终局标签是 <span className="mono">z=+1</span>。
          这台玩具故意省略 tanh（一种把输出压进 −1 到 +1 的函数），前向得到中间数 <span className="mono">h=1</span>、原始分 <span className="mono">r=1.5</span>，所以损失是
          <span className="mono">(1.5−1)²=0.25</span>。现在从这 0.25 分倒着问：怎么导出 3 和 1 两个梯度？
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
          复合函数求导时沿路径逐段相乘的规则。它不是新魔法，就是把同一条路径上的局部变化率乘起来：
          每一环回答「那边调一点点，这边变多少」。
        </Def>
        <div className="formula mt-3">
          ∂损失/∂w₁ = <span className="hl">2(r−z)</span> × <span className="hl">w₂</span> ×
          <span className="hl">门</span> × <span className="hl">x</span> = 1 × 1.5 × 1 × 2 =
          <span className="hl">3</span>
          <br />∂损失/∂w₂ = 2(r−z) × h = 1 × 1 = <span className="hl">1</span>
        </div>

        <h3>门关死、梯度消失与残差捷径</h3>
        <p>
          若把 w₁ 调到 −0.5，玩具中的 ReLU 会让 <span className="mono">h=0</span>；w₂ 的梯度式里含因子
          h，而 h=0，w₁ 的路径也断在门=0，所以这条路径两个权重都收不到更新。真实网络还有其他通道，
          不能因此断言整张网络都收不到信号；这个例子只说明门关上时该路径不会更新。
        </p>
        <p>
          深层里很多小于 1 的影响连续相乘，会让靠前的层更新变弱。残差块的
          <span className="mono">x+F(x)</span> 在出口 ReLU 之前留下一条梯度为 1 的捷径，
          用来缓解这种变弱。
        </p>
        <Def term="梯度消失" en="vanishing gradient">
          深层网络里若许多局部变化率的绝对值小于 1，连乘就会消失（大于 1 则相反地爆炸，exploding gradient），靠前的层各权重的梯度极小，几乎不更新。
          残差捷径这一段的总梯度是 <span className="mono">1+F′</span>
          （出口还有一次 ReLU，总梯度还要再乘那道门），能缓解信号变弱，
          却不是永不消失的保证。
        </Def>
      </div>

      <TwoLayerBook />

      <Ledger title="train.py · train_step（前向 → 两笔损失 → 反向传播 → 更新）">
        <Def term="数据增强" en="data augmentation" see="第 14 课">
          从若干等价视图里随机取一种来呈现当前样本,不增加样本条数。本课只用到「批次在喂网络前已经增广过」这一件事。
        </Def>
        <p className="mb-2 text-sm" style={{ color: "var(--fg-faint)" }}>
          节选从已增广的批次开始。真正的 train_step 在喂网络前，还把每张棋盘和 π 一起做
          8 种旋转/翻折之一。
        </p>
        <div className="codewalk">
          <pre>{`logits, v_net = net(x)                       # 当前网络重新前向
value_loss = F.mse_loss(v_net, target_z)      # 价值目标 z
logp = F.log_softmax(logits, dim=-1)
policy_loss = -(target_pi * logp).sum(dim=-1).mean() # 策略目标 π
loss = value_loss + policy_loss
optimizer.zero_grad()
loss.backward()
optimizer.step()`}</pre>
        </div>
        <p className="mt-3">
          先清旧梯度，再沿<strong>这次</strong>总损失反向接力，最后由优化器更新全部参数。
          这段代码没有读取搜索时记下的 root_value：它只使用重新计算的 v_net、目标 z 和目标 π。
          真实的优化器还带三件配套工具，第 3 课点过名。
        </p>
        <Def term="动量、Nesterov 与权重衰减" en="momentum, Nesterov, weight decay" see="第 14 课">
          真实优化器的三件配套工具，分别用来稳住更新方向、先按惯性探一步再算梯度、
          每次更新把权重往零轻拽。它们只改变「怎么调」，不改变「算什么损失」。
        </Def>
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
            然后接上真实优化器的动量、Nesterov、权重衰减，并说清 checkpoint 与 latest
            的恢复口径。到那里，一次 train_step 才在完整的样本流水线上落位。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 14 课"
        onAllCorrect={() => pass("l13")}
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
              "在这个玩具中：往 w₂ 的方向，r=w₂·h 里 h=0，调 w₂ 不改变原始分；往 w₁ 的方向，门的影响是 0，接力断链。真实网络还有其他路径，不能直接推出整张网络都没有信号；这个例子只让你看清「门关上时，这条路径不会更新」。",
          },
          {
            q: "为什么真实训练会把策略和价值两笔损失加成总损失，再一起反向传播？",
            options: [
              "因为只要把两个数字相加，训练速度一定翻倍",
              "同一组权重同时影响「下哪」和「谁优」；把两份反馈合起来，主干才能同时朝两种目标调整",
              "因为终局 z 和搜索 π 本来就是同一个数",
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

/* ============ 例 13-1 · 两层梯度：前向反向联动 + 走一步 ============ */

const boxStyle = {
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  padding: "0.3rem 0.55rem",
  minWidth: "5.2rem",
  textAlign: "center" as const,
}
const arrow = <span style={{ color: "var(--fg-faint)" }}>→</span>

function TwoLayerBook() {
  const [w1, setW1] = useState(W1_0)
  const [w2, setW2] = useState(W2_0)
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
  const dim = dead ? { opacity: 0.45 } : undefined

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 13-1 · 两层统计：一层看子数，一层看输赢分</span>
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
              x = 2（这扇窗里有 2 颗己方子）、z = +1（假设训练对局后来我赢）。拖 w₁
              <strong>穿过 0</strong>：看这道<strong>双权重玩具题</strong>的反向梯度列全部变为 0。
              ReLU 门关上后，这条路径不会更新。
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn primary" onClick={stepOnce} data-qa="step-btn">
              走一步(lr = 0.1)
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
                玩具原始分 r {f2(last.before.v)} → {f2(last.after.v)}
                {last.after.v < Z && last.before.v > Z ? "（跨过了 z=1）" : ""}、
                损失 {last.before.loss.toFixed(3)} → {last.after.loss.toFixed(3)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                第 3 课的「步子大，跨过最低点」就在这儿：从手推例出发，一步
                就从 1.5 跨到 0.56，损失降了，但跨过头了。多走几步会自己荡回来。
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">前向：x → s → h → r（玩具原始分） → 损失</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="fwd-chain">
            <div style={boxStyle}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>x 子数</div>
              <div className="num font-bold">{X}</div>
            </div>
            {arrow}
            <div style={boxStyle}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>s = w₁·x</div>
              <div className="num font-bold">{g.s.toFixed(2)}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, border: dead ? "1px solid var(--accent)" : "1px solid var(--hairline)" }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>h = ReLU(s)</div>
              <div className="num font-bold" style={{ color: dead ? "var(--accent-deep)" : undefined }}>
                {g.h.toFixed(2)}
              </div>
            </div>
            {arrow}
            <div style={boxStyle}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>r = w₂·h</div>
              <div className="num font-bold">{g.v.toFixed(2)}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, borderColor: "var(--accent)" }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>损失 (r−z)²</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.loss.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="mini-label mt-5">反向：损失 → 接力四环 → w₁ 的梯度</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="bwd-chain">
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>① 损失对 r</div>
              <div className="num font-bold">2(r−z) = {g.dv.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>② r 对 h</div>
              <div className="num font-bold">w₂ = {w2.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, border: "1px solid var(--accent)" }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>③ 门(s&gt;0 才开)</div>
              <div className="num font-bold" style={{ color: dead ? "var(--accent-deep)" : undefined }}>
                {g.gate}
              </div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>④ s 对 w₁</div>
              <div className="num font-bold">x = {X}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>=</span>
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...dim }}>
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
              纯梯度下降不会把这条路径救活：梯度为 0 是不动点。演示里的「拖回」是你在拖滑杆；真实网络里可能翻案的是 LeakyReLU 一类设计（负区仍有梯度）、卷积权重共享下其他位置的梯度，或其他路径的扰动（这族问题叫 dying ReLU；注意权重衰减救不活它：w₁ 只会带号趋近 0，到 0 处门仍关着）。
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              接力链四环相乘：{g.dv.toFixed(2)} × {w2.toFixed(2)} × 1 ×{" "}
              {X} = {g.dW1.toFixed(2)}(w₁ 的梯度)。每一环都是「那边调一点点，
              这边变多少」。反向传播没有别的魔法，只是把第 3、4 课的变化率沿网络
              反向乘了一遍。
            </p>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 13-1</span>
        前向与反向同一套数(lib/foundations.ts 的{" "}
        <span className="mono">twoLayer</span>)：拖任何一个权重，两个梯度同时更新。
        「走一步」就是真训练的那一步：w ← w − 0.1×梯度；手推例的数字(3、1、
        0.25)和正文里的算式一个数都不差。
      </figcaption>
    </figure>
  )
}
