/** 第 17 课 · 运行产物：训练事实怎样安全留下。
 *  节拍：思考题（同一份事实）→ 单写者与双向控制 → 两张键表 → 两种写法 → 对局身份 →
 *  心跳与锁 → 例（产物分拣台）→ 对证（storage.py 与 trainer.py 核心落点）→ 习题。 */
import { useState } from "react"
import { LessonGuide } from "../framework/lesson-guide"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"

const ARTIFACTS = [
  { id: "config", file: "config.json", fact: "棋盘、网络、搜索与训练配置", write: "整份原子替换" },
  { id: "control", file: "control.json", fact: "继续、暂停或停止命令", write: "整份原子替换" },
  { id: "status", file: "status.json", fact: "当前阶段、进度、样本数与 heartbeat", write: "整份原子替换" },
  { id: "events", file: "events.jsonl", fact: "按时间发生的一条条训练事件", write: "末尾逐行追加" },
  { id: "metrics", file: "metrics.jsonl", fact: "每轮结束后的损失、回放池和竞技场汇总", write: "末尾逐行追加" },
  { id: "buffer", file: "buffer.npz", fact: "回放池的样本、写入位置和训练答案", write: "整份保存（非原子，写一半断电则整池作废）" },
  { id: "selfplay", file: "games/000003/sp_000003_000.json", fact: "第 3 轮第 0 局自我对弈", write: "完整对局原子写入" },
  { id: "arenaBest", file: "arena/000002/ar_000002_000.json", fact: "第 2 轮挑战者对 best 的对局", write: "完整对局原子写入" },
  { id: "arenaBase", file: "arena/000002/ab_000002_000.json", fact: "第 2 轮挑战者对 baseline 的对局", write: "完整对局原子写入" },
  { id: "checkpoint", file: "checkpoints/latest.pt", fact: "最近保存的网络权重", write: "整份检查点原子保存" },
  { id: "checkpointBest", file: "checkpoints/best.pt", fact: "竞技场选出的当前最强网络权重（首轮无 best 时直接任命）", write: "整份检查点原子保存" },
  { id: "checkpointBase", file: "checkpoints/baseline.pt", fact: "冻结的初始权重（对照基准）", write: "整份检查点原子保存" },
  { id: "checkpointIter", file: "checkpoints/iter_000000.pt", fact: "每隔 keep_checkpoint_every 轮留的完整副本", write: "整份检查点原子保存" },
  { id: "lock", file: "trainer.lock", fact: "同一 run 目录只有一个训练器的独占权", write: "进程持有锁文件（flock）" },
] as const

type ArtifactId = (typeof ARTIFACTS)[number]["id"]

