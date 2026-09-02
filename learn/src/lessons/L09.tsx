/** 第 8 课 · 叠层:看见全盘。
 *  节拍:谜题(单层 3×3 怎么看全盘)→ 揭晓(视野每层 +2;越深管的事越大;
 *  残差/BN 一句话)→ 部件 1(层深滑杆:视野框 3×3 → 15×15)→
 *  部件 2(真特征图墙:traceNet + weights-best,stem 与三个残差块各取前 6 通道)→
 *  对账(model.py ResBlock / blocks)→ 小测。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { encode, type GameState } from "../engine/game"
import { traceNet, type WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 与第 7 课同一局面:己方三连 (2,4)(3,4)(4,4),轮己方走。
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

export default function L09() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 8 课</div>
      <h1 className="text-2xl font-bold">叠层:看见全盘</h1>

      <LessonGuide
        question="3×3 模板只能看一小块时，网络怎样逐步理解整盘棋的形势？"
        why="局部三连很重要，但“哪一边整体更强、两处威胁是否能连起来”需要更大的视野。把小模板直接做成全盘大小既笨重又难学。"
        chain={[
          "浅层模板先发现局部棋子和小棋形",
          "下一层把相邻位置的发现再组合",
          "每多叠一层，能回看的区域向外扩一圈",
          "深层把局部证据汇成整盘形势",
        ]}
        takeaway="层数不是为了“越多越神奇”，而是让机器按“先局部、后整体”的顺序扩大视野。"
        boundary="7 层得到 15×15 是本课程的 3×3 玩具网络计算；真实网络的有效视野和训练效果还会受权重、连接方式等因素影响。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "单张模板只看得见 3×3 的一小片,可「这边我子一大片、那边子很稀」是全盘的事。怎么让它看见全盘?",
            options: [
              "把模板做大:直接造一张 9×9 的大模板,一步看全",
              "叠层:小模板一层层叠上去,能看的范围每层大一圈",
              "没办法,模板天生只能看局部",
            ],
            answer: 1,
            explain:
              "选第二项。单张输入面上的 9×9 模板就要 81 个旋钮；本模型有三张输入面，一套全盘模板会有 243 个。更要紧的是，它想一步认完所有东西，跳过了“先认局部、再组合整体”的楼梯。叠层让第二层站在第一层结果上：窗口仍是 3×3，能回看的范围却一圈圈变大。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 每叠一层,视野 +2</h3>
        <p>
          一层 3×3 只看 3×3;两层叠起来,第二层的每个格子拿第一层
          <em>九个格子的得数</em>当原料。那九个格子紧挨着排成 3×3,每个又向外
          多看一圈——拼起来,第二层的视野(能看多大的一片)恰好是 5×5。
          规律:<strong>每多叠一层,视野边长 +2</strong>。本模型的第一层叫 stem,
          后面还叠 6 层；每两层编成一组，一组叫一个“残差块”，一共 3 组。
          这是本课程演示权重的配置，其他训练可以选不同深度。
          合起来 <strong className="num">7</strong> 层:
        </p>
        <div className="formula">
          视野边长 = <span className="hl">3</span> + 2 × (层数 − 1) → 7 层:
          3 + 2×<span className="hl">6</span> = <span className="hl">15</span>
        </div>
        <p>式子念出来:层数减 1,就是要多加几个 2。</p>
        <p>
          15×15 已覆盖整张 9×9 棋盘。更深的层<strong>有能力</strong>把更大范围的信息组合起来：
          浅层常更容易对局部子形敏感，深层可能整合成更大的局面线索。但这是一种常见倾向，
          不是“第几层必定懂什么”的承诺；每个通道实际学到的内容要看训练结果。
        </p>
        <p>
          两个工程零件先只认用途。<em>残差</em>让每两层学习“在输入上修一点”，而不是从头重写
          一张图；这让“什么也不改”也成为容易做到的选择。<em>BN</em>是训练时帮助各层数值保持
          合适尺度的稳定器。为什么这些设计会影响错误信号的回传，等到第 11 课看到完整的两种错误后再拆开。
        </p>
      </div>

      <FovSlider />

      <FeatureWall />

      <Ledger title="model.py L18-21(ResBlock)、L37(blocks)">
        <p className="text-sm">
          下面几行是代码原文,看不懂符号没关系,只看中文注:x 是进去的那张图,
          h 是「改了一点」的新图;最后一行 x + h 把两张加起来,捷径就在这儿。
        </p>
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
          正文说的「把忽高忽低的数拉回平常个头」,就是它们干的。本站引擎{" "}
          <span className="mono">learn/src/engine/model.ts</span> 的{" "}
          <span className="mono">resBlock</span> 与它逐条对齐——部件二的真特征图
          就是这个函数一层层算出来的。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 9 课"
        onAllCorrect={() => pass("l09")}
        questions={[
          {
            q: "7 层的视野怎么算?",
            options: [
              "7 × 3 = 21 格",
              "3 + 2 × (7 − 1) = 15:第一层 3×3,每多叠一层边长 +2",
              "算不出来,要看每张模板的旋钮才知道",
            ],
            answer: 1,
            explain:
              "规律与旋钮无关,是结构给的:第 1 层看 3,第 2 层看 5,第 3 层看 7……每层把上一层的九个得数当原料,视野每层 +2。滑杆从 1 拨到 7 亲手数一遍:3、5、7、9、11、13、15。",
          },
          {
            q: "从结构上看，叠深网络最稳妥的说法是什么？",
            options: [
              "深层可以组合更大范围的局部证据；浅层偏局部、深层偏整体是常见倾向，但具体通道学到什么要由训练结果决定",
              "浅层认黑子,深层认白子",
              "层层都一样,只是通道数不同",
            ],
            answer: 0,
            explain:
              "每多一层，理论视野就扩大一圈，因此深层有条件把更多局部证据放在一起。特征图里有些亮区看起来贴着棋子、有些连成大片，但这只提供观察线索，不能把单张图直接命名为“它一定在认某种棋形”。",
          },
          {
            q: "残差的捷径在这章最该先记住什么?",
            options: [
              "让棋盘刷新得更快",
              "让每层学习“在上一层答案上修一点”；修正量接近 0 时，输入就能大致原样通过",
              "把 48 个通道压缩成 2 个",
            ],
            answer: 1,
            explain:
              "捷径使“什么也不修”成为容易学到的选择：修正量 h 接近 0 时，x+h 大致保留输入。它常让深网络更容易训练；具体的错误信号为什么会更好传，第 11 课会在你看见策略、价值两种错误后再说明。",
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
            {/* 己方三连(与第 7 课同一局面) */}
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
              {layers === 1 && "第 1 层：窗口 3×3，只能看一个短局部片段。"}
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
        <span className="cap-no">部件 9-1</span>
        每叠一层,该层的每个格子拿上一层 3×3 的得数当原料——窗口还是 3×3,
        视野边长却 +2。棋盘上仍是第 7 课那个三连局面。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 2 · 真特征图:观察各层怎样保留与组合信号 ============ */

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
      { label: "第 1 层 · stem", sub: "局部响应", planes: trace.stemOut.data },
      { label: "第 2-3 层 · 残差块 1", sub: "", planes: trace.blockOuts[0].data },
      { label: "第 4-5 层 · 残差块 2", sub: "", planes: trace.blockOuts[1].data },
      { label: "第 6-7 层 · 残差块 3", sub: "更大范围的组合", planes: trace.blockOuts[2].data },
    ]
  }, [trace])

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 真特征图:每层都有 48 张局面响应图</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          观察亮区如何随层变化：有的贴近棋子，有的覆盖更大区域。它们是训练后数值响应，
          不是已经被人命名好的“棋理标签”。
        </p>
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
        <span className="cap-no">部件 9-2</span>
        真引擎 + 真权重:<span className="mono">traceNet</span>(model.ts)对三连局面从头到尾算一遍。
        每层 48 张模板,就有 48 张得数小图,一张叫一个「通道」;这里每层摆出前 {CHANNELS_SHOWN} 张。
        亮 = 这张图在这里的相对响应高。每张图都按<strong>自己</strong>的最大值着色，所以不同通道的亮度不能直接比较大小。只算一遍，滚动看不卡。
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
