/** 第 18 课 · 服务边界：训练事实怎样变成网页。
 *  节拍：思考题（数据从哪来）→ 控制与资源边界（正文证据组）→ REST 快照与 WebSocket 增量（正文证据组）→
 *  人机对战支线（正文证据组）→ 例 18-1 页面—通道—来源 → 两种浏览器里下棋 →
 *  对证（三层服务边界与验证）→ 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"

interface RouteCard {
  view: string
  question: string
  channel: string
  source: string
  result: string
}

const ROUTES: RouteCard[] = [
  {
    view: "总览 Dashboard",
    question: "训练到哪一轮、损失怎样变化？",
    channel: "先 GET /api/status、/api/config、/api/metrics，再接收 WebSocket 增量交付的 status 与 events 帧",
    source: "status.json、config.json、metrics.jsonl、events.jsonl",
    result: "网页先拿首屏快照，再用实时消息补上变化。",
  },
  {
    view: "直播 Live",
    question: "正在并行下的棋刚走到哪里？",
    channel: "WebSocket 的 history → events → status 三种帧（同一条连接上送来的一帧帧消息）",
    source: "events.jsonl 中的 game_progress / game_end，加上 status.json",
    result: "断线重连先补最近历史，再继续接收新增事件；重复的部分由网页按事件去重。",
  },
  {
    view: "对局 Games",
    question: "已经保存了哪些自我对弈和竞技场比赛？",
    channel: "GET /api/games?kind=...&cursor=...",
    source: "run 目录里的 self-play / arena 对局 JSON",
    result: "列表只拿摘要并分页，不一次下载每局棋的全部落子。",
  },
  {
    view: "复盘 Replay",
    question: "一局指定棋怎样逐手还原？",
    channel: "GET /api/games/{id}",
    source: "该 game JSON 中的 moves、pi、top 和搜索汇总 root_value",
    result: "浏览器按 moves 重放棋盘。每手记录里的 value 字段，在教学站数据里写作 rootValue；这个数来自搜索的 root_value，不是网络直接给的 v_net。",
  },
  {
    view: "对战 Play",
    question: "人落子后，AI 怎样回应？",
    channel: "GET /api/checkpoints；POST /api/play/new、/{sid}/move、/{sid}/step",
    source: "服务器独立加载所选检查点，并为会话运行没有根噪声的蒙特卡洛树搜索",
    result: "这局人机棋不写进回放池，也不会打断训练器。",
  },
]

export default function L18() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 18 课</div>
      <h1 className="text-2xl font-bold">服务边界：训练事实怎样变成网页</h1>

      <LessonGuide
        question="训练器只写运行文件，浏览器却能看直播、查旧棋和发起人机对战，中间的数据怎样走？"
        why="如果把网页上的数字误当成训练器内存的直接呈现，就无法判断它们来自快照、实时事件还是一次独立对战，也无法解释断线、恢复和检查点切换。"
        chain={[
          "训练器把事实写进 run 目录",
          "server 读取文件并管理训练器与对战会话",
          "REST 交付可重读的快照（列表可分页），WebSocket（同一条连接逐帧推送）负责增量交付",
          "React 各页面按用途组合这些数据，但不参与训练更新",
        ]}
        takeaway="你能接线一条 REST 与 WebSocket 的数据通路，验收网页上每个数字的来源，并指出 run 目录是唯一事实来源、浏览器不直接碰训练器。"
        boundary="本课学习这个项目的数据约定与接线：文件、端点、页面各管哪一段；FastAPI、React、HTTP、WebSocket 的通用知识不展开，框架细节以仓库代码为准。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "直播页出现新手落子时，最符合当前项目的路径是哪一条？",
            options: [
              "浏览器直接读取训练器的 Python 内存",
              "训练器追加事件，server 追读并通过 WebSocket 推送，浏览器再更新画面",
              "浏览器每半秒重新下载全部检查点",
            ],
            answer: 1,
            explain:
              "选第二项。训练器与 server 不共享内存；训练器写 run 目录，server 追读 events.jsonl，并把新增完整行组成 events 帧推给网页。检查点是模型权重，不是直播消息。",
          },
        ]}
      />

      <ServiceMap />

      <div className="prose mt-10">
        <h3>server 只做转手，不替训练器训练</h3>
        <p>
          浏览器和训练器之间没有直接通道，中间隔着一个 server。训练数据的通道上，它不替训练器训练，
          只做三件事：转达控制命令、交出可重复读取的快照、推送刚发生的变化。数据的起点始终是 run 目录；
          人机对战则另走一条独立会话支线。
        </p>
        <p>
          控制走反方向：网页把 start、pause、resume 或 stop 发给
          <span className="mono">POST /api/control</span>，server 先写
          <span className="mono">control.json</span>，训练器在稳定点读取。文件的三个值只有
          <span className="mono">run / pause / stop</span>，其中 start 与 resume 都写成 run。
          判断训练器是否活着，可以看进程状态，也可以看 run 目录里新鲜的心跳。
        </p>
        <Def term="REST" en="Representational State Transfer">
          网页按固定地址向 server 取数据的接口风格。每次请求拿到一份可重读的当前结果，
          列表端点可以分页；刷新页面能重新取一遍。本项目的 <span className="mono">/api/status</span>、
          <span className="mono">/api/metrics</span>、<span className="mono">/api/games</span> 等都走这条路。
        </Def>
        <p>
          代码分工也很直接：<span className="mono">server/app.py</span> 定义路由与静态托管，
          <span className="mono">server/play.py</span> 管理人机对战会话，
          <span className="mono">server/tail.py</span> 追读历史文件。React 端按 hash 选页，
          只消费 REST 快照与 WebSocket 增量。
        </p>
      </div>

      <div className="prose mt-10">
        <h3>快照可重复读取，增量只推新增消息</h3>
        <p>
          第二种是提供可重复读取的快照。请求方法写在地址前面：GET 是要数据，POST 是下命令，PUT 是改配置。
          例如下面这些 REST 端点：
          <span className="mono">/api/status</span> 给状态，<span className="mono">/api/metrics</span> 给指标，
          <span className="mono">/api/games</span> 给对局列表，<span className="mono">/api/games/{`{id}`}</span>
          给整局棋，<span className="mono">/api/checkpoints</span> 给检查点清单
          （名字、大小、修改时间与训练元数据；模型权重不走这条通道，由 server 自己从
          run 目录加载），<span className="mono">/api/config</span> 给配置。网页刷新后可以重新取得这些答案。
        </p>
        <Def term="WebSocket" en="WebSocket">
          一条一直连着的通信线，server 有新消息就主动推过来，网页不必反复来问。
          适合直播这类「正在发生」的内容。
        </Def>
        <Def term="增量交付" en="incremental delivery">
          只推新出现的记录，不把完整历史重发一遍。连接建立时先补一份最近历史，
          之后每个新增事件只送它自己那一行；status 则约每 2 秒送整份状态。
        </Def>
        <p>
          第三种是传递刚发生的变化。WebSocket 连接后先送最近 50 行
          <span className="mono">history</span>，再补一份当前 <span className="mono">status</span>；
          这条连接此后主要用来发现断开，新增消息由后台追读循环广播。
        </p>
        <p>
          REST 回答「现在是什么样」，WebSocket 回答「刚刚多了什么」，两件事分开做。
          为什么不用单一方案：纯轮询 REST 最简单，但空转多、延迟不可控；纯 WebSocket 一刷新就丢历史，
          还得自己造快照协议；快照加增量让刷新可重建、增量低开销。status 既可 GET 也可推送，
          是刻意冗余：GET 喂首屏，推送喂直播；指标走 REST，是因为曲线页不需要逐秒更新。
          追读循环把新增的 <span className="mono">events</span> 逐行送出，并约每 2 秒（<span className="mono">status_interval: float = 2.0</span>）送一次{" "}
          <span className="mono">status</span>。events 文件若最后一行还没写完，追读循环会截取到最后一个换行符为止，等这一行写完整了再读出来；短暂读错也不会让直播任务永久死掉。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="按字节偏移追读完整事件行，并定时广播最新状态"
          source="server/tail.py · EventTail._read_new 与 EventTail.run"
        >
          <div className="codewalk">
            <pre>{`        with open(self.events_path, "rb") as f:
            f.seek(offset)
            chunk = f.read(size - offset)
        last_nl = chunk.rfind(b"\\n")
        if last_nl < 0:
            return [], offset
        complete = chunk[: last_nl + 1]
        events: list[dict] = []
        for line in complete.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events, offset + last_nl + 1

    async def run(self) -> None:
        """Poll loop. Starts at end-of-file: history is replayed on WS connect."""
        try:
            offset = self.events_path.stat().st_size
        except OSError:
            offset = 0
        last_status = 0.0
        while True:
            try:
                events, offset = self._read_new(offset)
                if events:
                    await self.broadcast({"type": "events", "events": events})
                now = time.monotonic()
                if now - last_status >= self.status_interval:
                    last_status = now
                    await self.broadcast({"type": "status", "status": self.status_provider()})
            except asyncio.CancelledError:
                raise
            except Exception:
                pass  # never let the tail die on a transient read/parse error
            await asyncio.sleep(self.interval)`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <div className="prose mt-10">
        <h3>人机对战是独立的第四条支线</h3>
        <p>
          人机对战不走上面三条数据线。Play 页先查现有检查点，再开一局独立的
          会话（这局人机棋的临时记录）。
        </p>
        <Def term="预测器" en="Predictor">
          server 里装进内存的那份网络。它加载所选检查点的权重，只做前向计算，
          不训练、不更新；同一份权重按文件修改时间缓存复用。
        </Def>
        <p>
          每次 AI 落子创建一棵不加根噪声的搜索树，取访问数最多的动作。
          会话保存在 server 内存的 <span className="mono">self._sessions</span> 与{" "}
          <span className="mono">session.moves</span> 内，既不写入回放池，也不会借用或暂停训练器正在进行的搜索。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="人机对战每手建立无根噪声搜索树，取访问数最多动作并记入会话"
          source="server/play.py · PlayManager._ai_move"
        >
          <div className="codewalk">
            <pre>{`    def _ai_move(self, session: Session) -> dict | None:
        """One MCTS move for the side to play. None if the game is over."""
        game = session.game
        if game.outcome() is not None:
            return None
        cfg = self._get_config()
        pred = self.get_predictor(session.checkpoint)
        tree = SearchTree(game, cfg, add_noise=False, rng=self._rng)
        for _ in range(session.simulations):
            tree.select()
            if tree.needs_eval():
                policy, value = pred.predict(tree.leaf_input()[None, ...])
                tree.expand_and_backup(policy[0], float(value[0]))
        action = tree.best_action()
        top = tree.top_actions(5)
        value = tree.root_value()
        y, x = divmod(action, game.n)
        self._record(session, x, y, value=value)
        game.play(action)
        session.ai_top = top
        session.value = value
        return {"action": action, "x": x, "y": y, "top": top, "value": value}`}</pre>
          </div>
        </EvidenceCard>
        <p>
          React 负责选择和呈现页面，不会修改模型。训练事实若没有落成文件、再经 server 转手，
          就不应被网页声称为「真实运行数据」。
        </p>
      </div>

      <RouteMatcher />

      <div className="prose mt-10">
        <h3>两种「浏览器里下棋」：做法对齐，结果不逐位相同</h3>
        <p>
          生产 Web 的 Play 页把请求交给 server，由 Python 加载检查点、运行 Python 写的蒙特卡洛树搜索。
          两边遵守同一套棋盘、网络和搜索约定，但权重精度、随机数、预算都不同，所以只能保证约定一致、做法对齐，
          不能保证搜索路径与每个小数逐位相同。本教学站为离线和速度，在浏览器里运行一份 TypeScript 镜像实现
          （与 Python 端逐层对拍过），加载五位小数权重并使用较小的搜索预算。
        </p>
      </div>

      <Ledger title="server/app.py · create_app 与服务启动验证">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="mono">server/app.py · create_app</span>：以 run 目录为根组装 FastAPI，
            提供状态、配置、指标和对局 REST 端点，承接控制命令与 WebSocket 推送，并挂载前端静态文件。
          </li>
          <li>
            <span className="mono">server/tail.py · EventTail</span>：按字节偏移追读{" "}
            <span className="mono">events.jsonl</span>，只广播完整行，并周期推送状态快照。
          </li>
          <li>
            <span className="mono">server/play.py · PlayManager</span>：按检查点建立独立对战会话，
            用无根噪声的搜索树应手，不写回放池或训练器状态。
          </li>
          <li>
            验证：<span className="mono">python -m pytest tests/test_server.py -q</span>；
            启动：<span className="mono">scripts/dev.sh</span>。
          </li>
        </ul>
      </Ledger>


      <ChapterEnd
        summary={[
          "浏览器与训练器不共享内存：训练器写 run 目录，server 读文件再转手，REST 交可重读快照、WebSocket 推新增消息。",
          "控制命令反向走同一个边界：网页发 start/pause/resume/stop，server 写 control.json，训练器在安全位置读取；人机对战另开预测器会话，不写入回放池。",
          "页面名字不是事实来源；每个真实结论都要沿 API 或 WebSocket 帧追到 run 产物。教学站沙盒与生产 Web 约定一致、做法对齐，但不保证逐位相同。",
        ]}
        next={
          <>
            全书的技术内容到此为止。剩下的毕业章把十八课接成一张全系统图，
            请你亲手下完一局、沿箭头查清每个数的来历，再在四个新情境里找出第一处错误。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "总览页为什么同时使用 REST 和 WebSocket？",
            options: [
              "REST 拿可重读的快照（列表可分页），WebSocket 补刚发生的事件和状态变化",
              "REST 只管浅色主题，WebSocket 只管深色主题",
              "两者内容永远完全重复，任意删一个都没有区别",
            ],
            answer: 0,
            explain:
              "REST 让刷新后的页面重新取得状态、配置和指标；WebSocket 让正在打开的页面及时收到新增事件。它们解决的是「完整重建」和「持续更新」两个问题。",
          },
          {
            q: "人在 Play 页选择 best 并落子后，哪项说法正确？",
            options: [
              "浏览器直接修改 best.pt，然后训练器接着训练",
              "server 为独立会话加载或复用 best 预测器，用没有根噪声的蒙特卡洛树搜索应手，不把这局棋放进回放池",
              "Play 页必须等待当前训练迭代结束，才能共用训练器的搜索树",
            ],
            answer: 1,
            explain:
              "PlayManager 按检查点建立独立会话，使用自己的 Game 和每手新建的 SearchTree。它读取训练产物，但不修改检查点、回放池或训练器的进行中状态。",
          },
          {
            q: "教学站浏览器沙盒与生产 Web 对战为什么不能说成「执行结果完全相同」？",
            options: [
              "因为教学站没有棋盘规则",
              "因为核心契约相同，但权重舍入、浮点精度、随机数、预算和执行方式经过浏览器适配",
              "因为生产 Web 不使用网络和搜索",
            ],
            answer: 1,
            explain:
              "两边都遵守相同的棋盘规则、网络计算和蒙特卡洛树搜索走法；但约定一致不等于逐位一致。教学站的 TypeScript、舍入权重和较小预算是明确写下的运行适配差异。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 服务边界总览：训练事实和网页之间隔着什么 ============ */

