/** 第 6 课 · 回摊:责任怎么找到每个旋钮(地基篇 4/4)。
 *  节拍:谜题(罚分怎么落到旋钮头上)→ 揭晓(还第 5 课的账/一层责任=原料/
 *  变化率接力·手推数字例/梯度死/残差)→ 部件(两层账本:拖 w₁/w₂ 前向反向
 *  联动,拖 w₁ 穿 0 看账目熄灯;lr=0.1 走一步)→ 对账(train.py backward)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { twoLayer, twoLayerStep } from "../lib/foundations"

/* 手推例固定:x=2(窗口里己方子数)、z=+1(这盘我赢);
 * w₁、w₂ 可拖,默认正例 0.5 / 1.5。 */
const X = 2
const Z = 1
const W1_0 = 0.5
const W2_0 = 1.5

export default function L06() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 6 课</div>
      <h1 className="text-2xl font-bold">回摊:责任怎么找到每个旋钮</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "玩具网络答错了一道题:它说 v=1.5,真答案 z=1,罚了 0.25 分。这道题经过了两个旋钮(w₁、w₂)。这笔罚分,该怎么落到每个旋钮头上?",
            options: [
              "平摊:两个旋钮各记一半,公平",
              "按影响摊:谁对答案的影响大,谁多担——「影响」怎么算,正是要揭晓的账法",
              "不用摊:把两个旋钮都重置成随机数,重新来",
            ],
            answer: 1,
            explain:
              "选 B。平摊听着公平,实则冤枉:一个旋钮可能只顺路搭了句话,另一个才是主谋。按影响摊,要回答「这个旋钮拧一点点,罚分会变多少」——这正是第 3 课立的账目。账目怎么穿过层层运算找到每个旋钮,就是本课的「回摊」。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 变化率接力,逐环相乘</h3>
        <p>
          <strong>先还第 5 课一笔账。</strong>纯乘纯加的两层,叠了白叠
          (w₂·(w₁·x) = (w₂·w₁)·x)——所以真网络在每次求和之后都插一道弯折,
          本课的例子就带弯折。<em>一层看子、一层看势</em>:第一层把「窗口里
          己方子数」(x)折成形势分,第二层把形势分读成赢面 v。玩具长这样:
        </p>
        <div className="formula">
          h = ReLU(w₁·x) → v = w₂·h → 罚分 = (v − z)²
        </div>
        <p>
          <strong>① 一层的责任 = 它烧的原料。</strong>第 4 课判过:每个权重的账,
          恰好是它乘的那份输入。要把「罚分对 v 的账」摊回 w₁、w₂,只需沿网络
          <em>反向</em>把变化率一环环乘回去——教科书叫链式法则,本站叫
          <strong>变化率接力</strong>。
        </p>
        <p>
          <strong>② 手推一遍(数字例)。</strong>x=2、w₁=0.5、w₂=1.5、z=1:
          前向 s=w₁·x=<strong className="num">1</strong>,h=ReLU(1)=
          <strong className="num">1</strong>,v=w₂·h=<strong className="num">1.5</strong>,
          罚分=(1.5−1)²=<strong className="num">0.25</strong>。反向接力,
          从罚分那头往回走四环:
        </p>
        <div className="formula">
          ∂罚/∂w₁ = <span className="hl">2(v−z)</span> ×{" "}
          <span className="hl">w₂</span> × <span className="hl">门</span> ×{" "}
          <span className="hl">x</span> = 1 × 1.5 × 1 × 2 ={" "}
          <span className="hl">3</span>
          <br />∂罚/∂w₂ = 2(v−z) × h = 1 × 1 ={" "}
          <span className="hl">1</span>
        </div>
        <p>
          ReLU 的账拆两环看:<em>门</em>的账(正分区 1、负分区 0)乘<em>输入</em>的
          账 x——负分区门关死,后面乘什么都归 0。这套接力沿 7 层真网络一路乘到
          底,就是「反向传播」:每个 14.5 万旋钮各领到自己的账,一次算清。
        </p>
        <p>
          <strong>③ 梯度死:整条样本失声。</strong>把 w₁ 拧到 −0.5:s=−1、
          h=0、v=0、罚分=1——但两个旋钮的账<strong>全是 0</strong>:w₂ 的账
          恰是它乘的 h(=0);接力链断在「门」那环。深栈里负分区串成片,
          信号就死在里面。部件里拖 w₁ 穿过 0,亲眼看账目熄灯。
        </p>
        <p>
          <strong>④ 深栈的另一种死:梯度消失,残差是解药。</strong>七层接力,
          每环的账多半小于 1,连乘是几何衰减——账还没走到底层就缩成 0。
          残差的捷径治这个:直路是加法,加法对输入的账恰好是
          <strong className="num">1</strong>(精确,不随权重变);总账 =
          直路的 1 + 弯路的 F′。F′ 学成 0(这块啥也不修)时总账正好 1,
          信号原样通过;直路那份 1 不参与任何连乘——这才是「摔不死」的出处。
          (不说「账恒 1」:总账 1+F′,F′ 为负时比 1 还小。)
        </p>
      </div>

      <TwoLayerBook />

      <Ledger title="train.py L48-55(一步训练:前向 → 罚分 → 回摊 → 拧旋钮)">
        <div className="codewalk">
          <pre>{`# train.py L48-55  你手推过的那套接力,torch 一行做完
logits, v = net(x)                # 前向:14.5 万旋钮层层计票、弯折
value_loss = F.mse_loss(v, target_z)
policy_loss = -(target_pi * logp).sum(dim=-1).mean()
loss = value_loss + policy_loss

optimizer.zero_grad()             # 清掉上一批的旧账
loss.backward()                   # 回摊:罚分沿网络反向接力,
                                  #   每个旋钮各领到自己的账
optimizer.step()                  # 下山:每个旋钮按账挪 lr 那么多`}</pre>
        </div>
        <p className="mt-3">
          <span className="mono">loss.backward()</span> 就是本课整套变化率接力
          ——torch 把四环乘法沿 7 层网络自动接完,你手推的正是它内部的账法。
          至此四门地基课闭环:第 3 课立「账目」、第 4 课给第一个公式
          (∂z/∂w=x)、本课把账接成链——「学习」的全部机制你已经亲手算过一遍。
          下一课回到棋盘,看这套机制怎么吃掉「三张平面」。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 7 课"
        onAllCorrect={() => pass("l06")}
        questions={[
          {
            q: "回摊(反向传播)在干什么?",
            options: [
              "把罚分平分给每个旋钮",
              "变化率接力:罚分对答案的账,沿网络反向逐环相乘,摊到每个旋钮——谁影响大,谁的账大",
              "把答错的题存起来下次重考",
            ],
            answer: 1,
            explain:
              "接力链四环:2(v−z) × w₂ × 门 × x——每一环都是「那边拧一点点,这边变多少」。平摊冤枉人:重置随机数更糟,把学到的全扔了。",
          },
          {
            q: "w₁ 拧成负的(s<0),为什么两个旋钮的账全变 0?",
            options: [
              "因为负权重不许训练",
              "ReLU 门关死:h=0,而 w₂ 的账恰是它乘的 h;接力链又断在「门」那环——这条样本对两个旋钮全部失声(梯度死)",
              "因为罚分太小,四舍五入成 0",
            ],
            answer: 1,
            explain:
              "两层一起哑:往 w₂ 方向,v=w₂·h 里 h=0,拧 w₂ 纹丝不动;往 w₁ 方向,门的账是 0,接力断链。深栈里负分区串成片,整块网络学不到东西——这就是残差要治的第二种死(第一种是连乘衰减)。",
          },
          {
            q: "残差的「摔不死」,力量从哪来?",
            options: [
              "捷径让网络层数变少、算得快",
              "直路是加法,对输入的账恰好是 1、不参与连乘:总账=1+F′,F′ 学成 0 时信号原样通过",
              "捷径自带一个额外的训练信号",
            ],
            answer: 1,
            explain:
              "加法的账精确是 1——多深的栈,这份 1 都原样传到底。注意口径:总账是 1+F′ 不是「恒 1」,F′ 为负时总账比 1 还小;但直路那份 1 独立于所有权重,永不衰减,这才是底座的意义。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 6-1 · 两层账本:前向反向联动 + 走一步 ============ */

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
              x = 2(这扇窗里有 2 颗己方子)、z = +1(这盘我赢)。拖 w₁
              <strong>穿过 0</strong>:看反向的账目列整体熄灯——那条样本
              对两个旋钮全部失声,梯度死。
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
                v {f2(last.before.v)} → {f2(last.after.v)}
                {last.after.v < Z && last.before.v > Z ? "(跨过了 z=1)" : ""}、
                罚分 {last.before.loss.toFixed(3)} → {last.after.loss.toFixed(3)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                第 3 课的「步子大,跨过谷底」在这里现身:一步从 1.5 跨到 0.56,
                罚分降了,但跨过头了——多走几步会自己荡回来。
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">前向:x → s → h → v → 罚分</div>
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
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>v = w₂·h</div>
              <div className="num font-bold">{g.v.toFixed(2)}</div>
            </div>
            {arrow}
            <div style={{ ...boxStyle, borderColor: "var(--accent)" }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>罚分 (v−z)²</div>
              <div className="num font-bold" style={{ color: "var(--accent-deep)" }}>
                {g.loss.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="mini-label mt-5">反向:罚分 → 接力四环 → w₁ 的账</div>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-qa="bwd-chain">
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>① 罚对 v</div>
              <div className="num font-bold">2(v−z) = {g.dv.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, ...dim }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>② v 对 h</div>
              <div className="num font-bold">w₂ = {w2.toFixed(2)}</div>
            </div>
            <span style={{ color: "var(--fg-faint)", ...dim }}>×</span>
            <div style={{ ...boxStyle, border: "1px solid var(--accent)" }}>
              <div className="text-[0.62rem]" style={{ color: "var(--fg-faint)" }}>③ 门 [s&gt;0]</div>
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
              <strong>门关死:梯度死。</strong>s ≤ 0,h=0——w₂ 的账恰是它乘的 h
              (0),w₁ 的接力断在第③环(门=0)。这条样本对两个旋钮
              <strong>全部失声</strong>:罚分明明是 {g.loss.toFixed(2)},
              却没有一个旋钮知道该动。把 w₁ 拖回正的,账目复明。
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
        <span className="cap-no">部件 6-1</span>
        前向与反向同一套数(lib/foundations.ts 的{" "}
        <span className="mono">twoLayer</span>):拖任何一个旋钮,两本账同时更新。
        「走一步」是真梯度步 w ← w − 0.1×账;手推例的数字(3、1、0.25)与
        揭晓里的算式逐位一致。
      </figcaption>
    </figure>
  )
}
