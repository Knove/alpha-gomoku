/** 第 4 课 · 计票:乘和加,不多不少(地基篇 2/4)。
 *  节拍:谜题(九份证据怎么并成一个分)→ 揭晓(乘=音量/加=累加+账目分明/
 *  为什么不加别的/点积·矩阵/收尾命名「线性」)→
 *  部件 1(三证人计票器:真权重 stem.0.weight 一组 27 个,拖音量看乘积与账单)→
 *  部件 2(必单调:直线画不出 V)→ 对账(model.py stem 预告式)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { dot } from "../lib/foundations"
import { loadWeights } from "../lib/weights"
import type { WeightsJson } from "../engine/model"

/* 教学局面(全站同一手):己方三连 (2,4)(3,4)(4,4),轮己方走。
 * 计票窗口罩在三连正中 (3,4)——三张面的窗口值全在此。 */
const THREE: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
]
const BOARD81: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of THREE) b[y * 9 + x] = 1
  return b
})()

/** 三张面在窗口 (中心 (3,4)) 里的九个值:己 / 敌 / 色(轮己方=黑 → 整张 1)。 */
const WIN: number[][] = [
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
]
const PLANE_NAMES = ["己面", "敌面", "色面"]

const wIdx = (filter: number, plane: number, i: number) =>
  (filter * 3 + plane) * 9 + i

