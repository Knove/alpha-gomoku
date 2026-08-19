/** 第 8 课 · 飞轮:数据怎么转成棋力。
 *  节拍:谜题(数据从哪来?)→ 揭晓五小节(自我对弈 (s,π,z)/经验池/对称增广/
 *  损失两条/真数据卡)→ 部件((s,π,z) 解剖台·真数据 / 损失计算器+交叉熵手算 /
 *  8 对称变换台 / 真实曲线)→ 对账(selfplay·train·replay)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { dihedral, dihedralPi, emptyBoard, play, type GameState } from "../engine/game"

const GAME = REAL.selfplayGame
const MOVES = GAME.moves
const M = REAL.metrics

/* 逐手重建局面(与序回放同款):states[i] = 第 i 手落下之前。 */
const STATES: GameState[] = (() => {
  const arr: GameState[] = [emptyBoard()]
  for (const m of MOVES) arr.push(play(arr[arr.length - 1], m.y * 9 + m.x, m.player as 1 | -1))
  return arr
})()

/** z 永远站在「那一手的行棋方」:我赢 +1 / 我输 −1 / 和 0(终局才知道,统一补)。 */
const zOf = (i: number) => {
  const r = GAME.result
  const p = MOVES[i].player
  return r === 0 ? 0 : p === r ? 1 : -1
}

const LN = Math.log
const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

