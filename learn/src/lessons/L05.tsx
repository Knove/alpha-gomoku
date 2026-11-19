/** 第 5 课 · 非线性变换：直线画不出的形状(地基篇 3/3)。
 *  节拍：思考题(一边倒判断，线性学得会吗)→ 直线极限 / 线性叠线性 / ReLU 折痕
 *  → 例 5-1(折线拼形：ReLU(t)+ReLU(−t)=|t| 徒手拖)
 *  → 例 5-2(XOR 切分器：直线/一道折痕/两道折痕对比，|x−y| 构造)→ 求和之后再变换
 *  → 源码索引与验证 → ChapterEnd → 习题。 */
import { useEffect, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import { relu, reluAbs } from "../lib/foundations"

/** 四个教学点：x=我方三连数、y=对方三连数。
 *  均衡(否):(0,0) 双方都无 / (1,1) 双方都有；一边倒(是):(1,0)(0,1)。 */
const NO: [number, number][] = [
  [0, 0],
  [1, 1],
]
const YES: [number, number][] = [
  [1, 0],
  [0, 1],
]

export default function L05() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 5 课</div>
      <h1 className="text-2xl font-bold">非线性变换：直线画不出的形状</h1>

      <LessonGuide
        question="为什么网络不能只做乘法和加法，还要在层与层之间「弯一下」？"
        why="只会乘加的计算再叠很多层，本质仍是直线；棋盘上有些「恰好一方占优」或「先跌后涨」的形状，直线永远分不开。"
        chain={[
          "乘加先把特征汇成直线式的分数",
          "有些分类图形无法用一条直线切开",
          "ReLU 把负分截为 0，给直线加一道折痕",
          "加权求和与非线性变换交替叠起来，机器才能拼出复杂棋形",
        ]}
        takeaway="你能算出 ReLU 怎样把四点分类切开，并写出非线性该插在每层之后的位置。"
        boundary="四点反例只是证明「需要非线性变换」的最小例子，不是在说真实五子棋判断只靠两个三连数。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "网络要判断一扇窗的局面是不是「一边倒」。先认识两个数：x 是我方三连数，y 是对方三连数。两边一样多（都无或都有）叫均衡；恰好一方有三连，叫一边倒。只会乘和加（线性）的机器，学得会这道判断吗？",
            options: [
              "学得会：线性够聪明，权重多设几个就行",
              "学不会：线性画出的「分界线」永远是直线，而「均衡」和「一边倒」斜对角交错，任何直线都切不开",
              "学不会，但没关系，下棋用不上这种判断",
            ],
            answer: 1,
            explain:
              "选第二项。把四个点画在纸上就看见了：两个「均衡」在一条对角线上、两个「一边倒」在另一条上，两条对角线互相穿过。直线不管怎么摆，总有一对「同类」被切开、一对「异类」留在同侧。加权重救不了：权重再怎么调，线性还是线性。出路是给机器加入会拐弯的工序，正文接着给出构造。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>1. 线性再叠一层，还是同一条直线</h3>
        <p>
          第 4 课最后看到：乘加算出的输出只能沿一条直线变化。
          有人会想「那就多叠几层」——可惜，两层线性仍然能合并成一层。
        </p>
        <div className="formula">
          w₂ · (w₁ · x) = (<span className="hl">w₂w₁</span>) · x
        </div>
        <p>
          两个权重相乘，结果仍是一个权重；即使每层再加一个固定数，
          合并后也只是「一个权重乘 x，再加一个固定数」。
          叠一百层，形状还是直线。要折弯它，必须在两层之间插入非线性变换。
        </p>
      </div>

      <div className="prose mt-12">
        <h3>2. 先看一维：一道 ReLU 折出半边</h3>
        <p>
          插在层间的折弯工序叫<strong>激活函数</strong>。本课只看最常用的 ReLU：
          正数原样通过，负数一律归 0。它把一条直线折成两段。
        </p>
        <Def term="激活函数与 ReLU" en="activation function & Rectified Linear Unit">
          <strong>激活函数</strong>接在加权和之后，负责把直线折弯。
          <strong>ReLU</strong>（线性整流单元）的规则是 <span className="mono">max(0, s)</span>：
          <span className="mono">s</span> 为正时原样输出，为 0 或负时输出 0。
        </Def>
        <p>
          例 5-1 把同一段折线拆成两半：<span className="mono">ReLU(t)</span> 留下右半边，
          <span className="mono">ReLU(−t)</span> 留下左半边，相加正好拼出 V 形
          <span className="mono">|t|</span>。拖一拖 <span className="mono">t</span>，看两个半平面怎样互补。
        </p>
        <EvidenceCard
          fidelity="constructed"
          title="ReLU：正数原样通过，负数一律归零；两道镜像折痕相加拼出 |t|"
          source="learn/src/lib/foundations.ts · relu 与 reluAbs"
        >
          <div className="codewalk">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <pre className="min-w-0 flex-1">{`export const relu = (s: number): number => (s > 0 ? s : 0)
export const reluAbs = (t: number): number => relu(t) + relu(-t)`}</pre>
              <div className="text-xs leading-relaxed sm:w-56" style={{ color: "var(--fg-faint)" }}>
                <div>relu(s)：三元表达式 s &gt; 0 ? s : 0，即 max(0, s)。</div>
                <div className="mt-1">reluAbs(t)：右半折线 relu(t) 加左半折线 relu(-t)，拼成 V 形 |t|。</div>
              </div>
            </div>
          </div>
        </EvidenceCard>
      </div>

      <FoldSum />

      <div className="prose mt-12">
        <h3>3. 再看二维：V 形切开斜对角的四点</h3>
        <p>
          现在回到思考题：<span className="mono">x</span> 是我方三连数，
          <span className="mono">y</span> 是对方三连数。
          令 <span className="mono">t = x − y</span>，再把上一节的两道折痕相加：
          <span className="mono">v = ReLU(x−y) + ReLU(y−x) = |x−y|</span>。
          两边一样多时 <span className="mono">v=0</span>，恰好一方占优时 <span className="mono">v=1</span>。
          斜对角交错的四点，被这个 V 形一次拉开。
        </p>
        <Def term="异或" en="exclusive or，缩写 XOR">
          两个输入不同时才为「是」的逻辑关系。
          (1,0)、(0,1) 是「是」，(0,0)、(1,1) 是「否」；
          两类点在平面上斜对角交错，任何一条直线都切不开。
        </Def>
      </div>

      <XorCutter />

      <div className="prose mt-12">
        <h3>4. 折痕接在加权和之后</h3>
        <p>
          真实网络先做完整的加权求和，再对总分做 ReLU；不是对每个乘积分别截断。
          重复「加权和 → 非线性」很多次，折点越来越密，网络就能拼出复杂棋形。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块前向计算：每次卷积与批标准化汇总后再接一道 ReLU"
          source="alphagomoku/model.py · ResBlock.forward"
        >
          <div className="codewalk">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <pre className="min-w-0 flex-1">{`    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)`}</pre>
              <div className="text-xs leading-relaxed sm:w-56" style={{ color: "var(--fg-faint)" }}>
                <div>第一层：F.relu 套在 bn1(conv1(x)) 外面，对卷积加权求和后的结果做截断。</div>
                <div className="mt-1">块出口：第二层输出 h 与原输入 x 相加后，再过一道 F.relu。</div>
              </div>
            </div>
          </div>
        </EvidenceCard>
      </div>

      <Ledger title="alphagomoku/model.py · ResBlock 与 stem 中的 ReLU">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="mono">alphagomoku/model.py · AlphaGomokuNet.__init__</span>：首层{" "}
            <span className="mono">self.stem</span> 按「卷积（<span className="mono">bias=False</span>）→ 批标准化 →{" "}
            <span className="mono">nn.ReLU()</span>」顺序构造。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · ResBlock.forward</span>：块内第一层走{" "}
            <span className="mono">F.relu(self.bn1(self.conv1(x)))</span>，第二层经{" "}
            <span className="mono">self.bn2(self.conv2(h))</span> 与输入 <span className="mono">x</span> 相加后，在出口执行{" "}
            <span className="mono">F.relu(x + h)</span>。
          </li>
          <li>
            <span className="mono">learn/src/lib/foundations.ts · relu / reluAbs</span>：例 5-1 交互图的教学算子，直接计算{" "}
            <span className="mono">ReLU(t) + ReLU(−t) = |t|</span>。
          </li>
          <li>
            上下游衔接：<span className="mono">stem</span> 与 <span className="mono">ResBlock</span> 组装成卷积主干；主干提取的特征再交给后续读出层使用。
          </li>
          <li>
            验证命令：<span className="mono">pytest tests/test_model.py::test_forward_shapes_and_ranges</span> 与{" "}
            <span className="mono">cd learn && npm test</span>。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "只做乘加的分界永远是直线；两个权重相乘仍是一个权重，线性叠线性不增加表示能力。",
          "激活函数接在加权求和之后改变形状；ReLU 是「正数通过、负数归零」的一道折痕。",
          "ReLU(t)+ReLU(−t)=|t|，两道镜像折痕拼出 V 形，用两条平行线把「均衡 / 一边倒」四点分开。",
          "变换的次序是先加权求和、再非线性变换，两者交替重复才能拼出复杂棋形。",
        ]}
        next={
          <>
            复杂棋形从哪里读进来，取决于棋盘怎么送。下一课把同一份棋盘事实拆成三张图：
            己方子一张、对方子一张、先后手身份一张。三个平面并排，才是网络真正读到的输入。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "为什么线性机器切不开「均衡 / 一边倒」这四点？",
            options: [
              "因为权重太少了，加到足够多就能切开",
              "线性分界永远是直线，而两类点斜对角交错（对角线相交），任何直线必有一对同类被切开；权重多少都改变不了「直」",
              "因为四点太少，点多一点自然就切开了",
            ],
            answer: 1,
            explain:
              "在例 5-2 里把直线怎么转怎么挪，最好也分错一个。这不是权重数量问题，是形状问题：直线没有折痕。要切开的形状是「两条平行线夹一条带状区域」，直线一根画不出两根的事。",
          },
          {
            q: "两层线性叠起来仍切不开异或四点。该往哪里加非线性？",
            options: [
              "哪里都不用加：两层看得比一层深",
              "层与层之间要插非线性：w₂·(w₁·x) = (w₂·w₁)·x，线性套线性还是一条直线，叠一百层也一样；真实网络也在卷积层之间穿插非线性变换",
              "只在最后加一次就够",
            ],
            answer: 1,
            explain:
              "线性套线性还是线性，所以「多叠几层就更厉害」有个前提：层与层之间必须有非线性变换。真实网络也按这个次序搭：先做加权求和，再让激活函数折一下，然后交给下一层。",
          },
          {
            q: "ReLU(t) + ReLU(−t) 等于什么？这条恒等式在例 5-2 里干成了什么事？",
            options: [
              "等于 t；什么都不干",
              "等于 |t|；两个镜像 ReLU 拼出 V 形：v=|x−y| 把「均衡」两点留在最低点、「一边倒」两点推上两侧坡面；两条平行线 v=½ 从两侧夹开（0 与 1 之间任取，½ 最简）",
              "等于 2t；把分数放大一倍",
            ],
            answer: 1,
            explain:
              "ReLU(t) 只留从折点向右的半条线，ReLU(−t) 只留向左的半条（照镜子反过来），相加正好拼成 V。最低点的「均衡」两点各是 v=0，坡上的「一边倒」两点各是 v=1。把 v 相同的点连起来，是一条条跟对角线平行的线。判类规则是 v>½ 判「一边倒」、v≤½ 判「均衡」；本例四点的 v 只有 0 和 1，永远不会落在界上。v=½ 那两条把「均衡」点夹在带状区域里，把「一边倒」点推到外侧。在 v 这把尺子上一刀即可，因为 V 形把斜对角两点折到了同一高度。这道四点反例（异或）就这么被两个非线性变换切开。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 5-2 · XOR 切分器：一挡一挡看直线怎么失败 ============ */

const PW = 300, PH = 252, PPL = 40, PPR = 14, PPT = 14, PPB = 38
const GMIN = -0.35, GMAX = 1.35
const gx = (x: number) => PPL + ((x - GMIN) / (GMAX - GMIN)) * (PW - PPL - PPR)
const gy = (y: number) => PH - PPB - ((y - GMIN) / (GMAX - GMIN)) * (PH - PPT - PPB)

type Mode = "line" | "one" | "two"

function XorCutter() {
  const [mode, setMode] = useState<Mode>("line")
  const [angle, setAngle] = useState(45) // 直线角度(度)
  const [off, setOff] = useState(0.5) // 直线离原点的法向距离
  const [theta, setTheta] = useState(0) // 一个非线性变换的半平面阈值：x−y>θ

  const rad = (angle * Math.PI) / 180
  const nx = -Math.sin(rad), ny = Math.cos(rad) // 法向
  const side = (x: number, y: number) => nx * x + ny * y - off
  // 直线的两种定向都试，取错得少的
  const errLine = (() => {
    let best = 4
    for (const s of [1, -1]) {
      let e = 0
      for (const [x, y] of YES) if (side(x, y) * s <= 0) e++
      for (const [x, y] of NO) if (side(x, y) * s > 0) e++
      best = Math.min(best, e)
    }
    return best
  })()
  const errOne = (() => {
    let e = 0
    for (const [x, y] of YES) if (x - y <= theta) e++
    for (const [x, y] of NO) if (x - y > theta) e++
    return e
  })()

  // 直线两端(画面外各延 2 单位，根部裁掉)
  const cx = nx * off, cy = ny * off
  const dx = Math.cos(rad), dy = Math.sin(rad)
  const linePts = `${gx(cx - 2.4 * dx).toFixed(1)},${gy(cy - 2.4 * dy).toFixed(1)} ${gx(cx + 2.4 * dx).toFixed(1)},${gy(cy + 2.4 * dy).toFixed(1)}`

  const point = (x: number, y: number, kind: "yes" | "no", label: string, v?: number) => (
    <g key={`${x}-${y}`}>
      <circle cx={gx(x)} cy={gy(y)} r={7}
        style={{
          fill: kind === "yes" ? "var(--accent-deep)" : "var(--board)",
          stroke: kind === "yes" ? "var(--accent-deep)" : "var(--fg-faint)",
          strokeWidth: 2,
        }} />
      {v !== undefined && (
        <text x={gx(x)} y={gy(y) - 12} fontSize={10.5} textAnchor="middle" className="num"
          style={{ fill: "var(--accent-deep)" }}>
          v={v}
        </text>
      )}
      <text x={gx(x)} y={gy(y) + 22} fontSize={9.5} textAnchor="middle"
        style={{ fill: "var(--fg-faint)" }}>
        {label}
      </text>
    </g>
  )

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 5-2 · 异或切分器：谁切开了「一边倒」</span>
        <span className="seg" data-qa="xor-mode">
          <button type="button" className={`seg-btn ${mode === "line" ? "active" : ""}`}
            onClick={() => setMode("line")}>
            一条直线
          </button>
          <button type="button" className={`seg-btn ${mode === "one" ? "active" : ""}`}
            onClick={() => setMode("one")}>
            一个非线性变换
          </button>
          <button type="button" className={`seg-btn ${mode === "two" ? "active" : ""}`}
            onClick={() => setMode("two")}>
            两个非线性变换
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${PW} ${PH}`} data-qa="xor-plane"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 320 }}>
            {/* 轴 */}
            <line x1={PPL} y1={gy(0)} x2={PW - PPR} y2={gy(0)}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            <line x1={gx(0)} y1={PPT} x2={gx(0)} y2={PH - PPB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[0, 1].map((t) => (
              <g key={t}>
                <text x={gx(t)} y={gy(0) + 14} fontSize={9.5} textAnchor="middle" className="num"
                  style={{ fill: "var(--fg-faint)" }}>{t}</text>
                <text x={gx(0) - 8} y={gy(t) + 3} fontSize={9.5} textAnchor="end" className="num"
                  style={{ fill: "var(--fg-faint)" }}>{t}</text>
              </g>
            ))}
            <text x={PW - PPR} y={gy(0) + 14} fontSize={9} textAnchor="end"
              style={{ fill: "var(--fg-faint)" }}>我方三连 x →</text>
            <text x={gx(0) - 8} y={PPT + 8} fontSize={9} textAnchor="end"
              style={{ fill: "var(--fg-faint)" }}>对方三连 y ↑</text>

            {mode === "line" && (
              <g data-qa="xor-line">
                <polyline points={linePts} fill="none"
                  style={{ stroke: "var(--accent)" }} strokeWidth={2.2} />
              </g>
            )}
            {mode === "one" && (
              <g data-qa="xor-one">
                {/* 判类侧 x−y>θ 涂色：沿分界线向 +x 方向铺，伸出画面的部分由 svg 根部裁掉 */}
                <polygon
                  points={`${gx(theta + GMIN)},${gy(GMIN)} ${gx(theta + GMAX)},${gy(GMAX)} ${gx(theta + GMAX + 3)},${gy(GMAX)} ${gx(theta + GMIN + 3)},${gy(GMIN)}`}
                  style={{ fill: "var(--accent)" }} opacity={0.08} />
                <polyline
                  points={`${gx(GMIN - 0.1)},${gy(GMIN - 0.1)} ${gx(GMAX + 0.1)},${gy(GMAX + 0.1)}`}
                  fill="none" strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }}
                  strokeWidth={1.4} />
                <text x={gx(0.92)} y={gy(0.92) + 12} fontSize={9} style={{ fill: "var(--fg-faint)" }}>
                  折痕 x−y=0
                </text>
                <polyline
                  points={`${gx(theta + GMIN - 0.1)},${gy(GMIN - 0.1)} ${gx(theta + GMAX - 0.1)},${gy(GMAX - 0.1)}`}
                  fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2.2} />
                <text x={gx(theta + 0.7)} y={gy(0.7) - 6} fontSize={9.5} textAnchor="middle" style={{ fill: "var(--fg-faint)" }}>
                  判类界 x−y={theta.toFixed(2)}
                </text>
              </g>
            )}
            {mode === "two" && (
              <g data-qa="xor-two">
                {/* 带状区域 |x−y|<½:两条平行线之间涂色，「否」点躺在里面 */}
                <polygon
                  points={`${gx(GMIN - 0.1)},${gy(GMIN - 0.6)} ${gx(GMAX)},${gy(GMAX - 0.5)} ${gx(GMAX)},${gy(GMAX + 0.5)} ${gx(GMIN - 0.1)},${gy(GMIN + 0.4)}`}
                  style={{ fill: "var(--accent)" }} opacity={0.08} />
                <polyline
                  points={`${gx(GMIN - 0.1)},${gy(GMIN - 0.6)} ${gx(GMAX)},${gy(GMAX - 0.5)}`}
                  fill="none" strokeDasharray="5 4" style={{ stroke: "var(--accent)" }}
                  strokeWidth={1.8} />
                <polyline
                  points={`${gx(GMIN - 0.1)},${gy(GMIN + 0.4)} ${gx(GMAX)},${gy(GMAX + 0.5)}`}
                  fill="none" strokeDasharray="5 4" style={{ stroke: "var(--accent)" }}
                  strokeWidth={1.8} />
                <text x={gx(1.02)} y={gy(1.18)} fontSize={9.5} style={{ fill: "var(--fg-faint)" }}>
                  v=½ 两条
                </text>
              </g>
            )}

            {point(0, 0, "no", "均衡", mode === "two" ? 0 : undefined)}
            {point(1, 1, "no", "均衡", mode === "two" ? 0 : undefined)}
            {point(1, 0, "yes", "一边倒", mode === "two" ? 1 : undefined)}
            {point(0, 1, "yes", "一边倒", mode === "two" ? 1 : undefined)}
          </svg>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[17rem]">
          {mode === "line" && (
            <div data-qa="xor-line-ctl">
              <div className="mini-label">转直线：{angle}°</div>
              <input type="range" min={0} max={180} step={1} value={angle}
                onChange={(e) => setAngle(Number(e.target.value))} aria-label="直线角度"
                style={{ ["--fill" as string]: `${(angle / 180) * 100}%` }} />
              <div className="mini-label mt-3">挪直线：{off.toFixed(2)}</div>
              <input type="range" min={-1} max={2} step={0.05} value={off}
                onChange={(e) => setOff(Number(e.target.value))} aria-label="直线位置"
                style={{ ["--fill" as string]: `${((off + 1) / 3) * 100}%` }} />
              <div className="reveal-box mt-3">
                <p className="num text-lg font-bold">
                  最好也分错 <span style={{ color: "var(--accent-deep)" }}>{errLine}</span> 个点
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  转满一圈、挪遍全程：两个「一边倒」斜对角，两个「均衡」也斜对角。
                  一条直线最多分对三个点、至少分错一个；想把「一边倒」那对都分对，「均衡」那对至少分错一只（四点斜对角交错，一线必错至少一只）。这就是线性的极限，不是权重不够，
                  是「直」这个形状不行。
                </p>
              </div>
            </div>
          )}
          {mode === "one" && (
            <div data-qa="xor-one-ctl">
              <div className="mini-label">阈值：x−y &gt; {theta.toFixed(2)}</div>
              <input type="range" min={-1.3} max={1.3} step={0.05} value={theta}
                onChange={(e) => setTheta(Number(e.target.value))} aria-label="阈值"
                style={{ ["--fill" as string]: `${((theta + 1.3) / 2.6) * 100}%` }} />
              <div className="reveal-box mt-3">
                <p className="num text-lg font-bold">
                  当前分错 <span style={{ color: "var(--accent-deep)" }}>{errOne}</span> 个点
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  v = ReLU(x−y) 只有一道折痕，折痕固定在 x−y=0。你拖的 θ 是判类界（直线族演示：界线在 x−y 上取值；v=ReLU(x−y) 只在 θ 为非负时等价于在 v 上取阈值，θ 为负时 v 在 x−y≤0 段全压成 0、分不出档）：
                  规则是 x−y&gt;θ 算「一边倒」（图中阴影就是被判「一边倒」的半平面），界线可以挪，折痕本身不动。
                  尽管 v 会拐弯，判类界 x−y=θ 仍是一条直线，画出的也还是<strong>半平面</strong>（半个坐标面），极限没破。一个折痕不够，两个刚好。
                </p>
              </div>
            </div>
          )}
          {mode === "two" && (
            <div className="reveal-box" data-qa="xor-two-read">
              <div className="mini-label">v = ReLU(x−y) + ReLU(y−x) = |x−y|</div>
              <table className="mt-2 w-full text-sm">
                <tbody className="num">
                  <tr><td>(0,0) 均衡</td><td>|0−0| =</td><td><strong>0</strong></td><td>最低点 ✓</td></tr>
                  <tr><td>(1,1) 均衡</td><td>|1−1| =</td><td><strong>0</strong></td><td>最低点 ✓</td></tr>
                  <tr><td>(1,0) 一边倒</td><td>|1−0| =</td><td><strong>1</strong></td><td>坡上 ✓</td></tr>
                  <tr><td>(0,1) 一边倒</td><td>|0−1| =</td><td><strong>1</strong></td><td>坡上 ✓</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                表里 |0−1| 减出了负数，两条竖线只留差距：0 比 1 差 1。
                两个镜像 ReLU 拼出 V 形：v=½ 这把刀是读出规则（把算出的 v 与阈值比一比），不是网络内部的一步。分界线 v=½ 是两条虚线平行线（图中阴影是带内的「均衡」区，与一挡阴影的判「一边倒」相反），
                <strong>两个「均衡」躺在带状区域里(v=0)，两个「一边倒」各被一条线
                推到外侧(v=1)</strong>。一条线夹不住两个「均衡」、又同时推开两个「一边倒」（四点斜对角交错），
                两条刚好各管一边。这就是「两个非线性变换」的全部构造。
              </p>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            回到棋盘：x、y 是同一扇窗里两边的三连数，「差距大不大」这件事，
            天生就是 |x−y| 的 V 形。棋理里的「恰好一方占优」「先跌后涨」，
            都要靠这类非线性变换才画得出。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 5-2</span>
        一个隐藏层、两个镜像单元（h₁/h₂ 的 (1,−1) 镜像权重是为看清原理摆的）：h₁、h₂ 是中间层里各做一次乘加、再过一道 ReLU 的计算单元，各守一道折痕，
        h₁=ReLU(x−y)、h₂=ReLU(y−x)，v=h₁+h₂。
        四点逐值验证在右表：不是一个 ReLU（半平面切不开），而是两个（带状区域刚好够用）。
      </figcaption>
    </figure>
  )
}

/* ============ 例 5-1 · 折线拼形：ReLU(t)+ReLU(−t)=|t| ============ */

const FW = 128, FH = 116, FPL = 24, FPR = 8, FPT = 10, FPB = 22
const fx = (t: number) => FPL + ((t + 3) / 6) * (FW - FPL - FPR)
const fy = (v: number) => FH - FPB - (v / 3) * (FH - FPT - FPB)

function FoldSum() {
  const [t, setT] = useState(2)
  const [folding, setFolding] = useState(false)
  useEffect(() => {
    if (!folding) return
    let raf = 0
    const t0 = performance.now()
    const dur = 2600
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur)
      setT(-3 + 6 * u) // 从 −3 扫到 3:看两半折线合成 V
      if (u < 1) raf = requestAnimationFrame(tick)
      else setFolding(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [folding])

  const chart = (name: string, f: (v: number) => number, key: string) => (
    <div className="min-w-0 flex-1">
      <div className="mini-label mb-1.5 text-center">{name}</div>
      <svg viewBox={`0 0 ${FW} ${FH}`} data-qa={`fold-${key}`}
        style={{ width: "100%", height: "auto", display: "block" }}>
        <line x1={FPL} y1={fy(0)} x2={FW - FPR} y2={fy(0)}
          style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
        <line x1={fx(0)} y1={FPT} x2={fx(0)} y2={FH - FPB}
          style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
        <polyline
          points={Array.from({ length: 49 }, (_, i) => {
            const s = -3 + (i / 48) * 6
            return `${fx(s).toFixed(1)},${fy(Math.min(f(s), 3)).toFixed(1)}`
          }).join(" ")}
          fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2.2} />
        <circle cx={fx(t)} cy={fy(Math.min(f(t), 3))} r={4.5}
          style={{ fill: "var(--accent-deep)" }} />
        <text x={fx(t)} y={FPT + 8} fontSize={9} textAnchor="middle" className="num"
          style={{ fill: "var(--fg-faint)" }}>
          t={t.toFixed(1)}
        </text>
      </svg>
      <p className="num mt-1 text-center text-sm" style={{ color: "var(--accent-deep)" }}>
        {f(t).toFixed(1)}
      </p>
    </div>
  )

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 5-1 · 折线拼形：两段半截线，拼一个 V</span>
      </div>
      <div className="p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-5">
          {chart("ReLU(t) 正半边", relu, "pos")}
          <span className="mt-[5.2rem] text-lg" style={{ color: "var(--fg-faint)" }}>+</span>
          {chart("ReLU(−t) 负半边", (v) => relu(-v), "neg")}
          <span className="mt-[5.2rem] text-lg" style={{ color: "var(--fg-faint)" }}>=</span>
          {chart("|t| 两半拼成", reluAbs, "abs")}
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mini-label">拖 t(−3 → 3)</span>
            <button type="button" className={`btn ${folding ? "active" : ""}`}
              onClick={() => setFolding((f) => !f)} data-qa="fold-auto">
              {folding ? "⏸ 停" : "▶ 自动折一遍"}
            </button>
          </div>
          <input type="range" min={-3} max={3} step={0.1} value={t}
            onChange={(e) => setT(Number(e.target.value))} aria-label="t 滑杆"
            style={{ ["--fill" as string]: `${((t + 3) / 6) * 100}%` }}
            data-qa="fold-slider" />
          <div className="num mt-1 flex justify-between text-xs" style={{ color: "var(--fg-faint)" }}>
            <span>−3</span><span>0</span><span>+3</span>
          </div>
        </div>
        <div className="reveal-box mt-4">
          <p className="num">
            ReLU({t < 0 ? `−${Math.abs(t).toFixed(1)}` : t.toFixed(1)}) + ReLU({-t < 0 ? `−${Math.abs(-t).toFixed(1)}` : (-t).toFixed(1)}) ={" "}
            {relu(t).toFixed(1)} + {relu(-t).toFixed(1)} ={" "}
            <strong style={{ color: "var(--accent-deep)" }}>{reluAbs(t).toFixed(1)}</strong>
            {"   "}(|t| = {Math.abs(t).toFixed(1)})
          </p>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            负分区归零 = 半条线：ReLU(t) 只留右半边，ReLU(−t) 只留左半边，
            一拼就是 V。亲手拖到三个验算点：t=2 → 2+0=2；t=−3 → 0+3=3；
            t=0 → 0+0=0。例 5-2 切开异或的 v=|x−y|，就是这个恒等式换上
            棋盘的轴。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 5-1</span>
        折线拼形的最基本一招：每道 ReLU 贡献半条线（带一个折点），
        几道 ReLU 就拼出几段折线。真实网络把「先加权求和再非线性变换」层层重复，
        折线越拼越碎，能拼的形状成倍增加。
      </figcaption>
    </figure>
  )
}
