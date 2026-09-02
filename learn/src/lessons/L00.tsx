/** 序 · 没人教过它下棋。
 *  节拍:谜题(记下你的怀疑,答错放行)→ 揭晓(地图/所以然/诚实声明)→
 *  部件(第 3 轮真实自我对局回放:π 热度 + 它给自己打的分 v)→ 课尾「开始第 1 课」。
 *  回放不重算:每手的 pi/top/value 直接用 real.ts 的原始训练记录渲染。 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { LessonGuide } from "../framework/lesson-guide"
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
        why="这是全站的总问题。先抓住整条因果链，后面遇到棋盘、网络、搜索和训练时才知道它们各在解决哪一段。"
        chain={[
          "自己下棋，产生局面与输赢",
          "网络给出第一判断，搜索把它想得更深",
          "对局结果反过来改进网络的旋钮",
          "新网络再下新棋，用对战检验是否真的变强",
        ]}
        takeaway="这门课不是让你背 AI 名词，而是让你能从头解释：每个零件为何存在、它怎样让下一轮棋下得更好。"
        boundary="网页中的模型和记录来自真实训练快照，但它只练了几轮、仍然很弱。具体网络大小和搜索预算会在对应课程的真实组件里出现，现在不必记。"
      />

      <SystemPreview />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "一台机器从完全随机乱下起步——没人给它一盘人类棋谱，也没人替每手标“这步好不好”。你觉得它最后能学会下棋吗？",
            options: [
              "永远乱下,不可能学会",
              "能学会,但必须有人教它规则和棋理",
              "能自己学会：自己跟自己下，终局输赢给最终反馈；每盘里的搜索记录还能变成中间作业",
            ],
            answer: 2,
            explain:
              "选第三个。人没有提供棋谱或每手标注；机器自己下棋，终局输赢给出最终反馈，同时把搜索中“多想几步”得到的访问记录变成策略作业。于是它从一通乱下里不断造题、批改、再下。第 11、12 课会拆开这两种反馈；现在觉得不可思议就对了，15 课以后由你自己对答案。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 这台机器由四段接成</h3>
        <p>
          把整站先看成一条流水线，不必现在记住所有名字。每一段只做一件事，
          而且都为下一段服务：
        </p>
        <ol>
          <li><strong>先让机器读懂棋盘（第 1–2 课）。</strong>把棋局写成数字，并统一“我方 / 对方”的视角。</li>
          <li><strong>先造判断器的基本积木（第 3–5 课）。</strong>旋钮怎样参与计算，为什么直线还要弯一下。</li>
          <li><strong>然后造出会判断与会思考的大脑（第 6–10 课）。</strong>它从棋盘读出局部棋形、看到全盘、给出两个答案，再把后续多想几步。</li>
          <li><strong>最后让错误回到旋钮、让闭环转起来（第 11–13 课）。</strong>先把 π 和 z 两种老师的错误回摊，再用自我对弈训练、对战验收。</li>
        </ol>
        <p>
          课程有一条规矩：<strong>每个做法都要回答“为什么这么做，换个做法会怎样”。</strong>
          第一次遇到一个词时，先抓住它解决的实际问题；公式和代码放在能验证时再出现。你不需要 AI 背景，
          也不需要很会下五子棋，会加减乘除就够。
        </p>
        <p>
          还有一句诚实声明:站里跑的是<strong>真家伙</strong>——一个 14.5 万参数的模型。
          模型,就是这台「学会下棋的机器」;参数,是它肚子里 14.5 万个能拧的
          小旋钮。这台机器还留着一次真实训练攒下的三样东西:练出来的本事、
          下过的棋、每一轮的成绩。
          你在下面能点能玩的部件里看到的每个数字,都来自那次训练的记录,
          没有一处是提前摆好给你看的演示。也提前说好它现在的水平:演示只训了 4 轮,
          它下得还很臭——臭得诚实。
        </p>
        <p>
          下面是一盘真实自我对弈的<strong>预告片</strong>。按按钮会前进一手；棋盘旁边有两个
          现在不必懂的仪表：红色热度表示“它更想先检查哪里”，<span className="mono">v</span>
          表示“它觉得眼前局面谁更占优”。先观察它确实会留下思考痕迹即可。
          到<a href="#/l10">双头</a>、<a href="#/l11">搜索</a>和<a href="#/l12">飞轮</a>时，
          你会带着这些仪表回来，把每个数字的来历接上。
        </p>
      </div>

      <Replay />

      <a
        className="btn primary mt-10"
        href="#/l01"
        onClick={() => {
          if (!entered.current) {
            entered.current = true
            pass("prologue") // 序不设小测:点按钮即过关,解锁第 1 课
          }
        }}
      >
        开始第 1 课 →
      </a>
    </section>
  )
}

/** 对弈回放:棋盘由 moves 用引擎逐手重建;π/v 直接读训练记录。 */
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
  const vb = cur ? cur.player * cur.value : 0 // 黑方视角的 v

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5">
        <span className="mini-label">来自第 3 轮真实训练对局(对局编号 {GAME.id},不用记)</span>
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
                <strong>仪表 A：</strong>红色越热，表示它把更多注意力放在这个落点上。
                先只观察“注意力会移动”，不用读懂百分比或坐标；第 10 课会给这个仪表正式名字 π，
                并解释它为什么来自多次推演。
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
                <div className="mini-label">仪表 B · 它对局面的暂时判断</div>
                <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                  v = {cur.value >= 0 ? "+" : ""}
                  {cur.value.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  这是它对“眼前谁更有利”的暂时估计，不是胜率承诺，也不需要现在会算。
                  下面的针为了方便观看按黑棋方向画；第 9 课会解释网络为何会给出这个数，
                  第 10 课会解释搜索怎样使用它。
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
                白胜——第 {LEN} 手白落在 (5,1):括号里前一个数,对着棋盘底边
                找;后一个数,对着左边找。它在左边标 1 的那一横排上,把底边
                标 2 到 6 的五个格子连成了一线。
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                怎么判出来的五连?这正是第 1 课要亲手数的东西。
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真数据</span>
        {GAME.id},共 {LEN} 手,白胜。每一手都保留了两种原始仪表记录；本页只让你先看见
        “机器会留下思考痕迹”，不要求现在解释它们。它才训到第 3 轮，还很弱，但记录是真的。
      </figcaption>
    </figure>
  )
}
