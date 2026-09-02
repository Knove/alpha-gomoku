/** 第 9 课 · 双头:一次前向两个答案。
 *  节拍:谜题(两个问题两个网络?)→ 揭晓(共用主干 / 两种读法 / softmax+tanh)→
 *  部件(自由摆子真前向:问网络 → 81 分数热力图 + top5 + 估值条,
 *  对照开关换 weights-untrained 未训练网:baseline,训练前冻结的随机初始化)
 *  → 对账(model.py 双头 + forward)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board from "../lib/board"
import { encode, legalMoves, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { softmax } from "../engine/nn"
import { loadWeights, loadWeightsUntrained } from "../lib/weights"

/* 初始局面沿用第 8/9 课的三连(己方 (2,4)(3,4)(4,4),轮黑)——换你随手摆。 */
const INIT: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const x of [2, 3, 4]) b[4 * 9 + x] = 1
  return b
})()

interface AskResult {
  probs: number[] // 空格上重新归一的 81 概率
  top: { a: number; p: number }[] // top5
  value: number // 当前行棋方视角
  ms: number
}

/** 一次真前向:encode → loadNet 的函数(与本站引擎同一形状)。 */
function askNet(
  net: (input: number[][][]) => { logits: number[]; value: number },
  st: GameState,
): AskResult {
  const t0 = performance.now()
  const { logits, value } = net(encode(st))
  const ms = performance.now() - t0
  const legal = legalMoves(st)
  const raw = softmax(logits)
  let sum = 0
  const probs = raw.map((p, a) => p * legal[a])
  for (const p of probs) sum += p
  if (sum > 1e-9) for (let a = 0; a < 81; a++) probs[a] /= sum
  const top = probs
    .map((p, a) => ({ a, p }))
    .filter((t) => t.p > 0)
    .sort((x, y) => y.p - x.p)
    .slice(0, 5)
  return { probs, top, value, ms }
}