export default function L17() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 17 课</div>
      <h1 className="text-2xl font-bold">运行产物：训练事实怎样安全留下</h1>

      <LessonGuide
        question="训练器停下之后，服务器晚一点再来读时，怎样保证它们看到的是同一份事实？"
        why="前几课里每个「真实对局、真实指标、真实 best」的说法，都必须能追到 run 目录中的证据；否则网页只是一个无法核对的故事。"
        chain={[
          "训练器产生并写下训练事实",
          "不同事实进入固定名称与格式的文件",
          "server 读取同一个 run 目录",
          "四种机制各管一段：当前状态整份换新、历史一行接一行续在末尾、训练器定时报告「我还活着」、一把锁保证同时只有一个训练器写入者",
        ]}
        takeaway="你能写出 run 目录的快照原子替换与历史追加，用锁文件与心跳排障死进程与双写，破损尾行跳过不作证据。"
        boundary="本课只讲这个项目的文件约定，不扩展到通用文件系统理论；范围包括每类产物、两种写法、破损尾行、心跳、锁和文件名前缀。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "训练器和服务器不共享内存，它们靠什么对上同一份事实？",
            options: [
              "服务器直接读取训练器的 Python 变量",
              "两边读写同一个 run 目录里那些有固定名字和固定写法的文件",
              "每次训练结束由人把数字抄到网页上",
            ],
            answer: 1,
            explain:
              "选第二项。训练器是主要写入者，server 是读取者；控制命令走相反方向，同样落在文件里。文件的名字、格式和写法一旦固定，双方就不必约定内存布局，也能在进程重启后继续对得上。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>文件里的证据说了算</h3>
        <p>
          训练器 <span className="mono">trainer</span> 产生棋局、样本、指标和网络权重，
          是主要写入者；服务器不训练另一份网络，只读取同一个工作目录，再把结果交给浏览器。
        </p>
        <Def term="训练器与 run 目录" en="trainer & run directory">
          训练器是跑训练循环、产生对局、样本、指标和权重的程序；run 目录是一次训练的全部运行文件所在的文件夹。
          训练器把这些事实写进 run 目录，它既是训练器与 server 的唯一交接面，也是网页上每个真实结论最终要追到的证据。
        </Def>
        <p>
          控制命令走反方向：server 把 <span className="mono">run / pause / stop</span> 写进
          <span className="mono">control.json</span>，训练器在轮边界读取；只有 stop 会在自我对弈途中也检查，
          让它不必等完整个对局批次。这里的 <span className="mono">run</span> 是「继续训练」，不是 run 目录。
        </p>
        <p>
          为什么不用一个超级大文件？当前状态只要最新一份，历史要逐条保留，棋谱要能按编号单独打开，
          回放池和权重又很大。拆开后，每类事实可以选择自己的写法，读取一个状态也不必加载全部历史。
        </p>
        <ArtifactTable />

        <h3>快照整份替换，历史末尾追加</h3>
        <p>
          当前状态只保留最新一份，所以整个文件换新。假如直接覆盖 <span className="mono">status.json</span>，
          server 可能正好读到写了一半的 JSON。项目先把完整内容写进独立的临时文件，再用
          <span className="mono">os.replace</span> 一次换上；读到的不是旧完整版本，就是新完整版本。
        </p>
        <div className="formula">
          快照：写完 <span className="hl">file.tmp</span> → 一次 replace → 正式文件
        </div>
        <p>
          历史恰好相反：<span className="mono">events.jsonl</span> 与 <span className="mono">metrics.jsonl</span>
          只把新事实接到末尾，旧行不动。每次追加一行，是在已有历史后面接一条，而不是重写整份历史。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="快照先写临时文件再原子替换，历史事件末尾追加"
          source="alphagomoku/storage.py · RunStorage._write_json_atomic、write_status、append_event"
        >
          <div className="codewalk">
            <pre>{`    @staticmethod
    def _write_json_atomic(path: Path, data: dict) -> None:
        # unique tmp per process+thread: concurrent writers must not share it
        tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)

    # ------------------------------------------------------------ config/status

    def write_config(self, cfg_dict: dict) -> None:
        self._write_json_atomic(self.config_path, cfg_dict)

    def read_config(self) -> dict | None:
        return self._read_json(self.config_path)

    def write_status(self, status: dict) -> None:
        status = dict(status)
        status["heartbeat"] = time.time()
        self._write_json_atomic(self.status_path, status)

    def read_status(self) -> dict | None:
        return self._read_json(self.status_path)

    def write_control(self, command: str) -> None:
        assert command in ("run", "pause", "stop")
        self._write_json_atomic(self.control_path, {"command": command, "ts": time.time()})

    def read_control(self) -> str:
        data = self._read_json(self.control_path)
        return data.get("command", "run") if data else "run"

    # ------------------------------------------------------------------ events

    def append_event(self, type_: str, data: dict) -> None:
        line = json.dumps({"ts": time.time(), "type": type_, "data": data}, ensure_ascii=False)
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(line + "\\n")`}</pre>
          </div>
        </EvidenceCard>
        <Def term="JSONL" en="JSON Lines">
          每一行都是一个完整 JSON 对象的文本格式。行与行彼此独立，适合事件、指标这类只增不改的历史；
          读取器按行解析，单行损坏只影响那一行。
        </Def>
        <p>
          进程若在最后一行写到一半就中断，读取器跳过无法解析的破损尾行，前面的完整行仍然可信。
          破损内容不会被猜补成一条「差不多」的记录。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="逐行解析 JSONL，自动跳过断电留下的破损尾行"
          source="alphagomoku/storage.py · RunStorage._parse_lines"
        >
          <div className="codewalk">
            <pre>{`    @staticmethod
    def _parse_lines(lines: list[str]) -> list[dict]:
        out = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # tolerate a torn last line while trainer is appending
        return out`}</pre>
          </div>
        </EvidenceCard>

        <h3>文件名自带身份：sp、ar、ab</h3>
        <p>
          <span className="mono">sp_</span> 表示 self-play；<span className="mono">ar_</span> 表示挑战者
          对 best；<span className="mono">ab_</span> 表示挑战者对 baseline。
          前缀后面的六位数是训练轮次，三位数是该轮中的对局编号，因此{" "}
          <span className="mono">sp_000003_000</span> 不打开也能先读作
          「第 3 轮第 0 局自我对弈」。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="按对局类别生成前缀与六位轮号、三位局号"
          source="alphagomoku/storage.py · RunStorage._PREFIX_KIND 与 game_id"
        >
          <div className="codewalk">
            <pre>{`    # id prefixes: sp = self-play, ar = arena vs best, ab = arena vs baseline
    _PREFIX_KIND = {"sp": "selfplay", "ar": "arena", "ab": "arena"}

    @staticmethod
    def game_id(kind: str, iteration: int, idx: int) -> str:
        prefix = "sp" if kind == "selfplay" else "ar"
        return f"{prefix}_{iteration:06d}_{idx:03d}"`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          格式串 <span className="mono">{"{iteration:06d}_{idx:03d}"}</span> 中 <span className="mono">06d</span> 为六位轮次、
          <span className="mono">03d</span> 为三位局号，代入 <span className="mono">iteration=3, idx=0</span> 即得{" "}
          <span className="mono">sp_000003_000</span>。
        </p>

        <h3>心跳报告存活，锁防住双写</h3>
        <p>
          训练器每次写 <span className="mono">status.json</span>，都会盖上一个当时的时间戳。
        </p>
        <Def term="心跳" en="heartbeat">
          状态文件里每次写入都更新的时间戳。时间够新，说明写入者最近还活着。
        </Def>
        <p>
          server 同时看两件事：心跳是否在 10 秒内，以及 state 是否仍为 running 或 paused。
          只看其中一个，会漏掉「刚写完心跳就退出」或「旧状态还写着运行」。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="结合子进程状态、10 秒内新鲜心跳与运行状态判定存活"
          source="server/app.py · trainer_alive"
        >
          <div className="codewalk">
            <pre>{`        proc = state["trainer_proc"]
        if proc is not None and proc.poll() is None:
            return True
        status = storage.read_status() or {}
        hb = status.get("heartbeat")
        fresh = isinstance(hb, (int, float)) and (time.time() - hb) < HEARTBEAT_MAX_AGE
        return fresh and status.get("state") in ("running", "paused")`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          <span className="mono">HEARTBEAT_MAX_AGE = 10.0</span> 就是这 10 秒窗口。
        </p>
        <Def term="锁" en="lock, trainer.lock">
          同一 run 目录只允许一个训练器持有的独占权。第二个训练器会立即退出；
          进程退出或崩溃时，操作系统自动释放锁，新训练器仍能启动。
        </Def>
      </div>

      <ArtifactSorter />

      <Ledger title="alphagomoku/storage.py 与 alphagomoku/trainer.py · run 目录读写与独占锁">
        <EvidenceCard
          fidelity="runtime-exact"
          title="训练器入口对 trainer.lock 施加非阻塞排他锁，防止双写冲突"
          source="alphagomoku/trainer.py · _acquire_run_lock"
        >
          <div className="codewalk">
            <pre>{`def _acquire_run_lock(storage: RunStorage):
    """Exclusive flock on <run>/trainer.lock: a second trainer on the same run
    directory exits immediately instead of corrupting shared state."""
    fd = open(storage.root / "trainer.lock", "w")
    try:
        fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print(f"another trainer already holds {storage.root}/trainer.lock; exiting",
              file=sys.stderr)
        sys.exit(1)
    return fd  # keep the fd (and the lock) for the process lifetime`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          本课核心实现在 <span className="mono">alphagomoku/storage.py</span> 的{" "}
          <span className="mono">RunStorage</span>（临时文件加 <span className="mono">os.replace</span> 的快照原子替换、
          <span className="mono">write_status</span> 写入心跳时间戳、JSONL 历史末尾追加与{" "}
          <span className="mono">_parse_lines</span> 跳过破损尾行、<span className="mono">sp/ar/ab</span> 对局文件命名）与{" "}
          <span className="mono">alphagomoku/trainer.py</span> 的 <span className="mono">_acquire_run_lock</span>。
          运行 <span className="mono">python -m pytest tests/test_server.py -q</span>，
          可验证心跳新鲜度判定与破损尾行跳过。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "run 目录是训练器与 server 共用的事实来源：配置、状态、事件、指标、对局、回放池和检查点各有固定名字与格式。",
          "两种写法各管一类事实：快照类写临时文件后一次替换，历史类 JSONL 在末尾逐行追加；破损尾行跳过，完整行仍可信。",
          "文件名前缀 sp/ar/ab 自带对局身份；心跳让 server 判断进程是否还活着，trainer.lock 保证同一 run 目录只有一个训练器写入者。",
        ]}
        next={
          <>
            下一课把这些文件变成网页上的画面：server 怎样用 REST 交出可重读快照、
            用 WebSocket 推送刚发生的变化，以及人机对战为什么另开一条独立的会话。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "status.json 为什么先写临时文件，再用 os.replace 换上？",
            options: [
              "为了保留所有历史状态",
              "避免 server 读到半份 JSON：它只会看见旧完整版本或新完整版本",
              "为了把状态变成网络权重",
            ],
            answer: 1,
            explain: "状态只需要最新快照，但必须完整。临时文件先写完，再一次替换；历史保留是 JSONL 追加负责的另一件事。",
          },
          {
            q: "events.jsonl 最后一行在断电时只写了一半，读取器应该怎样做？",
            options: [
              "整份事件历史全部作废",
              "跳过无法解析的破损行，继续保留此前每一条完整事件",
              "猜出缺少的字符并补齐",
            ],
            answer: 1,
            explain: "每行独立是一条证据。破损尾行不能可靠猜测，但前面的完整行仍然可信。",
          },
          {
            q: "心跳和 trainer.lock 分别防止什么误判或冲突？",
            options: [
              "心跳判断棋力，trainer.lock 决定先后手",
              "心跳帮 server 判断训练是否仍活着；trainer.lock 防止两个训练器同时写同一 run 目录",
              "两者都只用来压缩检查点",
            ],
            answer: 1,
            explain: "心跳解决「进程还活着吗」，独占锁解决「会不会有两个写入者互相覆盖文件」。",
          },
          {
            q: "看到 ab_000002_000.json，最准确的解释是什么？",
            options: [
              "第 2 轮挑战者对 baseline 的第 0 局竞技场对局",
              "第 2 轮自我对弈第 0 局",
              "第 2 轮保存的 best 检查点",
            ],
            answer: 0,
            explain: "ab 是挑战者对 baseline（冻结对照基准）那组竞技场对局的前缀；000002 是训练轮次，000 是该轮对局编号。",
          },
        ]}
      />
    </section>
  )
}

