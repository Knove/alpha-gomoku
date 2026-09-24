/** 序 · 没人教过它下棋。
 *  节拍：总问题 → 18 课路线图 → 来源契约 → 真实自我对局回放 → 开始第 1 课。
 *  回放不重算搜索：棋盘逐手重建，π/rootValue 直接读真实训练记录。 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { SystemPreview } from "../framework/system-preview"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const GAME = REAL.selfplayGame
const LEN = GAME.moves.length

export default function Prologue() {
  const pass = usePassLesson()
  const entered = useRef(false)

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">序</div>
      <h1 className="text-2xl font-bold">没人教过它下棋</h1>

      <LessonGuide
        question="一台没有人类棋谱、起初只会乱下的机器，怎样最终学会下棋？"
        why="这是全站的总问题。先抓住整条因果链，后面遇到棋盘、神经网络、搜索和训练时才知道它们各在解决哪一段。"
        chain={[
          "自己下棋，产生局面与输赢",
          "网络给出第一判断，搜索在这一判断之上再想几步",
          "终局结果 z 与搜索记录 π 两种答案反过来改进网络里的权重",
          "新网络再下新棋，用对战检验是否真的变强",
        ]}
        takeaway="这门课不是让你背 AI 名词，而是让你能从头解释：每个环节为何存在、它怎样让下一轮棋下得更好。"
        boundary="网页中的模型和记录来自只练了几轮的真实演示快照，所以它仍然很弱。后续课程会按顺序推导网络大小、搜索时每手棋试多少次，以及每份数据的来源，并要求你逐项与真实代码对照（全书把这一步叫对证）。"
      />

      <SystemPreview />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一台机器从完全随机乱下起步：没人给它一盘人类棋谱，也没人替每手标「这步好不好」。你觉得它最后能学会下棋吗？",
            options: [
              "永远乱下，不可能学会",
              "能学会，但必须有人教它规则和棋理",
              "能自己学会：自己跟自己下，终局输赢给最终反馈；每盘里的搜索记录还能变成中间样本",
            ],
            answer: 2,
            explain:
              "选第三个。人没有提供棋谱或每手标注；机器自己下棋，终局输赢给出最终反馈，同时把搜索中「多想几步」得到的访问记录变成训练样本。机器因此不断产生样本、改进、再下。上面说的两样产物（终局输赢、搜索访问记录）由搜索、自我对弈与训练各章逐步展开（参见：第 10–15 课）；毕业时再由你用新局面验证整条链。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>18 课沿同一条流水线前进</h3>
        <p>
          后面出现的每个术语都要掌握，但不会一次全给。
          课程先让你看见一个具体变化，
          再用数字算一遍，最后到真实代码和运行文件里对证：
        </p>
        <ol>
          <li><strong>第 1–2 课：棋局与视角。</strong>点击怎样变成合法动作，同一盘棋为什么始终站在当前行棋方看。</li>
          <li><strong>第 3–5 课：能学习的计算。</strong>一个特征配一个权重，权重怎样按错误的方向修正，多个特征怎样相加，为什么只做线性（直线式）计算不够。</li>
          <li><strong>第 6–9 课：真实网络。</strong>棋盘怎样写成几张 0/1 图，再经过一层层「乘加＋非线性变换」（后面逐课教），最后给出策略和价值两个答案。</li>
          <li><strong>第 10–11 课：搜索。</strong>一次搜索怎样一步步试棋、再把结果传回来；一个节点选择公式（PUCT）和访问数怎样选点；噪声（noise，故意加的随机扰动）与温度（temperature，控制落子随机的程度）又怎样决定最终落子。</li>
          <li><strong>第 12–15 课：样本、训练与验收。</strong>机器跟自己下棋积累样本，策略与价值两种误差回去改权重；旧棋局混在一起训练，再让新旧网络对战，决定新网络能否被采用。</li>
          <li><strong>第 16–18 课：真实项目怎样运行。</strong>训练轮如何恢复，证据如何写进 run 目录（存放一次运行全部文件的文件夹），服务器又怎样把这些文件送到网页。</li>
        </ol>
        <Def term="神经网络" en="neural network">
          许多可调数字串成的分层计算结构：输入棋盘，输出判断，靠调整这些数字来学习（这里的「网络」不是互联网）。
        </Def>
        <Def term="权重" en="weight,亦称参数 parameter" see="第 3 课">模型里可调的数字，决定每个特征对结论占多大分量。</Def>
        <Def term="特征" en="feature" see="第 3 课">回答一个固定问题的数字；问题可以问一格，也可以问一种图案。</Def>
        <Def term="搜索" en="search" see="第 10 课">从当前局面试算多手、再把结果汇总回来的算法。</Def>
        <Def term="自我对弈" en="self-play" see="第 12 课">同一套网络互为对手，自动产生训练对局。</Def>
        <Def term="双头" en="dual head" see="第 9 课">策略头（policy head，给各落点的概率）与价值头（value head，给胜负估计）的合称。</Def>
        <p>
          课程有一条规矩：<strong>每个做法都要回答「为什么这么做，换个做法会怎样」。</strong>
          新数学工具会在第一次需要它时从具体数字教起，再写成公式；真实代码也会逐段读懂，
          不要求你预先会 AI、Python 或高等数学。
        </p>
        <p>
          还有一句诚实声明：站里加载的是<strong>真实演示快照</strong>：用 fast 配置
          （项目里小一号的演示配置，让网页算得快）训练出的、含 14.5 万个参数的模型。模型就是这台「学会下棋的机器」；它内部可调的数字就是权重。训练做的事，
          就是根据输赢反复调整这 14.5 万个数字。
          站里同时会出现三类东西：训练保存的真实记录、浏览器用导出权重重新算出的结果，
          以及为了放大一个原理而搭的教学玩具。每个环节都会单独说明来源，不把玩具冒充记录。
          这次演示运行的训练记录写到 iteration 3。iteration 指训练轮：自我对弈 → 训练 → 验收走完一遍，从 0 数起。
          网页加载的是目前保存的最好一版（训练记录里叫 best checkpoint），来自 iteration 2；「最好」指竞技场战绩，不是训练轮编号最大（参见：第 15 课）。
          它下得仍然很弱：只练了几轮的快照本就如此，与开头的来源声明一致。项目默认配置更大，所以 14.5 万不是这套代码永远固定的参数数量。
        </p>
        <p>
          下面是一盘真实自我对弈的回放。按按钮会前进一手；棋盘旁边是两块仪表：红色热度表示搜索把访问次数分到了哪里，
          <span className="mono">root_value</span> 表示搜索从当前局面出发试了许多棋之后，汇总出的估计值。
          另一个容易混的数是 <span className="mono">v_net</span>：网络不经过搜索、只看一眼棋盘给出的
          胜负估计。对局结束后还会补记终局结果 <span className="mono">z</span>（以该手行棋方为正：该手行棋方最终赢记 +1，输记 −1，和记 0）。
          网络的两个输出就是<strong>双头</strong>（见上方定义框）：一头给 81 个落点分数，一头给 1 个胜负估计，
          其中 <span className="mono">v_net</span> 是由负责胜负的<strong>价值头</strong>直接给出的。本页先完成第一步：观察同一盘棋中热度和根估值怎样随局面变化。
        </p>
      </div>

      <Replay />

      <ChapterEnd
        summary={[
          "机器的棋理不写成规则，而是存进权重；整条流水线是：自我对弈产生样本，训练改进权重，对战检验棋力。",
          "三个数要分清：网络不搜索直接给的 v_net、搜索汇总的 root_value、终局才有的 z。",
          "站里一切数字都标注来源：真实记录、浏览器复现或教学构造，不把玩具冒充记录。",
        ]}
        next={
          <>
            第 1 课从一次点击开始：坐标怎样变成 0 到 80 的动作编号，落子怎样写进 9×9 的数组，
            又怎样只看最后一手判出五连。这一课的全部约定，后面每一课都要用。
          </>
        }
      />

      <a
        className="btn primary mt-10"
        href="#/l01"
        onClick={() => {
          if (!entered.current) {
            entered.current = true
            pass("prologue") // 序不设习题：点按钮即过关，解锁第 1 课
          }
        }}
      >
        开始第 1 课 →
      </a>
    </section>
  )
}

/** 对弈回放：棋盘由 moves 用引擎逐手重建；π/rootValue 直接读训练记录。 */
function Replay() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const states = useMemo<GameState[]>(() => {
    const arr: GameState[] = [emptyBoard()]
    for (const m of GAME.moves)
      arr.push(play(arr[arr.length - 1], m.y * 9 + m.x, m.player as 1 | -1))
    return arr
  }, [])

  useEffect(() => {
    if (!playing) return
    if (step >= LEN) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setStep((s) => s + 1), 850)
    return () => clearTimeout(t)
  }, [playing, step])

  const cur = step < LEN ? GAME.moves[step] : null
  const prev = step > 0 ? GAME.moves[step - 1] : null
  const top = cur ? [...cur.top].sort((a, b) => b.prob - a.prob).slice(0, 5) : []
  const vb = cur ? cur.player * cur.rootValue : 0 // 搜索根汇总值换算为黑方视角

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">真实记录 · iteration 3 自我对局 {GAME.id}</span>
      </div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="min-w-0 flex-1">
          <Board
            board={states[step].board.flat()}
            heat={cur?.pi}
            lastMove={prev ? { x: prev.x, y: prev.y } : null}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={step === 0}
              onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)) }}>
              ← 上一手
            </button>
            <button type="button" className="btn active"
              onClick={() => setPlaying((p) => !p)}>
              {playing ? "⏸ 暂停" : "▶ 自动播放"}
            </button>
            <button type="button" className="btn" disabled={step >= LEN}
              onClick={() => { setPlaying(false); setStep((s) => Math.min(LEN, s + 1)) }}>
              下一手 →
            </button>
            <button type="button" className="btn" disabled={step === 0}
              onClick={() => { setPlaying(false); setStep(0) }}>
              ↺ 回到开局
            </button>
            <span className="num ml-auto text-sm" style={{ color: "var(--fg-faint)" }}>
              已下 {step} 手 / 共 {LEN} 手
            </span>
          </div>
        </div>

        <aside className="w-full sm:w-64 sm:flex-none">
          {cur ? (
            <div>
              <div className="mini-label">
                第 {step + 1} 手 · 轮到{cur.player === 1 ? "黑" : "白"}棋下
              </div>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                <strong>仪表 A：</strong>红色越热，表示搜索把更多访问次数放在这个落点上。
                本页先比较不同手的热区怎样移动；这块热度正式名字是 π：每次模拟沿路径选中某落点时，该落点访问数 +1；π 是根下各落点访问数占全部访问数的比例。
              </p>
              <ol className="mt-2 space-y-1.5">
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

              <div className="mt-5 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="mini-label">仪表 B · 搜索汇总后的根估值</div>
                <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                  root_value = {cur.rootValue >= 0 ? "+" : ""}
                  {cur.rootValue.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  这是许多模拟结果回传后的暂时汇总，不是胜率承诺，也不是网络价值头直接输出的
                  <span className="mono">v_net</span>。数值以当时行棋方为正；下方指针为便于观看，已换算成黑方视角。
                </p>
                <div className="l00-vbar mt-2">
                  <i className="l00-vbar-zero" />
                  <i className="l00-vbar-needle"
                    style={{ left: `${((vb + 1) / 2) * 100}%` }} />
                </div>
                <div className="num mt-1 flex justify-between text-xs"
                  style={{ color: "var(--fg-faint)" }}>
                  <span>−1 白优</span>
                  <span>0</span>
                  <span>+1 黑优</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="reveal-box">
              <div className="mini-label">终局</div>
              <p className="mt-2 text-sm font-semibold">
                坐标读法：(x, y) 的 x 看底边刻度、y 看左边刻度。
                连成一线：第 {LEN} 手白落 (5,1)，与 (2,1)(3,1)(4,1)(6,1) 连成横五。
                终局信息：白胜。
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                五连是怎么判出来的？
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        {GAME.id}，共 {LEN} 手，白胜。棋盘、π 和 root_value 是训练保存的真实记录；
        本页只要求观察，动手判胜在第 1 课。训练记录只到 iteration 3，仍然很弱，
        所以「真实」只说明来源，不等于走法正确。
      </figcaption>
    </figure>
  )
}