function ServiceMap() {
  return (
    <figure className="figure mt-8" data-qa="service-map">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">结构图 · 训练事实走到网页的整条路</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="service-map" aria-label="训练器、run 目录、FastAPI 与 React 的数据通路">
          <div className="service-node trainer">
            <span className="service-kicker">写入者</span>
            <strong>训练器</strong>
            <small>自我对弈 · 训练 · 竞技场</small>
          </div>
          <div className="service-link"><span>写</span><i>→</i></div>
          <div className="service-node rundir">
            <span className="service-kicker">唯一事实源</span>
            <strong>run/</strong>
            <div className="service-files mono">
              <span>status.json</span>
              <span>events.jsonl</span>
              <span>metrics.jsonl</span>
              <span>games/</span>
              <span>checkpoints/</span>
              <span>control.json</span>
            </div>
          </div>
          <div className="service-link"><span>读</span><i>→</i></div>
          <div className="service-node server">
            <span className="service-kicker">服务边界</span>
            <strong>FastAPI</strong>
            <div className="service-channels">
              <span><b>REST</b> 快照 / 分页</span>
              <span><b>WS</b> 增量事件</span>
              <span><b>Play</b> 独立会话</span>
            </div>
          </div>
          <div className="service-link"><span>HTTP / WS</span><i>→</i></div>
          <div className="service-node react">
            <span className="service-kicker">读取者</span>
            <strong>React</strong>
            <small>Dashboard · Live<br />Games · Replay · Play</small>
          </div>
        </div>
        <div className="service-backflow">
          <span>控制回程</span>
          网页 → <span className="mono">POST /api/control</span> → FastAPI 写 <span className="mono">control.json</span>
          → 训练器在轮边界读取
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">结构图</span>
        所有训练事实先经过 run 目录，再由 server 转成 HTTP 或 WebSocket 消息；React 只组合这些数据。
        图中的 Play 会话读取检查点，但不会把棋局写回训练器。
      </figcaption>
    </figure>
  )
}

