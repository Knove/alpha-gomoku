/** 第 12 课 · 自我对弈：一手棋怎样成为 (s,π,z) 训练样本。
 *  节拍：思考题→样本三要素（落点码 _finalize 打包、落子前 s 与 π、终局后补 z）→例 12-1 真实样本拆开看→
 *  多局同时推进（落点码 play_games 合批、例 12-2）→对证（整链：play_games / _finalize）→习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const GAME = REAL.selfplayGame
const MOVES = GAME.moves

/* states[i] 是第 i 手落下之前的原始棋盘。 */
const STATES: GameState[] = (() => {
  const arr: GameState[] = [emptyBoard()]
  for (const m of MOVES) arr.push(play(arr[arr.length - 1], m.y * 9 + m.x, m.player as 1 | -1))
  return arr
})()

/** z 永远站在「那一手的行棋方」视角。 */
const zOf = (i: number) => {
  const result = GAME.result
  const player = MOVES[i].player
  return result === 0 ? 0 : player === result ? 1 : -1
}

const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`

/** prob 来自全部根访问数；top 只是摘要。由 visits/prob 可还原真实分母。 */
function rootVisits(visits: number, prob: number): number | null {
  if (visits <= 0 || prob <= 0) return null
  return Math.round(visits / prob)
}

export default function L12() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 12 课</div>
      <h1 className="text-2xl font-bold">自我对弈：一手棋怎样成为样本</h1>

      <LessonGuide
        question="落子时还不知道输赢，机器怎样在棋局结束后凑齐一条训练样本的三个要素：局面 s、访问分布 π、终局结果 z？"
        why="搜索会留下当时的思考记录，终局会给出后来才知道的结果。只有把它们按同一个行棋方视角接好，训练才不会拿错样本配错答案。"
        chain={[
          "落子前保存局面 s 和搜索访问分布 π",
          "先把动作下到棋盘上，继续完成整局棋",
          "终局后从当时行棋方视角补上 z",
          "一局棋因此留下许多条训练样本",
        ]}
        takeaway="你能从一局棋构造出全部 (s, π, z) 并与真实记录对拍：三者都站在记录该手时的行棋方视角，落子前记 s 与 π，终局后补 z；并写出跨树合批、树内串行的四步锁步接口。"
        boundary="对局记录里的 root_value 是搜索汇总，不是网络直接输出的价值估计；训练会在抽到 s 时重新运行网络。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一手棋落下时还不知道整盘输赢，完整的 z 应该什么时候写进样本？",
            options: [
              "落子前先猜一个 z，之后不再修改",
              "终局后再按记录该手时的行棋方补上赢、输或和",
              "只给最后一手写 z，前面的手都没有答案",
            ],
            answer: 1,
            explain: "选第二项。落子前能保存 s 和搜索后的 π，终局结果 z 必须等棋下完才知道。系统记住当时是谁走，再从那一方视角统一补上 +1、−1 或 0。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一手棋留下 3 个要素</h3>
        <p>
          让机器越下越强的原料，不是人类棋谱（棋谱贴的是别人的棋力上限），而是自己下出来的对局。
          同一套网络互为对手产生训练对局，这种做法叫自我对弈。
          一局棋走过的每一手都会留下一条训练样本，由{" "}
          <span className="mono">(s, π, z)</span> 3 个要素组成：落子前的局面{" "}
          <span className="mono">s</span>、搜索得到的访问分布{" "}
          <span className="mono">π</span>，以及整盘棋的终局结果{" "}
          <span className="mono">z</span>。落子前后要分开记：落子前的{" "}
          <span className="mono">s</span> 和 <span className="mono">π</span> 当场写下，
          这手棋的输赢 <span className="mono">z</span> 要等终局才补，三者始终统一在记录该手时的行棋方视角。
        </p>
        <Def term="自我对弈" en="self-play">
          同一套网络互为对手产生训练对局的做法。黑白双方共用当前这一个模型，
          下完的对局再拆成样本喂回训练，形成「越下越多经验、越训越会下」的循环。
        </Def>
        <Def term="训练样本" en="training sample">
          一条样本就是一手棋的记录，由 <span className="mono">(s, π, z)</span> 3 个要素组成。
          <span className="mono">s</span> 是局面（state），与第 4 课的加权和 s 不同：记录里存下的是 81 格标准棋盘（每格空、己、敌三态，共 81 个数）
          加当时的行棋方（1 个数，代码里写作 <span className="mono">player</span>）；训练抽样时才由它们重建网络要的 3 个输入平面（第 6 课的编码）；
          <span className="mono">π</span>
          是策略目标（policy target），81 个概率的一份分布，告诉网络「搜索认为该下哪」；
          <span className="mono">z</span> 是终局结果（outcome），告诉网络「最后谁赢了」。
          三者都站在记录该手时的行棋方视角，这是第 2 课「始终站在当前行棋方视角」这条约定贯穿到训练数据的地方。
        </Def>
        <Def term="训练目标" en="training target">
          训练时网络被要求逼近的答案。本系统的每条样本带 2 个训练目标：策略目标
          <span className="mono">π</span> 和价值目标（即终局结果）
          <span className="mono">z</span>。
          网络在训练时分别对着它们调策略头与价值头（网络分出的 2 个输出端）：策略侧看重搜索分布的高信息密度，价值侧看重终局事实的高可靠性。
        </Def>
        <p>
          为什么策略目标学搜索的 <span className="mono">π</span>，而价值目标只认终局结果{" "}
          <span className="mono">z</span>（不拿 <span className="mono">root_value</span> 或{" "}
          <span className="mono">v_net</span> 当训练目标）？因为两个头面对的判据不同。
          策略侧要的是「同一问题的更好答案」：<span className="mono">π</span>{" "}
          汇聚了几十次模拟的推演，每手都能给出 81 个格子的完整分布，信息密度（一局棋留下的互不相同信息条数）远高于单一落子动作，适合用来改进网络的先验{" "}
          <span className="mono">P</span>。
          价值侧要的则是<strong>真值</strong>：<span className="mono">z</span>{" "}
          是对局事实，与网络当前水平无关，尽管一局只定一个输赢事实（按各行棋方立场记为胜方 +1、负方 −1），独立信息只有一条，却离事实最近、可靠性最高；<span className="mono">root_value</span>（每手一个搜索估计）与{" "}
          <span className="mono">v_net</span>（一次前向估计）虽然每局能留下几十条不同数值，却都是可再生的估计，拿估计当价值目标会把搜索与网络的系统性偏差固化回权重。
          就可靠性而言 <span className="mono">z</span> 优于{" "}
          <span className="mono">root_value</span>、<span className="mono">root_value</span> 优于{" "}
          <span className="mono">v_net</span>；就信息密度而言恰好相反。因此策略侧取搜索分布的高信息密度，价值侧取终局事实的高可靠性。
        </p>

        <h3>落子前记下 s 与 π</h3>
        <p>
          <span className="mono">s</span> 是落子前的局面：搜索和真实落子都从这张棋盘出发。
          这份记录让存放旧训练样本的回放池（第 14 课详解）既能还原「己方 / 对方」，
          也能还原标「现在轮到哪边」的颜色平面（网络输入里专门标轮到谁的那一层）。
          生产代码保存前，先调用 <span className="mono">canonical_board()</span>（定义于{" "}
          <span className="mono">alphagomoku/game.py</span>）把 9×9=81 格棋盘统一转成当前行棋方视角，
          连同 81 维的 <span className="mono">π</span> 与当时的{" "}
          <span className="mono">current_player</span> 一起追加进样本列表。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="落子前将当前视角棋盘、π 与行棋方追加进样本列表"
          source="alphagomoku/selfplay.py · play_games"
        >
          <div className="codewalk">
            <pre>{`            # training sample: canonical position BEFORE the move
            s.samples.append((s.game.canonical_board().astype(np.int8),
                              pi.astype(np.float32), np.int8(s.game.current_player)))`}</pre>
          </div>
        </EvidenceCard>
        <p>
          <span className="mono">π</span> 是全部根访问数的比例。先看数字（举例值，不对应下方案例的默认手数）：某格被访问 24 次、
          根上全部动作共访问 43 次，它的比例就是 <span className="mono">24/43</span>。
          换成公式就是 <span className="mono">π(a)=N(a)/ΣN</span>，
          分母 <span className="mono">ΣN</span> 把根上所有动作算进去。这份 π 是温度 τ=1 的访问分布；温度只在决定实际落子时用来抽样，不会改写样本里的 π。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="取 τ=1 的访问分布 π，并按温度门槛选出落子动作"
          source="alphagomoku/selfplay.py · play_games"
        >
          <div className="codewalk">
            <pre>{`            pi = s.tree.root_pi(temperature=1.0)
            if sample_temperature and s.game.move_count < temp_moves:
                a = int(rng.choice(n * n, p=pi / pi.sum()))
            else:
                a = s.tree.best_action()`}</pre>
          </div>
        </EvidenceCard>
        <p>
          页面只列 top 几项方便阅读，不能把 top 列表自己的访问数相加当分母。
          搜索预算（一次搜索计划做的模拟次数）也不保证等于这个分母：第一次模拟可能只展开根，
          复用之前搜过的树时还会带上旧计数。
        </p>
        <p>
          训练学的是 <span className="mono">π</span>，而不是网络自己的先验
          <span className="mono">P</span>。<span className="mono">P</span> 是第一眼的感觉；
          <span className="mono">π</span> 是这一眼再叠加几十次「如果真下这儿、对手会怎样」
          的搜索结果。两者回答的是同一个问题：「该下哪」，81 个格子各一个数，只是一个来自
          网络一眼、一个来自几十次模拟。正因为问的是同一个问题，π 才能当 P 的训练目标。
          同一个局面，<span className="mono">π</span> 几乎总是比<span className="mono">P</span> 更接近好棋；例外也存在：预算极小、被坏叶值带偏、或自对弈给根先验掺了 25% 噪声、π 由此搜出来时，π 不见得更纯。噪声带来的不纯是刻意的探索代价：换来路线多样性、让网络见到更多局面；噪声只动根先验，π 仍要过搜索的检验。把更强的答案喂回网络，下一局的
          <span className="mono">P</span> 就会更像今天的 <span className="mono">π</span>,
          搜索再把它推得更远。
        </p>
        <p>
          把这种「靠行动结果改进策略」的框架一般化，就是强化学习：智能体（agent，行动的一方，本课指下棋程序）在环境中行动、
          由行动结果的反馈调整策略、以争取更好结果。
        </p>
        <Def term="强化学习" en="reinforcement learning">
          智能体在环境中行动、由行动结果的反馈调整策略、以争取更好结果的学习范式。
          本课的「环境」是棋盘与对手，「反馈」是搜索改进的
          <span className="mono">π</span> 与终局 <span className="mono">z</span>。
        </Def>

        <h3>终局后补上 z</h3>
        <p>
          各条样本的 z 按记录当时的行棋方分别记，黑胜时黑方样本才记 +1。<span className="mono">s</span>、<span className="mono">π</span>、
          <span className="mono">z</span> 三者都必须守第 2 课的视角约定。
          z 的规则只有一句：和棋记 0，否则看这条样本记录时的行棋方
          是不是最终胜者，是就记 +1，不是就记 −1。若某条样本记录时轮到白，而终局是黑胜，
          对那条样本来说「我」输了，所以 z 是 −1。
          注意打包进 <span className="mono">samples</span> 的只有{" "}
          <span className="mono">(canon, pi, player, z)</span> 四个字段，搜索展示值{" "}
          <span className="mono">root_value</span> 不进训练样本。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="终局后按每手记录时的行棋方回填胜负结果 z"
          source="alphagomoku/selfplay.py · _finalize"
        >
          <div className="codewalk">
            <pre>{`def _finalize(slot: _Slot, cfg: Config, iteration: int, kind: str) -> dict:
    result = slot.game.outcome()
    assert result is not None
    samples = []
    for canon, pi, player in slot.samples:
        z = 0 if result == 0 else (1 if player == result else -1)
        samples.append((canon, pi, player, np.int8(z)))`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <SPZ />

      <div className="prose mt-10">
        <h3>多局同时推进，每棵树内部仍然顺序</h3>
        <p>
          样本是多局棋同时产生的。搜索树的叶子是等待评价的局面。真正的训练器（驱动整条管线的进程）会同时推进多局棋，
          但每棵树内部仍然顺序模拟。这四步就是锁步（lockstep）接口：
          <span className="mono">select</span> 各树各走一步到待评叶子，
          <span className="mono">needs_eval</span> 报告哪些树要评，
          <span className="mono">leaf_input</span> 取叶局面叠成一批前向，
          <span className="mono">expand_and_backup</span> 逐树回传结果。
          自我对弈两边是同一个网络，代码仍按叶方（<span className="mono">leaf_player</span>）选网，
          是为两边用不同网络的场景预留的接口。
        </p>
        <p>
          它批量处理的是不同棋局的叶子，不是让同一棵树的模拟同时乱改统计。
          批量驱动程序让每棵活跃树各走一次选择，待评的树按所用网络归组，再叠成一批调用一次{" "}
          <span className="mono">predict</span> 并逐树回传。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="多局锁步搜索：各树下探选叶，待求值叶子按网络归组并合批前向"
          source="alphagomoku/selfplay.py · play_games"
        >
          <div className="codewalk">
            <pre>{`        for _ in range(sims):
            groups: dict[int, list[SearchTree]] = {}
            preds: dict[int, Predictor] = {}
            for s in slots:
                s.tree.select()
                if s.tree.needs_eval():
                    p = s.nets[s.tree.leaf_player]
                    groups.setdefault(id(p), []).append(s.tree)
                    preds[id(p)] = p
            for pid, trees in groups.items():
                batch = np.stack([t.leaf_input() for t in trees])
                probs, values = preds[pid].predict(batch)
                for t, prob, val in zip(trees, probs, values):
                    t.expand_and_backup(prob, float(val))`}</pre>
          </div>
        </EvidenceCard>
        <Def term="虚拟损失" en="virtual loss">
          同一棵树并行搜索时才需要的技巧：给正在评估的路径临时虚增访问计数、虚记一笔负分拉低该路的成绩，
          让并行线程先走他处，避免各线程挤进同一条路；等网络评完、真实结果回传时就撤销这份虚增计数，
          恢复真实计数。本系统不同树之间合批、树内顺序执行，
          所以用不到它。
        </Def>
      </div>

      <figure className="card mt-8 p-5" data-qa="batch-trace">
        <div className="mini-label">例 12-2 · 多棵树共用一次网络前向</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="chip">树 A 选择 1 个叶子</span>
          <span>＋</span>
          <span className="chip">树 B 选择 1 个叶子</span>
          <span>＋</span>
          <span className="chip">树 C 选择 1 个叶子</span>
          <span>→</span>
          <span className="chip accent">合批（一次前向喂 3 个叶局面）</span>
          <span>→</span>
          <span className="chip">各自回传</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          先自问「再加一棵树 D，前向次数会加一还是不变」，再看上面的合批箭头对答案。这样利用了网络擅长批量计算的特点，同时保留每棵搜索树「选择后立刻拿到结果、下一次再选择」的顺序。
          这里的「一批」是合批（一次前向喂多个叶局面），与训练时每批 128 条样本的小批不是同一件事。
          浏览器里的单局 <span className="mono">SearchTree.run()</span> 是顺序复现；生产训练才会跨棋局合批。
        </p>
        <figcaption className="figure-cap">
          <span className="cap-no">例 12-2</span>
          合批只画形状，不带真实数字；数据链的代码在 alphagomoku/selfplay.py · play_games 的搜索循环。
        </figcaption>
      </figure>

      <Ledger title="alphagomoku/selfplay.py · play_games 主循环">
        <p className="mb-3 text-sm">
          下面连贯展示 <span className="mono">play_games</span> 每走一手棋的主循环：先对全部在局搜索树做{" "}
          <span className="mono">sims</span> 轮锁步合批模拟，再逐局取出{" "}
          <span className="mono">π</span>、选出动作、在落子前记下{" "}
          <span className="mono">(s, π, player)</span> 并推进棋局，已终局的对局交由{" "}
          <span className="mono">_finalize</span> 回填 <span className="mono">z</span>：
        </p>
        <div className="codewalk">
          <pre>{`        # --- one search round per active game, batched across games ---
        for _ in range(sims):
            groups: dict[int, list[SearchTree]] = {}
            preds: dict[int, Predictor] = {}
            for s in slots:
                s.tree.select()
                if s.tree.needs_eval():
                    p = s.nets[s.tree.leaf_player]
                    groups.setdefault(id(p), []).append(s.tree)
                    preds[id(p)] = p
            for pid, trees in groups.items():
                batch = np.stack([t.leaf_input() for t in trees])
                probs, values = preds[pid].predict(batch)
                for t, prob, val in zip(trees, probs, values):
                    t.expand_and_backup(prob, float(val))
        # --- pick a move in every game ---
        finished: list[_Slot] = []
        for s in slots:
            pi = s.tree.root_pi(temperature=1.0)
            if sample_temperature and s.game.move_count < temp_moves:
                a = int(rng.choice(n * n, p=pi / pi.sum()))
            else:
                a = s.tree.best_action()
            # training sample: canonical position BEFORE the move
            s.samples.append((s.game.canonical_board().astype(np.int8),
                              pi.astype(np.float32), np.int8(s.game.current_player)))
            y, x = divmod(a, n)
            s.moves.append({
                "n": s.game.move_count, "x": x, "y": y, "player": s.game.current_player,
                "value": round(float(s.tree.root_value()), 4),
                "pi": [round(float(v), 4) for v in pi],
                "top": s.tree.top_actions(5),
            })
            s.tree.update_root(a)
            s.game.play(a)
            if on_progress is not None:
                on_progress(s.idx, iteration, s.game_id, s.game, s.moves[-1])
            if s.game.outcome() is not None:
                finished.append(s)
        for s in finished:
            rec = _finalize(s, cfg, iteration, kind)`}</pre>
        </div>
        <p className="mt-3 text-sm">
          运行 <span className="mono">python -m pytest tests/test_selfplay.py -q</span>{" "}
          可验证自我对弈样本生成、终局 <span className="mono">z</span> 视角回填与多局锁步合批。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "一条训练样本是 (s, π, z)：落子前记下局面 s 和搜索访问分布 π，终局后按当时行棋方补上 z。",
          "π 的分母是全部根访问数 ΣN，不是 top 列表之和；搜索预算也不保证等于 ΣN，子树复用会带来旧访问数。",
          "z 站在记录该手的行棋方：白胜时黑方样本记 −1，和棋才记 0。v_net、root_value、z 是 3 个不同的量。",
          "多局自我对弈把不同棋局的叶子叠成一批问网络；每棵树内部仍顺序模拟，因此用不到虚拟损失。",
        ]}
        next={
          <>
            样本备齐之后，下一课把 <span className="mono">π</span> 和 <span className="mono">z</span>
            变成 2 个训练目标：策略目标对着搜索给的答案，价值目标对着终局结果，2 笔损失加成总损失，
            再沿共享主干反向传播，一次改动全部权重。那一步才真正把自我对弈的记录变成棋力。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "为什么 π 的分母不能用页面显示的 top3 访问数之和？",
            options: [
              "因为 top3 只列出一部分动作，π 要除以全部根动作的访问总数",
              "因为访问数不能做除法，只能显示百分比",
              "因为 π 的分母永远固定等于棋盘 81 格",
            ],
            answer: 0,
            explain: "top3 是摘要，没显示的合法动作也可能各有访问。真实 π=N/ΣN 中的 ΣN 要把根上所有动作算进去。",
          },
          {
            q: "一局白胜棋里，黑方某一步样本的 z 是多少？",
            options: ["+1，因为整盘产生了胜者", "−1，因为那条样本站在黑方视角，黑方最终输了", "0，因为那一步不是终局"],
            answer: 1,
            explain: "z 站在记录该手的行棋方视角。白胜时，白方样本记 +1，黑方样本记 −1；和棋才记 0。",
          },
          {
            q: "生产自我对弈为什么可以批量问网络，却不需要让同一棵树并行修改统计？",
            options: [
              "它把不同棋局等待评价的叶子合批；每棵树内部仍按模拟顺序选择和回传",
              "它让同一棵树所有分支同时写 N 和 W，所以完全没有先后",
              "它只是把同一张棋盘复制很多遍，答案再取平均",
            ],
            answer: 0,
            explain: "并行的是多局之间的网络前向，不是单树内部的选择与回传。每棵树下一次选择之前，上一份叶值已经回传进统计。",
          },
        ]}
      />
    </section>
  )
}

const CHIPS: { i: number; label: string }[] = [
  { i: REAL.heroIndex, label: "课程主案例" },
  { i: 1, label: "第 2 手·高度集中" },
  { i: 0, label: "第 1 手·开局分散" },
  { i: 16, label: "第 17 手·多个候选" },
]

function SPZ() {
  const [idx, setIdx] = useState(REAL.heroIndex)
  const mv = MOVES[idx]
  const prev = idx > 0 ? MOVES[idx - 1] : null
  const top = [...mv.top].sort((a, b) => b.visits - a.visits).slice(0, 3)
  const z = zOf(idx)
  const total = top.length ? rootVisits(top[0].visits, top[0].prob) : null

  return (
    <figure className="figure mt-8" data-qa="fig-spz">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">例 12-1 · 把一手的 (s, π, z) 拆开看（{GAME.id}）</span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1">
          <div data-qa="spz-board">
            <Board board={STATES[idx].board.flat()} heat={mv.pi}
              lastMove={prev ? { x: prev.x, y: prev.y } : null} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}>← 上一手</button>
            <button type="button" className="btn" disabled={idx >= MOVES.length - 1}
              onClick={() => setIdx((i) => Math.min(MOVES.length - 1, i + 1))}>下一手 →</button>
            <span className="num ml-auto text-sm" style={{ color: "var(--fg-faint)" }}>
              第 {idx + 1} / {MOVES.length} 手
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button key={c.i} type="button" className={`btn ${idx === c.i ? "active" : ""}`}
                onClick={() => setIdx(c.i)} data-qa="spz-chip">{c.label}</button>
            ))}
          </div>
        </div>

        <aside className="w-full sm:w-72 sm:flex-none">
          <div className="mini-label">s · 落子前，轮到{mv.player === 1 ? "黑" : "白"}棋</div>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            棋盘按原坐标重建；写入训练样本时保存的是转成当前行棋方视角的标准棋盘。
          </p>

          <div className="mini-label mt-4">π · 全部根访问数形成的分布（这里只列 top3）</div>
          <p className="mt-1 text-[0.68rem] leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            与第 9 课热度（策略头概率 p）不同，这里是搜索访问分布 π。
          </p>
          <ol className="mt-2 space-y-1.5" data-qa="spz-top">
            {top.map((t) => (
              <li key={t.action} className="l00-top-row">
                <span className="mono text-sm">{coord(t.action)}</span>
                <span className="prob-track"><span className="prob-fill" style={{ width: `${t.prob * 100}%` }} /></span>
                <span className="num flex-none text-right text-xs" style={{ color: "var(--fg-faint)" }}>
                  {total === null ? `${t.visits} 次` : `${t.visits}/${total}`}
                </span>
                <span className="num w-10 flex-none text-right text-sm" style={{ color: "var(--accent-deep)" }}>
                  {Math.round(t.prob * 100)}%
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-[0.68rem] leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            分母用记录里保存的真实 prob 核对得出，包含没列进这个 top3 列表的访问。
          </p>

          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <div className="mini-label">root_value 与 z · 搜索汇总和终局结果</div>
            <p className="num mt-1.5 text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
              root_value = {mv.rootValue >= 0 ? "+" : ""}{mv.rootValue.toFixed(2)}
            </p>
            <p className="num mt-1 text-lg font-bold" data-qa="spz-z">z = {z > 0 ? "+1" : z < 0 ? "−1" : "0"}</p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              root_value 是搜索汇总，即多次回传求平均的结果，只用于记录和展示。训练抽到 s 时会重新运行当前网络，
              得到新的 v_net，再与 z 比较算出误差。
            </p>
          </div>
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 12-1</span>
        {GAME.id}，iteration 3 的一局（训练轮自 0 编号），共 {MOVES.length} 手。局面由动作逐手重建，π、root_value 来自训练保存的记录；z 由终局和该手 player 推得。
        π 面板每行的「访问次数 / 访问总数」就是正文那个比例的实数版。
      </figcaption>
    </figure>
  )
}
