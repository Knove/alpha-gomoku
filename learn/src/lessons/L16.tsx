/** 第 16 课 · 管线：一轮训练怎样运行并恢复。
 *  节拍：思考题（顺序与中断）→ 两种「继续」→ 逐段推进真实管线 → 崩溃恢复推演 → 对证 → 习题。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"

const STAGES = [
  {
    name: "自我对弈",
    output: "对局记录 + 新的 (s, π, z)",
    why: "先让当前网络完成这一批自我对弈，才有这一轮的新样本。play_games 返回后，管线逐盘写入 games，并把样本加入回放池。",
  },
  {
    name: "保存回放池",
    output: "buffer.npz",
    why: "对局样本先落盘（写到硬盘上，存成文件）。程序正常重启时会恢复这只池子，不必把以前的样本全部丢掉。",
  },
  {
    name: "训练或预热",
    output: "挑战者参数 + 损失指标，或「继续积累样本」",
    why: "池子达到 min_buffer 才训练；样本不足时跳过参数更新，只在事件日志里记一条预热。",
  },
  {
    name: "竞技场",
    output: "晋升结果 + best 可能易主",
    why: "只有到了配置规定的轮次才比赛。一次竞技场评估要对 best 和 baseline 各赛 6 局、共 12 局完整搜索（第 15 课算的 6 局是 vs best 一组；同轮还要对 baseline 再赛 6 局），代价接近一批自我对弈。相邻两轮挑战者差别又小，按配置每隔一轮（arena_every=2）比一次，把预算省给出新样本。",
  },
  {
    name: "先写 metrics（每轮一行的指标记录）",
    output: "metrics.jsonl 新增一行",
    why: "先留下「这一轮完成到哪一步」的事实。这样 checkpoint 不会领先于可查的指标记录。",
  },
  {
    name: "再写 checkpoint",
    output: "latest.pt，必要时还有 iter_N.pt",
    why: "latest 保存最新训练参数；每隔 keep_checkpoint_every 轮，再额外保留一份不会被下一轮覆盖的完整副本（快照）。",
  },
] as const

export default function L16() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 16 课</div>
      <h1 className="text-2xl font-bold">管线：一轮训练怎样运行并恢复</h1>

      <LessonGuide
        question="自我对弈、保存回放池、训练、竞技场、指标和 checkpoint 为什么必须按这个顺序？"
        why="训练不只要算对，还要在暂停、停止或崩溃后留下彼此对得上的记录；顺序本身就是正确性的一部分。这串步骤项目里叫管线：一轮训练依次走「自我对弈 → 保存回放池 → 训练（或预热）→ 竞技场（到轮次才跑）→ 写 metrics → 写 checkpoint」，每阶段都有明确的落盘产物，顺序本身保证崩溃后可恢复。"
        chain={[
          "当前网络先下棋，产生并保存新样本",
          "池子够大才训练，指定轮次才跑竞技场",
          "先把这一轮写进 metrics，再保存同轮 checkpoint",
          "重启时恢复权重和回放池，但重新建立优化器与随机数状态",
        ]}
        takeaway="checkpoint 的迭代号不能跑在指标尾行的前面；就算恢复了网络权重，也不等于把动量和随机抽样的位置一并恢复了。"
        boundary="本课追踪一个训练进程的阶段与落盘边界，不打开每一种文件的内部格式。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一轮训练结束时，metrics 和 latest checkpoint 应该先写哪一个？",
            options: [
              "先写 checkpoint，指标晚一点补也完全一样",
              "先写 metrics，再保存 checkpoint，避免模型已经领先而记录还停在旧轮",
              "两个文件不相关，任意顺序都不会影响恢复",
            ],
            answer: 1,
            explain:
              "选第二项。恢复时 checkpoint 决定网络从哪轮参数继续，metrics 尾行保存可查的轮次事实。先写指标再写模型，计算最多重做一点、不会让参数悄悄跑到记录前面；唯一会丢数据的是断在 buffer 保存中途：未写完整的池子会整池作废，这是恢复边界里最疼的一格。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>一轮训练是一串有顺序的落盘阶段</h3>
        <p>
          训练进程每一轮都按同一串阶段走：先让当前网络下棋并收样本，把样本存进回放池，
          样本够数才更新参数，到了配置规定的轮次才跑竞技场，最后先写指标行、再保存网络参数。
          每个阶段结束时都有明确的落盘产物，阶段之间不互相插队。把这串固定顺序的步骤写成一条
          自动推进的流程，就是本课要拆开看的对象。
        </p>
        <Def term="管线" en="pipeline">
          一轮训练固定要走的阶段序列：自我对弈、保存回放池、训练或预热、竞技场、写指标、写 checkpoint。
          阶段顺序写死在代码里，每阶段产出各自负责的文件；顺序本身保证中断之后能从某个阶段边界接着跑：可恢复的是参数与轮号；样本可恢复以 buffer 文件完整为前提。
        </Def>
        <Def term="checkpoint" en="checkpoint">
          一次保存下来的网络参数文件。项目里 <span className="mono">latest.pt</span> 始终是最近一轮的参数，
          按 <span className="mono">keep_checkpoint_every</span> 另存的 <span className="mono">iter_N.pt</span>
          是不会被下一轮覆盖的完整副本。它保存网络参数、配置和少量说明，不保存优化器状态。
        </Def>
        <Def term="metrics" en="metrics">
          每轮结束追加一行的指标记录，落在 <span className="mono">metrics.jsonl</span>，
          记下这一轮的损失、池子大小和竞技场汇总。它按行追加，旧行不动，尾行就是可查的最新事实。
          崩溃重做同一轮会再追加一行同轮号的记录：旧那行的损失数字对应的参数已随内存消失、从未进 checkpoint。
          读取器应以每轮最后一行为准。
        </Def>

        <h3>「继续训练」有两种，恢复的程度不一样</h3>
        <p>
          同一进程里的下一轮会保留网络、优化器的动量、随机数发生器和回放池。
          进程退出后重新启动则不同：项目会自动加载 <span className="mono">latest.pt</span> 和
          <span className="mono">buffer.npz</span>，下一轮编号取 checkpoint 里的迭代号加 1；但 checkpoint
          只保存网络参数、配置和少量说明，没有保存优化器状态与 RNG 状态。
        </p>
        <p>
          所以「恢复训练」准确地说是：恢复网络参数和旧样本，再新建优化器（参见：第 3 课）与随机数发生器。
          恢复的随机数不是“接续”而是确定性重开：同一个种子重新走一遍随机流，逐轮自我对弈的随机流由「种子、轮号、已下局数」决定，崩溃重做同一轮可复现。动量历史则归零：恢复后头几步没有惯性，单批噪声直接拽着参数走、方向比平时颠簸，几步之后惯性重建，对最终收敛通常可容忍。checkpoint 不保存优化器与随机数状态，是因为它的职责只是「参数可复用」（server、竞技场加载权重都靠它）；优化器状态只对续训有用，存它会让文件翻倍、加载路径分叉。这是有意的简化，升级路径是保存时把优化器一并塞进文件。这些合起来就是当前实现的恢复边界。
        </p>
        <Def term="随机数发生器" en="random number generator, RNG">
          产生随机数序列的机制；它的内部状态决定下一串抽样。checkpoint 不保存它，
          所以恢复后的抽样序列不会与中断前接续。
        </Def>
        <Def term="动量" en="momentum" see="第 14 课">
          优化器的一种辅助状态：把最近几次更新方向合成一股惯性，用来压住单批噪声。
          它存在优化器自己的状态里，不写入 checkpoint。
        </Def>
      </div>

      <div className="prose mt-10">
        <h3>暂停、停止与崩溃留下的边界各不相同</h3>
        <p>
          暂停在主循环开头检查，所以通常等当前整轮结束后才真正进入暂停状态。
          轮边界是整条管线唯一不存在半成品的时刻：对局已整块写完、池子已保存完（buffer 保存本身不是原子的，若恰在其中断电就落在边界之外），
          在这里停下，任何文件都不会停在半途。
          stop 命令除了在每轮开头被检查一次，下棋过程中也会每隔一会儿被查看一次；已经完成的对局仍会写入，
          随后程序离开本轮。正常退出会在 <span className="mono">finally</span> 中再次保存池子和
          <span className="mono">latest</span>，并把 status.json 的状态写成 stopped。
        </p>
        <p>
          强制崩溃可能来不及执行 finally，所以项目还依靠原子 checkpoint 和
          「metrics 先于 checkpoint」的写入顺序，守住轮边界。
        </p>
        <Def term="原子" en="atomic">
          一次写入要么完整生效、要么完全不生效，不会留下写了一半的文件。
          checkpoint 的保存走这条路；回放池 <span className="mono">buffer.npz</span> 是直接写入，
          不保证原子，所以加载失败时程序会放弃这份损坏的池子，而不是拿半份数据继续训练。
        </Def>
        <p>
          这套顺序不能保证一条计算也不重复；它保证的是不会出现「参数已前进、
          记录没前进」却被当成完整一轮的情况。
        </p>
      </div>

      <PipelineStepper />
      <RecoveryProbe />

      <section className="mt-10">
        <div className="eyebrow mb-3">对证 · 输入、处理、输出</div>
        <div className="card p-5">
          <p className="font-semibold">证据一：启动时自动恢复网络与池子，再新建优化器</p>
          <pre className="mt-3 overflow-x-auto text-xs leading-relaxed">{`# pipeline.run
if latest_path.exists():
    net, meta = load_checkpoint(str(latest_path), device)
    iteration = int(meta.get("iteration", -1)) + 1
if storage.buffer_path.exists():
    buffer.load(storage.buffer_path)  # 节选省略：加载失败（如写了一半）就放弃这份池子的 try/except
optimizer = make_optimizer(net, cfg)`}</pre>
          <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
            输入是 <span className="mono">latest.pt</span> 和 <span className="mono">buffer.npz</span>；
            输出是恢复后的网络、回放池和下一轮编号。优化器在加载之后才重新创建，所以旧动量没有回来。
          </p>
        </div>

        <div className="card mt-4 p-5">
          <p className="font-semibold">证据二：样本够多才训练，否则只预热</p>
          <pre className="mt-3 overflow-x-auto text-xs leading-relaxed">{`# pipeline.run
if not stopped_mid and len(buffer) >= cfg.min_buffer:
    for _ in range(cfg.train_steps):
        train_step(net, optimizer, buffer.sample(cfg.batch_size, rng), device, rng)
elif not stopped_mid:
    storage.append_event("log", {"message": "buffer warming up"})
# 两处 not stopped_mid：收到 stop 的那轮既不训练也不记预热，直接离开本轮`}</pre>
          <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
            <span className="mono">min_buffer</span>（开始参数更新所需的最小样本数）不是池子容量。没过门槛时本轮仍会留下
            对局和样本，只是不执行参数更新。
          </p>
        </div>

        <div className="card mt-4 p-5">
          <p className="font-semibold">证据三：指标必须排在 checkpoint 前</p>
          <pre className="mt-3 overflow-x-auto text-xs leading-relaxed">{`# pipeline.run
storage.append_metrics(metric_row)
save_checkpoint(net, cfg.to_dict(), str(latest_path), meta={"iteration": iteration})
if iteration % cfg.keep_checkpoint_every == 0:
    save_checkpoint(net, cfg.to_dict(), str(storage.checkpoint_path(iter_name)), meta={"iteration": iteration})`}</pre>
          <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
            输出顺序是 <span className="mono">metrics → latest → iter_N</span>。如果在 metrics 之后、
            checkpoint 之前突然断电，重启会从旧 checkpoint 再做，而不是加载一个指标里从未出现的新模型。
          </p>
        </div>
      </section>


      <ChapterEnd
        summary={[
          "一轮训练按固定阶段落盘：自我对弈、保存回放池、训练或预热、到轮次才跑竞技场、先写 metrics 再写 checkpoint。顺序本身就是正确性的一部分。",
          "进程重启恢复的是网络参数、迭代号和回放池；优化器与 RNG 重新建立，动量历史和随机抽样位置不在恢复范围内。",
          "暂停会等到轮边界、停止会收尾保存、强制崩溃靠原子 checkpoint 与 metrics 先于 checkpoint 的顺序兜底；buffer.npz 直接写入，不保证原子。",
        ]}
        next={
          <>
            下一章把 run 目录里的文件一件件打开：谁负责写、用哪种写法、名字里的
            sp/ar/ab 前缀各是什么意思，以及心跳和锁怎样防住死进程与两个写入者。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 17 课"
        onAllCorrect={() => pass("l16")}
        questions={[
          {
            q: "新进程发现 latest.pt 和 buffer.npz 后，实际恢复了什么？",
            options: [
              "恢复网络参数、下一轮编号和回放池；优化器与 RNG 重新建立",
              "恢复每一项内存状态，包括动量和随机数走到的位置",
              "只恢复页面上的训练曲线，网络重新随机初始化",
            ],
            answer: 0,
            explain:
              "checkpoint 带回网络参数和迭代号，buffer.npz 带回旧样本；make_optimizer 和随机数发生器会在新进程中重新创建，所以这不是逐字节续上旧进程。",
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
              "min_buffer 是开始参数更新所需的最小样本数。自我对弈产物照常进入池子；只有参数更新暂时跳过，后续轮次继续积累。",
          },
          {
            q: "如果程序在 metrics 已写、latest 还没写时突然崩溃，最准确的说法是什么？",
            options: [
              "记录可能暂时领先旧 checkpoint，重启可能重做工作，但不会加载一个领先于指标的新模型",
              "latest 已自动写完，因此什么都不可能重复",
              "metrics 会自动回滚，所以两个文件永远同时消失",
            ],
            answer: 0,
            explain:
              "先写 metrics 的目标不是做到两个文件同时出现，而是禁止 checkpoint 超前。断在两步之间时，旧 checkpoint 仍可恢复；代价可能是重做，而不是无记录地跳过。",
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
          无论哪种情况，最后都必须先写指标、再保存 checkpoint。
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn ${!bufferReady ? "active" : ""}`}
            onClick={() => { setBufferReady(false); setStep(0) }} data-qa="buffer-warming">
            池子 200 / 门槛 256
          </button>
          <button type="button" className={`btn ${bufferReady ? "active" : ""}`}
            onClick={() => { setBufferReady(true); setStep(0) }} data-qa="buffer-ready">
            池子 800 / 门槛 256
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
                    ? "200 条样本还没到 256 条门槛，本轮不改参数；对局与 buffer.npz 已经保存，下一轮继续积累。"
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
        阶段顺序来自 <span className="mono">pipeline.run</span>；200、800 是为比较门槛而设的教学数字，
        演示配置的真实 <span className="mono">min_buffer</span> 是 256。
      </figcaption>
    </figure>
  )
}

function RecoveryProbe() {
  const [point, setPoint] = useState<"before" | "between" | "clean">("before")
  const copy = {
    before: {
      title: "metrics 之前强制崩溃",
      body: "这一轮还没有完整指标，也没有同轮 checkpoint。重启从旧 latest 的下一轮编号开始。buffer.npz 是直接写入而非原子替换：若写完则可能保留新样本，若写到一半则加载会失败并放弃这份损坏的池子。",
      verdict: "不会加载超前模型；可能重做本轮，也可能丢失未完整保存的回放池。",
    },
    between: {
      title: "metrics 之后、checkpoint 之前强制崩溃",
      body: "指标尾行已经出现，但 latest 仍是旧参数。重启依据旧 latest 决定轮号，因此可能重做；关键是不会出现「模型领先、指标缺席」。",
      verdict: "记录可能暂时领先；checkpoint 永不领先。",
    },
    clean: {
      title: "收到 stop 后正常退出",
      body: "自我对弈会隔一会儿查看一次 stop 命令，已完成记录仍会保存；finally 再保存 buffer 与 latest，并写 stopped 状态。优化器和 RNG 仍不会进入 checkpoint。",
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
            onClick={() => setPoint("before")}>断在 metrics 前</button>
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
        「可以恢复」不等于「从中断的那条机器指令继续」；要逐项说明哪些文件已经落盘。
      </figcaption>
    </figure>
  )
}
