/** 序 · 没人教过它下棋。
 *  节拍：总问题 → 18 课路线图 → 来源契约 → 真实自我对局回放 → 开始第 1 课。
 *  回放不重算搜索：棋盘逐手重建，π/rootValue 直接读真实训练记录。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd } from "../framework/def"
import { SystemPreview } from "../framework/system-preview"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { emptyBoard, play, type GameState } from "../engine/game"

const GAME = REAL.selfplayGame
const LEN = GAME.moves.length

export default function Prologue() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">序</div>
      <h1 className="text-2xl font-bold">没人教过它下棋</h1>

      <LessonGuide
        question="一台没有人类棋谱、起初只会乱下的机器，怎样最终学会下棋？"
        why="这是全书的总问题。先看清整条自我改进闭环，后面学棋盘编码、神经网络、搜索和训练时，才知道每一步在整台机器里负责什么。"
        chain={[
          "自己跟自己下棋，产生局面与最终输赢",
          "神经网络给出第一眼判断，搜索顺着它再往后推演几步",
          "搜索留下的访问分布 π 与终局结果 z 反过来修正网络权重",
          "新网络与旧网络对战验收，赢过门槛才留用",
        ]}
        takeaway="你能画出整条自我改进闭环的顺序（谁产生数据、谁改进权重），并在真实对局回放里读懂机器每一步的落点热度与优劣判断。"
        boundary="本页先建立全局直觉，不要求计算或写代码。第 1 课起逐个拆开真实代码、数字和交互，直到能独立解释并改动这条链。"
      />

      <SystemPreview />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "一台机器从完全随机乱下起步：没人给它一局人类棋谱，也没人替每手标「这步好不好」。你觉得它最后能学会下棋吗？",
            options: [
              "永远乱下，不可能学会",
              "能学会，但必须有人教它规则和棋理",
              "能自己学会：自己跟自己下，终局输赢给最终反馈；每局里的搜索记录还能变成中间样本",
            ],
            answer: 2,
            explain:
              "选第三个。人只提供五子棋规则，不提供棋谱或每手点评。机器靠自我对弈走完整盘棋：终局输赢给出最终反馈，同时每一步搜索「往后多想几步」留下的访问分布 π 给出每手的改进方向。有这两份反馈，机器就能不断积累样本、更新权重、在下一轮下出更好的棋。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>18 课沿同一条流水线前进</h3>
        <p>
          全书 18 课对应真实仓库里的每一个核心模块。每到一个新环节，我们都按同一个节奏推进：
          <strong>先看直观现象，再用简单数字手算一遍，最后对着真实的 Python 代码和测试走通验证。</strong>
          不需要预先学过深度学习或高等数学，用到的数学工具会在第一次需要它时从加减乘除推出来：
        </p>
        <ol>
          <li><strong>第 1–2 课：棋局与视角。</strong>点击怎样变成合法动作与胜负判定，同一局棋为什么始终站在当前行棋方的视角编码。</li>
          <li><strong>第 3–5 课：能学习的计算。</strong>一个特征配一个权重，误差怎样指出权重的修正方向，多个特征怎样加权求和，为什么层与层之间必须插入非线性变换。</li>
          <li><strong>第 6–9 课：双头神经网络。</strong>棋盘怎样拆成 3 个 0/1 平面，经过卷积层与残差块扩大感受野，最后分路读出 81 个落点概率和 1 个局面价值估计。</li>
          <li><strong>第 10–11 课：蒙特卡洛树搜索。</strong>一次搜索模拟怎样沿树选择、求值、回传；选择公式（PUCT）怎样兼顾已知好棋与未知探索，最终由访问次数生成访问分布 <span className="mono">π</span> 并决定落子。</li>
          <li><strong>第 12–15 课：自我对弈、反向传播、训练与竞技场。</strong>一盘自我对弈怎样变成训练样本，策略与价值两笔损失怎样反向传播更新权重，新旧网络又怎样通过受控对战决定谁晋升。</li>
          <li><strong>第 16–18 课：工程管线与对弈服务。</strong>完整训练轮如何中断恢复，运行文件如何安全落盘，服务程序又如何把实时数据与人机对弈送到网页。</li>
        </ol>

        <h3>先看一局它自己下的真棋</h3>
        <p>
          下面这盘棋不是动画演示，而是这台模型在第 3 轮自我对弈时留下的真实记录（为便于在浏览器里实时计算，站内使用小一号的演示模型，只训了几轮，棋力还很稚嫩，但整套机制已经完整跑通）。
          点「▶ 自动播放」或「下一手」，观察机器每走一步时右侧变化的两块仪表：
        </p>
        <ul>
          <li>
            <strong>仪表 A · 访问分布 <span className="mono">π</span>（棋盘上的红色热区与右侧占比榜）</strong>：
            机器落子前会往后模拟几十次。哪个落点在模拟中被反复选中，哪里的占比就越高、颜色越红。
          </li>
          <li>
            <strong>仪表 B · 搜索汇总 <span className="mono">root_value</span>（底部的优劣指针）</strong>：
            把这一手所有模拟的结果汇总到当前局面，取值在 <span className="mono">−1</span> 到 <span className="mono">+1</span> 之间，表示机器认为当前哪一方占优。
          </li>
        </ul>
      </div>

      <Replay />

      <ChapterEnd
        summary={[
          "机器的棋理不靠人工写死规则，而是存进神经网络的权重里：自我对弈产生样本，训练更新权重，受控对战检验是否真的变强。",
          "每走一手棋，搜索都会留下两份关键记录：各落点的访问分布 π（哪里值得下）与搜索汇总 root_value（当前谁占优）。",
          "整盘棋分出胜负后还会得到真实终局结果 z；把搜索记录与终局结果拿去改进网络，闭环就转起来了。",
        ]}
        next={
          <>
            第 1 课从棋盘上的第一次点击开始：行列坐标怎样变成 0 到 80 的动作编号，落子怎样写进 9×9 的数组，
            又怎样只检查刚落下的那一颗子就判出五连胜负。
          </>
        }
      />

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
                <strong>仪表 A · 访问分布 <span className="mono">π</span>：</strong>
                前 5 个候选落点的搜索访问占比。颜色越红、条越长，说明搜索在这手棋上投的模拟次数越多。
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
                <div className="mini-label">仪表 B · 搜索汇总 root_value</div>
                <p className="num mt-1.5 text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                  root_value = {cur.rootValue >= 0 ? "+" : ""}
                  {cur.rootValue.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  正数表示当前行棋方占优；下方指针统一换算到黑方视角（向右黑优，向左白优）。
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
                五连是怎么判出来的？第 1 课动手判。
              </p>
            </div>
          )}
        </aside>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">真实记录</span>
        {GAME.id}，共 {LEN} 手，白胜。棋盘按记录的走法逐手重建，π 与 root_value 直接读取自第 3 轮自我对弈的真实训练记录。
      </figcaption>
    </figure>
  )
}