export default function L04() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 4 课</div>
      <h1 className="text-2xl font-bold">计票:乘和加,不多不少</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "网络第一层的小算子,拿到一个 3×3 窗口里的九份证据,要并成一个分。哪种并法,配得上上一课说的「能自己变准」?",
            options: [
              "排序取大:九份证据里挑最大的当分",
              "乘一乘再加起来:每份证据乘上自己的权重,九个乘积相加",
              "连乘:九份证据乘成一个积",
            ],
            answer: 1,
            explain:
              "选 B。A、C 先记半分:都能算出「一个分」,但都会坏账——排序是分支(挑最大藏着一道「如果」,旋钮没有坡,上一课刚说过);连乘里一份证据为 0 整积归 0(一票否决),账目还随别的证据乱漂。B 的妙处,揭晓里摊开:乘是音量,加是累加,而且每一笔账都算得清。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 乘是音量,加是账目分明</h3>
        <p>
          <strong>① 乘 = 音量旋钮。</strong>每份证据乘上自己的权重:权重为 1,
          原样进场;权重为 0,静音;权重为 0.5,音量减半。而<strong>拧过 0 会
          反相</strong>:负权重的证据越强、分反而越低——负号不是调小,是唱反调
          (「对方的子坏我的事」就是这么造出来的)。
        </p>
        <p>
          <strong>② 加 = 证据累加,而且账目分明。</strong>九份证据各乘各的音量,
          再全部相加:z = w₁x₁ + w₂x₂ + … + w₉x₉。这一步最要紧的性质在第 3 课的
          账目口径下看:每个旋钮的账{" "}
          <span className="mono">∂z/∂wᵢ = xᵢ</span>——恰好是它乘的那份证据本身。
          <strong>不管权重怎么拧,每个旋钮的账永远找得到、永远不混</strong>:这
          就是「答错一分,能算出该怪哪个旋钮」的前提(第 6 课用它摊账)。
        </p>
        <p>
          <strong>③ 为什么不加别的?</strong>可以在乘加之外再加点花样吗——
          试过,都坏在「账」上:<em>交互项</em>(输入之间相乘,如「己方三连
          <strong>且</strong>对方也三连」)的账是 x₁x₂,随别的证据漂,账目不再
          各归各;<em>分支</em>(如果…就…)没有坡,第 3 课判过;成排的乘加是
          硬件上现成的工业肌肉(GEMM,名字不必记);至于「更复杂的形状」——
          不用挤在这一层里,<strong>复杂度外包给层数</strong>(前提是每层之间
          插一道弯折,这个前提第 5 课立)。
        </p>
        <p>
          <strong>④ 一个名字,一个性质。</strong>「对应相乘再求和」有个真名:
          <em>点积</em>;把很多个点积排成一队一起算,就叫矩阵。第 7 课你会看到
          三张平面、第 8 课看到 48 张模板——它们喂进第一层的那一下,全是这个
          点积。还有个性质先记下:<strong>只会乘和加,行话叫「线性」</strong>
          ——这个名字第 5 课要用。线性有个天生的限制,叫<em>必单调</em>:每个
          输入各走一条直线——权重为正,输入涨它不跌;权重为负,输入涨它不升;
          唯独<strong>不会先跌后涨</strong>。部件二让你亲手撞一下这堵墙。
        </p>
      </div>

      <VoteCounter />

      <MonotoneLine />

      <Ledger title="model.py L32-36(stem:第一层就是 48 组计票)">
        <div className="codewalk">
          <pre>{`# model.py L32-36  第一层(stem):48 组「27 个乘积加成一个分」
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),  # 3 张面进来,48 组 3×3 权重
    nn.BatchNorm2d(channels),                           # 校准数值的稳定器(第 9 课)
    nn.ReLU(),                                          # 求和之后的弯折(第 5 课)
)`}</pre>
        </div>
        <p className="mt-3">
          <span className="mono">stem.0.weight</span> 的形状是 [48, 3, 3, 3]——
          <strong className="num">48 × 27 = 1296</strong> 个旋钮住在第一层。
          为什么恰好是「3 张 3×3 的面 × 48 组」?3 张面的来历第 7 课揭晓
          (三张平面),48 组的来历第 8 课揭晓(模板)——<em>现在只需认出:
          第一层就是 48 组「27 个乘积加成一个分」</em>,正是部件一你玩的那套
          计票。BN 和 ReLU 两行先按下,各自有专门的课。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 5 课"
        onAllCorrect={() => pass("l04")}
        questions={[
          {
            q: "「乘一乘再加起来」好在哪?排序取大、连乘坏在哪?",
            options: [
              "算得更快,硬件友好",
              "账目分明:每个权重的账 ∂z/∂wᵢ = xᵢ,永远找得到不混淆;排序是分支没有坡,连乘一票否决且账目乱漂",
              "因为乘法和加法是最早发明运算",
            ],
            answer: 1,
            explain:
              "快是顺带的(成排乘加确实是硬件肌肉),要紧的是账:答错一分时,「该怪哪个旋钮、各怪多少」永远算得清——这是第 6 课回摊的全部前提。排序的「挑最大」藏着分支(旋钮无坡);连乘一份为 0 全积归 0,账 x₁x₂ 还随别的输入漂。",
          },
          {
            q: "权重从 +0.5 拧到 −0.5,那份证据发生了什么?",
            options: [
              "音量从一半调到零",
              "反相:从「抬一半分」变成「压一半分」——负号是唱反调,不是调小",
              "没有变化,只是符号习惯",
            ],
            answer: 1,
            explain:
              "乘是音量旋钮,但拧过 0 会反相:证据本身不变,它在总分里的角色从帮腔变成拆台。「对方的子永远在帮倒忙」——第 7 课正负抵消那笔账,坏就坏在这。",
          },
          {
            q: "必单调(线性天生的限制)说的是什么?",
            options: [
              "输出永远不会变小",
              "每个输入各走一条直线:权重为正输入涨它不跌、权重为负输入涨它不升,唯独不会先跌后涨——「敌、己都报警而空居中」的 V 形永远画不出",
              "权重只能取正值",
            ],
            answer: 1,
            explain:
              "注意别读成「输出永远涨」:负权重就是跌的——但那是条方向不变的直线。想要「先跌后涨」(敌 −1 和己 +1 两头都报警、空 0 居中)得让直线会拐弯,那是第 5 课弯折的事。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 4-1 · 三证人计票器:真权重,拖音量 ============ */

/** 数字九宫格(cells 为字符串;on 给非零格上底色,hot 给负数标朱砂)。 */
function NumGrid9({ cells, on, hot }: { cells: string[]; on: boolean[]; hot?: boolean[] }) {
  return (
    <div className="l04-grid">
      {[0, 1, 2].map((r) => (
        <div key={r} className="l04-row">
          {[0, 1, 2].map((c) => {
            const i = r * 3 + c
            return (
              <span key={c} className={`l04-cell ${on[i] ? "on" : ""} ${hot?.[i] ? "hot" : ""}`}>
                <span className="num">{cells[i]}</span>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const fmt2 = (v: number) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(2)}`

function VoteCounter() {
  const [w, setW] = useState<WeightsJson | null>(null)
  const [filter, setFilter] = useState(0)
  const [k, setK] = useState(1) // 整层音量:权重 × k

  useEffect(() => {
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => {
    if (!w) return null
    const flat = w.tensors["stem.0.weight"]
    return WIN.map((xs, p) => {
      const ws = Array.from({ length: 9 }, (_, i) => k * flat[wIdx(filter, p, i)])
      const ps = ws.map((wv, i) => wv * xs[i])
      return { xs, ws, ps, sum: dot(ws, xs) }
    })
  }, [w, filter, k])

  const total = rows ? rows.reduce((s, r) => s + r.sum, 0) : 0

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 三证人计票器:真权重,亲手拧音量</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[15rem]" data-qa="counter-board">
          <Board board={BOARD81} lastMove={{ x: 4, y: 4 }} />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            教学局面的三连(同全站):窗口罩在正中 (3,4)。三张面在那扇窗里
            各有九个值——就是右边三行的「窗口值」。
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                挑一组真权重:第 <span className="num">{filter + 1}</span> / 48 组
              </div>
              <input type="range" min={0} max={47} step={1} value={filter}
                onChange={(e) => setFilter(Number(e.target.value))} aria-label="模板编号"
                style={{ ["--fill" as string]: `${(filter / 47) * 100}%` }}
                data-qa="filter-slider" />
            </div>
            <div className="min-w-[11rem] flex-1">
              <div className="mini-label">
                整层音量 k(权重 × k):<span className="num">{k.toFixed(1)}</span>
              </div>
              <input type="range" min={-2} max={2} step={0.1} value={k}
                onChange={(e) => setK(Number(e.target.value))} aria-label="音量"
                style={{ ["--fill" as string]: `${((k + 2) / 4) * 100}%` }}
                data-qa="volume-slider" />
            </div>
          </div>

          {!rows ? (
            <p className="mt-4 text-sm" style={{ color: "var(--fg-muted)" }}>
              正在加载真权重(weights-best.json,约 1.2 MB)……
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-3" data-qa="counter-rows">
                {rows.map((r, p) => (
                  <div key={p} className="flex flex-wrap items-center gap-2">
                    <span className="w-8 flex-none text-xs" style={{ color: "var(--fg-faint)" }}>
                      {PLANE_NAMES[p]}
                    </span>
                    <NumGrid9 cells={r.xs.map((v) => (v === 1 ? "1" : "0"))}
                      on={r.xs.map((v) => v !== 0)} />
                    <span style={{ color: "var(--fg-faint)" }}>×</span>
                    <NumGrid9 cells={r.ws.map(fmt2)} on={r.ws.map((v) => Math.abs(v) > 0.005)}
                      hot={r.ws.map((v) => v < 0)} />
                    <span style={{ color: "var(--fg-faint)" }}>=</span>
                    <NumGrid9 cells={r.ps.map(fmt2)} on={r.ps.map((v) => Math.abs(v) > 0.005)}
                      hot={r.ps.map((v) => v < 0)} />
                  </div>
                ))}
              </div>
              <div className="reveal-box mt-4">
                <p className="num">
                  总分 z = 27 个乘积相加 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }} data-qa="counter-sum">
                    {total.toFixed(3)}
                  </strong>
                  <span className="ml-3 text-sm font-normal" style={{ color: "var(--fg-muted)" }}>
                    (己面 {rows[0].sum.toFixed(2)} + 敌面 {rows[1].sum.toFixed(2)} +
                    色面 {rows[2].sum.toFixed(2)})
                  </span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  拖音量看三件事:① k=0 整层静音,k 过 0 总分翻符号(反相);
                  ② 权重全变,「窗口值」一列纹丝不动——它同时就是每个权重的账
                  ∂z/∂wᵢ = xᵢ,拧多大声,账单不变;③ 敌面九个值全 0:窗口里
                  没有对方的子,九个乘积全是 0,安静。
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                这 27 个权重不是编的:它们是{" "}
                <span className="mono">weights-best.json</span> 里{" "}
                <span className="mono">stem.0.weight</span> 第 {filter + 1} 组的真值
                (训练拧出来的)。48 组各不相同——挑几组看看,有的全正、有的
                一片负,没有一组是人画的。
              </p>
            </>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 4-1</span>
        一组真权重 × 三张面的窗口值:乘积(音量×证据)再相加(累加)。
        「音量」是本部件借来演示的——真网络里每个权重各自拧,那正是训练干的活。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 4-2 · 必单调:直线画不出 V ============ */

const MW = 280, MH = 168, MPL = 34, MPR = 10, MPT = 26, MPB = 30
const mxOf = (t: number) => MPL + ((t + 1) / 2) * (MW - MPL - MPR) // t∈[−1,1]
const myOf = (zv: number) => MH - MPB - ((zv + 2) / 4) * (MH - MPT - MPB) // z∈[−2,2]

function MonotoneLine() {
  const [w, setW] = useState(1)

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 必单调:一条直线的能耐与不能</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${MW} ${MH}`} data-qa="mono-chart"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 320 }}>
            {/* z=0 横轴与 x 轴 */}
            <line x1={MPL} y1={myOf(0)} x2={MW - MPR} y2={myOf(0)}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            <line x1={mxOf(0)} y1={MPT} x2={mxOf(0)} y2={MH - MPB}
              style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
            {/* 格子值刻度:敌 / 空 / 己 */}
            {[-1, 0, 1].map((t) => (
              <text key={t} x={mxOf(t)} y={MH - MPB + 14} fontSize={10} textAnchor="middle"
                style={{ fill: "var(--fg-faint)" }}>
                {t === -1 ? "敌 −1" : t === 0 ? "空 0" : "己 +1"}
              </text>
            ))}
            <text x={MW - MPR} y={MH - MPB + 14} fontSize={9} textAnchor="end" className="num"
              style={{ fill: "var(--fg-faint)" }}>格子值 x</text>
            {/* 想要的 V 形:z=|x|(敌、己都报警,空安静) */}
            <polyline points={`${mxOf(-1)},${myOf(1)} ${mxOf(0)},${myOf(0)} ${mxOf(1)},${myOf(1)}`}
              fill="none" strokeDasharray="5 4" style={{ stroke: "var(--fg-faint)" }}
              strokeWidth={1.6} />
            <text x={mxOf(0.62)} y={myOf(0.86)} fontSize={9.5} style={{ fill: "var(--fg-faint)" }}>
              想要的:敌、己都报警,空安静
            </text>
            {/* 当前的直线 z = w·x */}
            <line x1={mxOf(-1)} y1={myOf(-w)} x2={mxOf(1)} y2={myOf(w)}
              style={{ stroke: "var(--accent)" }} strokeWidth={2.4} data-qa="mono-line" />
            {[-1, 0, 1].map((t) => (
              <circle key={t} cx={mxOf(t)} cy={myOf(w * t)} r={4.5}
                style={{ fill: "var(--accent-deep)" }} />
            ))}
          </svg>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[18rem]">
          <div className="mini-label">权重 w(−2 → 2)</div>
          <input type="range" min={-2} max={2} step={0.1} value={w}
            onChange={(e) => setW(Number(e.target.value))} aria-label="w 滑杆"
            style={{ ["--fill" as string]: `${((w + 2) / 4) * 100}%` }}
            data-qa="mono-slider" />
          <div className="reveal-box mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>格子值 x</th>
                  <th>敌 −1</th>
                  <th>空 0</th>
                  <th>己 +1</th>
                </tr>
              </thead>
              <tbody className="num">
                <tr>
                  <td>分 z = w·x</td>
                  <td style={{ color: "var(--accent-deep)" }}>{fmt2(-w)}</td>
                  <td>0.00</td>
                  <td style={{ color: "var(--accent-deep)" }}>{fmt2(w)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              {w > 0
                ? "w 为正:己的分开、敌的分低——「空」永远夹在中间。"
                : w < 0
                  ? "w 为负:反相了——敌高己低,「空」还是夹在中间。"
                  : "w 为 0:整条线躺平,谁都静音。"}
              拖到任何值,那条线都是直的:<strong>「先跌后涨」的 V 形,线性永远画不出</strong>
              ——想要它,得让直线会拐弯(第 5 课)。
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            三个点就是同一条直线上 x=−1、0、+1 三处:格子的三种身份被钉上同一条
            数轴,z 只能沿直线走。这个「钉」的代价,第 7 课判决段正式清算。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 4-2</span>
        每个输入各走一条直线:权重为正输入涨它不跌、为负输入涨它不升,唯独不会
        先跌后涨。直线的「直」,是乘加的命;弯折是第 5 课的活。
      </figcaption>
    </figure>
  )
}
