/** 序 · 没人教过它下棋。
 *  节拍:谜题(承诺装置,答错放行)→ 揭晓(地图/所以然/诚实声明)→
 *  部件(第 3 轮真实自我对局回放:π 热度 + 根估值 v)→ 课尾「开始第 1 课」。
 *  回放不重算:每手的 pi/top/value 直接用 real.ts 的原始训练记录渲染。 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
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

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "一台机器从完全随机乱下起步——没人给它一盘人类棋谱,也没人教它规则之外的任何技巧。你觉得它最后能学会下棋吗?",
            options: [
              "永远乱下,不可能学会",
              "能学会,但必须有人教它规则和棋理",
              "能自己学会:自己跟自己下一盘盘棋,只靠「输赢」这一条反馈",
            ],
            answer: 2,
            explain:
              "选 C。这正是本站要带你亲手造的东西:一张人类棋谱都没有,只靠「自我对弈 + 输赢反馈」,从随机噪声里滚出棋力。现在觉得不可思议就对了——这是承诺装置:带着你的怀疑往下走,15 课之后由你自己验收。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 你要看懂的是一台什么机器</h3>
        <p>
          先给全站地图。第 1、2 课把棋盘翻译成数:81 个数装下一盘棋,再加一条
          <em>黑白通用</em>的视角铁约。第 3-6 课是四门<strong>地基篇</strong>——
          没有棋盘的数学课,回答「网络凭什么长成乘加和弯折」:什么样的机器能
          自己变准(旋钮)、乘和加为什么不多不少(计票)、直线切不出的形状
          (弯折)、责任怎么找到每个旋钮(回摊)。第 7-11 课回到棋盘造它的
          「大脑」——三张平面、会滑的模板、层层叠高的视野、一次前向两个答案、
          落子之前「再想四十遍」。第 12、13 课把这一切拧成自我变强的飞轮,
          再用真对战验证它。毕业课:你亲自跟它下一盘。提前说明:地基篇四门
          不碰棋盘,但每一步都通向棋盘——熬过这四门,后面每一课的「为什么」
          你都亲手算过。
        </p>
        <p>
          <em>(老读者注意:课程已从 11 课扩为 15 课,新增第 3-6 课地基篇,
          原三张平面起各课顺延——进度重新上锁,请从第 3 课继续。)</em>
        </p>
        <p>
          这个站有一条规矩:<strong>每个设计决策都回答「为什么这么做,换个做法会怎样」</strong>
          。没有「显然」,没有「简单来说」;每个新概念都先出一道题让你卡一下,再揭晓机制,
          然后交到你手里拨弄。你不需要任何 AI 背景,也不需要会下五子棋——会加减乘除就够。
        </p>
        <p>
          还有一句诚实声明:站里跑的是<strong>真家伙</strong>——一个 14.5 万参数的模型,
          外加一次真实训练的完整产物(权重、对局、指标)。你在部件里看到的每个数字,
          都来自那次训练的记录,没有一处是手工编排的演示。也提前说清天花板:演示只训了 4 轮,
          它下得还很臭——臭得诚实。
        </p>
        <p>
          下面就是那次训练第 3 轮里,网络跟自己下的一盘真实对局。按钮逐手推进;
          右边是它<strong>每一手落子前的思考记录</strong>:40 次模拟投给了哪些点(记作 π,
          读「派」),以及它觉得自己赢面多大(记作 v)。棋盘上的红色热度,就是 π——
          这是它第一次在你面前想事情。
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
        <span className="mini-label">来自第 3 轮真实训练对局 {GAME.id}</span>
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
              第 {step} / {LEN} 手
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
                π:40 次模拟的访问分布——它把「想」投给了哪些点
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
                <div className="mini-label">v:根估值(它对自己胜算的打分)</div>
                <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                  v = {cur.value >= 0 ? "+" : ""}
                  {cur.value.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  打分人是当前行棋方({cur.player === 1 ? "黑" : "白"}):
                  +1 = 稳赢,−1 = 稳输。下面的条已换算到黑方视角。
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
                白胜——第 {LEN} 手白落 (5,1),横排 y=1 上凑齐 (2,1)…(6,1) 五连。
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
        {GAME.id},共 {LEN} 手,白胜。每一手的 π 与 v 都是当时搜索的原始记录——本页只回放,
        不重算。它才训到第 3 轮,还很弱,但每一次「想」都是真的。
      </figcaption>
    </figure>
  )
}
