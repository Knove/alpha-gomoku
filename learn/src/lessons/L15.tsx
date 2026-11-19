/** 第 15 课 · 竞技场：谁有资格成为 best。
 *  节拍：思考题（损失降=棋力涨？）→ 角色(best/latest/baseline/challenger，落点码首任 best/基线/晋升线)→
 *  受控对战（换先后手/开局采样/和棋半分，落点码 net_assign/采样开关/计分行）→ 晋升计算器 → 真实对局
 *  → 对证（整链：演示配置、play_match 计分与开关、pipeline 晋升分支）→ 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const ARENA = REAL.arenaGame!

const coord = (x: number, y: number) => `(${x},${y})`

export default function L15() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 15 课</div>
      <h1 className="text-2xl font-bold">竞技场：谁有资格成为 best</h1>

      <LessonGuide
        question="训练日志显示「损失变低」时，怎样判断机器是真的更会下棋，而不是只更会背旧样本？"
        why="训练损失只衡量它对已有训练目标的贴合程度；棋力是实战能力，必须在控制先后手和随机性的对战中验证。"
        chain={[
          "新网络作为挑战者，对战当前 best",
          "交替先后手，避免把颜色优势误判成实力",
          "比较多局、不同开局，避免把同一条路线重复当证据",
          "达到 55% 才换 best；baseline 只当长期进步的尺",
        ]}
        takeaway="你能配置一场受控对战（交换先后手、开局按 π 采样），并按得分率执行 55% 晋升判定。"
        boundary="少量对局仍有运气，所以竞技场只能提供有限证据；局数、规则和对手都会影响结论强度。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "训练日志里的损失曲线降了。损失降了，棋力就涨了吗？",
            options: [
                "是，损失降就是变强，曲线是唯一标准",
                "不一定，可能只是背熟了回放池里的样本，换个局面就露馅",
                "损失根本不重要，训练白训了",
            ],
            answer: 1,
            explain:
              "选第二项。损失衡量的是「答案离样本多近」，不是「棋下得多好」：把训练用的样本贴合得更好，也能让曲线下降。这种「贴合旧样本却不见得更会下新局」的现象，就是过拟合。受控对战更接近真正要测的实战能力，但少量对局同样会受运气影响；训练离不开损失这个信号，但损失低不等于棋力高。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>损失下降，量的是贴合，不是棋力</h3>
        <p>
          损失只回答「网络把旧样本答得多像」。把回放池里的局面拟合得更好，曲线就会下降；
          但棋力要在没见过的局面上检验。两者可以一起变好，也可以一个变好、另一个原地不动。
        </p>
        <Def term="过拟合" en="overfitting">
          贴合旧样本的能力涨了，面对新局面的判断却没跟上。
          单看训练曲线分不出这两种情况，所以还要让网络上场对战。
        </Def>

        <h3>4 个身份决定谁和谁比</h3>
        <Def term="四种模型身份：latest、challenger、best、baseline" en="model roles">
          <strong>latest</strong> 是最近保存的训练状态，只代表「刚写完」；
          <strong>challenger</strong> 是刚训练完、等待上场检验的新网络；
          <strong>best</strong> 是竞技场认可的当前最强权重，只有挑战者过线才换；
          <strong>baseline</strong> 是训练开始前冻结的随机网络，只提供长期进步的参照，不参与晋升。
        </Def>
        <ArenaRoles />
        <EvidenceCard
          fidelity="runtime-exact"
          title="对战基线只记录成绩，不参与晋升"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`                arena_base = {"win_rate_a": res_b["win_rate_a"], "wins_a": res_b["wins_a"],
                              "wins_b": res_b["wins_b"], "draws": res_b["draws"],
                              "promoted": False}`}</pre>
          </div>
        </EvidenceCard>
        <p>
          第一次评估时还没有 <span className="mono">best.pt</span>，当前网络直接成为首任 best；
          从第二次开始，挑战者必须战胜现任 best 才能换主。基线那一组只写成绩，永远不会把
          <span className="mono">promoted</span> 设为真。
        </p>
        <Def term="受控对战" en="controlled match">
          在竞技场里比较两个网络的成组对局：固定局数、交换先后手、关闭根噪声，
          但开局前几手仍按 <span className="mono">π</span> 采样分叉，避免每局重播同一条路线。
          每局按胜 1、和 0.5、负 0 记分，整组汇总成挑战者的得分率。
        </Def>
        <Def term="晋升线" en="promote threshold">
          挑战者对战 best 的得分率达到 55%（<span className="mono">promote_threshold=0.55</span>），才成为新 best。
          得分率 =（胜局 + 0.5×和局）/ 总局数。它是让自动训练稳定前进的工程门槛，不是「已统计证明更强」：
          局数越少，运气和开局造成的摆动越大。
        </Def>
        <EvidenceCard
          fidelity="runtime-exact"
          title="得分率达到 55% 晋升线即保存为新 best，尚无 best 时直接任命"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`                best_path = storage.checkpoint_path("best")
                if best_path.exists():
                    champ_net, _ = load_checkpoint(str(best_path), device)
                    res = play_match(challenger, Predictor(champ_net, device), cfg,
                                     iteration, iter_rng, storage=storage, opponent="best",
                                     on_progress=on_arena_progress)
                    promoted = res["win_rate_a"] >= cfg.promote_threshold
                    if promoted:
                        save_checkpoint(net, cfg.to_dict(), str(best_path),
                                        meta={"iteration": iteration})
                        best_iteration = iteration
                    arena_best = {"win_rate_a": res["win_rate_a"], "wins_a": res["wins_a"],
                                  "wins_b": res["wins_b"], "draws": res["draws"],
                                  "promoted": promoted}
                    storage.append_event("arena_end", {
                        "iteration": iteration, "opponent": "best",
                        "win_rate": res["win_rate_a"], "wins": res["wins_a"],
                        "losses": res["wins_b"], "draws": res["draws"], "promoted": promoted,
                    })
                else:
                    save_checkpoint(net, cfg.to_dict(), str(best_path),
                                    meta={"iteration": iteration})
                    best_iteration = iteration`}</pre>
          </div>
        </EvidenceCard>

        <h3>受控对战要控制先后手与开局</h3>
        <p>
          受控不是把同一局重复 6 遍。无噪声搜索加上每步都取最大访问动作，会让固定网络走上完全确定的路线；
          只换先后手，6 局实际只有 2 种棋：挑战者执黑一局、执白一局，其余 4 局全是重播。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="按局号奇偶交替分配执黑方"
          source="alphagomoku/arena.py · play_match"
        >
          <div className="codewalk">
            <pre>{`    def net_assign(gi: int):
        if gi % 2 == 0:
            return ({1: pred_a, -1: pred_b}, name_a, name_b)
        return ({1: pred_b, -1: pred_a}, name_b, name_a)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          局号 <span className="mono">gi</span> 为偶数时挑战者执黑、奇数时执白，所以 6 局里两边各执黑 3 次。
        </p>
        <p>
          另一半解法是开局采样：前几手仍按 π 抽，概率大的更容易被选中、小的也有机会，
          之后才取最大。这样同一对网络能走出不同棋局，而不是把一条路线数六遍。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="竞技场关闭根噪声，开局前几手按 π 采样"
          source="alphagomoku/arena.py · play_match"
        >
          <div className="codewalk">
            <pre>{`        add_noise=False, simulations=cfg.arena_simulations,
        sample_temperature=True, temp_threshold=max(2, cfg.temp_threshold // 2),`}</pre>
          </div>
        </EvidenceCard>
        <p>
          采样手数取自我对弈门槛的一半；模拟预算也单列，竞技场每手 30 次、自我对弈 40 次（演示配置）。
          两边使用不同的思考量时，不能把结果当成同条件对局。
        </p>

        <h3>胜 1、和 0.5、负 0 与 55% 晋升线</h3>
        <p>
          记分公式只有一行：
          <span className="mono">score = (wins + 0.5×draws) / games</span>。
          如果这 6 局都没有和棋、两边又其实一样强，纯靠运气至少赢 4 局（得分率 ≥ 66.7%）的概率约为 34%。
          和棋会贡献半分，所以 34% 只是无和棋时的基准，实际过线概率还会随和棋率变化。
          所以 55% 线能驱动自动迭代，却远不足以证明实力；先亲手改几组胜负，看它怎样过线。
        </p>
      </div>

      <PromoCalc />

      <div className="prose mt-10">
        <h3>从 6 局汇总走进单局实录</h3>
        <p>
          真实第 2 轮里，挑战者对现任 best 下满 6 局，以 6 胜 0 负晋升。
          例 15-2 抽出其中挑战者执黑的一局：逐手推进，看每手的访问前三名和搜索汇总
          <span className="mono">root_value</span>，并记住整局只是 6 局证据中的 1 局。
        </p>
      </div>

      <ArenaReplay />

      <Ledger title="alphagomoku/arena.py · play_match（受控对战与计分）">
        <EvidenceCard
          fidelity="runtime-exact"
          title="发起受控对战并按胜 1、和 0.5 汇总挑战者得分率"
          source="alphagomoku/arena.py · play_match"
        >
          <div className="codewalk">
            <pre>{`    records = play_games(
        None, cfg, cfg.arena_games, iteration, rng,
        kind="arena", id_prefix=id_prefix,
        add_noise=False, simulations=cfg.arena_simulations,
        sample_temperature=True, temp_threshold=max(2, cfg.temp_threshold // 2),
        net_assign=net_assign,
        on_progress=on_progress, on_game_end=on_end,
    )
    wins_a = wins_b = draws = 0
    for rec in records:
        a_is_black = rec["meta"]["black"] == name_a
        r = rec["result"]
        if r == 0:
            draws += 1
        elif (r == 1) == a_is_black:
            wins_a += 1
        else:
            wins_b += 1
    total = max(len(records), 1)
    return {
        "wins_a": wins_a,
        "wins_b": wins_b,
        "draws": draws,
        "win_rate_a": (wins_a + 0.5 * draws) / total,
        "games": len(records),
    }`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          上面这段 <span className="mono">play_match</span> 串联起受控对战的开关（关闭根噪声、开局前几手按 <span className="mono">π</span> 采样分叉）与得分率汇总，再交由 <span className="mono">alphagomoku/pipeline.py</span> 按 <span className="mono">promote_threshold = 0.55</span> 判断是否更新 <span className="mono">best.pt</span>。
          可运行 <span className="mono">python -m pytest tests/test_regressions.py -q</span> 验证受控对战计分与同色对局分叉。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "损失下降，量的是对旧样本的贴合，不是棋力；贴合变好而新局变差的现象叫过拟合。挑战者、best、baseline、latest 4 个身份决定谁和谁比。",
          "受控对战要交换先后手、让开局按 π 采样适度分叉；否则无噪声加纯取最大会让 6 局变成 2 局的重播。胜 1、和 0.5、负 0，得分率过 55% 的晋升线才换 best。",
        ]}
        next={
          <>
            下一课把一轮训练从头到尾走一遍（自我对弈→存回放池→训练→竞技场→写指标→存检查点），
            并解释为什么必须按这个顺序，以及进程在中途崩溃之后靠什么接着跑。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "为什么预先设定的晋升线不能被读成「已经统计证明新网络更强」？",
            options: [
              "因为只要有一局输过，就永远不能再比较",
              "因为晋升线是工程门槛；少量对局仍会受运气、开局和样本量影响，更多受控对战才能提高结论强度",
              "因为和棋完全没有信息，必须从成绩里删掉",
            ],
            answer: 1,
            explain:
              "晋升线帮助系统在自动训练时保持稳定，但不是科学证明。少量比赛里，哪怕两者同样强，也可能暂时一方领先；增加对局、控制先后手与开局、说明结果有多不确定，都会让证据更可靠。本课已经用演示模型的 6 局和 55% 规则完整计算过一次。",
          },
          {
            q: "比较 2 个网络时，为什么不能只让它们在同一开局、同一先后手下反复下一局？",
            options: [
              "因为同一局棋重复得越多，计算机就越省电",
              "因为先后手和开局路线会影响结果；需要控制这些条件并让对局有足够不同的分支，比赛才提供更多独立证据",
              "因为只要让一方先走，它就一定比较强",
            ],
            answer: 1,
            explain:
              "受控比较要避免把「先手优势」或「恰好走到同一条路线」误判成实力。交替先后手、让开局适度分叉，都会让每局提供不同的信息。本课展示的开局采样说明：比赛设计会直接影响证据有多可信。排障时可对拍 tests/test_regressions.py 的 test_arena_games_diversify：它断言同色对局不再逐手一模一样。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 四种模型身份：同一轮的模型在竞技场里各站什么位置 ============ */

