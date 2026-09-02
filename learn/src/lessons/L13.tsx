/** 第 13 课 · 竞技场:证据说话。
 *  节拍:谜题(损失降=棋力涨?)→ 揭晓三小节(晋升规则/确定性陷阱/可疑模式读数据)→
 *  部件(晋升计算器 · 真实晋升赛对局回放)→ 对账(arena·pipeline)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const SP = REAL.selfplayGame
const ARENA = REAL.arenaGame!

/* 行棋方相关模式小表：全部由 real.ts 第 3 轮那盘自我对局现算，不手抄；只用于提出待验证假设。 */
interface SideStat {
  who: string
  hands: number
  vMin: number
  vMax: number
  piMaxMin: number
  piMaxMax: number
  focused: number // π 完全集中(=1)的手数
}
const sideStat = (player: number, who: string): SideStat => {
  const vs = SP.moves.filter((m) => m.player === player)
  const vmax = (m: (typeof SP.moves)[number]) => Math.max(...m.pi)
  const vms = vs.map((m) => m.value)
  const pms = vs.map(vmax)
  return {
    who,
    hands: vs.length,
    vMin: Math.min(...vms),
    vMax: Math.max(...vms),
    piMaxMin: Math.min(...pms),
    piMaxMax: Math.max(...pms),
    focused: vs.filter((m) => vmax(m) >= 0.999).length,
  }
}
const BLACK_STAT = sideStat(1, "黑方")
const WHITE_STAT = sideStat(-1, "白方")

/* 40/40 三个铁证:同一盘棋,天元与边角垃圾点同等待遇 */
const FORTY = [1, 9, 13].map((i) => SP.moves[i]) // 第2手(1,0)、第10手(4,4)天元、第14手(0,7)
const coord = (x: number, y: number) => `(${x},${y})`

