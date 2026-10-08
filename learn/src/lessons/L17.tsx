/** 第 17 课 · 运行产物：训练事实怎样安全留下。
 *  节拍：思考题（同一份事实）→ 单写者与双向控制 → 两种写法 → 对局身份 → 心跳与锁 →
 *  例（产物分拣台）→ 对证（storage.py/trainer.py）→ 习题。 */
import { useState } from "react"
import { LessonGuide } from "../framework/lesson-guide"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { ChapterEnd, Def } from "../framework/def"

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
  { id: "checkpoint", file: "checkpoints/latest.pt", fact: "最近保存的网络权重", write: "整份 checkpoint 原子保存" },
  { id: "checkpointBest", file: "checkpoints/best.pt", fact: "竞技场选出的当前最强网络权重（首轮无 best 时直接任命）", write: "整份 checkpoint 原子保存" },
  { id: "checkpointBase", file: "checkpoints/baseline.pt", fact: "冻结的初始权重（对照基准）", write: "整份 checkpoint 原子保存" },
  { id: "checkpointIter", file: "checkpoints/iter_000000.pt", fact: "每隔 keep_checkpoint_every 轮留的完整副本", write: "整份 checkpoint 原子保存" },
  { id: "lock", file: "trainer.lock", fact: "同一 run 目录只有一个训练器的独占权", write: "进程持有锁文件（flock）" },
] as const

type ArtifactId = (typeof ARTIFACTS)[number]["id"]