const ROLES = [
  { tag: "latest", title: "最近保存点", note: "刚写完，不等于最强", tone: "plain" },
  { tag: "challenger", title: "挑战者", note: "刚训练完，等待上场", tone: "hot" },
  { tag: "best", title: "当前最佳", note: "守擂；过 55% 才换主", tone: "best" },
  { tag: "baseline", title: "冻结基线", note: "随机初始权重，只当尺", tone: "plain" },
] as const

function ArenaRoles() {
  return (
    <div className="arena-roles" aria-label="四种模型身份">
      {ROLES.map((role, i) => (
        <div className={`arena-role ${role.tone}`} key={role.tag}>
          <span className="arena-role-no">{i + 1}</span>
          <span className="arena-role-tag mono">{role.tag}</span>
          <strong>{role.title}</strong>
          <small>{role.note}</small>
        </div>
      ))}
    </div>
  )
}

/* ============ 例 15-1 · 晋升计算器：6 局胜负和，亲手配平 55% 线 ============ */

type Slot = 1 | 0.5 | 0 // 胜 / 和 / 负
const SLOT_LABEL: Record<number, string> = { 1: "胜", 0.5: "和", 0: "负" }
const NEXT: Record<number, Slot> = { 1: 0.5, 0.5: 0, 0: 1 }
const PRESETS: { label: string; slots: Slot[] }[] = [
  { label: "6 胜 0 负（真实第 2 轮）", slots: [1, 1, 1, 1, 1, 1] },
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
        <span className="mini-label">例 15-1 · 晋升计算器：点 6 个格子配一场 6 局的对抗</span>
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
          点格子循环：胜 → 和 → 负。6 局轮流换先后手（哪局执黑是事先固定的，不影响记分）。
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
            {promoted ? "✓ ≥ 55%，晋升！best 易主" : "✗ 不到 55%，现任 best 留任"}
          </span>
        </div>

        <div className="l09-ratebar mt-8" data-qa="calc-bar">
          <i className="l09-ratebar-fill" style={{ width: `${rate * 100}%` }} />
          <i className="l09-ratebar-line" style={{ left: `${passLine * 100}%` }} />
          <i className="l09-ratebar-needle" style={{ left: `${rate * 100}%` }} />
          <span className="num l09-ratebar-tag" style={{ left: `${passLine * 100}%` }}>55% 线</span>
        </div>
        <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
          <span>0%</span><span>50% 五五开</span><span>100%</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--fg-faint)" }}>快捷：</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn" data-qa="calc-preset"
              onClick={() => setSlots(p.slots)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="reveal-box mt-4 text-sm leading-relaxed">
          <strong>无和棋时的运气过线概率 34%：</strong>假设两网络完全同强（每局五五开），6 局全无和棋。
          至少赢 4 局共有 C(6,4)+C(6,5)+C(6,6)=15+6+1=22 种输赢排法，除以全部 2⁶=64 种，得到
          <span className="num"> 34.4%</span>。
        </div>
        <div className="reveal-box mt-3 text-sm leading-relaxed">
          <strong>组合数怎么读：</strong>C(6,4)=15 是「6 局里挑 4 局来赢」，C(6,5)=6、C(6,6)=1。
          三者相加再除以 64 种等可能的输赢序列，就是二项概率；所以两网络同强时，约每 3 场六局赛就有 1 场会纯靠运气过线。
        </div>
        <div className="reveal-box mt-3 text-sm leading-relaxed">
          <strong>和棋也算半分：</strong>3 胜 1 和 2 负 = 58.3%，同样过线。
          因此 6 局、55% 的规则是略高于五五开的工程折中；它能驱动自动迭代，却不足以单独证明棋力。
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 15-1</span>
        计分公式和 ≥55% 判定分别对应 alphagomoku/arena.py 的 play_match 与 alphagomoku/pipeline.py 的 run；
        真实记录见第 2 轮：挑战者对 best 组 6 比 0 晋升（同轮另有对 baseline 的 6 局；例 15-2 就是对 best 那 6 局里的一局）。
      </figcaption>
    </figure>
  )
}

