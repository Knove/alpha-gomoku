/** 第 16 课 · 管线：一轮训练怎样运行并恢复。
 *  节拍：思考题（顺序与中断）→ 两种「继续」→ 逐段推进真实管线（正文证据组）→ 崩溃恢复推演 → 对证（整链：pipeline.run 全序）→ 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"

const STAGES = [
  {
    name: "自我对弈",
    output: "对局记录 + 新的（局面 s、π、z）",
    why: "先让当前网络完成这一批自我对弈，才有这一轮的新样本。play_games 返回后，管线逐局写入 games，并把样本加入回放池。",
  },
  {
    name: "保存回放池",
    output: "buffer.npz",
    why: "对局样本先落盘（写到硬盘上，存成文件）。程序正常重启时会恢复这个回放池，不必把以前的样本全部丢掉。",
  },
  {
    name: "训练或预热",
    output: "挑战者权重 + 损失指标，或「继续积累样本」",
    why: "回放池达到 min_buffer 才训练；样本不足时跳过权重更新，只在事件日志里记一条预热。",
  },
  {
    name: "竞技场",
    output: "晋升结果 + best 可能易主",
    why: "只有到了配置规定的轮次才比赛。演示配置下对 best 和 baseline 各赛 6 局、共 12 局（默认配置各 10 局）；第一次评估还没有 best，那一轮只对 baseline 赛 6 局，挑战者直接被任命为 best。代价接近一批自我对弈。相邻两轮挑战者差别小，按配置每隔一轮（arena_every=2）比一次，实际在第 0、2、4…轮各赛一场，把预算省给出新样本。",
  },
  {
    name: "先写指标记录（每轮一行）",
    output: "metrics.jsonl 新增一行",
    why: "先留下「这一轮完成到哪一步」的事实。这样检查点不会领先于可查的指标记录。",
  },
  {
    name: "再保存检查点",
    output: "latest.pt，必要时还有 iter_N.pt",
    why: "latest 保存最新训练权重；每隔 keep_checkpoint_every 轮，再额外保留一份不会被下一轮覆盖的检查点。",
  },
] as const

export default function L16() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 16 课</div>
      <h1 className="text-2xl font-bold">管线：一轮训练怎样运行并恢复</h1>

      <LessonGuide
        question="自我对弈、保存回放池、训练、竞技场、指标和检查点为什么必须按这个顺序？"
        why="训练不只要算对，还要在暂停、停止或崩溃后留下彼此对得上的记录；顺序本身就是正确性的一部分。这串步骤项目里叫管线：一轮训练依次走「自我对弈 → 保存回放池 → 训练（或预热）→ 竞技场（到轮次才跑）→ 写指标记录 → 保存检查点」，每阶段都有明确的落盘产物，顺序本身保证崩溃后可恢复。"
        chain={[
          "当前网络先下棋，产生并保存新样本",
          "回放池够大才训练，指定轮次才跑竞技场",
          "先把这一轮写进指标记录，再保存同轮检查点",
          "重启时恢复权重和回放池，但重新建立优化器与随机数状态",
        ]}
        takeaway="你能跑通一轮训练管线，并排出写盘顺序（指标先于检查点）；演练崩溃恢复：权重、样本各回到哪一步，动量与随机数发生器从零重来。"
        boundary="本课追踪一个训练器的阶段与落盘边界，不打开每一种文件的内部格式。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一轮训练结束时，指标记录和最新检查点应该先写哪一个？",
            options: [
              "先写检查点，指标晚一点补也完全一样",
              "先写指标记录，再保存检查点，避免模型已经领先而记录还停在旧轮",
              "两个文件不相关，任意顺序都不会影响恢复",
            ],
            answer: 1,
            explain:
              "选第二项。恢复时检查点决定网络从哪轮权重继续，指标尾行保存可查的轮次事实。先写指标再写模型，重做的顶多是一轮的计算，不会让权重悄悄跑到记录前面。（中断还有别的代价，正文的恢复边界一节会逐条数。）",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一轮训练是一串有顺序的落盘阶段</h3>
        <p>
          一轮训练要走一串固定顺序的步骤，把它们写成自动推进的流程，就是本课要拆开看的对象。
          每个阶段结束时都有明确的落盘产物，阶段之间不互相插队。
          训练器每一轮都按同一串阶段走：先让当前网络下棋并收样本，把样本存进回放池，
          样本够数才更新权重，到了配置规定的轮次才跑竞技场，最后先写指标行、再保存网络权重。
        </p>
        <Def term="管线" en="pipeline">
          一轮训练固定要走的阶段序列：自我对弈、保存回放池、训练或预热、竞技场、写指标记录、保存检查点（检查点定义与命名规则见第 14 课）。
          阶段顺序写死在代码里，每阶段产出各自负责的文件。顺序本身保证中断之后能从某个阶段边界接着跑：可恢复的是权重与轮号，样本可恢复以 buffer 文件完整为前提。
        </Def>
        <Def term="指标记录" en="metrics record">
          每轮结束追加一行的指标记录，落在 <span className="mono">metrics.jsonl</span>，
          记下这一轮的损失、回放池大小和竞技场汇总。它按行追加，旧行不动，尾行就是可查的最新事实。
          崩溃重做同一轮会再追加一行同轮号的重复记录：旧那行的损失数字对应的权重已随内存消失、从未以本轮标号进检查点。
          读取时应以每轮最后一行为准。
        </Def>
      </div>

      <PipelineStepper />

      <div className="prose mt-10">
        <h3>把一轮训练跑起来：命令与配置</h3>
        <p>
          训练器的入口是 <span className="mono">python -m alphagomoku.trainer</span>。
          只有 <span className="mono">--run</span> 必填，指向 run 目录；
          <span className="mono">--config</span> 仅在该目录尚无 config.json 时用来播种，
          <span className="mono">--max-iterations</span> 限制轮数。
        </p>
        <EvidenceCard
          fidelity="constructed"
          title="训练器启动命令与开发、验收脚本示例"
          source="README.md 运行说明与 scripts/dev.sh、scripts/start.sh"
        >
          <div className="codewalk">
            <pre>{`python -m alphagomoku.trainer --run data/runs/dev --config configs/fast.json
python -m alphagomoku.trainer --run data/runs/dev --max-iterations 4

scripts/dev.sh
scripts/start.sh`}</pre>
          </div>
        </EvidenceCard>
        <p>
          配置的两套值：项目默认（<span className="mono">configs/default.json</span>）与
          演示（<span className="mono">configs/fast.json</span>，站里真实记录就出自它）。
          改一个数之前先看它影响哪一段：
        </p>
        <table className="l09-table">
          <thead><tr><th>配置键</th><th>默认</th><th>演示</th><th>影响</th></tr></thead>
          <tbody>
            <tr><td className="mono">net_channels / net_res_blocks</td><td>64 / 4</td><td>48 / 3</td><td>网络容量与感受野</td></tr>
            <tr><td className="mono">mcts_simulations</td><td>100</td><td>40</td><td>自我对弈每手思考量</td></tr>
            <tr><td className="mono">c_puct / dirichlet_epsilon / dirichlet_alpha</td><td>1.5 / 0.25 / 0.3</td><td>同左</td><td>探索强度与根噪声</td></tr>
            <tr><td className="mono">temp_threshold</td><td>12</td><td>10</td><td>前几手按 π 采样，之后取最大访问</td></tr>
            <tr><td className="mono">games_per_iteration / parallel_games</td><td>24 / 8</td><td>12 / 6</td><td>每轮对局数与并行局数</td></tr>
            <tr><td className="mono">batch_size / train_steps</td><td>128 / 30</td><td>128 / 20</td><td>每轮更新的批大小与步数</td></tr>
            <tr><td className="mono">lr / weight_decay</td><td>0.01 / 1e-4</td><td>同左</td><td>步幅与轻拽</td></tr>
            <tr><td className="mono">buffer_size / min_buffer</td><td>100000 / 512</td><td>50000 / 256</td><td>回放池容量与训练门槛</td></tr>
            <tr><td className="mono">arena_every / arena_games / arena_simulations</td><td>2 / 10 / 50</td><td>2 / 6 / 30</td><td>受控对战的节奏、局数与每手思考量</td></tr>
            <tr><td className="mono">promote_threshold</td><td>0.55</td><td>0.55</td><td>晋升线</td></tr>
            <tr><td className="mono">seed / device / keep_checkpoint_every</td><td>42 / auto / 10</td><td>42 / auto / 5</td><td>可复现性、算力选择、留档节奏</td></tr>
          </tbody>
        </table>
        <p>
          表里与本课边界直接相关的三个键是 <span className="mono">temp_threshold</span>、
          <span className="mono">buffer_size</span> 与 <span className="mono">min_buffer</span>。
          <span className="mono">min_buffer</span> 是开训门槛（定义见第 14 课），不是回放池容量：
          没过门槛的那一轮照常留下对局与样本，只跳过权重更新。
          三个键的两套值是 temp_threshold 默认 12、演示 10，buffer_size 与 min_buffer
          默认 100000 与 512、演示 50000 与 256。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="自我对弈与训练阶段的默认配置字段"
          source="alphagomoku/config.py · Config"
        >
          <div className="codewalk">
            <pre>{`    temp_threshold: int = 12
    # self-play
    games_per_iteration: int = 24
    parallel_games: int = 8
    # training
    batch_size: int = 128
    train_steps: int = 30
    lr: float = 0.01
    weight_decay: float = 1e-4
    buffer_size: int = 100_000
    min_buffer: int = 512`}</pre>
          </div>
        </EvidenceCard>

        <h3>「继续训练」有两种，恢复的程度不一样</h3>
        <p>
          同一进程里的下一轮会保留网络、优化器的动量、随机数发生器和回放池。
          进程退出后重新启动则不同：项目会自动加载 <span className="mono">latest.pt</span> 和
          <span className="mono">buffer.npz</span>，下一轮编号取检查点里的迭代号加 1。
          所以「恢复训练」准确地说是：恢复网络权重和旧样本，再新建优化器（参见：第 3 课）与随机数发生器。
          恢复的随机数不是「接续」，而是确定性重开：同一个种子重新走一遍随机流。
          检查点只保存网络权重、配置和少量说明，没有保存优化器状态与随机数发生器的状态。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="启动时重设随机种子，并尝试恢复最新检查点与回放池"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`    torch.manual_seed(cfg.seed)
    rng = np.random.default_rng(cfg.seed)

    net = AlphaGomokuNet(cfg.board_size, cfg.net_channels, cfg.net_res_blocks)
    iteration = 0
    latest_path = storage.checkpoint_path("latest")
    if latest_path.exists():
        net, meta = load_checkpoint(str(latest_path), device)
        iteration = int(meta.get("iteration", -1)) + 1
        storage.append_event("log", {"level": "info",
                                     "message": f"resumed from latest.pt, next iteration {iteration}"})

    buffer = ReplayBuffer(cfg.buffer_size, cfg.board_size)
    if storage.buffer_path.exists():
        try:
            buffer.load(storage.buffer_path)
        except (OSError, ValueError) as e:
            storage.append_event("log", {"level": "warn", "message": f"buffer load failed: {e}"})`}</pre>
          </div>
        </EvidenceCard>
        <p>
          三者都相同且网络权重没变，重做出的就是同一批对局；已下局数写进指标记录之后再崩，
          重做时它已经变了，出的是另一批。这是有意的安排：防止同一批样本二次入池。
          逐轮自我对弈的随机流由「种子、轮号、已下局数」三者决定（已下局数只数自我对弈，不含竞技场）。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="每轮自我对弈用种子、轮号与累计局数派生独立随机流"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`            iter_rng = np.random.default_rng(cfg.seed * 1_000_003 + iteration * 97 + games_total)`}</pre>
          </div>
        </EvidenceCard>
        <p>
          动量历史（第 14 课定义的优化器惯性状态）则归零。恢复后头几步没有惯性，单批噪声直接拽着权重走、方向比平时颠簸；
          几步之后惯性重建，对最终收敛通常可容忍。
        </p>
        <p>
          检查点不保存优化器与随机数状态：它的职责只是「权重可复用」（server、
          竞技场加载权重都靠它）。优化器状态只对续训有用，存它会让文件翻倍、加载路径分叉；
          这是有意的简化，升级路径是保存时把优化器一并塞进文件。这些合起来就是当前实现的恢复边界。
        </p>
        <Def term="随机数发生器" en="random number generator, RNG">
          产生随机数序列的机制；它的内部状态决定下一串抽样。检查点不保存它，
          所以恢复后的抽样序列不会与中断前接续。
        </Def>
      </div>

      <div className="prose mt-10">
        <h3>暂停、停止与崩溃留下的边界各不相同</h3>
        <p>
          暂停在主循环开头检查，所以通常等当前整轮结束后才真正进入暂停状态。
          轮边界不存在半成品。对局已整块写完、回放池已保存完，在这里停下，任何文件都不会停在半途。
          唯一既不受原子写也不受跳行保护的整文件是 buffer.npz：它直接写入，不走原子换名。
        </p>
        <Def term="原子" en="atomic">
          一次写入要么完整生效、要么完全不生效，不会留下写了一半的文件。
          检查点的保存走这条路；回放池 <span className="mono">buffer.npz</span> 是直接写入，
          不保证原子（回放池是 np.savez_compressed 直接写目标文件；检查点那样先写临时文件再换名，就能原子，这是它的升级路径）。写一半断电留下的截断文件，加载时抛出的异常（如 zipfile.BadZipFile、EOFError）
          不在 pipeline 的捕获范围（那里只接 OSError、ValueError），进程会带着报错退出，
          要删掉 buffer.npz 才能重跑；回放池作废（接得住的加载失败则丢弃回放池、以空的回放池继续攒）。恢复边界里不可逆丢样本的路径只有这一条。
        </Def>
        <p>
          stop 命令除了在每轮开头被检查一次，自我对弈的下棋过程中也会每隔一会儿被查看一次（竞技场不查：它是固定局数的评估，中途打断得不偿失，停在轮边界即可）。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="自我对弈途中通过回调检查 stop 命令"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`            def should_stop() -> bool:
                return storage.read_control() == "stop"

            records = play_games(
                predictor, cfg, cfg.games_per_iteration, iteration, iter_rng,
                kind="selfplay", id_prefix="sp",
                on_progress=on_progress, on_game_end=on_game_end,
                should_stop=should_stop,
            )`}</pre>
          </div>
        </EvidenceCard>
        <p>
          收到 stop 的那一轮既不训练也不记预热，直接离开本轮；已经完成的对局仍会写入，
          随后程序退出训练。正常退出会在 <span className="mono">finally</span> 中再次保存回放池和
          <span className="mono">latest</span>，并把 status.json 的状态写成 stopped。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="退出训练循环时收尾保存回放池、最新检查点与状态"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`    finally:
        buffer.save(storage.buffer_path)
        save_checkpoint(net, cfg.to_dict(), str(latest_path),
                        meta={"iteration": max(iteration - 1, -1)})
        write_status("stopped", "idle")`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          收尾保存的 <span className="mono">meta</span> 轮号取 <span className="mono">max(iteration - 1, -1)</span>，
          确保中断退出时保存的轮号不会超前。
        </p>
        <p>
          强制崩溃可能来不及执行 finally，所以项目还依靠原子写入的检查点和
          「指标先于检查点」的写入顺序，守住轮边界（完整写盘代码见下方课末整链第三张卡）。
          这套顺序不能保证一条计算也不重复；它保证的是不会出现「权重已前进、
          记录没前进」却被当成完整一轮的情况：崩溃落在两次写入之间时，重启会从旧检查点再做，
          而不是加载一个指标里从未出现的新模型。finally 的收尾保存也只保证轮号不超前：被中断（如 Ctrl-C）时它存下的权重可能已走过本轮的部分更新，meta 却只记到上一轮（多训半轮可容忍，比加载超前模型安全）。
        </p>
      </div>

      <RecoveryProbe />

      <div className="prose mt-10">
        <h3>跑起来之后，按症状排障</h3>
        <p>
          指标不是看一次就完的数字，而是症状线索。常见的四种症状、先查什么：
        </p>
        <table className="l09-table">
          <thead><tr><th>症状</th><th>先查</th><th>处置</th></tr></thead>
          <tbody>
            <tr><td>损失一直不动</td><td>回放池是否还在预热</td><td>攒够 min_buffer 才有更新；够了仍不动，回头查学习率与 z 的视角</td></tr>
            <tr><td>π 几乎全压在一两手</td><td>每手模拟数与根噪声</td><td>提高 mcts_simulations；确认自我对弈开了根噪声（竞技场不开是设计如此）</td></tr>
            <tr><td>价值损失贴 0、策略损失高</td><td>z 是否按行棋方视角补的</td><td>对照样本构造一节核对 z；视角错时价值头在拟合错目标</td></tr>
            <tr><td>训练损失降、受控对战不涨</td><td>对局数与增广是否单一</td><td>过拟合：按「训练损失降、对战不涨」确认后，提升样本多样性（增广与回放混合，第 14 课）</td></tr>
          </tbody>
        </table>
        <p>
          完成标准也来自证据而不是感觉：受控对战对 best 的得分率稳定过 55% 晋升线
          （局数有限时过线也可能是运气，第 15 课有算例），对 baseline 明显领先
          （它是对照尺，不参与晋升），指标曲线可追溯到每一轮的对局与样本数，
          才算这一轮训练在真的变强。
        </p>
      </div>

      <Ledger title="alphagomoku/pipeline.py · run · 启动恢复、训练门槛与写盘顺序">
        <EvidenceCard
          fidelity="runtime-exact"
          title="启动时恢复权重、回放池与累计计数，并新建优化器"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`    latest_path = storage.checkpoint_path("latest")
    if latest_path.exists():
        net, meta = load_checkpoint(str(latest_path), device)
        iteration = int(meta.get("iteration", -1)) + 1
        storage.append_event("log", {"level": "info",
                                     "message": f"resumed from latest.pt, next iteration {iteration}"})

    buffer = ReplayBuffer(cfg.buffer_size, cfg.board_size)
    if storage.buffer_path.exists():
        try:
            buffer.load(storage.buffer_path)
        except (OSError, ValueError) as e:
            storage.append_event("log", {"level": "warn", "message": f"buffer load failed: {e}"})

    if not storage.checkpoint_path("baseline").exists():
        save_checkpoint(net, cfg.to_dict(), str(storage.checkpoint_path("baseline")),
                        meta={"iteration": -1, "note": "frozen random init"})

    tail = _metrics_tail(storage)
    best_iteration = int(tail.get("best_iteration", -1))
    games_total = int(tail.get("games_total", 0))
    samples_total = int(tail.get("samples_total", 0))

    optimizer = make_optimizer(net, cfg)`}</pre>
          </div>
        </EvidenceCard>
        <EvidenceCard
          fidelity="runtime-exact"
          title="达到最小样本门槛才执行训练步，否则只记预热日志"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`            if not stopped_mid and len(buffer) >= cfg.min_buffer:
                write_status("running", "train")
                acc = []
                for i in range(cfg.train_steps):
                    acc.append(train_step(net, optimizer, buffer.sample(cfg.batch_size, rng),
                                          device, rng))
                    heartbeat("train", (i + 1) / cfg.train_steps)
                avg = {k: sum(a[k] for a in acc) / len(acc) for k in acc[0]}
                storage.append_event("train_end", {
                    "iteration": iteration, "loss": avg["loss"],
                    "policy_loss": avg["policy_loss"], "value_loss": avg["value_loss"],
                    "buffer": len(buffer),
                })
            elif not stopped_mid:
                storage.append_event("log", {"level": "info",
                                             "message": f"buffer warming up: {len(buffer)}/{cfg.min_buffer}"})`}</pre>
          </div>
        </EvidenceCard>
        <EvidenceCard
          fidelity="runtime-exact"
          title="每轮结束先追加指标记录，再保存检查点"
          source="alphagomoku/pipeline.py · run"
        >
          <div className="codewalk">
            <pre>{`storage.append_metrics({
    "iteration": iteration,
    "loss": avg["loss"] if avg else None,
    "policy_loss": avg["policy_loss"] if avg else None,
    "value_loss": avg["value_loss"] if avg else None,
    "policy_entropy": avg["policy_entropy"] if avg else None,
    "lr": avg["lr"] if avg else cfg.lr,
    "games": len(records),
    "games_total": games_total,
    "samples": new_samples,
    "samples_total": samples_total,
    "buffer": len(buffer),
    "sec_selfplay": round(sec_selfplay, 2),
    "sec_train": round(sec_train, 2),
    "arena_vs_best": arena_best,
    "arena_vs_baseline": arena_base,
    "best_iteration": best_iteration,
    "ts": time.time(),
})
# checkpoints only after metrics: meta.iteration <= metrics tail
save_checkpoint(net, cfg.to_dict(), str(latest_path), meta={"iteration": iteration})
if iteration % cfg.keep_checkpoint_every == 0:
    save_checkpoint(net, cfg.to_dict(),
                    str(storage.checkpoint_path(f"iter_{iteration:06d}")),
                    meta={"iteration": iteration})`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          运行 <span className="mono">python -m pytest tests/test_smoke.py -q</span> 可跑通最小预算的一轮完整管线，验证 <span className="mono">metrics.jsonl</span> 尾行的轮号始终不落后于 <span className="mono">latest.pt</span> 的迭代号。
        </p>
      </Ledger>


      <ChapterEnd
        summary={[
          "一轮训练按固定阶段落盘：自我对弈、保存回放池、训练或预热、到轮次才跑竞技场、先写指标记录再保存检查点。顺序本身就是正确性的一部分。",
          "进程重启恢复的是网络权重、迭代号和回放池；优化器与随机数发生器重新建立，动量历史和随机抽样位置不在恢复范围内。",
          "暂停会等到轮边界、停止会收尾保存、强制崩溃靠原子写入的检查点与指标先于检查点的顺序兜底；buffer.npz 直接写入，不保证原子。",
        ]}
        next={
          <>
            下一课把 run 目录里的文件一件件打开：谁负责写、用哪种写法、名字里的
            sp/ar/ab 前缀各是什么意思，以及心跳和锁怎样防住死进程与两个写入者。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "恢复训练后优化器的动量归零。要不要把优化器状态一并存进检查点？依据是什么？",
            options: [
              "本项目选择不存：换取文件简单、加载路径统一；代价是恢复后头几步没有惯性、方向比平时颠簸，几步后惯性重建。中断频繁且在意这几步时，再考虑存",
              "必须存：不存就无法恢复训练",
              "不用管：动量本来就不起作用",
            ],
            answer: 0,
            explain:
              "检查点带回网络权重和迭代号，buffer.npz 带回旧样本；make_optimizer 和随机数发生器在新进程里重建，所以这不是逐字节续上旧进程。动量丢失只影响恢复后头几步，这是权衡后的取舍，不是疏漏。",
          },
          {
            q: "回放池还没有达到 min_buffer 时，这一轮会怎样？",
            options: [
              "整轮作废，对局和样本全部删除",
              "继续保存对局与样本，但跳过训练并记录预热状态",
              "拿少量样本无限重复，强行完成全部 train_steps",
            ],
            answer: 1,
            explain:
              "min_buffer 是开始权重更新所需的最小样本数。自我对弈产物照常进入回放池；只有权重更新暂时跳过，后续轮次继续积累。",
          },
          {
            q: "如果程序在指标记录已写、latest 还没写时突然崩溃，最准确的说法是什么？",
            options: [
              "记录可能暂时领先旧检查点，重启可能重做工作，但不会加载一个领先于指标的新模型",
              "latest 已自动写完，因此什么都不可能重复",
              "指标记录会自动回滚，所以两个文件永远同时消失",
            ],
            answer: 0,
            explain:
              "先写指标记录的目标不是做到两个文件同时出现，而是禁止检查点超前。断在两步之间时，旧检查点仍可恢复；代价可能是重做，而不是无记录地跳过。",
          },
        ]}
      />
    </section>
  )
}

function PipelineStepper() {
  const [step, setStep] = useState(0)
  const [bufferReady, setBufferReady] = useState(false)
  const shown = STAGES.slice(0, step + 1)

  return (
    <figure className="figure mt-8" data-qa="pipeline-stepper">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 16-1 · 按真实顺序推进一轮</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          先选择回放池是否达到 min_buffer 门槛，再逐段推进。观察第三段会「训练」还是「只预热」；
          无论哪种情况，最后都必须先写指标、再保存检查点。
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn ${!bufferReady ? "active" : ""}`}
            onClick={() => { setBufferReady(false); setStep(0) }} data-qa="buffer-warming">
            回放池 200 / 门槛 256
          </button>
          <button type="button" className={`btn ${bufferReady ? "active" : ""}`}
            onClick={() => { setBufferReady(true); setStep(0) }} data-qa="buffer-ready">
            回放池 800 / 门槛 256
          </button>
        </div>

        <ol className="mt-5 space-y-3">
          {shown.map((stage, i) => {
            const warmup = i === 2 && !bufferReady
            return (
              <li key={stage.name} className="reveal-box text-sm" data-qa="pipeline-stage">
                <div className="flex items-baseline gap-2">
                  <span className="num" style={{ color: "var(--accent-deep)" }}>{i + 1}</span>
                  <strong>{warmup ? "训练阶段暂不执行：继续预热" : stage.name}</strong>
                </div>
                <p className="mt-1" style={{ color: "var(--fg-muted)" }}>
                  {warmup
                    ? "200 条样本还没到 256 条门槛，本轮不改权重；对局与 buffer.npz 已经保存，下一轮继续积累。"
                    : stage.why}
                </p>
                <p className="num mt-1 text-xs" style={{ color: "var(--fg-faint)" }}>
                  产物：{warmup ? "预热日志（没有新训练损失）" : stage.output}
                </p>
              </li>
            )
          })}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}>
            ← 上一步
          </button>
          <button type="button" className="btn active" disabled={step >= STAGES.length - 1}
            onClick={() => setStep((s) => Math.min(STAGES.length - 1, s + 1))} data-qa="pipeline-next">
            {step >= STAGES.length - 1 ? "本轮已落盘" : "推进下一段 →"}
          </button>
          <button type="button" className="btn" disabled={step === 0}
            onClick={() => setStep(0)}>
            ↺ 从自我对弈重走
          </button>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 16-1</span>
        阶段顺序出自 <span className="mono">alphagomoku/pipeline.py · run</span>；200、800 是为比较门槛而设的教学数字，
        演示配置的真实 <span className="mono">min_buffer</span> 是 256。
      </figcaption>
    </figure>
  )
}

function RecoveryProbe() {
  const [point, setPoint] = useState<"before" | "between" | "clean">("before")
  const copy = {
    before: {
      title: "指标记录之前强制崩溃",
      body: "这一轮还没有完整指标，也没有同轮检查点。重启从旧 latest 的下一轮编号开始。buffer.npz 是直接写入而非原子替换：崩溃前若已保存本轮样本，重做出的同一批对局会把样本再入池一次（回放池不排重）；写到一半的回放池文件加载时报错退出，要删掉 buffer.npz 才能重跑。",
      verdict: "不会加载超前模型；样本可能重复入池；重做的是同一批对局，同名棋谱里写入的着法与结果不变（时间戳会变）；写坏的回放池作废。",
    },
    between: {
      title: "指标记录之后、检查点之前强制崩溃",
      body: "指标尾行已经出现，但 latest 仍是旧权重。重启依据旧 latest 决定轮号；已下局数已写进指标，重做出的是另一批对局，样本不会重复入池。关键是不会出现「模型领先、指标缺席」。",
      verdict: "记录可能暂时领先；检查点永不领先；重做换一批对局，新棋谱顶掉旧棋谱文件，旧样本从此失去出处：回放池内样本本身（s、π、z）仍可继续训练，只是事后查不到它出自哪局棋。",
    },
    clean: {
      title: "收到 stop 后正常退出",
      body: "自我对弈会隔一会儿查看一次 stop 命令，已完成记录仍会保存；finally 再保存 buffer 与 latest，并写 stopped 状态。优化器和随机数发生器仍不会进入检查点。",
      verdict: "保存明确边界，但下次不是逐字节续跑。",
    },
  } as const
  const current = copy[point]

  return (
    <figure className="figure mt-8" data-qa="recovery-probe">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 16-2 · 把中断放在不同位置</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn ${point === "before" ? "active" : ""}`}
            onClick={() => setPoint("before")}>断在指标记录前</button>
          <button type="button" className={`btn ${point === "between" ? "active" : ""}`}
            onClick={() => setPoint("between")}>断在两次写入之间</button>
          <button type="button" className={`btn ${point === "clean" ? "active" : ""}`}
            onClick={() => setPoint("clean")}>正常 stop</button>
        </div>
        <div className="reveal-box mt-4">
          <p className="font-semibold">{current.title}</p>
          <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>{current.body}</p>
          <p className="mt-2 text-sm"><strong>结论：</strong>{current.verdict}</p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 16-2</span>
        推演依据 <span className="mono">alphagomoku/pipeline.py</span> 的 finally 收尾与写盘顺序；「可以恢复」不等于「从中断的那条机器指令继续」，要逐项说明哪些文件已经落盘。
      </figcaption>
    </figure>
  )
}
