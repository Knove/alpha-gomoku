/** 序 · 没人教过它下棋。
 *  节拍:谜题(记下你的怀疑,答错放行)→ 揭晓(地图/所以然/诚实声明)→
 *  部件(第 3 轮真实自我对局回放:π 热度 + 它给自己打的分 v)→ 课尾「开始第 1 课」。
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
            q: "一台机器从完全随机乱下起步——没人给它一盘人类下棋的记录(棋谱),也没人教它规则之外的任何技巧。你觉得它最后能学会下棋吗?",
            options: [
              "永远乱下,不可能学会",
              "能学会,但必须有人教它规则和棋理",
              "能自己学会:自己跟自己下一盘盘棋,只看「输了还是赢了」这一条消息",
            ],
            answer: 2,
            explain:
              "选第三个。这正是本站要带你亲手造的东西:一张人类棋谱都没有,只靠自己跟自己下、只看输赢,从一通乱下里滚出下棋的本事。现在觉得不可思议就对了——先把你的怀疑记在这儿,15 课以后,由你自己来对答案。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 你要看懂的是一台什么机器</h3>
        <p>
          先给全站地图。第 1、2 课把棋盘翻译成数:81 个数装下一盘棋,再加一条
          <em>黑棋白棋都通用</em>的铁规矩。第 3-6 课是四门<strong>地基篇</strong>——
          没有棋盘的数学课,回答一个问题:这台机器的肚子里,凭什么只靠乘、加,
          再加一点「把直线掰弯」(拐弯)就够了?(「网络」不是互联网,就是那台
          机器的「大脑」。)四门课各答一件事:什么样的机器能自己变准——第 3 课
          <em>旋钮</em>;乘和加为什么不多不少——第 4 课<em>计票</em>;直线切不出的
          形状——第 5 课<em>弯折</em>;答错了,责任怎么找到每个旋钮——第 6 课
          <em>回摊</em>。第 7-11 课回到棋盘造它的「大脑」:把棋盘画成三张叠起来
          的透明胶片(三张平面),用像盖章一样滑着找图案的小模板(会滑的模板),
          一层层垫高看见全盘,一口气算出两个答案,落子之前「再想四十遍」。
          第 12、13 课把这些
          拼到一起,拧成一个越转越快的「飞轮」——像滚雪球,越滚越强——
          再用真对战验证它。毕业课:你亲自跟它下一盘。提前说明:地基篇四门
          不碰棋盘,但每一步都通向棋盘——熬过这四门,后面每一课的「为什么」
          你都亲手算过。
        </p>
        <p>
          <em>(第一次来的读者请直接跳过这条,它只写给看过旧版的老读者:课程已
          从 11 课扩为 15 课,新增第 3-6 课地基篇,从「三张平面」那课起都往后
          顺延;老读者以前解锁的进度已重新锁上,请从第 3 课接着看。)</em>
        </p>
        <p>
          这个站有一条规矩:<strong>每个做法都要回答「为什么这么做,换个做法会怎样」</strong>
          。绝不拿一句「这还不简单」糊弄你;每个新概念都先出一道题让你卡一下,再揭晓里面的道理,
          然后交到你手里拨弄。你不需要任何 AI 背景,也不需要会下五子棋——会加减乘除就够。
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
          下面就是那次训练第 3 轮里,网络跟自己下的一盘真实对局。按一下按钮,
          就往前走一手。棋盘旁边(手机上在棋盘下面)是它<strong>每一手落子前的思考记录</strong>:
          落子前,它先在脑子里把后面的棋偷偷试下了 40 回(这就叫「模拟」)。
          每一回试下,都先替眼下这一步挑一个点下手。数一数每个点被挑中了
          几回,像投票数票——票数记作 π(读「派」,就是圆周率那个符号,
          这里只借来当个名字)。它还给自己估一估赢的把握,记作 v。
          棋盘上的红色热度,就是 π——圈越红越大,它越想下在那里
          (棋子身上那个小红点不是热度,是刚下的那一手)。
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
                π:40 次试下里,它把「想」投给了哪些点。只列它最想下的 5 个;
                括号里两个数是格子的门牌号:拿第一个数,沿棋盘底边找到相同的数字;拿第二个数,沿棋盘左边往上找。两条对上的地方,就是这颗子。
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
                <div className="mini-label">v:它给自己这盘棋打的分</div>
                <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                  v = {cur.value >= 0 ? "+" : ""}
                  {cur.value.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  轮到谁下,这个分就由谁来打(现在轮到
                  {cur.player === 1 ? "黑" : "白"}棋):+1 = 稳赢,−1 = 稳输(−1
                  是比 0 还小的数)。下面的条像温度计:0 是平局,针偏右黑棋占优,
                  偏左白棋占优。这根针永远按黑棋的立场画:白棋的好消息,针就
                  往左挪——轮到白棋时,它给自己打 +0.3,是白棋的好消息,所以
                  针往左。
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
        {GAME.id},共 {LEN} 手,白胜。每一手的 π 与 v,都是它当时「想」的原始记录——
        本页只回放,不重算。它才训到第 3 轮,还很弱,但每一次「想」都是真的。
      </figcaption>
    </figure>
  )
}