export default function L10() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 9 课</div>
      <h1 className="text-2xl font-bold">双头:一次前向两个答案</h1>

      <LessonGuide
        question="同一盘棋既要回答“哪里该下”，又要回答“谁更占优”，为什么不用两台完全分开的机器？"
        why="两个问题虽然答案形状不同，却都依赖同一批棋形和全盘形势。先共享理解，再分别读出答案，能少学重复的功课。"
        chain={[
          "主干把棋盘变成一组棋形与形势地图",
          "策略头保留每个格子的差别，给 81 个落点打分",
          "价值头把整盘信息汇成一个胜负倾向",
          "搜索把“落点建议 + 形势估计”组合成实际走法",
        ]}
        takeaway="“两个头”不是两份大脑：它们共用一份棋盘理解，只是在最后按不同问题读出 81 个分数和 1 个判断。"
        boundary="策略分数怎样变成概率、价值怎样压到 −1 到 +1，会在本章用到；不需要先记住 softmax 和 tanh 的公式。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "网络看完棋盘,要回答两个问题:81 格各下哪(逐点的分数),和整盘谁优(一个数)。怎么安排这套问答?",
            options: [
              "两个网络:一个专门学「下哪」,一个专门学「谁优」",
              "一个主干带两个头:主干看棋,末端分岔,一个头逐点读,一个头整盘读",
              "一个网络答两次:先把 81 个分数算完,再用同一套权重算一遍估值",
            ],
            answer: 1,
            explain:
              "选第二项。第一项白学一遍:判断「这里该下」和「这局我优」,看的是同一批棋形——理解只该学一次。第三项连「同一套权重读出两种形状的答案」都做不到:81 个分数和 1 个数,读法本身就不同,各配各的读法层(头)。一、三两项的共同错误:把「两个问题」当成了「两份理解」。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 一份理解,两种读法</h3>
        <p>
          <strong>① 为什么共用主干。</strong>“这里该下”和“这局我优”都要看同一盘棋里的
          棋形与形势。若完全分开，两套网络可能重复学习“怎样认棋形”。共用主干让一份
          表示同时服务两个训练目标，通常更省参数、也能让两种目标给主干提供辅助信号；
          这是一种常见设计取舍，不保证两个任务永远互相帮助。
        </p>
        <p>
          <strong>② 两个头,两种读法。</strong>主干(第 7、8 课那 7 层卷积)吐出
          48 张 9×9 的理解地图;两个头各自把它读成自己的答案。
          <em>策略头逐点读</em>:先用 1×1 卷积把 48 通道压到 2 通道
          (1×1 不看旁边的格子,只在每个交叉点上把 48 个数各乘各的音量再相加
          ——行话叫「加权求和」,就是第 4 课那套计票),
          再读成 81 个分数——每个格子都留着自己的分数,一格不合并。
          <em>价值头整盘读</em>:压到 1 通道后要把 81 个数收成 1 个数,落差太大,
          中间先过一层 64 个数的台阶,再收成 1。逐点的归逐点,整盘的归整盘。
        </p>
        <p>
          <strong>③ 两个收尾动作。</strong>策略头先给 81 个格子原始分数（logits），
          再用 <span className="mono">softmax</span> 把它们改成总和为 1 的比例。你只需要
          记住效果：原始分越高，得到的比例通常越大；所有格子的比例加起来恰好是 1。
          它背后的指数运算是为了让高分更突出，下面只把结果算一次给你看：
        </p>
        <div className="formula">
          分数 <span className="hl">2</span> / 1 / 0 → e 的次方 7.39 / 2.72 / 1.00
          (和 11.11)→ 除以和 <span className="hl">0.67</span> / 0.24 / 0.09
          ——加起来正好 1
        </div>
        <p>
          这个“凑成 1”叫归一；部件 top5 的百分比就是它。价值头的一个数则过
          <span className="mono">tanh</span>，压进 −1 到 +1，和训练标签“赢 +1、输 −1、和 0”
          使用同一把尺子，才能计算误差 <span className="mono">(v−z)²</span>。它是优势估计，
          <strong>不是未经校准就能直接读成胜率的概率</strong>。视角也要分开说：价值 v 站在当前
          行棋方立场；策略头的分数仍对应原棋盘上的 81 个坐标，并没有把棋盘坐标翻转。
        </p>
      </div>

      <AskBoard />

      <Ledger title="model.py L39-46(两个头)、L48-55(forward)">
        <div className="codewalk">
          <pre>{`# L39-46  末端分岔:两个小头,各接各的读法
self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)  # 策略头:1×1 压到 2 通道
self.p_bn   = nn.BatchNorm2d(2)
self.p_fc   = nn.Linear(2*n*n, n*n)                 # 展平 162 → 读成 81 个分数
self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)  # 价值头:1×1 压到 1 通道
self.v_bn   = nn.BatchNorm2d(1)
self.v_fc1  = nn.Linear(n*n, 64)                    # 81 → 64(落差大,先过一层台阶)
self.v_fc2  = nn.Linear(64, 1)                      # 64 → 1`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L48-55  forward:一次前向,两个答案
def forward(self, x):
    h = self.blocks(self.stem(x))              # 主干:一份理解
    p = F.relu(self.p_bn(self.p_conv(h)))      # 策略头读 h → 81 个 logits
    p = self.p_fc(p.reshape(-1, 2*n*n))
    v = F.relu(self.v_bn(self.v_conv(h)))      # 价值头读同一个 h
    v = F.relu(self.v_fc1(v.reshape(-1, n*n)))
    v = torch.tanh(self.v_fc2(v)).squeeze(-1)  # → 1 个数,压进 −1..+1
    return p, v`}</pre>
        </div>
        <p className="mt-3">
          两处值得指认:①两个头读的是<em>同一个</em> <span className="mono">h</span>
          ——「一份理解」在代码里就是这一个变量;②forward 里找不到 softmax:
          「凑成 1」这件事(③里那个归一),训练时和下棋时各做各的——训练用
          <span className="mono">log_softmax</span>(带对数的同一场归一,第 12
          课对账),下棋用
          <span className="mono">softmax</span>,网络只吐裸 logits,一身轻。
          本站引擎 <span className="mono">learn/src/engine/model.ts</span> 的{" "}
          <span className="mono">loadNet</span> 与 forward 逐条对齐——网页这一版
          (model.ts)和 torch 版各算一遍、逐个数对答案(行话叫「对拍」,tests/parity.test.ts),
          部件里「问网络」按下的每一下都是它算的。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 10 课"
        onAllCorrect={() => pass("l10")}
        questions={[
          {
            q: "为什么「下哪」和「谁优」共用一个主干,而不训练两个网络?",
            options: [
              "共用省内存,两个网络存不下",
              "两个问题都依赖棋形和形势：共享主干可避免重复表示，并让两个训练目标共同给主干提供信号",
              "因为只买得起一份棋谱数据",
            ],
            answer: 1,
            explain:
              "主因是“一份理解”：判断该下哪和判断谁占优都依赖同一批棋形与形势。分开学可能重复做“认棋形”这门功课；合在一起，两个训练目标都能更新同一个主干。省参数、省计算是顺带收益，两个目标是否总能互相帮助仍取决于训练。",
          },
          {
            q: "策略头和价值头的读法差在哪?",
            options: [
              "策略头整盘读成一个数,价值头逐点读成 81 个分数",
              "策略头逐点读:压到 2 通道后读成 81 个分数;价值头整盘读:压到 1 通道,经 64 的台阶收成 1 个数",
              "没有差别,只是输出的名字不同",
            ],
            answer: 1,
            explain:
              "逐点的归逐点、整盘的归整盘:策略头把棋盘一格一格的细节全保住(每格一个分数,第 1 课的 81 个动作一一对应);价值头要把整盘收成一个赢面数,81→64→1 的台阶就是给这个落差修的坡。",
          },
          {
            q: "价值头的输出为什么要过 tanh?",
            options: [
              "为了让它看起来更像概率,加起来等于 1",
              "为了压进 −1 到 +1:和训练目标(赢 +1 / 输 −1 / 和 0)同一把尺子,误差才可比,训练早期也不会飙出天文数字",
              "为了让计算更快",
            ],
            answer: 1,
            explain:
              "tanh 不做归一（那是策略头 softmax 的活），它管的是标尺：把任意数压进 −1 到 +1，使其能与训练标签赢 +1 / 输 −1 / 和 0 比较，计算 (v−z)²。它表示优势倾向，不是直接的胜率；有和棋、模型未校准等情况时，不能把 (v+1)/2 当作“赢的概率”。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 · 自由摆子,问真网络 ============ */

function AskBoard() {
  const [stones, setStones] = useState<number[]>(INIT)
  const [cur, setCur] = useState<1 | -1>(1) // 下一手摆的颜色(也决定网络替谁看)
  const [cmp, setCmp] = useState(false)
  const [wBest, setWBest] = useState<WeightsJson | null>(null)
  const [wUntrained, setWUntrained] = useState<WeightsJson | null>(null)
  const [res, setRes] = useState<{ best: AskResult; untrained: AskResult | null } | null>(null)

  useEffect(() => {
    let alive = true
    loadWeights().then((w) => alive && setWBest(w))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (!cmp || wUntrained) return
    let alive = true
    loadWeightsUntrained().then((w) => alive && setWUntrained(w))
    return () => {
      alive = false
    }
  }, [cmp, wUntrained])

  const netBest = useMemo(() => (wBest ? loadNet(wBest) : null), [wBest])
  const netUntrained = useMemo(() => (wUntrained ? loadNet(wUntrained) : null), [wUntrained])

  const state = useMemo<GameState>(() => {
    const board = Array.from({ length: 9 }, (_, y) => stones.slice(y * 9, y * 9 + 9))
    let n = 0
    for (const v of stones) if (v !== 0) n++
    return { board, current: cur, winner: 0, moveCount: n, lastMove: null }
  }, [stones, cur])

  const place = (x: number, y: number) => {
    setRes(null) // 棋盘一变,旧答案作废——数字永远对得上眼前的局面
    setStones((s) => {
      const next = s.slice()
      next[y * 9 + x] = cur
      return next
    })
  }

  const ask = () => {
    if (!netBest) return
    setRes({
      best: askNet(netBest, state),
      untrained: cmp && netUntrained ? askNet(netUntrained, state) : null,
    })
  }

  const vb = res ? res.best.value * cur : 0 // 估值条按黑方视角换算

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 合成输入探针:亲手摆局面,看真网络怎样计算</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--fg-muted)" }}>
          <input
            type="checkbox"
            checked={cmp}
            onChange={(e) => {
              setCmp(e.target.checked)
              setRes(null)
            }}
            data-qa="cmp-toggle"
          />
          对照未训练网络(baseline,权重还是随机数)
        </label>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          <div data-qa="board-main">
            <Board board={stones} onCellClick={place} heat={res?.best.probs} ghostPlayer={cur} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="seg">
              <button type="button" className={`seg-btn ${cur === 1 ? "active" : ""}`} onClick={() => setCur(1)}>
                摆黑
              </button>
              <button type="button" className={`seg-btn ${cur === -1 ? "active" : ""}`} onClick={() => setCur(-1)}>
                摆白
              </button>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStones(new Array<number>(81).fill(0))
                setRes(null)
              }}
            >
              清空
            </button>
            <button type="button" className="btn primary" disabled={!netBest} onClick={ask} data-qa="ask-btn">
              {netBest ? "问网络 →" : "正在加载真权重……"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            红色热度 = 策略头的概率(只在空格里重新凑成 100%,已占格不参与)。摆子颜色同时是
            「轮到谁」——网络站在它这边看棋盘、报估值。
          </p>
          <p className="misconception mt-3 text-xs leading-relaxed">
            <span className="m-title">使用边界</span>
            这里允许你任意摆黑白子，目的是观察一次真实前向计算。若摆出了不合规则的局面
            （例如双方数量不符合轮流落子），数值仍是网络对这份输入的输出，<strong>不应当解释成
            合法对局中的落子建议或棋力证据</strong>。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          {!res ? (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              初始是第 7 课的三连局面。你可以随手摆子来观察输入怎样改变输出；若想把结果
              当作棋局建议，请自己保持黑白轮流与合法落子。按“问网络”会进行一次真前向计算，
              两个头当场交卷。
            </p>
          ) : (
            <>
              <div className="mini-label">策略头 · 下哪:top5((列 x,行 y),概率)</div>
              <ol className="mt-2 space-y-1.5">
                {res.best.top.map((t) => (
                  <li key={t.a} className="l00-top-row" data-qa="top-row">
                    <span className="mono text-sm">({t.a % 9},{Math.floor(t.a / 9)})</span>
                    <span className="prob-track">
                      <span className="prob-fill" style={{ width: `${t.p * 100}%` }} />
                    </span>
                    <span
                      className="num w-12 flex-none text-right text-sm"
                      style={{ color: "var(--accent-deep)" }}
                    >
                      {(t.p * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="mini-label">
                  价值头 · 谁优:<span className="num">一次前向 {res.best.ms.toFixed(1)} 毫秒</span>
                </div>
                <p className="num mt-1.5 text-2xl font-bold" data-qa="v-best" style={{ color: "var(--accent-deep)" }}>
                  v = {res.best.value >= 0 ? "+" : ""}
                  {res.best.value.toFixed(2)}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  {cur === 1 ? "黑" : "白"}方视角(轮到谁就替谁看);条上已换算到黑方视角。
                </p>
                <div className="l00-vbar mt-2">
                  <i className="l00-vbar-zero" />
                  <i className="l00-vbar-needle" style={{ left: `${((vb + 1) / 2) * 100}%` }} />
                </div>
                <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
                  <span>−1 白优</span>
                  <span>0</span>
                  <span>+1 黑优</span>
                </div>
              </div>
            </>
          )}

          {cmp && (
            <div className="mt-5 border-t pt-3" style={{ borderColor: "var(--hairline)" }} data-qa="cmp-panel">
              <div className="mini-label">对照组 · 未训练(baseline:训练开始前冻住的随机数权重)</div>
              {!res?.untrained ? (
                <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                  {wUntrained ? "按「问网络」,两个网络同题同考。" : "正在加载未训练权重(单独一份文件,约 1.2 MB)……"}
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-4 sm:flex-row">
                  <div className="w-40 flex-none" data-qa="board-untrained">
                    <Board board={stones} heat={res.untrained.probs} />
                    <p className="num mt-1 text-center text-xs" style={{ color: "var(--fg-faint)" }}>
                      未训练的热度
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <ol className="space-y-1.5">
                      {res.untrained.top.slice(0, 3).map((t) => (
                        <li key={t.a} className="l00-top-row" data-qa="top-row-untrained">
                          <span className="mono text-sm">({t.a % 9},{Math.floor(t.a / 9)})</span>
                          <span className="prob-track">
                            <span className="prob-fill" style={{ width: `${t.p * 100}%` }} />
                          </span>
                          <span
                            className="num w-12 flex-none text-right text-sm"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            {(t.p * 100).toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="num mt-3 text-lg font-bold" data-qa="v-untrained" style={{ color: "var(--fg-muted)" }}>
                      v = {res.untrained.value >= 0 ? "+" : ""}
                      {res.untrained.value.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                同一局面、同一副网络骨架,只差训练。未训练的(baseline,权重还是一堆随机数):策略头几乎把票平分给 81 格——
                初始三连局面实测最热一格才 1.4%(81 格平摊、每格约 1.2%),估值贴着 0
                (实测 +0.02,换哪个局面都基本贴着 0 小幅漂)。训练过的(才训到第 3 轮)已有态度:
                同一局面 v=−0.31、最热 2.0%——离懂棋还远,但已经不是一片均匀的乱数了。
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 10-1</span>
        真引擎 + 真权重:<span className="mono">encode</span>(game.ts)→{" "}
        <span className="mono">loadNet</span>(model.ts)前向,softmax 在站内现算。
        训练后 weights-best.json;对照 weights-untrained.json(baseline,单独一份文件,打开开关才下载)。
      </figcaption>
    </figure>
  )
}
