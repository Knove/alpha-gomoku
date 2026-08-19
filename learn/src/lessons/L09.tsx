/** 第 9 课 · 竞技场:证据说话。
 *  节拍:谜题(损失降=棋力涨?)→ 揭晓三小节(晋升规则/确定性陷阱/颜色偏置读数据)→
 *  部件(晋升计算器 · 真实晋升赛对局回放)→ 对账(arena·pipeline)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const SP = REAL.selfplayGame
const ARENA = REAL.arenaGame!

/* 颜色偏置小表:全部由 real.ts 第 3 轮那盘自我对局现算,不手抄。 */
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

export default function L09() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 9 课</div>
      <h1 className="text-2xl font-bold">竞技场:证据说话</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "第 8 课末尾的损失曲线降了。损失降了,棋力就涨了吗?",
            options: [
                "是,损失降就是变强,曲线是唯一标准",
                "不一定——可能只是背熟了池子里的作业,换个局面就露馅",
                "损失根本不重要,训练白训了",
            ],
            answer: 1,
            explain:
              "选 B。损失量的是「答案离作业多近」,不是「棋下得多好」:把训练集背熟也能让损失下降,曲线会撒谎。棋力涨没涨,只有让它真刀真枪下一场才知道——本课的竞技场就是干这个的。C 也错:损失是必要的向导,只是不当证据。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 曲线会撒谎,对战不会</h3>
        <p>
          <strong>① 晋升规则:挑战者要打赢擂台。</strong>每 2 轮,刚训练完的
          <em>挑战者</em>走进竞技场,与现任冠军<em>交替先后手</em>下 6 局,
          胜率按「胜 + 和棋×0.5」计,<strong>≥ 55% 才换人</strong>。
          为什么不五五开就换?因为 6 局太少、运气太重——两个棋力完全相同的网络,
          光靠运气也可能赢下 4 局以上(概率约 34%,下面部件里给你算)。
          55% 这条线是「赢面要明显盖过运气」的最低要求。另有锚点赛:对
          训练开始前冻结的随机网络打一组——冠军老在换,锚点赛的数字才横向可比。
        </p>
        <p>
          <strong>② 确定性陷阱:开局要采样。</strong>一个只在工程里才踩得到的坑:
          无噪声 + 纯 argmax(argmax = 只认最大的那个:哪手访问数最高就下哪,
          绝不例外)的搜索是<em>完全确定</em>的——两个固定的网络,
          同先手的那几局会下出<em>逐手一模一样</em>的棋,「6 局对抗」实际只有
          2 局的信息量(黑白各一盘)。解法:开局前几手仍按 π 采样(概率大的多抽、
          小的也抽得到),制造分叉,之后才认真 argmax。自我对弈同理——
          第 8 课的棋谱一盘盘长得都不一样,先给采样记一功。
        </p>
        <p>
          <strong>③ 读数据:一个最容易读错的案例。</strong>第 3 轮的一盘自我对弈
          ({SP.id})里,白方第 10 手把 40 次模拟<strong>全部</strong>押给了天元
          (4,4)——40/40,看着像「学会了天元最大」。先把同一盘棋翻完再说
          (下表由 real.ts 的 32 手记录现算):
        </p>
        <table className="l09-table">
          <thead>
            <tr><th>行棋方</th><th>根估值 v</th><th>π 最大值</th><th>完全集中</th></tr>
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
          白方 16 手的根估值<strong>全为正</strong>,黑方 16 手<strong>全为负</strong>
          ——和棋盘上是什么局面无关:价值头还没学会看棋,先抓了一条最省事的规律
          「轮到白走就说我优」(这叫<strong>颜色偏置</strong>;颜色面给了它这个身份,
          第 3 课埋的伏笔)。偏置进而歪了搜索的天平:白方的候选越看越顺眼,
          访问堆成一点;黑方的候选越看越嫌弃,访问摊得很平。于是——
        </p>
        <div className="formula">
          {FORTY.map((m, i) => (
            <span key={i}>
              第 {m.n + 1} 手 {m.player === -1 ? "白" : "黑"}落 {coord(m.x, m.y)}:
              {m.top[0].visits}/40
              {i === 1 ? "(天元)" : "(边角)"}{i < FORTY.length - 1 ? "、" : ""}
            </span>
          ))}
          <br />——<span className="hl">天元和边线角落,拿到一样的 40/40</span>
        </div>
        <p>
          天元那手撞对了,(1,0)、(0,7) 撞错了——同一个机制,和棋理无关。
          这就是本课最该带走的一句话:<strong>π 集中 ≠ 棋力,损失降 ≠ 棋力,
          只有对战算数。</strong>下面两件部件,一件让你把 55% 这条线亲手算一遍,
          一件是真实晋升赛里挑战者赢下的一局。
        </p>
      </div>

      <PromoCalc />
      <ArenaReplay />

      <Ledger title="arena.py L75(胜率计法)、pipeline.py L203(≥55% 判定)、arena.py L56(开局采样)">
        <div className="codewalk">
          <pre>{`# arena.py L75  胜率按「胜 + 和棋×0.5」计
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
          ②promote_threshold 就是那条 55% 线,判定完当场存新冠军;
          ③竞技场把自我对弈的开局采样阈值砍半(10 → 5)——竞技场只需要分叉
          制造不同的棋,不需要自我对弈那么多样的探索。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁毕业课"
        onAllCorrect={() => pass("l09")}
        questions={[
          {
            q: "6 局 2 胜 2 和 2 负,为什么不能晋升?",
            options: [
              "因为有 2 局输了,输过就不配当冠军",
              "胜率只有 (2+0.5×2)/6 = 50%,不到 55% 的线——6 局太少,50% 和抛硬币没区别,运气成分还没被甩开",
              "和棋不算成绩,实际只赢 2 局",
            ],
            answer: 1,
            explain:
              "晋升线问的是「赢面是否明显盖过运气」:50% 恰是五五开,而纯运气赢 4 局以上的概率都有约 34%。不设这条线,换冠军就成了掷硬币。和棋算半分不是不算——它正是「没分出高下」的诚实记法。",
          },
          {
            q: "竞技场的对局为什么开局几手要按 π 采样,而不是一路 argmax?",
            options: [
              "采样更快,能省计算",
              "无噪声纯 argmax 是完全确定的:两个固定网络同先手会逐手下出一模一样的棋,6 局只剩 2 局信息量;开局采样制造分叉",
              "为了公平,让双方轮流先行",
            ],
            answer: 1,
            explain:
              "确定性陷阱:同样的网络、同样的开局、每步都取访问数最大——同一盘棋永远重演。交替先后手只能换来黑先/白先两盘。开局几手采样(大的多抽、小的也轮得到),棋盘从此分岔,6 局才真的是 6 局。",
          },
          {
            q: "第 3 轮那盘棋,第 10 手把 40 次模拟全押天元 (4,4)。为什么这不能证明它学会了「天元最大」?",
            options: [
              "因为 40 次模拟太少,400 次就能证明",
              "因为同一盘棋里 (1,0)、(0,7) 这些边角垃圾点也拿到 40/40,且白方 16 手估值全为正——集中来自颜色偏置,和棋理无关",
              "因为天元本来就不是好点",
            ],
            answer: 1,
            explain:
              "同一个机制(白方候选的 Q 被偏置抬高)让天元和边线角落拿到同等待遇——撞对一次和撞错两次是一回事。π 集中只说明搜索在堆访问,不说明堆对了地方;棋力要靠对战证明,这就是竞技场存在的理由。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 9-1 · 晋升计算器:6 局胜负和,亲手配平 55% 线 ============ */

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
        <span className="mini-label">部件 9-1 · 晋升计算器:点 6 个格子配一盘对抗</span>
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
          点格子循环:胜 → 和 → 负。六局交替先后手(哪局执黑由配对轮换,不影响记分)。
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
            {promoted ? "✓ ≥ 55%,晋升!best 易主" : "✗ 不到 55%,现任冠军留任"}
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
          纯靠运气拿下 4 局及以上的概率 = (C(6,4)+C(6,5)+C(6,6)) / 2⁶ =
          (15+6+1)/64 ≈ <span className="num">34%</span>——而 4 胜 2 负 = 66.7%,
          稳过线。所以 6 局的晋升只敢要 55% 这种「明显好过抛硬币」的证据,
          真要证明棋力得打几百局:6 局证明的是「飞轮转得动」,不是「棋力已经到手」。
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 9-1</span>
        计分公式与 ≥55% 判定即 arena.py L75 与 pipeline.py L203;
        真实记录见第 2 轮:挑战者 6 比 0 晋升(下面就是那 6 局里的一局)。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 9-2 · 真实晋升赛对局:第 2 轮挑战者(黑)的一胜 ============ */

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
        <span className="mini-label">部件 9-2 · 晋升赛实录——{ARENA.id}(第 2 轮,挑战者执黑)</span>
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
                竞技场每手 30 次模拟(比自我对弈的 40 少、开局 5 手按 π 采样):
                朱砂环标出本局的最后一手。
              </p>
              <div className="mini-label mt-4">π:访问 top3</div>
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
                白方(老冠军)的估值一路 −0.7 跌到 −0.99:新网络每一手都把它越推越远。
              </p>
            </div>
          ) : (
            <div className="reveal-box">
              <div className="mini-label">终局</div>
              <p className="mt-2 text-sm font-semibold">
                挑战者(黑)胜——第 {ALEN} 手黑落 {coord(prev!.x, prev!.y)},终局直传。
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                这只是 6 局里的一局;配齐 6 局,胜率 100% ≥ 55%,best 易主
                ——第 8 课真数据卡里那条「6 比 0 晋升」就是它。
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        {ARENA.id},共 {ALEN} 手,黑胜。局面由引擎逐手重建,π/v 读训练记录;
        回放样式沿用序章的回放器——同一盘「棋谱」,这次站在竞技场的角度看。
      </figcaption>
    </figure>
  )
}