function RouteMatcher() {
  const [selected, setSelected] = useState(0)
  const route = ROUTES[selected]

  return (
    <figure className="figure mt-8" data-qa="fig-routes">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 18-1 · 页面、通道与事实来源</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          先选一个网页，再沿着通道找到它真正读取的文件或独立计算。不要只记页面名字。
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {ROUTES.map((item, i) => (
            <button
              key={item.view}
              type="button"
              className={`btn ${selected === i ? "active" : ""}`}
              onClick={() => setSelected(i)}
              data-qa="route-source"
            >
              {item.view}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="reveal-box text-sm leading-relaxed">
            <div className="mini-label">网页要回答</div>
            <p className="mt-1 font-semibold">{route.question}</p>
          </div>
          <div className="reveal-box text-sm leading-relaxed">
            <div className="mini-label">经过的通道</div>
            <p className="mt-1">{route.channel}</p>
          </div>
          <div className="reveal-box text-sm leading-relaxed">
            <div className="mini-label">事实来源 / 计算者</div>
            <p className="mt-1">{route.source}</p>
          </div>
          <div className="reveal-box text-sm leading-relaxed">
            <div className="mini-label">所以</div>
            <p className="mt-1">{route.result}</p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 18-1</span>
        每个页面都能沿 server API 或 WebSocket 帧追到 run 产物；Play 的 AI 回应则来自独立检查点会话。
      </figcaption>
    </figure>
  )
}
