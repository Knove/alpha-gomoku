/** 第 11 课 · 回摊:两种错误怎样改动所有旋钮。
 *  节拍:谜题(π/z 两位老师怎么一起改网络)→ 揭晓(两笔罚分→最小两旋钮显微镜→
 *  变化率接力)→ 部件(拖 w₁/w₂ 前向反向联动)→ 想深挖(门/梯度消失/残差)→
 *  对账(train.py backward)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { twoLayer, twoLayerStep } from "../lib/foundations"

/* 手推例固定:x=2(窗口里己方子数)、z=+1(假设这盘训练对局后来由我赢);
 * w₁、w₂ 可拖,默认正例 0.5 / 1.5。 */
const X = 2
const Z = 1
const W1_0 = 0.5
const W2_0 = 1.5

export default function L06() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 11 课</div>
      <h1 className="text-2xl font-bold">回摊:两种错误怎样改动所有旋钮</h1>

      <LessonGuide
        question="搜索给出 π、终局给出 z 后，这两种错误怎样不靠猜测地回到约 14.5 万颗旋钮？"
        why="你现在已经看见完整机器：双头给出落子分和赢面，搜索把落子分变成更丰富的 π，终局给出 z。下一问自然是：这些老师答案怎样真的改变整张网络？"
        chain={[
          "双头给出落子分和赢面 v",
          "搜索的 π 与终局 z 分别指出两类错误",
          "从两笔罚分倒着沿计算路径分账",
          "每颗旋钮按自己的方向微调，下一轮判断才可能更准",
        ]}
        takeaway="反向传播不是平分罚分，而是沿实际计算路径回溯影响；策略和价值两笔错误加在一起，给每颗旋钮各算一笔方向账。"
        boundary="两旋钮例子只是显微镜，并故意省略了第 9 课价值头最后的 tanh；它的原始分 r 可以超过 ±1，不能和真实价值输出 v 混为一谈。门关死、梯度消失、残差的精确数学放在本页“想深挖”。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "第 9 课的双头给出两类答案，第 10 课的搜索给出 π，终局给出 z。两笔罚分要怎样改变全部旋钮？",
            options: [
              "平摊：每颗旋钮各记一半，听起来最公平",
              "按影响回摊：谁对两笔答案影响大，谁收到的更新信号就大",
              "重置：把所有旋钮都设回随机数，重新来",
            ],
            answer: 1,
            explain:
              "选第二项。平摊听着公平，其实会冤枉人：一颗旋钮可能只顺路参与，另一颗才大幅改变答案。训练要问的是“我把这颗旋钮调一点，两笔罚分会怎样变？”第 3 课立过这本方向账；本课把它穿过真实的多层机器。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 两位老师都说“错了”，但各颗旋钮不能平均挨罚</h3>
        <p>
          先把上一课见过的完整机器接起来。策略头给每个落点一个分，搜索把这些分和推演结果
          变成老师 <span className="mono">π</span>；价值头给出赢面 <span className="mono">v</span>，
          终局给出老师 <span className="mono">z</span>。训练会计算“落子答案离 π 多远”和
          “赢面答案离 z 多远”两笔罚分，再把它们加成一张总账。
        </p>
        <div className="formula">
          策略：落子分 ↔ π　＋　价值：v ↔ z　→　总罚分 → 更新全部旋钮
        </div>
        <p>
          <strong>回摊要解决的不是“有没有错”，而是“该改谁、改哪边”。</strong>第 4 课已经看过：
          一个权重改一点，它所乘的证据会决定分数改多少。现在从总罚分倒着走，沿实际计算路径
          逐段追问“这一处小变化会传多远”。教科书叫它反向传播；这里把它叫<strong>变化率接力</strong>。
        </p>
        <p>
          <strong>先用两颗旋钮看清规则。</strong>令 <span className="mono">x=2</span> 是一条教学读数，
          <span className="mono">w₁=0.5、w₂=1.5</span>，并假设终局标签是 <span className="mono">z=+1</span>。
          这台玩具故意省略 tanh，前向计算得到原始分 <span className="mono">h=1、r=1.5</span>，所以罚分是
          <span className="mono">(1.5−1)²=0.25</span>。现在从这 0.25 分倒着问：两颗旋钮各要承担多少？
        </p>
        <div className="formula">
          w₁ 的方向账 = <span className="hl">3</span>　　w₂ 的方向账 = <span className="hl">1</span>
        </div>
        <p>
          这里 <span className="mono">w₁</span> 的方向账更大，因为它的影响会继续穿过
          <span className="mono">w₂</span> 和输入 <span className="mono">x</span>；两颗旋钮不是各分一半。
          方向账为正，训练就把旋钮往能减小罚分的反方向调；为负则反过来。网页部件让你亲手拖动，
          看前向答案、两本方向账和“一步更新”同时变化。
        </p>
        <details className="account-book mt-5">
          <summary>想深挖 · 四段变化率怎样乘成上面的两本账</summary>
          <div className="formula mt-3">
            ∂罚/∂w₁ = <span className="hl">2(r−z)</span> × <span className="hl">w₂</span> ×
            <span className="hl">门</span> × <span className="hl">x</span> = 1 × 1.5 × 1 × 2 =
            <span className="hl">3</span>
            <br />∂罚/∂w₂ = 2(r−z) × h = 1 × 1 = <span className="hl">1</span>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
            ∂罚/∂w₁ 读作“罚分对 w₁ 的方向账”。四段依次是：平方罚分怎样响应误差、
            中间量怎样影响原始分 r、ReLU 的门是否放行、输入 x 怎样影响第一颗旋钮。真实网络把同样的
            接力沿许多层和通道自动算完，这就是 <span className="mono">loss.backward()</span>。
          </p>
        </details>
        <details className="account-book mt-3">
          <summary>想深挖 · 门关死、方向变弱与残差捷径</summary>
          <div className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
            <p>
              若把 w₁ 拧到 −0.5，玩具中的 ReLU 会让 <span className="mono">h=0</span>；这条路径上
              两颗旋钮的方向账都变为 0，叫“梯度死”的最小例子。真实网络有其他通道和路径，不能据此
              说整条样本完全失声。
            </p>
            <p className="mt-2">
              深层里很多小于 1 的影响连续相乘也会让早层更新变弱。第 8 课见过的残差连接让一层学习
              <span className="mono">x + F(x)</span> 的小修正；当末端门打开时，直路能帮助信号传递。
              它是常见缓解手段，不是永远有效的保证。
            </p>
          </div>
        </details>
      </div>

      <TwoLayerBook />

      <Ledger title="train.py L48-55(一步训练:前向 → 罚分 → 回摊 → 拧旋钮)">
        <div className="codewalk">
          <pre>{`# train.py L48-55  你手推过的那套接力,torch(真训练用的软件)一行做完
logits, v = net(x)                # 前向:14.5 万旋钮层层计票、弯折
value_loss = F.mse_loss(v, target_z) # 赢面那笔罚分:差的平方
policy_loss = -(target_pi * logp).sum(dim=-1).mean() # 下哪步那笔,用到对数:第 12 课对账
loss = value_loss + policy_loss # 两笔罚分加成一笔总账

optimizer.zero_grad()             # 清掉上一批的旧账
loss.backward()                   # 回摊:罚分沿网络反向接力,
                                  #   每个旋钮各领到自己的账
optimizer.step()                  # 下山:每个旋钮按账挪 lr 那么多`}</pre>
        </div>
        <p className="mt-3">
          网络一次交两份答案：<span className="mono">v</span> 是赢面，<span className="mono">logits</span>
          是每个落子格的分；罚分也有两笔，加成总账后一起回摊。
          <span className="mono">loss.backward()</span> 就是本课的变化率接力——软件把同样的
          规则沿整张网络自动算完。现在你已把第 3–5 课的旋钮、计票、弯折，和第 6–10 课的
          输入、双头、搜索接成了一条“老师答案 → 更新旋钮”的链。下一课会把很多盘这样的作业攒起来，
          让链条变成飞轮。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 12 课"
        onAllCorrect={() => pass("l06")}
        questions={[
          {
            q: "回摊（反向传播）在干什么？",
            options: [
              "把罚分平分给每个旋钮",
              "变化率接力：两笔罚分对答案的影响，沿网络反向逐环相乘，摊到每个旋钮——谁影响大，谁的更新信号大",
              "把答错的题存起来下次重考",
            ],
            answer: 1,
            explain:
              "核心不是平摊，而是沿实际路径计影响：某颗旋钮调一点会怎样改变输出，输出又会怎样改变总罚分。两笔训练目标最后一起形成更新信号；两旋钮的公式只是把这条规则放大给你看。",
          },
          {
            q: "在两旋钮玩具里，w₁ 拧成负的（s&lt;0）时，为什么两个方向账都变 0？",
            options: [
              "因为负权重不许训练",
              "在这个两旋钮玩具里，ReLU 门关死：h=0，而 w₂ 的账恰好乘 h；w₁ 的路径也断在门上，所以两颗旋钮的账都为 0",
              "因为罚分太小,四舍五入成 0",
            ],
            answer: 1,
            explain:
              "在这个玩具中：往 w₂ 的方向，r=w₂·h 里 h=0，拧 w₂ 不改变原始分；往 w₁ 的方向，门的影响是 0，接力断链。真实网络还有其他路径，不能直接推出整张网络都没有信号；这个例子只让你看清“门关上时，这条路径不会更新”。",
          },
          {
            q: "为什么真实训练会把策略和价值两笔罚分加成总账，再一起回摊？",
            options: [
              "因为只要把两个数字相加，训练速度一定翻倍",
              "同一组旋钮同时影响“下哪”和“谁优”；把两份反馈合起来，主干才能同时朝两种目标调整",
              "因为终局 z 和搜索 π 本来就是同一个数",
            ],
            answer: 1,
            explain:
              "双头各有自己的老师：π 指出搜索后更值得尝试的落子，z 指出最终输赢。它们读的是同一份主干理解，因此总账会把两种反馈一起交给同一批旋钮；这不是把两个目标混为一谈，而是让共享部分同时收到两种信号。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 11-1 · 两层账本:前向反向联动 + 走一步 ============ */

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
        <span className="mini-label">部件 · 两层账本:一层看子,一层看势</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[17rem]">
          <div className="mini-label">第一层 w₁(看子:子数折形势)−1 → 1</div>
          <input type="range" min={-1} max={1} step={0.05} value={w1}
            onChange={(e) => {
              setW1(Number(e.target.value))
              setLast(null)
            }} aria-label="w1 滑杆"
            style={{ ["--fill" as string]: `${((w1 + 1) / 2) * 100}%` }}
            data-qa="w1-slider" />
          <div className="mini-label mt-3">第二层 w₂(看势:形势读赢面)0 → 3</div>
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
              <strong>穿过 0</strong>：看这道<strong>两旋钮玩具题</strong>的反向账目列整体熄灯——
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
                {last.after.v < Z && last.before.v > Z ? "(跨过了 z=1)" : ""}、
                罚分 {last.before.loss.toFixed(3)} → {last.after.loss.toFixed(3)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                第 3 课的「步子大,跨过谷底」就在这儿:从手推例出发,一步
                就从 1.5 跨到 0.56,罚分降了,但跨过头了——多走几步会自己荡回来。
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">前向:x → s → h → r(玩具原始分) → 罚分</div>
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
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>罚分 (r−z)²</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.loss.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="mini-label mt-5">反向:罚分 → 接力四环 → w₁ 的账</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="bwd-chain">
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>① 罚对 r</div>
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
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>④ h 对 w₁</div>
              <div className="num font-bold">x = {X}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>=</span>
            <div style={{ ...boxStyle, borderColor: "var(--accent)", ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>w₁ 的账</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.dW1.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" data-qa="bwd-w2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>
              w₂ 的账(只两环:① × h) =
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
              <strong>门关死:梯度死。</strong>s 掉到 0 或 0 以下(记号写作
              s ≤ 0),h=0——w₂ 的账恰好是它乘的 h(0),w₁ 的接力断在
              第③环(门=0)。在这道<strong>两旋钮玩具题</strong>里，两个旋钮都暂时
              <strong>收不到方向账</strong>：罚分明明是 {g.loss.toFixed(2)}，却没有一个旋钮知道该动。
              把 w₁ 拖回正的，账目复明。
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              接力链四环相乘:{g.dv.toFixed(2)} × {w2.toFixed(2)} × 1 ×{" "}
              {X} = {g.dW1.toFixed(2)}(w₁ 的账)。每一环都是「那边拧一点点,
              这边变多少」——回摊没有任何魔法,只是把第 3、4 课的账目沿网络
              反向乘了一遍。
            </p>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 11-1</span>
        前向与反向同一套数(lib/foundations.ts 的{" "}
        <span className="mono">twoLayer</span>):拖任何一个旋钮,两本账同时更新。
        「走一步」就是真训练的那一步:w ← w − 0.1×账;手推例的数字(3、1、
        0.25)和揭晓里的算式一个数都不差。
      </figcaption>
    </figure>
  )
}