export default function L17() {
  const pass = usePassLesson()

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
        takeaway="run 目录是训练器与 server 共用的工作目录：当前快照安全替换，历史逐行追加；网页上的每个真实结论都应能指出来源文件。"
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
          因此它是主要写入者。服务器不训练另一份网络；它读取同一个工作目录，再把结果交给浏览器。
          这个装着一次训练全部运行文件的文件夹叫 run 目录，它是训练器与 server 之间唯一的事实来源。
        </p>
        <Def term="训练器" en="trainer">
          负责跑训练循环的那个程序，代码里叫 <span className="mono">trainer</span>：
          产生棋局、样本、指标和网络权重，往 run 目录里写。它与 server 分工明确：
         训练器写、server 读。本课起统一称「训练器」；代码标识与文件名里的 trainer 原样保留。
        </Def>
        <Def term="run 目录" en="run directory">
          一次训练运行的工作文件夹，装下配置、状态、事件、指标、对局、回放池和 checkpoint。
         训练器往里写，server 从里读；网页上的每个真实结论都应能沿这条链回到其中某个文件。
        </Def>
        <p>
          控制按钮走的是反方向：平时是训练器写、server 读；这里是 server 把
          <span className="mono">run / pause / stop</span> 写进 <span className="mono">control.json</span>。config.json 也由 server 写（首次 start 且尚无 config.json 时，拷入启动配置或默认值），训练器只在缺 config.json 时自行播种一次（用 --config 或默认值），其余时候不再改它；网页改配置（PUT）要求训练器不在运行，改完对随后启动的训练器生效。
          <span className="mono">run</span> 在这里是「继续训练」这条命令，不是 run 目录。
         训练器读命令的时机分两种：pause 和 run（继续；网页按钮叫 resume，写进 control.json 的值是 run）只在轮边界这类稳定点生效；
          stop 在自我对弈的下棋途中也会每隔一会儿查看一次（竞技场不查：固定局数的评估中途不打断）。训练器启动时会先把 run 写进
          <span className="mono">control.json</span>，作为默认命令。
        </p>
        <p>
          为什么不用一个超级大文件？当前状态只要最新一份，历史事件要保留每一条，
          棋谱要能按编号单独打开，回放池和网络权重又是很大的数据文件（不是文字，直接打开看不懂）。
          分开保存后，每类事实使用适合自己的写法，server 也不必为了读一个状态而加载全部历史。
        </p>
        <ArtifactTable />

        <h3>快照整份替换，历史末尾追加</h3>
        <p>
          只存最新状态的文件需要整份替换。假如训练器直接覆盖
          <span className="mono">status.json</span>，server 可能恰好读到只写了一半的 JSON。项目先把完整
          内容写到独立临时文件，再调用 <span className="mono">os.replace</span> 一次换上。读取者看到的要么
          是旧完整版本，要么是新完整版本，不会看到半份。
        </p>
        <div className="formula">
          快照：写完 <span className="hl">file.tmp</span> → 一次 replace → 正式文件
        </div>
        <p>
          历史类文件需要末尾追加。<span className="mono">events.jsonl</span> 和
          <span className="mono">metrics.jsonl</span> 是一种叫 JSONL 的文件，新事实只加在末尾，旧历史
          不会被覆盖。如果进程恰好在最后一行写到一半就中断，读取器跳过无法解析的破损尾行，前面的
          完整行仍然可信；它跳过坏行，不去猜补缺失内容。
        </p>
        <Def term="JSONL" en="JSON Lines">
          每一行都是一个完整 JSON 对象的文本文件格式。行与行彼此独立，追加一行就多一行 JSONL 记录；
          读取器按行解析，单行损坏只影响那一行。适合事件、指标这类「只增不改」的历史。
        </Def>

        <h3>文件名自带身份：sp、ar、ab</h3>
        <p>
          <span className="mono">sp_</span> 表示 self-play；<span className="mono">ar_</span> 表示挑战者
          （当前轮训出的网络）对 best（现任最强网络）；<span className="mono">ab_</span> 表示挑战者对
          冻结基线（对照用的固定网络）。前缀后面的六位数是训练
          轮次，三位数是该轮中的对局编号。因此 <span className="mono">sp_000003_000</span> 不打开也能先读作
          「第 3 轮第 0 局自我对弈」。三类前缀还能防止不同对手的对局互相覆盖。
        </p>

        <h3>心跳报告存活，锁防住双写</h3>
        <p>
         训练器每写一次 <span className="mono">status.json</span> 就盖上当时的时间（心跳间隔约 2 秒），隔一会儿报告一次；server 认 10 秒内的心跳为新鲜
          「我还活着」。server 同时检查这个时间是否够新，以及 state 是否仍为 running 或 paused，
          避免把刚停止却留下新心跳的训练器误判成运行中。
        </p>
        <Def term="心跳" en="heartbeat">
          状态文件里每次写入都更新的时间戳。它够新，说明写入者最近还活着；
          服务器把「心跳是否新鲜」和「状态字段是否仍在运行」合起来判断，避免被过期状态骗过。
        </Def>
        <Def term="锁" en="lock, trainer.lock">
          锁是同一 run 目录只允许一个训练器持有的独占权。进程一退出（包括崩溃），操作系统自动释放这把锁，新训练器起得来。第二个训练器会立即退出，
          而不是两个进程交叉改写同一批文件。
        </Def>
      </div>

      <ArtifactSorter />

      <Ledger title="storage.py 与 trainer.py · 输入、处理、输出都要说清">
        <div className="codewalk mt-3">
          <pre>{`# storage.py · 快照：完整临时文件写完后一次换上
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)
os.replace(tmp, path)

# 历史：旧行不动，只在末尾追加一行
with open(self.events_path, "a", encoding="utf-8") as f:
    f.write(line + "\\n")`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# JSONL 读取：坏行（常见是断电写一半的尾行）不能当证据，跳过；完整行仍保留
try:
    out.append(json.loads(line))
except json.JSONDecodeError:
    continue

# trainer.py · 同一 run 只准一个 trainer
fcntl.flock(fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)`}</pre>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
          输入是训练器刚产生的新快照或历史事件；快照走 tmp + replace，历史走 append；输出是 server
          可以稳定读取的 run 目录证据。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "run 目录是训练器与 server 共用的事实来源：配置、状态、事件、指标、对局、回放池和 checkpoint 各有固定名字与格式。",
          "两种写法各管一类事实：快照类写临时文件后一次替换，历史类 JSONL 在末尾逐行追加；破损尾行跳过，完整行仍可信。",
          "文件名前缀 sp/ar/ab 自带对局身份；心跳让 server 判断进程是否还活着，trainer.lock 保证同一 run 目录只有一个训练器写入者。",
        ]}
        next={
          <>
            下一课把这些文件变成网页上的画面：server 怎样用 REST 交出完整快照、
            用 WebSocket 推送刚发生的变化，以及人机对战为什么另开一条独立的会话。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 18 课"
        onAllCorrect={() => pass("l17")}
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
            q: "heartbeat 和 trainer.lock 分别防止什么误判或冲突？",
            options: [
              "heartbeat 判断棋力，trainer.lock 决定先后手",
              "heartbeat 帮 server 判断训练是否仍活着；trainer.lock 防止两个训练器同时写同一 run 目录",
              "两者都只用来压缩 checkpoint",
            ],
            answer: 1,
            explain: "心跳解决「进程还活着吗」，独占锁解决「会不会有两个写入者互相覆盖文件」。",
          },
          {
            q: "看到 ab_000002_000.json，最准确的解释是什么？",
            options: [
              "第 2 轮挑战者对 baseline 的第 0 局竞技场对局",
              "第 2 轮自我对弈第 0 局",
              "第 2 轮保存的 best checkpoint",
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
