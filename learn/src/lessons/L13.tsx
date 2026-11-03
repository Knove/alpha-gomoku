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

const SP = REAL.selfplayGame
const ARENA = REAL.arenaGame!

/* 行棋方相关模式小表：全部由 real.ts 第 3 轮那局自我对局现算，不手抄；只用于提出待验证假设。 */
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
  const vms = vs.map((m) => m.rootValue)
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

/* π 完全集中的六个记录：同一局棋，六手全是白方，天元与五个单点各拿到 100% */
const FOCUSED = [1, 5, 7, 9, 13, 21].map((i) => SP.moves[i]) // (1,0)(5,4)(6,1)(4,4)天元(0,7)(2,1)
const coord = (x: number, y: number) => `(${x},${y})`

export default function L13() {

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
          "公布局数与结果的不确定度",
          "用固定参照网衡量长期进步",
        ]}
        takeaway="你能配置一场受控对战（交换先后手、开局按 π 采样），并按得分率执行 55% 晋升判定；并指出损失与访问数集中都不当棋力证据。"
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
          训练日志里下降的损失，量的是网络对已有样本的贴合程度：把回放池里的旧局面答得更像，
          曲线就会往下走。棋力量的是另一件事，在没见过的局面上能不能走出好棋。
          把前者当成后者，是训练曲线上最常见的误读。
        </p>
        <Def term="过拟合" en="overfitting" see="第 3 课（泛化）">
          贴合旧样本的能力涨了，面对新局面的判断却没跟上。
          损失下降可以来自泛化变好，也可以来自过拟合；单看训练曲线分不出是哪一种。
          要区分二者，需要更贴近实战的检验方式。
        </Def>

        <h3>4 个身份决定谁和谁比</h3>
        <Def term="四种模型身份：latest、challenger、best、baseline" en="model roles">
          <strong>最近保存点</strong>（<span className="mono">latest</span>，见第 14 课）是最近一次保存的训练状态，只代表「刚写完」，不自动等于当前最佳模型；
          <strong>挑战者</strong>（<span className="mono">challenger</span>）是刚完成一轮训练、等待评估的新网络，属于待检验对象，检验方式是分别对战当前最佳模型与基线；
          <strong>当前最佳模型</strong>（<span className="mono">best</span>）是竞技场认可的最强权重，只有挑战者过晋升线才换主，下棋演示上场的就是它；
          <strong>基线</strong>（<span className="mono">baseline</span>）是训练开始前冻结的随机网络，充当永远不变的对照基准，挑战者与它比较（演示配置 6 局）量的是长期进步，不参与晋升，只当一把不动的尺。
        </Def>
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
          评估前先认清对战双方的来历：自我对弈下棋用的就是当前网络，它训练完一轮后以挑战者身份上场对战当前最佳模型；最近保存点只代表刚写完，不自动等于当前最佳模型；
          基线提供长期进步的参照。从第二次评估起，才需要挑战现任并过晋升线；
          若项目还没有 <span className="mono">best.pt</span>，
          第一次评估会先把当前网络直接保存为首任当前最佳模型。
        </p>
        <Def term="受控对战" en="controlled match">
          在<strong>竞技场</strong>（arena）中比较 2 个网络实战能力的成组对局：固定局数、交换先后手、关闭自我对弈用的根噪声（根噪声见第 11 课，给根节点掺随机），但开局前几手仍按搜索访问分布 <span className="mono">π</span> 采样分叉；
          每局按胜 1、和 0.5、负 0 记分，一组对局汇总成得分率，用来决定挑战者能否成为新的当前最佳模型。
        </Def>
        <Def term="晋升线" en="promote threshold">
          挑战者得分率的及格线。得分率 =（胜局 + 0.5×和局）/ 总局数，演示配置取 55%（<span className="mono">promote_threshold=0.55</span>）。这条线只看挑战者对当前最佳模型那一组的得分率，对基线的得分率不参与晋升。
          达到或超过这条线，挑战者才成为新的当前最佳模型。它是让自动训练能继续运转的工程门槛，
          并不等于「已统计证明更强」：局数越少，运气和开局造成的摇摆越大。
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
          受控不是把同一局棋重复 6 遍。写程序的人常碰到「确定性陷阱」：
          若每步都只取访问数最多的动作（取最大，即 <span className="mono">argmax</span>），再加上不加噪声的搜索是完全确定的，同一局面永远走出同样的棋。
          2 个固定的网络只要先手方相同，
          就会下出逐手一模一样的棋，「6 局对抗」等于只下了 2 局：挑战者执黑 1 局、执白 1 局（黑方永远先走，换的是谁拿黑），其余 4 局全是重播。
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
          局号 <span className="mono">gi</span> 为偶数时挑战者（<span className="mono">pred_a</span>）执黑、奇数时执白，
          6 局里挑战者执黑 3 局、执白 3 局。
        </p>
        <p>
          自我对弈同理，它的棋谱局局不同，开局采样正是原因之一。
          开局适度分叉、双方轮流执黑，才能减少把颜色和单一路线误当成棋力的机会；
          竞技场不加根噪声（见上方定义框「受控对战」），靠的就是把开局引上不同岔路。
          解法是开局采样：前几手仍按 π 采样，概率大的多抽、小的也抽得到，把棋盘引上不同的岔路，
          之后才取最大（argmax）。
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
          采样手数的折半取法写在配置调用处，是配置上的选择，不是算法常量；模拟预算也彼此独立，
          竞技场与自我对弈各用各的模拟次数配置（演示配置的取值见例 15-2 旁注），
          混用会让两边用不一样的思考量比棋力。
        </p>

        <h3>胜 1、和 0.5、负 0 与 55% 晋升线</h3>
        <p>
          受控对战比训练损失更直接，但它给出的仍是有限证据。
          比赛记分规则固定：胜记 1 分，和棋记 0.5 分，负记 0 分；
          <span className="mono">score = (wins + 0.5×draws) / games</span>，其中 games 为本场局数（例中为 6）。
          在每局只有胜、负两种结果的独立试验里（暂不计和棋，按二项概率计算），哪怕 2 个网络实力完全一样，6 局里纯靠运气至少赢 4 局（含 4 局，得分率 ≥ 66.7%）的概率也有约 34%。下面先在例 15-1 亲手配几组胜负和，体会 55% 晋升线与有限局数下的运气边界。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="得分率按胜 1、和 0.5 计算"
          source="alphagomoku/arena.py · play_match"
        >
          <div className="codewalk">
            <pre>{`    total = max(len(records), 1)
    return {
        "wins_a": wins_a,
        "wins_b": wins_b,
        "draws": draws,
        "win_rate_a": (wins_a + 0.5 * draws) / total,
        "games": len(records),
    }`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <PromoCalc />

      <div className="prose mt-10">
        <h3>从 6 局汇总走进单局实录</h3>
        <p>
          第 2 轮训练结束后，挑战者对现任 <span className="mono">best</span> 下满 6 局受控对战，以 6 胜 0 负（得分率 100% ≥ 55%）顺利晋升。
          下面例 15-2 抽出其中挑战者执黑的一局实录（<span className="mono">{ARENA.id}</span>）：每手做 30 次模拟，开局前 5 手按 <span className="mono">π</span> 采样分叉，之后取最大访问落子。你可以逐手推进，观察右侧面板里的访问数前三名与当前行棋方视角的搜索汇总 <span className="mono">root_value</span>。
        </p>
      </div>

      <ArenaReplay />

      <div className="prose mt-12">
        <h3>π 集中是一条待验证的假设</h3>
        <p>
          读训练记录时容易只看单个漂亮点位。下面用一个案例走完整流程：先提假设，再想办法验证。
          第 3 轮（轮号即 iteration 号，自 0 编号）的一局自我对弈
          （{SP.id}）的完整记录见第 12 课例 12-1，先回想那局，再看下表。
          下表由内置的真实记录（32 手）现算，各列含义如下：
          「搜索汇总 root_value」是多次模拟回传到树根后的平均；「π 最热一格」表示最热门落点
          拿走了全部根访问的多少；「π 完全集中」数一数有几手的 π 几乎全集中在一个格子（≥0.999，下文公式按 100% 记）。
          待验证的假设是：第 10 手（白落）训练保存的记录中的 π 全部集中在天元 (4,4)，
          看着像「学会了天元最大」；逐手清单见下方现算区。
        </p>
        <table className="l09-table">
          <thead>
            <tr><th>行棋方</th><th>搜索汇总 root_value</th><th>π 最热一格</th><th>π 完全集中</th></tr>
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
          白方 16 手的搜索汇总 <span className="mono">root_value</span> 全是正的，
          黑方 16 手全是负的（正 = 搜索汇总后偏向「当前行棋方占优」，负 = 偏向「当前行棋方不利」）。备择解释也要摆出来：这局正好白胜，若评估全程准确，形状也会差不多；单凭它分不出「颜色偏向」和「评估准确」。
          它不是价值头（网络直接输出的那个价值估计 v_net）在树根直接给出的
          <span className="mono">v_net</span>，而是多次叶评估和终局结果
          回传后的平均。
        </p>
        <p>
          这是一条值得怀疑的模式：它可能表示搜索结果过度依赖行棋方或
          与颜色相关的特征，而不怎么看棋盘本身；但只看这一局 32 手，
          不能直接判定「网络已经偏向某种颜色」，也不能说谁导致了谁，只能把它当作需要验证的假设。
        </p>
        <div className="formula">
          {FOCUSED.map((m, i) => (
            <span key={i}>
              第 {m.n + 1} 手 {m.player === -1 ? "白" : "黑"}落 {coord(m.x, m.y)}:
              π={(m.top[0].prob * 100).toFixed(0)}%
              {coord(m.x, m.y) === "(4,4)" ? "（天元）" : "（非天元）"}{i < FOCUSED.length - 1 ? "、" : ""}
            </span>
          ))}
          <br />·<span className="hl">本局 32 手里共 6 手的 π 是 100%，且六手全是白方：天元 (4,4) 一手，另有 (1,0)、(5,4)、(6,1)、(0,7)、(2,1) 五手</span>
        </div>
        <p className="mt-3">
          上方逐手清单与表格都出自同一局真实记录 {SP.id}（第 12 课例 12-1 同一局）：
          π 记成 100% 的 6 手全由白方落下，天元之外的五手都是单点；白方搜索汇总区间落在正侧，黑方落在负侧。
        </p>
        <p>
          在这局记录里，天元那手看起来合理，其余五手都落在不寻常的点上，值得怀疑；六手全是白方，又正对上文「可能与颜色相关的特征」那条线索。但这只足以说明
          「集中≠棋理对」，还不能说明集中从何而来。
          本课最该带走的一句话是：π 集中不等于棋力，损失降也不等于棋力；
          受控对战给出更直接、但仍有限的证据。
        </p>
      </div>

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
          "π 完全集中、root_value 全正全负都只是值得怀疑的模式，要靠对照与更多局面验证；受控对战是更直接的证据。",
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
          {
            q: "一次搜索把访问几乎全压在一个落点，为什么仍不能证明网络已经学会了对应棋理？",
            options: [
              "因为只要把搜索次数增加十倍，就必然证明棋理正确",
              "因为集中只说明搜索把预算压在那里；它可能来自正确证据、错误的第一眼判断（先验）或偶然路线，原因需要对照与更多局面验证",
              "因为访问数高的落点一定是坏点",
            ],
            answer: 1,
            explain:
              "访问数是搜索过程留下的记录，不是棋理正确性的证明。一处集中可能有很多原因；要判断原因，需要固定其他条件做对照，并看更多局面。前面的天元案例正是训练这种「先提出假设、再设计验证」的习惯。",
          },
        ]}
      />
    </section>
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
          <span className="text-xs" style={{ color: "var(--fg-faint)" }}>快捷：</span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn" data-qa="calc-preset"
              onClick={() => setSlots(p.slots)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="reveal-box mt-4 text-sm leading-relaxed">
          <strong>无和棋时的运气过线概率 34%：</strong>假设 2 个网络棋力完全相同（每局五五开），
          纯靠运气至少赢 4 局（含 4 局）的概率 = (C(6,4)+C(6,5)+C(6,6)) / 2⁶ =
          (15+6+1)/64 ≈ <span className="num">34%</span>。
        </div>
        <div className="reveal-box mt-3 text-sm leading-relaxed">
          公式怎么读：C(6,4) 是「6 局里挑 4 局来赢」，有 15 种挑法（其实等于挑 2 局来输：
          6×5÷2 = 15，先挑谁后挑谁算同一种，所以除以 2）；C(6,5)=6 种，
          C(6,6)=1 种，赢 4 局、赢 5 局、赢 6 局 3 种都得算进去。
          2⁶ 就是 2 连乘 6 次 = 64：每局非赢即输，6 局的全部输赢排法共 64 种。
          把「至少赢 4 局」的各种排法加起来再除以 64，就是二项概率给的 34%。
          也就是说，2 个网络一样强，大约每 10 回里有 3 回半会纯靠运气赢到 4 局及以上。
        </div>
        <div className="reveal-box mt-3 text-sm leading-relaxed">
          和棋也算半分：3 胜 1 和 2 负 = 58.3%，一样过线。
          所以 6 局的晋升线 55% 只比五五开高一档，是工程上的折中，不是强证据；真要证明棋力得打几百局。
          6 局过线只说明改进回路在运转（能自动换 best），并不说明棋力已足够。
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