export default function L08() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 8 课</div>
      <h1 className="text-2xl font-bold">飞轮:数据怎么转成棋力</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "本站的网络从随机噪声起步——没人给它一盘人类棋谱。训练要吃的数据,从哪来?",
            options: [
              "网上下载人类高手的棋谱",
              "它自己跟自己下,棋谱一盘盘自己长出来",
              "请人手工标注每一手的优劣",
            ],
            answer: 1,
            explain:
              "选 B。这正是「从零自学」的招牌:左右互搏,每盘棋的每一手都榨出一条作业,作业攒进池子喂训练,训练出的新网络再去下更多棋——飞轮转起来,棋谱自己长。A 违背「没有老师」的军令状;C 更不可能:要是有能力标注每一手,还要它学什么?",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 一盘棋榨出一条条作业</h3>
        <p>
          <strong>① 自我对弈:每一手记三样。</strong>最新网络左右互搏,
          每一手落子之前,系统记下一个三元组 <em>(s, π, z)</em>:<em>s</em> 是局面,
          <em>π</em> 是搜索 40 次投出的访问分布(第 7 课的总结算),<em>z</em>{" "}
          是这盘棋的最终胜负——下这手时谁也不知道,终局才统一补上。关键在{" "}
          <strong>π 是比裸网强的老师</strong>:裸网只是「看一眼」的第一印象,
          π 是「再想四十遍」之后的深思——拿 π 当作业答案,学生(网络)学的是
          比自己强一截的走法,飞轮才转得动。z 逐手换视角:那一手轮到谁,
          「我」就是谁——我赢 +1、我输 −1(黑白每换一手,符号翻一次,第 2 课的铁约)。
        </p>
        <p>
          <strong>顺带还一笔第 7 课的债。</strong>那个一手成五的 F5,在没训几轮的
          先验里前面压着 56 个点,40 次预算全被网络偏爱的点借走,拉到 770 次探索项
          才把它送进来——搜索放大直觉,直觉弱时预算也追不回。还债的正是这只
          飞轮:自我对弈里每撞见一个真终局,「成五就赢」就以 z 和 π 的样子
          灌回训练——价值头先学会看见成五,先验跟着把成五的点抬上来。直觉
          变准,压在 F5 前面的 56 个点才会让开,同样的 40 次预算才花得值。搜索
          养在直觉上,飞轮养着直觉——第 7 课和这一课,本来就是一个零件的两半。
        </p>
        <p>
          <strong>② 经验池:作业攒着、混着批改。</strong>新下的棋不是现做现扔,
          而是倒进一个滑动池子(写满一圈从头覆盖),每步训练从池里
          <em>随机</em>抓一把。若只用刚下完的几盘训练,网络会全力模仿
          「昨天的自己」——连怪着一起模仿,越学越像昨天。混着批,是防过拟合
          昨天的自己的第一道闸。
        </p>
        <p>
          <strong>③ 对称增广:一份棋谱八份用。</strong>五子棋的棋理对旋转镜像免疫:
          同一个三连转 90° 还是三连,该下的点跟着转过去就是。于是每条样本上阵前
          随机抽一种变换(4 种旋转 × 是否镜像,共 8 种),<em>棋盘和 π 同步转</em>
          再喂给网络。「同步」是硬前提:π 是 81 个格子上的分布,棋盘转了,
          每个概率都得跟着搬到新坐标——只转棋盘不转 π,等于把答案贴到无关的格子上。
          z 是一个数,不用转。
        </p>
        <p>
          <strong>④ 损失两条:判卷怎么判。</strong>训练时网络的答案和老师的答案差多少,
          一条损失、两项判卷:<em>策略头离 π 有多远</em>(交叉熵:π 集中的地方,
          网络的概率也得跟上)+ <em>价值头离 z 有多远</em>(平方差:网络说能赢,
          结果输了,罚)。下面的部件让你亲手拖一拖这两笔罚分。
        </p>
        <p>
          <strong>⑤ 真数据卡:第 2 轮的一圈飞轮。</strong>下面每个数字都来自那次
          真实训练的 metrics 记录:
        </p>
        <div className="formula">
          第 2 轮:自我对弈产出 <span className="hl">{M[2].buffer - M[1].buffer}</span>{" "}
          条新样本 → 池子 {M[1].buffer} + {M[2].buffer - M[1].buffer} ={" "}
          <span className="hl">{M[2].buffer}</span> 条;训练后价值损失{" "}
          {M[1].value_loss!.toFixed(3)} → <span className="hl">{M[2].value_loss!.toFixed(3)}</span>;
          竞技场 {M[2].arena_vs_best!.wins_a} 比 {M[2].arena_vs_best!.wins_b} 晋升
          ——带着新网络回到自我对弈,转下一圈
        </div>
      </div>

      <SPZ />
      <LossCalc />
      <SymLab />
      <MetricCharts />

      <Ledger title="selfplay.py L45-50(z 视角)、train.py L48-51(损失)、replay.py L25-44(池子)、train.py L38-40(增广)">
        <div className="codewalk">
          <pre>{`# selfplay.py L45-50  终局统一补 z:站在每一手行棋方的视角
result = slot.game.outcome()
for canon, pi, player in slot.samples:
    z = 0 if result == 0 else (1 if player == result else -1)`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# train.py L48-51  一条损失,两项判卷:交叉熵 + 平方差
value_loss = F.mse_loss(v, target_z)                 # 价值头离 z 有多远
logp = F.log_softmax(logits, dim=-1)
policy_loss = -(target_pi * logp).sum(dim=-1).mean() # 策略头离 π 有多远(减号=最大化)
loss = value_loss + policy_loss`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# replay.py L25-44  滑动池子:写满一圈从头覆盖;每步随机抓一把
def add_many(self, samples):
    for canon, pi, player, z in samples:
        ... self.pos = (self.pos + 1) % self.capacity
def sample(self, batch_size, rng):
    idx = rng.integers(0, self.size, size=batch_size)  # 均匀随机,新旧混批`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# train.py L38-40  对称增广:棋盘与 π 用同一个 k 转(8 种抽一种)
aug_in[i] = dihedral_transform(inputs[i], k)
aug_pi[i] = dihedral_transform_pi(pis[i], n, k)`}</pre>
        </div>
        <p className="mt-3">
          四处指认:① z 的视角是「那一手的行棋方」,黑白交替所以同一盘棋的 z
          逐手翻号;② 策略损失对 logits 做 <span className="mono">log_softmax</span>{" "}
          而不是先 softmax 再取对数——对数域计算,大分数不溢出;
          ③ 池子随机抓批,相隔数轮的局面同堂批卷;④ 增广的 k 棋盘与 π 共用,
          本站引擎 <span className="mono">game.ts</span> 的{" "}
          <span className="mono">dihedral / dihedralPi</span> 与 Python 端逐条对齐,
          变换台转的就是它们。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 9 课"
        onAllCorrect={() => pass("l08")}
        questions={[
          {
            q: "训练目标 π 为什么用搜索的访问分布,而不用网络自己的裸输出?",
            options: [
              "访问分布是 81 个数,裸输出也是 81 个数,格式更配",
              "老师必须比学生强:π 是「再想四十遍」的深思,比第一印象强;拿裸输出当老师,学生只能学到自己已有的偏见,飞轮原地空转",
              "因为访问分布全是整数,算得更快",
            ],
            answer: 1,
            explain:
              "飞轮的全部动力来自「老师比学生强」这个不等式:π 里带着搜索撞见真终局的信息,是裸网没有的。拿裸输出当目标,等于让学生抄自己的卷子——偏见喂偏见,永远原地踏步。",
          },
          {
            q: "对称增广把棋盘转了 90°,π 为什么必须跟着转?",
            options: [
              "为了保持 81 个数的总和等于 1",
              "π 是 81 个格子上的分布:棋盘转了,每个概率都得搬到对应的新坐标——不同步,就把「该下的点」的答案贴到无关的格子上,作业全错",
              "为了和 z 保持一致",
            ],
            answer: 1,
            explain:
              "「同步」是硬前提:答案长在格子上,题目(棋盘)转了答案必须跟着转。z 是一个数,棋盘怎么转它都不变——所以只有 π 要跟着搬。变换台的棋盘和热度是同一个 k 转出来的,你可以亲手验。",
          },
          {
            q: "黑胜的一盘棋,白走的那些手 z 记多少?为什么逐手翻号?",
            options: [
              "全记 +1,赢的是这盘棋",
              "白走的手记 −1:z 站在「那一手行棋方」的视角,「我」每手都在黑白换人——白方的输正是黑方的赢",
              "白走的手记 0,只有黑方的手有 z",
            ],
            answer: 1,
            explain:
              "z 的视角契约贯穿全链:局面 s 是行棋方视角(canonical),z 也必须是——这样价值头学的时候 (v−z)² 这笔误差才可比。同一盘棋 z 逐手翻号,不是因为结局变了,是「我」换人了。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 8-1 · (s,π,z) 解剖台:真数据某一手,三样并排 ============ */

const CHIPS: { i: number; label: string }[] = [
  { i: REAL.heroIndex, label: "第 10 手·天元 40/40" },
  { i: 1, label: "第 2 手·边角 40/40" },
  { i: 0, label: "第 1 手·开局分散" },
  { i: 16, label: "第 17 手·两个候选" },
]

function SPZ() {
  const [idx, setIdx] = useState(REAL.heroIndex)
  const mv = MOVES[idx]
  const prev = idx > 0 ? MOVES[idx - 1] : null
  const top = [...mv.top].sort((a, b) => b.visits - a.visits).slice(0, 3)
  const z = zOf(idx)
  const topSum = mv.top.reduce((s, t) => s + t.visits, 0)

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">
          部件 8-1 · (s, π, z) 解剖台——第 3 轮真实自我对局 {GAME.id}
        </span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1">
          <div data-qa="spz-board">
            <Board
              board={STATES[idx].board.flat()}
              heat={mv.pi}
              lastMove={prev ? { x: prev.x, y: prev.y } : null}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              ← 上一手
            </button>
            <button type="button" className="btn" disabled={idx >= MOVES.length - 1}
              onClick={() => setIdx((i) => Math.min(MOVES.length - 1, i + 1))}>
              下一手 →
            </button>
            <span className="num ml-auto text-sm" style={{ color: "var(--fg-faint)" }}>
              第 {idx + 1} / {MOVES.length} 手
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button key={c.i} type="button"
                className={`btn ${idx === c.i ? "active" : ""}`}
                onClick={() => setIdx(c.i)} data-qa="spz-chip">
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="w-full sm:w-72 sm:flex-none">
          <div className="mini-label">s:局面 —— 轮到{mv.player === 1 ? "黑" : "白"}棋下</div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            40 次模拟刚跑完、子还没落。这是它眼里的 s(存档时已换成行棋方视角)。
          </p>

          <div className="mini-label mt-4">π:搜索的访问分布(top3,含访问数)</div>
          <ol className="mt-2 space-y-1.5" data-qa="spz-top">
            {top.map((t) => (
              <li key={t.action} className="l00-top-row">
                <span className="mono text-sm">{coord(t.action)}</span>
                <span className="prob-track">
                  <span className="prob-fill" style={{ width: `${t.prob * 100}%` }} />
                </span>
                <span className="num flex-none text-right text-xs" style={{ color: "var(--fg-faint)" }}>
                  {t.visits}/{topSum}
                </span>
                <span className="num w-10 flex-none text-right text-sm" style={{ color: "var(--accent-deep)" }}>
                  {Math.round(t.prob * 100)}%
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <div className="mini-label">v 与 z:当时的判断,和最后的答案</div>
            <p className="num mt-1.5 text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
              v = {mv.value >= 0 ? "+" : ""}{mv.value.toFixed(2)}
              <span className="ml-2 text-sm font-normal" style={{ color: "var(--fg-faint)" }}>
                ({mv.player === 1 ? "黑" : "白"}方视角)
              </span>
            </p>
            <p className="num mt-1 text-lg font-bold" data-qa="spz-z">
              z = {z > 0 ? "+1" : z < 0 ? "−1" : "0"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              这盘棋{GAME.result === 1 ? "黑胜" : GAME.result === -1 ? "白胜" : "和棋"},
              {mv.player === GAME.result
                ? "这一手的行棋方是赢家:z = +1"
                : "这一手的行棋方是输家:z = −1"}
              。v 是下这手时的判断,z 是终局才补上的答案——训练要压小的就是
              (v−z)²,策略头要对齐的是上面的 π。
            </p>
          </div>
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        {GAME.id}(第 3 轮,共 {MOVES.length} 手):局面由引擎逐手重建,
        π/v 直接读训练记录。切到「第 10 手」看天元拿 40/40——第 9 课会告诉你
        为什么这个 40/40 不能读成「学会了天元」。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 8-2 · 损失计算器:亲手拖两笔罚分 ============ */

function LossCalc() {
  const [v, setV] = useState(0.8)
  const [z, setZ] = useState(-1)
  const pen = (v - z) * (v - z)

  // 抛物线 (v−z)²,v∈[−1,1],罚分上限 4
  const W = 300, H = 150, PL = 34, PR = 12, PT = 12, PB = 30
  const xOf = (t: number) => PL + ((t + 1) / 2) * (W - PL - PR)
  const yOf = (p: number) => H - PB - (p / 4) * (H - PT - PB)
  const pts = Array.from({ length: 41 }, (_, i) => {
    const t = -1 + (i / 40) * 2
    return `${xOf(t).toFixed(1)},${yOf((t - z) * (t - z)).toFixed(1)}`
  }).join(" ")

  // 交叉熵手算:π=[0.6,0.3,0.1] vs p=[0.5,0.3,0.2](以及两个参照)
  const PI3 = [0.6, 0.3, 0.1]
  const ce = (p: number[]) => -PI3.reduce((s, pi, i) => s + pi * LN(p[i]), 0)
  const ceHand = ce([0.5, 0.3, 0.2])
  const ceSelf = ce(PI3)
  const ceUni = ce([1 / 3, 1 / 3, 1 / 3])

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">部件 8-2 · 损失计算器:罚分是拖出来的</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <div className="mini-label">价值损失 (v − z)²:拖 v、选 z,一笔罚分</div>
          <svg viewBox={`0 0 ${W} ${H}`} data-qa="loss-curve"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 340 }}>
            <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[1, 2, 3, 4].map((p) => (
              <g key={p}>
                <line x1={PL} y1={yOf(p)} x2={W - PR} y2={yOf(p)}
                  style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
                <text x={PL - 6} y={yOf(p) + 3} fontSize={9} textAnchor="end"
                  className="num" style={{ fill: "var(--fg-faint)" }}>{p}</text>
              </g>
            ))}
            {[-1, 0, 1].map((t) => (
              <text key={t} x={xOf(t)} y={H - PB + 14} fontSize={9.5} textAnchor="middle"
                className="num"
                style={{ fill: z === t ? "var(--accent-deep)" : "var(--fg-faint)" }}>
                v={t > 0 ? "+" + t : t}
              </text>
            ))}
            <polyline points={pts} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2} />
            <line x1={xOf(z)} y1={yOf(0)} x2={xOf(z)} y2={yOf(4)}
              strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <circle cx={xOf(v)} cy={yOf(pen)} r={5.5} style={{ fill: "var(--accent-deep)" }} />
            <text x={xOf(v)} y={yOf(pen) - 10} fontSize={10} textAnchor="middle" className="num"
              style={{ fill: "var(--accent-deep)" }}>
              {pen.toFixed(2)}
            </text>
          </svg>

          <div className="mini-label mt-3">网络的说法 v(拖我)</div>
          <input type="range" min={-1} max={1} step={0.05} value={v}
            onChange={(e) => setV(Number(e.target.value))}
            aria-label="v 滑杆" style={{ ["--fill" as string]: `${((v + 1) / 2) * 100}%` }}
            data-qa="loss-v" />
          <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
            <span>−1 稳输</span><span>0</span><span>+1 稳赢</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>真实结局 z</span>
            <span className="seg">
              {[-1, 0, 1].map((t) => (
                <button key={t} type="button"
                  className={`seg-btn ${z === t ? "active" : ""}`}
                  onClick={() => setZ(t)} data-qa="loss-z">
                  {t === -1 ? "我输" : t === 0 ? "和" : "我赢"}
                </button>
              ))}
            </span>
            <span className="num ml-auto text-lg font-bold" data-qa="loss-readout"
              style={{ color: "var(--accent-deep)" }}>
              ({v.toFixed(2)} − {z > 0 ? "+" + z : z})² = {pen.toFixed(3)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            把 v 拖到 z 附近,罚分归零;嘴硬说稳赢却输了,罚到顶 4。
            平方让正负误差都变罚分,差得越远罚得越狠。
          </p>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[17rem]">
          <div className="mini-label">策略损失:交叉熵手算(三选一的小盘子)</div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            老师 π = [0.6, 0.3, 0.1](访问分布归一后),网络 p = [0.5, 0.3, 0.2]。
            (ln 是「e 的几次方等于它」的反问:ln 0.5 ≈ −0.69,因为 e<sup>−0.69</sup> ≈ 0.5。
            你只需记住 ln 把 0 到 1 的小数变成负数,越接近 1 越接近 0——和第 6 课
            的 e 是一对正反运算。)
          </p>
          <div className="formula mt-2" style={{ fontSize: "0.72rem", textAlign: "left", whiteSpace: "normal" }}>
            −Σ π·ln p = −(0.6·ln<span className="hl">0.5</span> + 0.3·ln0.3 + 0.1·ln0.2)
            <br />= −(−0.416 − 0.361 − 0.161) = <span className="hl">{ceHand.toFixed(3)}</span>
          </div>
          <table className="l09-table mt-3 w-full">
            <thead>
              <tr><th>网络的 p</th><th>交叉熵</th><th>读法</th></tr>
            </thead>
            <tbody>
              <tr><td>= π(0.6, 0.3, 0.1)</td><td className="num">{ceSelf.toFixed(3)}</td><td>下限:老师自带的犹豫</td></tr>
              <tr><td>0.5, 0.3, 0.2</td><td className="num">{ceHand.toFixed(3)}</td><td>手算:离老师远一点</td></tr>
              <tr><td>均匀(各 1/3)</td><td className="num">{ceUni.toFixed(3)}</td><td>撒胡椒面,罚得最狠</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            式子前的减号,分两步看就直白了:第一步,损失是罚分,训练只求把它
            压到最小;第二步,「−Σπ·ln p 压到最小」翻过来就是「Σπ·ln p 拉到
            最大」——π 大的地方 p 跟着大,网络的分往老师给的方向靠,罚分自然小。
            全对齐也到不了 0——老师自己就分了三份,这份「下限」是老师的犹豫,
            不是网络的错。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 8-2</span>
        两笔罚分就是 train.py 的两条损失:左侧 (v−z)² 在真训练里天天在算;
        右侧手算与真实第 0 轮策略损失 4.434 同一口径——只是把 81 格缩成 3 格
        好手算(81 格均匀乱猜的交叉熵 = ln 81 ≈ 4.394,正是曲线部件里那条乱猜线)。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 8-3 · 8 对称变换台:棋盘与 π 同步转 ============ */

const SYM_IDX = 17 // 第 18 手:π 81% 集中在偏心的 (2,4),转起来看得清

const argmaxPi = (pi: number[]) => {
  let a = 0
  for (let i = 1; i < 81; i++) if (pi[i] > pi[a]) a = i
  return a
}

function SymLab() {
  const [k, setK] = useState(0)
  const mv = MOVES[SYM_IDX]
  const boardK = dihedral(STATES[SYM_IDX].board, k).flat()
  const piK = dihedralPi(mv.pi, k)
  const arg0 = argmaxPi(mv.pi)
  const argK = argmaxPi(piK)

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">部件 8-3 · 8 对称变换台:一份棋谱八份用</span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="w-full sm:w-64 sm:flex-none" data-qa="sym-board">
          <Board board={boardK} heat={piK} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">抽哪种变换 k?(0-7:转 k%4 次 90°,k≥4 再镜像)</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} type="button" className={`btn ${k === i ? "active" : ""}`}
                style={{ minWidth: "2.4rem" }} onClick={() => setK(i)} data-qa="sym-k">
                {i}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            这是第 18 手的真实局面与 π(轮白,约 {Math.round(mv.top[0].prob * 100)}%
            押在 {coord(mv.top[0].action)})。点 k,棋子和热度用
            <em>同一个 k</em> 一起转——转它们的是 <span className="mono">game.ts</span> 的{" "}
            <span className="mono">dihedral</span>(棋盘)与{" "}
            <span className="mono">dihedralPi</span>(π),真引擎同款。
          </p>
          <div className="reveal-box mt-3 text-sm" data-qa="sym-argmax">
            <span className="num">
              π 的最大点:k=0 时在 {coord(arg0)} → k={k} 时在{" "}
              <span style={{ color: "var(--accent-deep)" }}>{coord(argK)}</span>
            </span>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              答案跟着题目走:棋形转到哪,该下的点就转到哪。要是只转棋盘不转 π,
              热度还留在老坐标——同一道题配了别的题的答案,这份数据就废了。
              z 是一个数,转不转都是它。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 8-3</span>
        训练时每条样本上阵前随机抽一个 k(train.py L38-40),不真复制八份——
        存储一分不花,等效数据八倍多样。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 8-4 · 真实曲线:4 轮的 metrics,手绘折线 ============ */

interface Series {
  name: string
  vals: number[]
  dash?: number // 参照线(如乱猜线)
  dashLabel?: string
  fmt: (n: number) => string
}

function MetricCharts() {
  const series: Series[] = [
    { name: "总损失 loss", vals: M.map((r) => r.loss!), fmt: (n) => n.toFixed(2) },
    { name: "策略损失", vals: M.map((r) => r.policy_loss!), dash: LN(81), dashLabel: "乱猜线 ln81", fmt: (n) => n.toFixed(3) },
    { name: "价值损失", vals: M.map((r) => r.value_loss!), fmt: (n) => n.toFixed(3) },
    { name: "经验池(条)", vals: M.map((r) => r.buffer), fmt: (n) => n.toFixed(0) },
  ]

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">部件 8-4 · 真实曲线:4 轮训练的全部指标</span>
      </div>
      <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-5" data-qa="metric-charts">
        {series.map((s) => (
          <MiniChart key={s.name} s={s} />
        ))}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        metrics.jsonl 全部 4 轮,一个不落:总损失与策略损失贴着乱猜线松动,
        价值损失第 2 轮下探到 {M[2].value_loss!.toFixed(3)} 又弹回{" "}
        {M[3].value_loss!.toFixed(3)},池子每轮稳定涨。
        <strong>只有 4 个点,读趋势、别读单点</strong>——下探一次不叫学会,
        弹回一次也不叫白学;棋力到底涨没涨,第 9 课的竞技场说了算。
      </figcaption>
    </figure>
  )
}

function MiniChart({ s }: { s: Series }) {
  const W = 240, H = 120, PL = 42, PR = 10, PT = 14, PB = 22
  const lo = Math.min(...s.vals, s.dash ?? Infinity)
  const hi = Math.max(...s.vals, s.dash ?? -Infinity)
  const pad = (hi - lo) * 0.15 || 0.1
  const yOf = (n: number) => H - PB - ((n - (lo - pad)) / (hi + pad - (lo - pad))) * (H - PT - PB)
  const xOf = (i: number) => PL + (i / (s.vals.length - 1)) * (W - PL - PR)
  const pts = s.vals.map((n, i) => `${xOf(i).toFixed(1)},${yOf(n).toFixed(1)}`).join(" ")

  return (
    <div>
      <div className="mini-label">{s.name}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB}
          style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
        <text x={PL - 5} y={PT + 3} fontSize={8.5} textAnchor="end" className="num"
          style={{ fill: "var(--fg-faint)" }}>{s.fmt(hi)}</text>
        <text x={PL - 5} y={H - PB} fontSize={8.5} textAnchor="end" className="num"
          style={{ fill: "var(--fg-faint)" }}>{s.fmt(lo)}</text>
        {s.dash !== undefined && (
          <>
            <line x1={PL} y1={yOf(s.dash)} x2={W - PR} y2={yOf(s.dash)}
              strokeDasharray="5 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <text x={W - PR} y={yOf(s.dash) - 4} fontSize={8.5} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>{s.dashLabel}</text>
          </>
        )}
        <polyline points={pts} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
        {s.vals.map((n, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(n)} r={3.4} style={{ fill: "var(--accent-deep)" }} />
        ))}
        {s.vals.map((_, i) => (
          <text key={`x${i}`} x={xOf(i)} y={H - PB + 13} fontSize={8.5} textAnchor="middle"
            className="num" style={{ fill: "var(--fg-faint)" }}>轮{i}</text>
        ))}
      </svg>
    </div>
  )
}