function ArtifactTable() {
  return (
    <div className="overflow-x-auto">
      <table className="l09-table">
        <thead><tr><th>事实</th><th>文件</th><th>写法</th></tr></thead>
        <tbody>
          {ARTIFACTS.map((a) => (
            <tr key={a.id}>
              <td>{a.fact}</td>
              <td className="mono">{a.file}</td>
              <td>{a.write}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ArtifactSorter() {
  const [picked, setPicked] = useState<Record<string, ArtifactId>>({})
  const tasks = [
    { id: "live", fact: "网页顶部要显示当前正在 self-play、已完成 40%（该轮对局）", answer: "status" as ArtifactId },
    { id: "history", fact: "直播页要接收刚追加的一条 game_end", answer: "events" as ArtifactId },
    { id: "replay", fact: "回放页要打开第 3 轮第 0 局自我对弈", answer: "selfplay" as ArtifactId },
    { id: "resume", fact: "进程重启后要加载最近保存的 latest.pt", answer: "checkpoint" as ArtifactId },
    { id: "curve", fact: "曲线页要读取每一轮的损失历史", answer: "metrics" as ArtifactId },
  ]
  const correct = tasks.filter((t) => picked[t.id] === t.answer).length

  return (
    <figure className="figure mt-8" data-qa="artifact-sorter">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 17-1 · 把网页上的说法送回最直接的来源文件</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          每行先读「要证明什么」，再选文件。选完后在心里分清它是当前快照、历史、完整棋谱还是网络权重。
        </p>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {tasks.map((task) => {
          const selected = picked[task.id]
          return (
            <div key={task.id} className="card p-4">
              <p className="text-sm font-semibold">{task.fact}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ARTIFACTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`btn ${selected === a.id ? "active" : ""}`}
                    onClick={() => setPicked((p) => ({ ...p, [task.id]: a.id }))}
                    data-qa="artifact-choice"
                  >
                    {a.file}
                  </button>
                ))}
              </div>
              {selected && (
                <p className="mt-2 text-xs" style={{ color: selected === task.answer ? "var(--accent-deep)" : "var(--fg-muted)" }}>
                  {selected === task.answer
                    ? `对：${ARTIFACTS.find((a) => a.id === selected)!.fact}；写法是${ARTIFACTS.find((a) => a.id === selected)!.write}。`
                    : "还没对上：先问这是「当前快照」「历史事件」「完整棋谱」还是「网络权重」。"}
                </p>
              )}
            </div>
          )
        })}
        <p className="num text-sm" data-qa="artifact-score" style={{ color: "var(--fg-faint)" }}>
          已对上 {correct} / {tasks.length} 条证据
        </p>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 17-1</span>
        网页可以重新排版事实，却不能凭空制造证据；每个真实结论都要能沿这条链返回 run 目录。
      </figcaption>
    </figure>
  )
}
