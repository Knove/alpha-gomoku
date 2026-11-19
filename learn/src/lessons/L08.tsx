/** 第 8 课 · 叠层：看见全盘。
 *  三个问题：感受野怎样长大、残差为什么留下旧信息、BN 怎样稳住尺度。
 *  例 8-1 拨层深，例 8-2 对真实权重看逐层特征图。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { NetPipeline } from "../framework/net-pipeline"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import { encode, type GameState } from "../engine/game"
import { traceNet, type WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 与第 7 课同一局面：己方三连 (2,4)(3,4)(4,4),轮己方走。
 * encode 只读 board + current,直接构造状态(教学局面：只摆三连，演示用)。 */
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

export default function L08() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 8 课</div>
      <h1 className="text-2xl font-bold">叠层：看见全盘</h1>

      <NetPipeline step={4} />

      <LessonGuide
        question="3×3 卷积核只能看一小块时，网络怎样逐步理解整局棋的形势？"
        why="局部三连很重要，但「两块棋是否相连、整条边谁更厚」要同时看更大范围。把卷积核直接做成全盘大小既笨重又难学。"
        chain={[
          "浅层先发现局部棋子与小棋形",
          "每多叠一层，感受野向外扩一圈",
          "残差捷径让深层仍能保留原信号",
          "批标准化把各层数值稳在同一尺度",
        ]}
        takeaway="你能算出叠层后的感受野，解释 x+h 捷径为什么好学，并说出训练与推理时 BN 使用的统计量为什么不同。"
        boundary="演示权重用 3 个残差块，共 7 层；项目默认 4 个残差块，共 9 层。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "单个卷积核只看得见 3×3 的一小片，可「我方子力一大片、对方很稀」是全盘的事。怎么让它看见全盘？",
            options: [
              "把卷积核做大：直接造一张 9×9 的大卷积核，一步看全",
              "叠层：小卷积核一层层叠上去，能看的范围每层大一圈",
              "没办法，卷积核天生只能看局部",
            ],
            answer: 1,
            explain:
              "选第二项。全盘大核会一步跳过「先认局部、再组合整体」的层次。叠层让第二层站在第一层结果上：窗口仍是 3×3，能回看的范围却一圈圈变大。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>每叠一层，感受野边长 +2</h3>
        <p>
          第一层每个格子只看 3×3。第二层拿第一层的九个结果当原料，
          每个结果又各自看过一圈，九个窗口拼起来就是 5×5。
          <strong>每多叠一层，能回看的边长增加 2。</strong>
        </p>
        <Def term="感受野" en="receptive field">
          一个输出格理论上能看到的输入范围。它由网络结构决定，与权重数值无关。
          在 stride=1、3×3 核、padding=1 的叠层中，第 L 层的边长是 3+2×(L−1)。
        </Def>
        <p>
          第一层叫 stem；其后每两层组成一个残差块。演示配置叠 3 个残差块，
          所以共有 1+3×2=<strong className="num">7</strong> 层。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="主干叠层：首层 stem 之后串联 res_blocks 个残差块"
          source="alphagomoku/model.py · AlphaGomokuNet.__init__"
        >
          <div className="codewalk">
            <pre>{`        self.blocks = nn.Sequential(*[ResBlock(channels) for _ in range(res_blocks)])`}</pre>
          </div>
        </EvidenceCard>
        <div className="formula">
          感受野边长 = <span className="hl">3</span> + 2 × (层数 − 1) → 7 层：
          3 + 2×<span className="hl">6</span> = <span className="hl">15</span>
        </div>
        <p>
          15×15 是以输出格为中心的<strong>理论窗口</strong>：天元位置已经覆盖 9×9；
          角落位置仍有半径差。整盘判断不必靠单格看全，末端读出层会汇总全部 81 个格子的信息。
        </p>
      </div>

      <FovSlider />

      <div className="prose mt-12">
        <p>
          把许多层串起来就是<strong>深度网络</strong>：浅层看小范围，深层在浅层结果上组合更大范围。
          例 8-2 用真实权重把这条变化逐层画出来。
        </p>
      </div>

      <FeatureWall />

      <div className="prose mt-12">
        <h3>残差连接让旧信息留下</h3>
        <p>
          层一多，原信号传到最后可能越来越淡。残差连接不要求每组重写答案，
          只让它们学一份「修正量」：输出为
          <span className="mono">y=ReLU(x+F(x))</span>。
          <span className="mono">F(x)</span> 接近 0 时，<span className="mono">x</span> 几乎原样通过；
          网络不必每层重新构造原信号，更新信号也有一条直通路。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块前向计算：两层卷积后把原输入 x 加回修正量 h"
          source="alphagomoku/model.py · ResBlock.forward"
        >
          <div className="codewalk">
            <pre>{`    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)`}</pre>
          </div>
        </EvidenceCard>
        <Def term="残差块" en="residual block">
          带一条残差连接的两层 3×3 卷积。第一层是「卷积 → BN → ReLU」，
          第二层是「卷积 → BN」，最后把修正量加回原输入再过 ReLU。
        </Def>
      </div>

      <div className="prose mt-12">
        <h3>批标准化稳住各层数值尺度</h3>
        <p>
          层间数值可能越滚越大，或缩到接近 0，让后面的权重追着尺度反复改。
          训练时，BN 按通道用当前批次统计做标准化
          <span className="mono">x̂=(x−μ批)/σ批</span>，再用可学习的
          <span className="mono">γ·x̂+β</span> 恢复表达力，同时积累运行均值与方差。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块层定义：两层 3×3 卷积（无偏置）各配一处批标准化"
          source="alphagomoku/model.py · ResBlock.__init__"
        >
          <div className="codewalk">
            <pre>{`    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          下棋时由 <span className="mono">net.eval()</span> 切换统计路径：
          同一局面必须每次得到同一个 <span className="mono">v_net</span>，
          所以推理不能依赖眼前这一批的其他样本。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="推理封装初始化：切入 eval 模式以使用运行统计量"
          source="alphagomoku/model.py · Predictor.__init__"
        >
          <div className="codewalk">
            <pre>{`    def __init__(self, net: AlphaGomokuNet, device: str = "cpu"):
        self.net = net
        self.device = torch.device(device)
        self.net.to(self.device)
        self.net.eval()`}</pre>
          </div>
        </EvidenceCard>
        <Def term="批标准化" en="Batch Normalization，简称 BN">
          按通道把各层输入拉回相近尺度的整理步骤。训练使用当前批次统计并更新运行记录；
          推理调用 <span className="mono">eval()</span>，改用固定的运行统计。这样同一局面不会被同批其他样本带偏，
          搜索树重复评估同一个叶节点时才有稳定答案。
        </Def>
      </div>

      <Ledger title="alphagomoku/model.py · ResBlock 与 blocks">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="mono">alphagomoku/model.py · ResBlock</span>：<span className="mono">__init__</span> 定义两层{" "}
            <span className="mono">3×3</span> 卷积（<span className="mono">padding=1, bias=False</span>）与两处{" "}
            <span className="mono">BatchNorm2d</span>；<span className="mono">forward</span> 计算修正量{" "}
            <span className="mono">h</span> 并返回 <span className="mono">F.relu(x + h)</span>。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · AlphaGomokuNet.__init__（self.blocks）</span>：在{" "}
            <span className="mono">stem</span> 之后串联 <span className="mono">res_blocks</span> 个残差块，总卷积层数为{" "}
            <span className="mono">1 + 2 × res_blocks</span>，理论感受野边长为{" "}
            <span className="mono">3 + 2 × (层数 − 1)</span>（7 层得 15，9 层得 19）。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · Predictor.__init__ / load_checkpoint</span>：调用{" "}
            <span className="mono">net.eval()</span> 切入推理模式，确保批标准化使用保存的运行统计量。
          </li>
          <li>
            上下游衔接：主干输出 <span className="mono">h = self.blocks(self.stem(x))</span> 由策略头与价值头分别读取；浏览器端{" "}
            <span className="mono">learn/src/engine/model.ts · traceNet</span> 逐层复现该主干并驱动例 8-2。
          </li>
          <li>
            验证命令：<span className="mono">pytest tests/test_model.py::test_forward_shapes_and_ranges</span> 与{" "}
            <span className="mono">cd learn && npm test</span>。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "感受野边长 = 3 + 2 × (层数 − 1)：每叠一层加 2；演示模型 7 层得到 15×15。",
          "残差块让每组只学修正量 F(x)，输出 y=ReLU(x+F(x))，保留一条直通旧信息的路。",
          "BN 训练时用当前批统计并积累运行记录，推理时必须 eval() 使用固定统计。",
        ]}
        next={
          <>
            卷积主干到此把局面整理成一层层特征。下一课在网络末端接上两个头：
            一个回答「哪里更值得下」，另一个回答「这局谁更可能赢」。
            两个答案为什么共用同一条主干、各自怎样变回可用的形式，都在下一课展开。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "7 层的感受野怎么算？",
            options: [
              "7 × 3 = 21 格",
              "3 + 2 × (7 − 1) = 15：第一层 3×3，每多叠一层边长 +2",
              "算不出来，要看每个卷积核的权重才知道",
            ],
            answer: 1,
            explain:
              "规律由结构决定，与权重无关。滑杆从 1 拨到 7：3、5、7、9、11、13、15。",
          },
          {
            q: "从结构上看，叠深网络最稳妥的说法是什么？",
            options: [
              "深层可以组合更大范围的局部特征；浅层偏局部、深层偏整体是常见倾向，但具体通道学到什么要由训练结果决定",
              "浅层认黑子，深层认白子",
              "层层都一样，只是通道数不同",
            ],
            answer: 0,
            explain:
              "每多一层，理论感受野就扩大一圈，因此深层有条件组合更多局部特征。单张特征图的亮区只能当作观察提示，不能直接命名成某种棋理。",
          },
          {
            q: "残差连接起什么作用、写在 ResBlock 的哪一处？",
            options: [
              "让棋盘刷新得更快",
              "让每层学习「在上一层答案上修一点」；修正量接近 0 时，输入就能大致原样通过",
              "把 48 个通道压缩成 2 个",
            ],
            answer: 1,
            explain:
              "修正量 h 接近 0 时，x+h 大致保留输入，所以「什么也不修」是容易学到的选择；反向时也有一条 ×1 的直通路。",
          },
          {
            q: "推理脚本忘了切 eval()、BN 仍用当前批统计，对局表现会怎么坏？",
            options: [
              "没有不同：每次重新算统计更准",
              "同一局面的 v_net 会随同批其他局面变化，树上的访问计数就全废了；训练时用批统计并更新运行记录，真正下棋必须用保存的运行统计",
              "训练时关闭 BN，真正下棋时才打开",
            ],
            answer: 1,
            explain:
              "训练的一批样本足以估计通道当前的中心和尺度，BN 同时积累运行统计；下棋必须改用保存的统计。忘切 eval() 会让同一叶节点每次值不同，搜索统计随之失效。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 8-1 · 层深滑杆：感受野一圈圈长大 ============ */

const CELL5 = 26
const M5 = CELL5 * 4.2 // 界外余量：7 层感受野(15×15)在 9×9 外还要伸 3.5 格
const VB5 = M5 * 2 + 8 * CELL5
const px5 = (x: number) => M5 + x * CELL5

function FovSlider() {
  const [layers, setLayers] = useState(1)
  const side = 3 + 2 * (layers - 1)
  const half = side / 2

  // 感受野框(以天元 (4,4) 为中心),单位：格
  const bx = px5(4 - half)
  const by = px5(4 - half)
  const bw = side * CELL5

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 8-1 · 层深滑杆：看第几层的眼睛</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[26rem]">
          <svg viewBox={`0 0 ${VB5} ${VB5}`} style={{ width: "100%", height: "auto", display: "block" }}
            role="img" aria-label={`层数 ${layers},感受野 ${side}×${side}`}>
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
            {/* 感受野框：中心在天元；伸出棋盘的部分=界外(补 0) */}
            <rect
              x={bx} y={by} width={bw} height={bw} rx={8}
              style={{
                fill: "var(--accent)",
                stroke: "var(--accent)",
                strokeWidth: 2.5,
                // CSS 几何属性可过渡的浏览器里平滑缩放；不支持则直接跳变(属性兜底)
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
                伸出棋盘的部分 = 界外，按 0 算
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
              感受野边长 = 3 + 2 × ({layers} − 1) ={" "}
              <span data-qa="fov-side" style={{ color: "var(--accent-deep)" }}>{side}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              {layers === 1 && "第 1 层：窗口 3×3，只能看一个短局部片段。"}
              {layers > 1 && layers < 7 && `叠到第 ${layers} 层：盖住 ${side}×${side}。`}
              {layers === 7 &&
                "7 层 = stem 1 层 + 残差块 3 × 2 层（演示模型的配置）：以天元计 15×15 盖过 9×9 全盘。"}
            </p>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            从 1 拨到 7，看感受野框一圈圈长大：
            <span className="num font-bold">3 → 5 → 7 → 9 → 11 → 13 → 15</span>。
            到第 4 层恰好罩住 9×9；演示模型 7 层，界外还有一圈余量。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 8-1</span>
        窗口始终是 3×3，每叠一层感受野边长 +2。棋盘上仍是前面用过的三连局面。
      </figcaption>
    </figure>
  )
}

/* ============ 例 8-2 · 真特征图：观察各层怎样保留与组合信号 ============ */

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

  // 单次前向(~16ms),缓存；滑杆/交互只切展示，不重算
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
        <span className="mini-label">例 8-2 · 真特征图：每层都有 48 张特征图</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          观察亮区如何随层变化：有的贴近棋子，有的覆盖更大区域。它们是训练后的数值响应，
          不是已经被人命名好的「棋理标签」。
        </p>
      </div>
      <div className="overflow-x-auto p-4 md:p-5">
        {!trace ? (
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            正在加载真权重（weights-best.json，约 1.2 MB）……
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
        <span className="cap-no">例 8-2</span>
        真引擎 + 真权重：<span className="mono">traceNet</span>（model.ts）对三连局面从头到尾算一遍。
        每层 48 个卷积核，就有 48 张特征图，一张叫一个「通道」；这里每组出口摆出前 {CHANNELS_SHOWN} 张。
        亮 = 这张图在这里的相对响应高。每张图都按<strong>自己</strong>的最大值着色，所以不同通道的亮度不能直接比较大小。滚动前先猜哪一层还亮在横三连那三格上，再往下对照。
      </figcaption>
    </figure>
  )
}

/** 一张 9×9 特征图：planes 为 [48, 9, 9] 布局，通道在前；每通道按自身最大值归一。 */
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
