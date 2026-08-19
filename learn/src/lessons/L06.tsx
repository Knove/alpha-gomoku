/** 第 6 课 · 双头:一次前向两个答案。
 *  节拍:谜题(两个问题两个网络?)→ 揭晓(共用主干 / 两种读法 / softmax+tanh)→
 *  部件(自由摆子真前向:问网络 → 81 分数热力图 + top5 + 估值条,
 *  对照开关换 weights-untrained 未训练网:baseline,训练前冻结的随机初始化)
 *  → 对账(model.py 双头 + forward)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { encode, legalMoves, type GameState } from "../engine/game"
import { loadNet, type WeightsJson } from "../engine/model"
import { softmax } from "../engine/nn"
import { loadWeights, loadWeightsUntrained } from "../lib/weights"

/* 初始局面沿用第 4/5 课的三连(己方 (2,4)(3,4)(4,4),轮黑)——换你随手摆。 */
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

export default function L06() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 6 课</div>
      <h1 className="text-2xl font-bold">双头:一次前向两个答案</h1>

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
              "选 B。A 白学一遍:判断「这里该下」和「这局我优」,看的是同一批棋形——理解只该学一次。C 连「同一套权重读出两种形状的答案」都做不到:81 个分数和 1 个数,读法本身就不同,各配各的读法层(头)。A、C 的共同错误:把「两个问题」当成了「两份理解」。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 一份理解,两种读法</h3>
        <p>
          <strong>① 为什么共用主干。</strong>「这里该下」和「这局我优」问的是同一盘棋:
          三连该堵、这边的势厚不厚,是同一批棋形证据。让两个网络各学各的,
          等于把「认棋形」这门课学两遍——参数翻倍还在其次,更贵的是数据:
          本站每一盘训练对局都是自己下出来的,一份理解教两个头,样本不涨价。
          还有个顺带的好处:价值头逼着主干学「形势判断」,
          这份理解策略头也拿去用——两个头互相当老师。
        </p>
        <p>
          <strong>② 两个头,两种读法。</strong>主干(第 4、5 课那 7 层卷积)吐出
          48 张 9×9 的理解地图;两个头各自把它读成自己的答案。
          <em>策略头逐点读</em>:先用 1×1 卷积把 48 通道压到 2 通道
          (1×1 不看邻域,只在每个交叉点上把 48 个数做一次加权求和),
          再读成 81 个分数——每个格子一个,棋盘的空间分辨率一分不丢。
          <em>价值头整盘读</em>:压到 1 通道后要把 81 个数收成 1 个数,落差太大,
          中间先过一层 64 个数的台阶,再收成 1。逐点的归逐点,整盘的归整盘。
        </p>
        <p>
          <strong>③ 两个收尾动作。</strong>策略头的 81 个原始分数(logits)要变成
          「概率」:过 <span className="mono">softmax</span>——每个分数取 e
          的这个次方,再各自除以总和。这里的 e 是一个固定的底数,约等于 2.718:
          取 e 的次方就像 2³ = 2×2×2,只是把底数 2 换成 e——指数越大,结果
          涨得越猛,分数差一点,次方之后就拉开一大截。手算三个分数:
        </p>
        <div className="formula">
          分数 <span className="hl">2</span> / 1 / 0 → e 的次方 7.39 / 2.72 / 1.00
          (和 11.11)→ 除以和 <span className="hl">0.67</span> / 0.24 / 0.09
          ——加起来正好 1
        </div>
        <p>
          每格占多少、全盘加起来 1,这就是部件里 top5 的那行百分比。价值头收成的
          1 个数要过 <span className="mono">tanh</span>:把任意数压进 −1 到 +1
          ——这是赢面标尺(+1 稳赢、−1 稳输、0 五五开),
          和训练目标「终局我赢 +1 / 我输 −1」同一把尺子,误差才可比。
          注意视角:两个头都站在<em>当前轮到的那一方</em>回答,黑白一换手,符号翻一次
          (第 2 课的铁约,一路贯穿到这里)。
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
          归一化外置在训练(<span className="mono">log_softmax</span>)和推理(
          <span className="mono">softmax</span>)各自进行,网络只吐裸 logits,一身轻。
          本站引擎 <span className="mono">learn/src/engine/model.ts</span> 的{" "}
          <span className="mono">loadNet</span> 与 forward 逐条对齐——网络的 TS 前向
          与 torch 逐张量对拍(tests/parity.test.ts),部件里「问网络」按下的每一下
          都是它算的。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 7 课"
        onAllCorrect={() => pass("l06")}
        questions={[
          {
            q: "为什么「下哪」和「谁优」共用一个主干,而不训练两个网络?",
            options: [
              "共用省内存,两个网络存不下",
              "两个问题看的是同一批棋形:理解只学一遍,还能互相促进——价值头逼出的形势判断,策略头也用得上",
              "因为只买得起一份棋谱数据",
            ],
            answer: 1,
            explain:
              "内存和数据都不是主因,主因是「同一份理解」:判断该下哪和判断谁占优,证据是同一批棋形。分开学等于「认棋形」这门课学两遍;合在一起,价值头学到的形势判断还反哺策略头。省参数省算力(一次前向两个答案)是顺带的账。",
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
              "逐点的归逐点、整盘的归整盘:策略头保住棋盘的空间分辨率(每格一个分数,第 1 课的 81 个动作一一对应);价值头要把整盘收成一个赢面数,81→64→1 的台阶就是给这个落差修的坡。",
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
              "tanh 不做归一(那是策略头 softmax 的活),它定量纲:把任意数压进 [−1,+1] 的赢面标尺。尺子对了,(v−z)² 这笔误差才有意义;有界输出还顺带稳住了训练。想读成胜率,按 (v+1)/2 换算。",
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
        <span className="mini-label">部件 · 亲手摆局面,问真网络</span>
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
          对照未训练网络(baseline,随机初始化)
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
            红色热度 = 策略头的概率(空格上重新归一,已占格不参与)。摆子颜色同时是
            「轮到谁」——网络站在它这边看棋盘、报估值。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          {!res ? (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              初始是第 4 课的三连局面。随手摆几个子(黑白随便,不用轮流),
              按「问网络」:一次真前向(约 16 ms),两个头当场交卷。
            </p>
          ) : (
            <>
              <div className="mini-label">策略头 · 下哪:top5(坐标,概率)</div>
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
                  价值头 · 谁优:<span className="num">一次前向 {res.best.ms.toFixed(1)} ms</span>
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
              <div className="mini-label">对照组 · 未训练(baseline:训练开始前冻结的随机初始化)</div>
              {!res?.untrained ? (
                <p className="mt-2 text-sm" style={{ color: "var(--fg-muted)" }}>
                  {wUntrained ? "按「问网络」,两个网络同题同考。" : "正在加载未训练权重(独立分块,约 1.2 MB)……"}
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
                同一局面、同一架构,只差训练。未训练的(baseline,纯随机初始化):策略头近乎均匀撒胡椒面——
                初始三连局面实测最热一格才 1.4%(均匀线 1/81≈1.2%),估值贴着 0
                (实测 +0.02,换哪个局面都在 ±0.05 里小幅漂)。训练过的(才训到第 3 轮)已有态度:
                同一局面 v=−0.31、最热 2.0%——离懂棋还远,但已经不是均匀的噪声了。
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 6-1</span>
        真引擎 + 真权重:<span className="mono">encode</span>(game.ts)→{" "}
        <span className="mono">loadNet</span>(model.ts)前向,softmax 在站内现算。
        训练后 weights-best.json;对照 weights-untrained.json(baseline,独立懒加载,打开开关才下载)。
      </figcaption>
    </figure>
  )
}