export default function L13() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 13 课</div>
      <h1 className="text-2xl font-bold">竞技场:证据说话</h1>

      <LessonGuide
        question="训练日志显示“损失变低”时，怎样判断机器是真的更会下棋，而不是只更会做旧作业？"
        why="训练分数只衡量它对已有训练目标的贴合程度；棋力是实战能力，必须在控制先后手和随机性的对战中验证。"
        chain={[
          "新网络作为挑战者，对战当前冠军",
          "交替先后手，避免把颜色优势误判成实力",
          "比较多局、不同开局，避免把同一条路线重复当证据",
          "把比赛结果连同局数与不确定性一起解释，并用固定锚点作长期比较",
        ]}
        takeaway="损失、访问数集中、单局巧合都不是充分棋力证据；受控对战提供更直接的证据，但局数少时结论仍要保留余地。"
        boundary="少量对局仍有运气，所以竞技场只能提供有限证据；局数、规则和对手都会影响结论强度。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "第 12 课末尾的损失曲线降了。损失降了,棋力就涨了吗?",
            options: [
                "是,损失降就是变强,曲线是唯一标准",
                "不一定——可能只是背熟了池子里的作业,换个局面就露馅",
                "损失根本不重要,训练白训了",
            ],
            answer: 1,
            explain:
              "选第二项。损失量的是“答案离作业多近”，不是“棋下得多好”：把训练用的作业贴合得更好，也能让曲线下降。受控对战更接近真正要测的实战能力，但少量对局同样会受运气影响；损失是必要的训练向导，不是充分的棋力证据。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 曲线不够，对战更直接但也要看证据强度</h3>
        <p>
          <strong>① 晋升规则：挑战者要打赢擂台。</strong>新训练出的<em>挑战者</em>会和现任冠军
          <em>交替先后手</em>对战，再按事先定好的工程规则决定是否换冠军。换上的冠军会存成
          <span className="mono">best</span>（当前最强候选）。这条规则的目的，是不要每次一场险胜
          就易主；它仍不是统计证明。局数少时，两个同样强的网络也会因运气分出高下；更可靠的结论
          需要更多局、更多开局和不确定性检查。另有锚点赛：不时跟
          训练开始前冻结的随机网络(还没学棋、只会乱下的那个)打一组。
          这里的锚点 = 钉在那里不动的那把尺子,跟第 1 课棋盘上的「锚点」
          不是一回事。冠军老在换,尺子永不换——拿它一量,
          这个月跟上个月的成绩才比得了。
        </p>
        <p>
          <strong>先带走主结论：</strong>损失下降、一次搜索的访问集中、单局赢棋，都不是充分棋力证据。
          控制先后手、对手和对局多样性的对战，提供更直接的比较；但局数少时，结论仍要保留余地。
          下面先看一局真实晋升赛，观察“受控比较”到底长什么样；演示快照的晋升线、采样和偏置诊断
          都放进实验室，避免把工程阈值误当成棋力定理。
        </p>
        <details className="account-book mt-5">
          <summary>实验室 · 为什么对战要采样，以及怎样谨慎诊断可疑数据</summary>
          <div className="prose mt-5">
        <p>
          <strong>② 确定性陷阱:开局要采样。</strong>一个只有亲手写程序的人才踩得到的坑。
          先认识一个词:argmax,意思是「只认最大的那个」——
          哪一手访问数最高就下哪,绝不例外。坑在这:无噪声 + 纯 argmax 的搜索
          是<em>完全确定</em>的(同样的一幕,永远走出同样的棋)。于是两个固定的网络,
          只要先手方相同,就会下出<em>逐手一模一样</em>的棋——「6 局对抗」
          等于只下了 2 局(黑先一盘、白先一盘,其余 4 局全是重播)。
          解法:开局前几手仍按 π 采样(概率大的多抽、小的也抽得到),
          把棋盘引上不同的岔路(制造分叉),之后才认真 argmax。自我对弈同理——
          第 12 课的棋谱一盘盘长得都不一样,先给采样记一功。
        </p>
        <p>
          <strong>③ 读数据：一个最容易读错的案例。</strong>第 3 轮的一盘自我对弈
          ({SP.id})里,白方第 10 手把 40 次模拟<strong>全部</strong>押给了天元
          (4,4)——40/40,看着像「学会了天元最大」。先把同一盘棋翻完再说。
          表里几列先认识——「根估值 v」:网络在树根(眼下这一步)给局面打的分;
          「π 最热一格」:每一手里最被看好的那个点,拿走了多少
          (给的是最少 ~ 最多;1.00 = 40 次模拟全押同一格);
          「全押一格」:数一数有几手是全押的。(下表由 real.ts 的 32 手记录现算):
        </p>
        <table className="l09-table">
          <thead>
            <tr><th>行棋方</th><th>根估值 v</th><th>π 最热一格</th><th>全押一格</th></tr>
          </thead>
          <tbody>
            {[WHITE_STAT, BLACK_STAT].map((s) => (
              <tr key={s.who}>
                <td>{s.who} {s.hands} 手</td>
                <td className="num">{s.vMin >= 0 ? "+" : "−"}{Math.abs(s.vMin).toFixed(2)} ~ {s.vMax >= 0 ? "+" : "−"}{Math.abs(s.vMax).toFixed(2)}</td>
                <td className="num">{s.piMaxMin.toFixed(2)} ~ {s.piMaxMax.toFixed(2)}</td>
                <td className="num">{s.focused} 手</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          白方 16 手的根估值<strong>全是正的</strong>，黑方 16 手<strong>全是负的</strong>
          （正 = 觉得“我要赢”，负 = 觉得“我要输”）。这是一条<strong>值得怀疑</strong>的模式：
          它可能表示价值头过度依赖行棋方或颜色信息，而不够看棋盘；但只看这一盘 32 手，
          不能直接判定“已经存在颜色偏置”或断言因果。更严谨的对照有两种：第一，保持己面、敌面
          完全不变，只改颜色面，才是在测颜色面本身的影响；第二，若切换行棋方，要承认 canonical
          会连同己/敌面和颜色面一起变化，这只能测“完整视角变化”的效果。再在更多局面上统计，
          才能判断是否存在稳定偏向。若这种偏向成立，它可能让搜索的访问分布过度集中；现在我们只能
          把它当作需要验证的假设。
        </p>
        <div className="formula">
          {FORTY.map((m, i) => (
            <span key={i}>
              第 {m.n + 1} 手 {m.player === -1 ? "白" : "黑"}落 {coord(m.x, m.y)}:
              {m.top[0].visits}/40
              {i === 1 ? "(天元)" : "(边角)"}{i < FORTY.length - 1 ? "、" : ""}
            </span>
          ))}
          <br />——<span className="hl">本盘中，天元和两个边线角落都拿到 40/40</span>
        </div>
        <p>
          在这盘记录里，天元那手看起来合理，(1,0)、(0,7) 则值得怀疑；这足以说明
          “40/40 集中”本身不能证明棋理学对了。它还不能单独证明背后的原因。
          本课最该带走的一句话是：<strong>π 集中 ≠(读“不等于”)棋力，损失降 ≠ 棋力；
          受控对战给出更直接、但仍有限的证据。</strong>实验室里的计算器让你试演示快照的
          晋升线；主线中的回放则让你观察一局真实受控对战。
        </p>
          </div>
        </details>
      </div>

      <ArenaReplay />

      <details className="account-book mt-8">
        <summary>实验室 · 演示快照怎样用 6 局、55% 和开局采样做晋升筛选</summary>
        <PromoCalc />
      </details>

      <Ledger title="arena.py L75(胜率怎么算)、pipeline.py L203(≥55% 判定)、arena.py L56(开局采样)">
        <div className="codewalk">
          <pre>{`# arena.py L75  胜率按「胜 + 和棋×0.5」计(wins=胜局,draws=和局,total=总局数)
"win_rate_a": (wins_a + 0.5 * draws) / total,`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# pipeline.py L203  过线才易主:挑战者 ≥ 55% 才成为新 best
promoted = res["win_rate_a"] >= cfg.promote_threshold
if promoted:
    save_checkpoint(net, ...)   # best 易主`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# arena.py L56  确定性陷阱的解法:开局 5 手仍按 π 采样
sample_temperature=True, temp_threshold=max(2, cfg.temp_threshold // 2),`}</pre>
        </div>
        <p className="mt-3">
          三处对上部件:①胜率的「和棋算半分」正是计算器里的分子;
          ②promote_threshold 就是那条 55% 线,判完当场存新冠军;
          ③这个演示快照里，竞技场把自我对弈的开局采样门槛从 10 手改为 5 手；
          这是配置选择，不是永恒规则。竞技场只需要让棋局适度分叉，不需要自我对弈那么多样的探索。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁毕业课"
        onAllCorrect={() => pass("l13")}
        questions={[
          {
            q: "为什么预先设定的晋升线不能被读成“已经统计证明新网络更强”？",
            options: [
              "因为只要有一局输过，就永远不能再比较",
              "因为晋升线是工程筛子；少量对局仍会受运气、开局和样本量影响，更多受控比赛才能提高结论强度",
              "因为和棋完全没有信息，必须从成绩里删掉",
            ],
            answer: 1,
            explain:
              "晋升线帮助系统在自动训练时保持稳定，但不是科学证明。少量比赛里，哪怕两者同样强，也可能暂时一方领先；增加对局、控制先后手与开局、报告不确定性，都会让证据更可靠。实验室保留了本演示快照的具体 6 局、55% 算法。",
          },
          {
            q: "比较两个网络时，为什么不能只让它们在同一开局、同一先后手下反复下一盘？",
            options: [
              "因为同一盘棋重复得越多，计算机就越省电",
              "因为先后手和开局路线会影响结果；需要控制这些条件并让对局有足够不同的分支，比赛才提供更多独立证据",
              "因为只要让一方先走，它就一定比较强",
            ],
            answer: 1,
            explain:
              "受控比较要避免把“先手优势”或“恰好走到同一条路线”误判成实力。交替先后手、让开局适度分叉，都会让每局提供不同的信息。实验室会具体展示一种开局采样方法；主线只需记住：比赛设计决定证据有多可信。",
          },
          {
            q: "一次搜索把访问几乎全压在一个落点，为什么仍不能证明网络已经学会了对应棋理？",
            options: [
              "因为只要把搜索次数增加十倍，就必然证明棋理正确",
              "因为集中只说明搜索把预算压在那里；它可能来自正确证据、错误先验或偶然路线，原因需要对照与更多局面验证",
              "因为访问数高的落点一定是坏点",
            ],
            answer: 1,
            explain:
              "访问数是搜索过程留下的记录，不是棋理正确性的证明。一处集中可能有很多原因；要判断原因，需要固定其他条件做对照，并看更多局面。实验室里的天元案例正是训练这种“先提出假设、再设计验证”的习惯。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 13-1 · 晋升计算器:6 局胜负和,亲手配平 55% 线 ============ */

type Slot = 1 | 0.5 | 0 // 胜 / 和 / 负
const SLOT_LABEL: Record<number, string> = { 1: "胜", 0.5: "和", 0: "负" }
const NEXT: Record<number, Slot> = { 1: 0.5, 0.5: 0, 0: 1 }
const PRESETS: { label: string; slots: Slot[] }[] = [
  { label: "6 胜 0 负(真实第 2 轮)", slots: [1, 1, 1, 1, 1, 1] },
  { label: "2 胜 2 和 2 负", slots: [1, 1, 0.5, 0.5, 0, 0] },
  { label: "3 胜 1 和 2 负", slots: [1, 1, 1, 0.5, 0, 0] },
]

function PromoCalc() {
  const [slots, setSlots] = useState<Slot[]>([1, 1, 0.5, 0.5, 0, 0])
  const wins = slots.filter((s) => s === 1).length
  const draws = slots.filter((s) => s === 0.5).length
  const score = wins + 0.5 * draws
  const rate = score / 6
  const passLine = 0.55
  const promoted = rate >= passLine

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">部件 13-1 · 晋升计算器:点 6 个格子配一盘对抗</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" data-qa="calc-slots">
          {slots.map((s, i) => (
            <button key={i} type="button"
              className={`btn calc-slot ${s === 1 ? "active" : ""}`}
              onClick={() => setSlots((ss) => ss.map((x, j) => (j === i ? NEXT[x] : x)))}
              data-qa="calc-slot">
              <span className="num">第{i + 1}局</span>
              <span className="calc-slot-val" data-val={s}>{SLOT_LABEL[s]}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--fg-faint)" }}>
          点格子循环:胜 → 和 → 负。六局轮流换先后手(哪局执黑是排好班的,不影响记分)。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="num text-lg font-bold" data-qa="calc-rate"
            style={{ color: "var(--accent-deep)" }}>
            ({wins} + 0.5×{draws}) / 6 = {score.toFixed(1)} / 6 = {(rate * 100).toFixed(1)}%
          </span>
          <span className="banner" style={{
            borderColor: promoted ? "var(--accent)" : "var(--hairline-strong)",
            background: promoted ? "var(--accent-wash)" : "var(--card-sunken)",
            color: promoted ? "var(--accent-deep)" : "var(--fg-muted)",
          }} data-qa="calc-verdict">
            {promoted ? "✓ ≥ 55%,晋升!best 换了主人" : "✗ 不到 55%,现任冠军留任"}
          </span>
        </div>

        <div className="l09-ratebar mt-3" data-qa="calc-bar">
          <i className="l09-ratebar-fill" style={{ width: `${rate * 100}%` }} />
          <i className="l09-ratebar-line" style={{ left: `${passLine * 100}%` }} />
          <i className="l09-ratebar-needle" style={{ left: `${rate * 100}%` }} />
          <span className="num l09-ratebar-tag" style={{ left: `${passLine * 100}%` }}>55% 线</span>
        </div>
        <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
          <span>0%</span><span>50% 五五开</span><span>100%</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--fg-faint)" }}>快捷:</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn" data-qa="calc-preset"
              onClick={() => setSlots(p.slots)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="reveal-box mt-4 text-sm leading-relaxed">
          <strong>34% 运气线:</strong>假设两个网络棋力完全相同(每局五五开),
          纯靠运气赢下 4 局以上的概率 = (C(6,4)+C(6,5)+C(6,6)) / 2⁶ =
          (15+6+1)/64 ≈(读「约等于」)<span className="num">34%</span>。公式怎么读:
          C(6,4) 是「6 局里挑 4 局来赢」,有 15 种挑法(其实等于挑 2 局来输:
          6×5÷2 = 15——先挑谁后挑谁算同一种,所以除以 2);C(6,5)=6 种,
          C(6,6)=1 种——赢 4 局、赢 5 局、赢 6 局,三种都得算进去。
          2⁶ 就是 2 连乘 6 次 = 64:每局非赢即输,6 局的全部输赢排法共 64 种。
          也就是说,俩网络一样强,10 回里也有 3 回多能「运气好到赢 4 局」。
          而 4 胜 2 负 = 66.7%,稳过线。所以 6 局的晋升只敢要 55% 这种
          「明显好过抛硬币」的证据;真要证明棋力得打几百局:
          6 局证明的是「飞轮转得动」,不是「棋力已经到手」。
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 13-1</span>
        计分公式和 ≥55% 判定,对应 arena.py L75 与 pipeline.py L203;
        真实记录见第 2 轮:挑战者 6 比 0 晋升(下面就是那 6 局里的一局)。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 13-2 · 真实晋升赛对局:第 2 轮挑战者(黑)的一胜 ============ */

const ALEN = ARENA.moves.length

function ArenaReplay() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const states = useMemo<GameState[]>(() => {
    const arr: GameState[] = [emptyBoard()]
    for (const m of ARENA.moves)
      arr.push(play(arr[arr.length - 1], m.y * 9 + m.x, m.player as 1 | -1))
    return arr
  }, [])

  useEffect(() => {
    if (!playing) return
    if (step >= ALEN) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 700)
    return () => clearTimeout(t)
  }, [playing, step])

  const cur = step < ALEN ? ARENA.moves[step] : null
  const prev = step > 0 ? ARENA.moves[step - 1] : null
  const top = cur ? [...cur.top].sort((a, b) => b.visits - a.visits).slice(0, 3) : []

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-5">
        <span className="mini-label">部件 13-2 · 晋升赛实录——{ARENA.id}(第 2 轮,挑战者执黑)</span>
        <span className="mini-label num" style={{ color: "var(--accent-deep)" }}>
          该轮挑战者 6 比 0 全胜,晋升
        </span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1 sm:max-w-[22rem]">
          <div data-qa="arena-board">
            <Board
              board={states[step].board.flat()}
              lastMove={prev ? { x: prev.x, y: prev.y } : null}
              marks={step === ALEN && prev ? [{ x: prev.x, y: prev.y, anchor: true }] : undefined}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={step === 0}
              onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)) }}>
              ← 上一手
            </button>
            <button type="button" className="btn active" onClick={() => setPlaying((p) => !p)}>
              {playing ? "⏸ 暂停" : "▶ 自动播放"}
            </button>
            <button type="button" className="btn" disabled={step >= ALEN}
              onClick={() => { setPlaying(false); setStep((s) => Math.min(ALEN, s + 1)) }}>
              下一手 →
            </button>
            <span className="num ml-auto text-sm" style={{ color: "var(--fg-faint)" }}>
              第 {step} / {ALEN} 手
            </span>
          </div>
        </div>

        <aside className="w-full sm:w-64 sm:flex-none">
          {cur ? (
            <div>
              <div className="mini-label">
                第 {step + 1} 手 · 轮到{cur.player === 1 ? "黑(挑战者)" : "白(冠军)"}下
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                竞技场每手 30 次模拟(比自我对弈的 40 少,开局 5 手按 π 采样)。
                走到终局时,红色圆环会圈出最后一手。
              </p>
              <div className="mini-label mt-4">π:访问数前三名</div>
              <ol className="mt-2 space-y-1.5" data-qa="arena-top">
                {top.map((t) => (
                  <li key={t.action} className="l00-top-row">
                    <span className="mono text-sm">({t.x},{t.y})</span>
                    <span className="prob-track">
                      <span className="prob-fill" style={{ width: `${t.prob * 100}%` }} />
                    </span>
                    <span className="num w-10 flex-none text-right text-sm"
                      style={{ color: "var(--accent-deep)" }}>
                      {Math.round(t.prob * 100)}%
                    </span>
                  </li>
                ))}
              </ol>
              <p className="num mt-4 text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
                v = {cur.value >= 0 ? "+" : ""}{cur.value.toFixed(2)}
                <span className="ml-2 text-sm font-normal" style={{ color: "var(--fg-faint)" }}>
                  ({cur.player === 1 ? "黑" : "白"}方视角)
                </span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                白方(老冠军)的估值从 −0.7 一路跌到 −0.99(负数像零下温度,
                越跌越觉得「我要输」):新网络每一手都把它越推越远。
              </p>
            </div>
          ) : (
            <div className="reveal-box">
              <div className="mini-label">终局</div>
              <p className="mt-2 text-sm font-semibold">
                挑战者(黑)胜——第 {ALEN} 手黑落 {coord(prev!.x, prev!.y)},
                终局直传(这一手让棋真正结束,输赢直接记账,不用问网络)。
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                这只是 6 局里的一局;配齐 6 局,胜率 100% ≥ 55%,best 换了主人
                ——第 12 课真数据卡里那条「6 比 0 晋升」就是它。
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        {ARENA.id},共 {ALEN} 手,黑胜。局面由引擎逐手重建,π/v 读训练记录;
        回放器还是序章那套——同一盘「棋谱」,这次站在竞技场的角度看。
      </figcaption>
    </figure>
  )
}
