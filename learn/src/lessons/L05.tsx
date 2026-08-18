/** 第 5 课 · 叠层:看见全盘。
 *  节拍:谜题(单层 3×3 怎么看全盘)→ 揭晓(视野每层 +2;层数 = 抽象层级;
 *  残差/BN 一句话)→ 部件 1(层深滑杆:视野框 3×3 → 15×15)→
 *  部件 2(真特征图墙:traceNet + weights-best,stem 与三个残差块各取前 6 通道)→
 *  对账(model.py ResBlock / blocks)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { encode, type GameState } from "../engine/game"
import { traceNet, type WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 与第 4 课同一局面:己方三连 (2,4)(3,4)(4,4),轮己方走。
 * encode 只读 board + current,直接构造状态(教学局面:只摆三连,演示用)。 */
const THREE: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
]
const STATE: GameState = (() => {
  const board = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (const [x, y] of THREE) board[y][x] = 1
  return { board, current: 1, winner: 0, moveCount: 3, lastMove: null }
})()

export default function L05() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 5 课</div>
      <h1 className="text-2xl font-bold">叠层:看见全盘</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "单张模板只看得见 3×3 的一小片,可「这边阵厚、那边势薄」是全盘的事。怎么让它看见全盘?",
            options: [
              "把模板做大:直接造一张 9×9 的大模板,一步看全",
              "叠层:小模板一层层叠上去,视野每层 +2",
              "没办法,模板天生只能看局部",
            ],
            answer: 1,
            explain:
              "选 B。大模板一张 81 个权重、参数暴涨不说,还把「先认局部棋形、再拼全局形势」的层次压扁了。叠层让第二层的每个格子站在第一层的肩膀上:小窗还是 3×3,视野一圈圈长大——怎么长的,马上算给你看。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 每叠一层,视野 +2</h3>
        <p>
          一层 3×3 只看 3×3;两层叠起来,第二层的每个格子拿第一层
          <em>九个格子的得数</em>当原料——它的视野是 5×5。规律:
          <strong>每多叠一层,视野边长 +2</strong>。本模型的主干:第一层(stem)1 层,
         后面 3 个残差块 × 每块 2 层,共 <strong className="num">7</strong> 层:
        </p>
        <div className="formula">
          视野边长 = <span className="hl">3</span> + 2 × (层数 − 1) → 7 层:
          3 + 2×<span className="hl">6</span> = <span className="hl">15</span>
        </div>
        <p>
          15×15 盖过 9×9 全盘还有富余。而且层数买的不只是视野:
          <strong>层数 = 抽象层级</strong>。浅层的模板认<em>子和形</em>——这三格挨着、
          这里有个冲四;深层的模板拿浅层的得数当原料,认<em>势</em>——这一大片我厚敌薄。
          小窗直接看「势」看不出来,一层层把局部拼装成全局。
        </p>
        <p>
          两个工程细节,一句话各带过(代码在对账折叠里):①<em>残差</em>:每两层开一条
          捷径,输出 = 输入 + 修正量——误差信号沿捷径直达底层,几十层也训得动;
          本模型只有 7 层,捷径是保险。②<em>BN</em>:每层算完,先把数值的分布
          校准成标准形状再放出去,训练更稳。
        </p>
      </div>

      <FovSlider />

      <FeatureWall />

      <Ledger title="model.py L18-21(ResBlock)、L37(blocks)">
        <div className="codewalk">
          <pre>{`# L18-21  残差块:两层 3×3 卷积 + 一条捷径(x + h)
def forward(self, x: torch.Tensor) -> torch.Tensor:
    h = F.relu(self.bn1(self.conv1(x)))   # 第一层卷积
    h = self.bn2(self.conv2(h))           # 第二层卷积
    return F.relu(x + h)                  # ← 捷径:x 原样加上修正量 h`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L37  主干 = stem 1 层 + 3 个残差块(每块 2 层)= 7 层
self.blocks = nn.Sequential(*[ResBlock(channels) for _ in range(res_blocks)])`}</pre>
        </div>
        <p className="mt-3">
          每块两层 3×3 卷积 → 每过一块视野 +4(一层 +2);stem 之后叠 3 块,
          3 + 2×6 = 15。BN 就是上面 <span className="mono">bn1/bn2</span> 那两行:
          校准形状的稳定器。本站引擎{" "}
          <span className="mono">learn/src/engine/model.ts</span> 的{" "}
          <span className="mono">resBlock</span> 与它逐条对齐——部件二的真特征图
          就是这个函数一层层算出来的。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 6 课"
        onAllCorrect={() => pass("l05")}
        questions={[
          {
            q: "7 层的视野怎么算?",
            options: [
              "7 × 3 = 21 格",
              "3 + 2 × (7 − 1) = 15:第一层 3×3,每多叠一层边长 +2",
              "算不出来,要看每张模板的权重才知道",
            ],
            answer: 1,
            explain:
              "规律与权重无关,是结构给的:第 1 层看 3,第 2 层看 5,第 3 层看 7……每层把上一层的九个得数当原料,视野每层 +2。滑杆从 1 拨到 7 亲手数一遍:3、5、7、9、11、13、15。",
          },
          {
            q: "浅层和深层各自认什么?",
            options: [
              "浅层认子和形(局部棋形),深层拿浅层的得数当原料,认势(大片区域的形势)",
              "浅层认黑子,深层认白子",
              "层层都一样,只是通道数不同",
            ],
            answer: 0,
            explain:
              "部件二的真特征图墙上肉眼可见:stem 那一排的亮斑贴着三颗子;到第三块,亮暗已经连成大片。黑白在 canonical 里早已抹平,任何一层看的都是「己方/对方」,与颜色无关。",
          },
          {
            q: "残差的捷径(x + h)是干什么用的?",
            options: [
              "让棋盘刷新得更快",
              "让每层只学「在上一层答案上修一点」,误差信号沿捷径直通底层——几十层也训得动",
              "把 48 个通道压缩成 2 个",
            ],
            answer: 1,
            explain:
              "捷径的本事是「什么都不做也打平」:修正量学成 0,输入原样通过,多出来的层不会拖后腿;误差往回传时沿加法这条直路走,不衰减。本模型 7 层,残差是保险;压通道是两个输出头的活(第 6 课)。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 1 · 层深滑杆:视野一圈圈长大 ============ */

const CELL5 = 26
const M5 = CELL5 * 4.2 // 界外余量:7 层视野(15×15)在 9×9 外还要伸 3.5 格
const VB5 = M5 * 2 + 8 * CELL5
const px5 = (x: number) => M5 + x * CELL5

function FovSlider() {
  const [layers, setLayers] = useState(1)
  const side = 3 + 2 * (layers - 1)
  const half = side / 2

  // 视野框(以天元 (4,4) 为中心),单位:格
  const bx = px5(4 - half)
  const by = px5(4 - half)
  const bw = side * CELL5

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 层深滑杆:看第几层的眼睛</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[26rem]">
          <svg viewBox={`0 0 ${VB5} ${VB5}`} style={{ width: "100%", height: "auto", display: "block" }}
            role="img" aria-label={`层数 ${layers},视野 ${side}×${side}`}>
            <rect
              x={M5 - CELL5 * 0.62}
              y={M5 - CELL5 * 0.62}
              width={VB5 - 2 * (M5 - CELL5 * 0.62)}
              height={VB5 - 2 * (M5 - CELL5 * 0.62)}
              rx={10}
              style={{ fill: "var(--board)" }}
            />
            <g style={{ stroke: "var(--board-line)" }} strokeWidth={1} opacity={0.85}>
              {Array.from({ length: 9 }, (_, i) => (
                <line key={`v${i}`} x1={px5(i)} y1={px5(0)} x2={px5(i)} y2={px5(8)} />
              ))}
              {Array.from({ length: 9 }, (_, j) => (
                <line key={`h${j}`} x1={px5(0)} y1={px5(j)} x2={px5(8)} y2={px5(j)} />
              ))}
            </g>
            {/* 己方三连(与第 4 课同一局面) */}
            {THREE.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={px5(x)} cy={px5(y)} r={CELL5 * 0.36}
                style={{ fill: "var(--stone-b)", stroke: "var(--stone-b-lo)", strokeWidth: 1.5 }} />
            ))}
            {/* 视野框:中心在天元;伸出棋盘的部分=界外(补 0) */}
            <rect
              x={bx} y={by} width={bw} height={bw} rx={8}
              style={{
                fill: "var(--accent)",
                stroke: "var(--accent)",
                strokeWidth: 2.5,
                // CSS 几何属性可过渡的浏览器里平滑缩放;不支持则直接跳变(属性兜底)
                transition: "x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease",
              }}
              fillOpacity={0.06}
              strokeDasharray={side > 9 ? "9 6" : undefined}
            />
            <text x={bx + bw} y={by - 7} textAnchor="end" fontSize={13}
              fontFamily="ui-monospace, SF Mono, Menlo, monospace" style={{ fill: "var(--accent-deep)" }}>
              {side}×{side}
            </text>
            {side > 9 && (
              <text x={bx + bw / 2} y={by + bw + 16} textAnchor="middle" fontSize={12}
                style={{ fill: "var(--fg-faint)" }}>
                伸出棋盘的部分 = 界外,按 0 算
              </text>
            )}
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">层数(1 → 7)</div>
          <input
            type="range" min={1} max={7} step={1} value={layers}
            onChange={(e) => setLayers(Number(e.target.value))}
            aria-label="层数"
            style={{ ["--fill" as string]: `${((layers - 1) / 6) * 100}%` }}
            data-qa="fov-slider"
          />
          <div className="mt-1 flex justify-between text-xs num" style={{ color: "var(--fg-faint)" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="reveal-box mt-4">
            <p className="num text-lg font-bold">
              视野边长 = 3 + 2 × ({layers} − 1) ={" "}
              <span data-qa="fov-side" style={{ color: "var(--accent-deep)" }}>{side}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              {layers === 1 && "第 1 层:窗口 3×3,装得下一个三连(第 4 课的模板)。"}
              {layers > 1 && layers < 7 && `叠到第 ${layers} 层:盖住 ${side}×${side}。`}
              {layers === 7 &&
                "7 层 = stem 1 层 + 残差块 3 × 2 层(真模型的配置):15×15 盖过 9×9 全盘。"}
            </p>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            从 1 拨到 7,看视野框一圈圈长大:{"> "}
            <span className="num font-bold">3 → 5 → 7 → 9 → 11 → 13 → 15</span>。
            到第 4 层恰好罩住 9×9;真模型 7 层,界外还有一圈余量。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 5-1</span>
        每叠一层,该层的每个格子拿上一层 3×3 的得数当原料——窗口还是 3×3,
        视野边长却 +2。棋盘上仍是第 4 课那个三连局面。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 2 · 真特征图:浅层认子,深层认势 ============ */

const CHANNELS_SHOWN = 6

function FeatureWall() {
  const [w, setW] = useState<WeightsJson | null>(null)
  useEffect(() => {
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [])

  // 单次前向(~16ms),缓存;滑杆/交互只切展示,不重算
  const trace = useMemo(() => {
    if (!w) return null
    return traceNet(w)(encode(STATE))
  }, [w])

  const rows: { label: string; sub: string; planes: Float64Array }[] = useMemo(() => {
    if (!trace) return []
    return [
      { label: "第 1 层 · stem", sub: "认子和形", planes: trace.stemOut.data },
      { label: "第 2-3 层 · 残差块 1", sub: "", planes: trace.blockOuts[0].data },
      { label: "第 4-5 层 · 残差块 2", sub: "", planes: trace.blockOuts[1].data },
      { label: "第 6-7 层 · 残差块 3", sub: "认势", planes: trace.blockOuts[2].data },
    ]
  }, [trace])

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 真特征图:同一局面,过一遍真网络</span>
      </div>
      <div className="overflow-x-auto p-4 md:p-5">
        {!trace ? (
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            正在加载真权重(weights-best.json,约 1.2 MB)……
          </p>
        ) : (
          <div className="flex flex-col gap-5" data-qa="fwall">
            {rows.map((r, ri) => (
              <div key={ri} data-qa="frow" className="flex flex-wrap items-center gap-4">
                <div className="w-[7.5rem] flex-none">
                  <div className="mini-label">{r.label}</div>
                  {r.sub && (
                    <div className="text-xs" style={{ color: "var(--fg-faint)" }}>{r.sub}</div>
                  )}
                </div>
                {Array.from({ length: CHANNELS_SHOWN }, (_, ch) => (
                  <FeatureMap key={ch} planes={r.planes} ch={ch} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 5-2</span>
        真引擎 + 真权重:<span className="mono">traceNet</span>(model.ts)对三连局面做一次前向,
        取主干每层的前 {CHANNELS_SHOWN} 个通道(每层共 48 张)。亮 = 该通道在这里激活强。
        结果缓存,切换展示不重算。
      </figcaption>
    </figure>
  )
}

/** 一张 9×9 特征图:planes 为 [48, 9, 9] 布局,通道在前;每通道按自身最大值归一。 */
function FeatureMap({ planes, ch }: { planes: Float64Array; ch: number }) {
  const off = ch * 81
  let max = 0
  for (let k = 0; k < 81; k++) max = Math.max(max, planes[off + k])
  return (
    <svg viewBox="0 0 90 90" width="86" height="86" data-qa="fmap" role="img"
      aria-label={`通道 ${ch} 特征图`}
      style={{ borderRadius: 6, background: "var(--card-sunken)", flex: "none" }}>
      {Array.from({ length: 9 }, (_, y) =>
        Array.from({ length: 9 }, (_, x) => {
          const v = planes[off + y * 9 + x]
          const t = max > 0 ? v / max : 0
          return (
            <rect key={`${x}-${y}`} x={x * 10 + 0.5} y={y * 10 + 0.5} width={9} height={9}
              style={{ fill: "var(--accent)" }} opacity={0.05 + t * 0.85} />
          )
        }),
      )}
    </svg>
  )
}