/* ============ 例 15-2 · 真实晋升赛对局：第 2 轮挑战者（黑）的一胜 ============ */

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
        <span className="mini-label">例 15-2 · 晋升赛实录 · {ARENA.id}（第 2 轮，挑战者执黑）</span>
        <span className="mini-label num" style={{ color: "var(--accent-deep)" }}>
          该轮挑战者对 best 6 比 0 全胜（对 baseline 另有 6 局），晋升
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
              已下 {step} / {ALEN} 手
            </span>
          </div>
        </div>

        <aside className="w-full sm:w-64 sm:flex-none">
          {cur ? (
            <div>
              <div className="mini-label">
                第 {step + 1} 手 · 轮到{cur.player === 1 ? "黑（挑战者）" : "白(best)"}下
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                竞技场每手 30 次模拟（演示配置；比自我对弈的 40 少，开局 5 手按 π 采样）。
                走到终局时，红色圆环会圈出最后一手。
              </p>
              <div className="mini-label mt-4">π：访问数前三名</div>
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
                root_value = {cur.rootValue >= 0 ? "+" : "−"}{Math.abs(cur.rootValue).toFixed(2)}
                <span className="ml-2 text-sm font-normal" style={{ color: "var(--fg-faint)" }}>
                  （搜索汇总，{cur.player === 1 ? "黑" : "白"}方视角）
                </span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                这是当前这一步、当前行棋方视角的搜索汇总。沿整局看数值变化可以提出问题，
                但不同棋盘和不同玩家的数不能把它们连成一条线，然后说它一路在变差。
              </p>
            </div>
          ) : (
            <div className="reveal-box">
              <div className="mini-label">终局</div>
              <p className="mt-2 text-sm font-semibold">
                挑战者（黑）胜。第 {ALEN} 手黑落 {coord(prev!.x, prev!.y)},
                终局价值直接给出（z 取 +1/−1/0，不再问网络）。
              </p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                这只是对 best 的 6 局里的一局；该轮对 best 的汇总为 6 比 0，得分率 100% ≥ 55%（对 baseline 另 6 局），
                所以 best 易主。单看眼前这一局仍不能得出该结论。
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 15-2</span>
        {ARENA.id}，共 {ALEN} 手，黑胜。局面由引擎逐手重建，π 与 root_value 读取真实竞技场记录；
        root_value 是搜索汇总的记录值，不是训练时重新计算的 v_net。播放下一手前先预测 top 访问点会落在哪，再推进验证。
      </figcaption>
    </figure>
  )
}
