/** 第六章 · 训练:把搜索的结论,学进网络里。
 *
 *  图 6-1 对称变换台:教学示意局面(L 形 4 子)+ 朱砂候选点,8 种二面体变换;
 *  变换规则与 alphagomoku/game.py 的 dihedral_transform 完全一致
 *  (np.rot90(k % 4) 之后,若 k >= 4 再做左右镜像),候选点扮演 π 标签。
 *  图 6-2 真实损失曲线:REAL.metrics 第 0–3 轮的 policy_loss / value_loss,
 *  附乱猜线 ln(81) ≈ 4.394,悬停读数。
 *  本章无 JS 动画(Reveal 自身已对 prefers-reduced-motion 降级)。
 */
import { useMemo, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import GomokuBoard from "../lib/board"
import Reveal from "../lib/reveal"
import ChapterHeader from "../components/ChapterHeader"
import { coordLabel, fmtFloat, fmtInt } from "../lib/format"
import { REAL } from "../data/real"

/* ============================================================
   二面体群 D4:与训练代码同规则的 8 种对称变换
   ============================================================ */

const N = 9

/** 与 np.rot90(k=1) 一致:new[r][c] = old[c][n-1-r]。 */
function rot90Once(src: number[], n: number): number[] {
  const out = new Array<number>(n * n)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) out[r * n + c] = src[c * n + (n - 1 - r)]
  }
  return out
}

/** 与 np.flip(axis=-1) 一致:列左右颠倒。 */
function flipLR(src: number[], n: number): number[] {
  const out = new Array<number>(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i * n + j] = src[i * n + (n - 1 - j)]
  }
  return out
}

/** 与 alphagomoku/game.py dihedral_transform 同规则。 */
function dihedral(src: number[], n: number, k: number): number[] {
  let out = src
  for (let i = 0; i < k % 4; i++) out = rot90Once(out, n)
  if (k >= 4) out = flipLR(out, n)
  return out
}

/** 单点坐标过同一个变换 —— π 标签「同步变换」的依据。 */
function dihedralPoint(
  x: number,
  y: number,
  n: number,
  k: number,
): { x: number; y: number } {
  let px = x
  let py = y
  for (let i = 0; i < k % 4; i++) {
    const nx = py
    const ny = n - 1 - px
    px = nx
    py = ny
  }
  if (k >= 4) px = n - 1 - px
  return { x: px, y: py }
}

const K_NAMES = [
  "原图",
  "转 90°",
  "转 180°",
  "转 270°",
  "镜像",
  "转 90° · 镜像",
  "转 180° · 镜像",
  "转 270° · 镜像",
]

/* 教学示意局面:黑棋三连 + 白棋卡住肘部,构成一个不对称的 L;
   朱砂候选点是「把三连延长成四」的那一格,扮演 π 中概率最高的格子。 */
const DEMO_STONES: { x: number; y: number; v: number }[] = [
  { x: 2, y: 2, v: 1 },
  { x: 3, y: 2, v: 1 },
  { x: 4, y: 2, v: 1 },
  { x: 2, y: 3, v: -1 },
]
const DEMO_CAND = { x: 5, y: 2 }

function buildDemoBoard(): number[] {
  const b = new Array<number>(N * N).fill(0)
  for (const s of DEMO_STONES) b[s.y * N + s.x] = s.v
  return b
}
const DEMO_BOARD = buildDemoBoard()

/* 真实数据速取(第 0–3 轮真实训练) */
const M_FIRST = REAL.metrics[0]
const M_LAST = REAL.metrics[REAL.metrics.length - 1]
const LN81 = Math.log(81)

/* ============================================================
   图 6-1:对称变换台(教学示意)
   ============================================================ */

/** 缩略图下方的短名。 */
const K_SHORT = ["原", "90°", "180°", "270°", "镜像", "镜90°", "镜180°", "镜270°"]

function SymmetryLab() {
  const [k, setK] = useState(0)

  /** 8 份变换后的棋盘 + 8 个同步变换后的候选点(候选点扮演 π 中概率最高的格子)。 */
  const variants = useMemo(
    () =>
      Array.from({ length: 8 }, (_, kk) => {
        const board = dihedral(DEMO_BOARD, N, kk)
        const pt = dihedralPoint(DEMO_CAND.x, DEMO_CAND.y, N, kk)
        const heat = new Array<number>(N * N).fill(0)
        heat[pt.y * N + pt.x] = 1
        return { board, pt, heat }
      }),
    [],
  )

  const cur = variants[k]

  return (
    <div style={{ padding: "1.25rem 1.3rem 1.1rem" }}>
      <div
        className="flex items-center justify-between"
        style={{ gap: "0.8rem", flexWrap: "wrap", marginBottom: "1.1rem" }}
      >
        <div className="mini-label">二面体群 D4 · 8 种对称变换 · 点击缩略图切换主视图</div>
        <span className="chip">教学示意</span>
      </div>

      <div style={{ display: "flex", gap: "1.4rem", flexWrap: "wrap" }}>
        {/* 主视图 */}
        <div style={{ flex: "0 1 300px", minWidth: 230 }}>
          <GomokuBoard size={N} board={cur.board} heat={cur.heat} />
          <div
            className="flex items-center justify-center"
            style={{ gap: "0.45rem", marginTop: "0.65rem", flexWrap: "wrap" }}
          >
            <span className="chip accent">
              k = <span className="mono">{k}</span> · {K_NAMES[k]}
            </span>
            <span className="chip">
              候选点{" "}
              <span className="mono">
                {coordLabel(DEMO_CAND.x, DEMO_CAND.y)} →{" "}
                {coordLabel(cur.pt.x, cur.pt.y)}
              </span>
            </span>
          </div>
        </div>

        {/* 缩略图阵列 */}
        <div style={{ flex: "1 1 320px", minWidth: 260 }}>
          <div
            role="group"
            aria-label="选择一种对称变换"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.7rem",
            }}
          >
            {variants.map((v, kk) => (
              <button
                key={kk}
                type="button"
                aria-pressed={k === kk}
                aria-label={`变换:${K_NAMES[kk]}`}
                onClick={() => setK(kk)}
                style={{
                  padding: 0,
                  border: "2px solid",
                  borderColor: k === kk ? "var(--accent)" : "var(--hairline)",
                  borderRadius: 10,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "var(--card)",
                  lineHeight: 0,
                  transition: "border-color 160ms ease",
                }}
              >
                <span aria-hidden="true">
                  <GomokuBoard size={N} board={v.board} heat={v.heat} small />
                </span>
              </button>
            ))}
          </div>
          <div
            aria-hidden
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.7rem",
              marginTop: "0.35rem",
            }}
          >
            {K_SHORT.map((s, kk) => (
              <div
                key={kk}
                className="mono"
                style={{
                  textAlign: "center",
                  fontSize: "0.68rem",
                  color: k === kk ? "var(--accent-deep)" : "var(--fg-faint)",
                  transition: "color 160ms ease",
                }}
              >
                {s}
              </div>
            ))}
          </div>

          <p
            style={{
              fontSize: "0.86rem",
              lineHeight: 1.75,
              color: "var(--fg-muted)",
              margin: "0.95rem 0 0",
            }}
          >
            朱砂圆盘扮演 π 中概率最高的候选点。逐一点击缩略图:棋盘每换一种变换,
            候选点都落在<strong>对应的同一格</strong>——训练时,棋盘与 π 标签必须
            永远这样同步变换,一格都不能错。
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   图 6-2:真实损失曲线(第 0–3 轮真实训练)
   ============================================================ */

const CW = 760
const CH = 380
const PLOT = { l: 56, r: 24, t: 30, b: 46 }
const PW = CW - PLOT.l - PLOT.r
const PH = CH - PLOT.t - PLOT.b
const Y_MAX = 5
/** 悬停提示的锚点高度:两条线之间的空隙,避免被 .figure 的圆角裁掉。 */
const TIP_ANCHOR_Y = 178

function xAt(i: number, n: number): number {
  return PLOT.l + (i * PW) / (n - 1)
}
function yAt(v: number): number {
  return PLOT.t + PH * (1 - v / Y_MAX)
}

function LossChart() {
  const rows = REAL.metrics
  const [hi, setHi] = useState<number | null>(null)

  const pts = rows.map((r, i) => ({
    i,
    x: xAt(i, rows.length),
    pl: r.policy_loss ?? 0,
    vl: r.value_loss ?? 0,
    loss: r.loss ?? 0,
  }))
  const toPath = (key: "pl" | "vl") =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${yAt(p[key]).toFixed(1)}`)
      .join(" ")

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * CW
    const t = Math.round(((mx - PLOT.l) / PW) * (rows.length - 1))
    setHi(Math.max(0, Math.min(rows.length - 1, t)))
  }

  const hover = hi != null ? pts[hi] : null
  const tipLeftPct = hover
    ? (Math.max(130, Math.min(CW - 130, hover.x)) / CW) * 100
    : 0

  return (
    <div style={{ padding: "1.25rem 1.3rem 1.1rem" }}>
      <div
        className="flex items-center justify-between"
        style={{ gap: "0.8rem", flexWrap: "wrap", marginBottom: "1rem" }}
      >
        <div
          className="flex items-center"
          style={{ gap: "1.1rem", flexWrap: "wrap", fontSize: "0.82rem", color: "var(--fg-muted)" }}
        >
          <span className="flex items-center" style={{ gap: "0.4rem" }}>
            <i style={{ width: 18, borderTop: "3px solid var(--accent)", borderRadius: 2 }} />
            策略损失 <span className="mono">−Σ π·log p</span>
          </span>
          <span className="flex items-center" style={{ gap: "0.4rem" }}>
            <i style={{ width: 18, borderTop: "3px solid var(--ok)", borderRadius: 2 }} />
            价值损失 <span className="mono">(v−z)²</span>
          </span>
          <span className="flex items-center" style={{ gap: "0.4rem" }}>
            <i style={{ width: 18, borderTop: "2px dashed var(--fg-faint)" }} />
            乱猜线
          </span>
        </div>
        <span className="chip accent">来自第 0–3 轮真实训练</span>
      </div>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${CW} ${CH}`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
          role="img"
          aria-label="第 0 到 3 轮的策略损失与价值损失折线图,附乱猜线 ln(81)"
          onPointerMove={onMove}
          onPointerLeave={() => setHi(null)}
        >
          {/* 横向网格与 y 轴刻度 */}
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line
                x1={PLOT.l}
                x2={CW - PLOT.r}
                y1={yAt(v)}
                y2={yAt(v)}
                style={{ stroke: v === 0 ? "var(--hairline-strong)" : "var(--hairline)" }}
                strokeWidth={1}
              />
              <text
                x={PLOT.l - 10}
                y={yAt(v) + 4}
                textAnchor="end"
                fontSize={11}
                className="mono"
                style={{ fill: "var(--fg-faint)" }}
              >
                {v}
              </text>
            </g>
          ))}

          {/* x 轴刻度 */}
          {pts.map((p) => (
            <text
              key={p.i}
              x={p.x}
              y={CH - 14}
              textAnchor="middle"
              fontSize={11}
              className="mono"
              style={{ fill: "var(--fg-faint)" }}
            >
              第 {p.i} 轮
            </text>
          ))}

          {/* 乱猜线 ln(81) ≈ 4.394 */}
          <line
            x1={PLOT.l}
            x2={CW - PLOT.r}
            y1={yAt(LN81)}
            y2={yAt(LN81)}
            style={{ stroke: "var(--fg-faint)" }}
            strokeWidth={1.4}
            strokeDasharray="5 6"
          />
          <text
            x={CW - PLOT.r}
            y={yAt(LN81) - 8}
            textAnchor="end"
            fontSize={11}
            className="mono"
            style={{ fill: "var(--fg-faint)" }}
          >
            乱猜线 ln(81) ≈ 4.394
          </text>

          {/* 悬停参考竖线 */}
          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PLOT.t}
              y2={PLOT.t + PH}
              style={{ stroke: "var(--hairline-strong)" }}
              strokeWidth={1}
            />
          )}

          {/* 价值损失(绿) */}
          <path d={toPath("vl")} fill="none" style={{ stroke: "var(--ok)" }}
            strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* 策略损失(朱砂) */}
          <path d={toPath("pl")} fill="none" style={{ stroke: "var(--accent)" }}
            strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />

          {/* 数据点 */}
          {pts.map((p) => (
            <g key={p.i}>
              <circle cx={p.x} cy={yAt(p.vl)} r={hi === p.i ? 5.5 : 4}
                style={{ fill: "var(--card)", stroke: "var(--ok)", transition: "r 120ms ease" }}
                strokeWidth={2} />
              <circle cx={p.x} cy={yAt(p.pl)} r={hi === p.i ? 5.5 : 4}
                style={{ fill: "var(--card)", stroke: "var(--accent)", transition: "r 120ms ease" }}
                strokeWidth={2} />
            </g>
          ))}
        </svg>

        {hover && (
          <div
            className="tip"
            style={{
              left: `${tipLeftPct}%`,
              top: `${(TIP_ANCHOR_Y / CH) * 100}%`,
            }}
          >
            <div>第 {hover.i} 轮</div>
            <div>策略 {fmtFloat(hover.pl, 3)}</div>
            <div>价值 {fmtFloat(hover.vl, 3)}</div>
            <div>总损失 {fmtFloat(hover.loss, 3)}</div>
          </div>
        )}
      </div>

      <p
        className="mono"
        style={{
          margin: "0.7rem 0 0",
          fontSize: "0.72rem",
          letterSpacing: "0.04em",
          color: "var(--fg-faint)",
        }}
      >
        悬停读数 · 纵轴为原始损失值,两条线共用同一刻度
      </p>
    </div>
  )
}

/* ============================================================
   第六章主件
   ============================================================ */

export default function Ch6() {
  return (
    <section id="ch-6">
      <div className="prose-col">
        <ChapterHeader
          no="陆"
          eyebrow="TRAINING"
          title="把搜索的结论,学进网络里"
        />

        <Reveal>
          <div className="prose">
            <p>
              每一局自我对局结束,棋盘上留下的不只是胜负,还有一沓<em>作业</em>:
              每一手棋都记下三样东西——当时的局面、搜索算出的落点分布{" "}
              <span className="chip">π</span>、以及这盘棋最终的结局{" "}
              <span className="chip">z</span>。网络对同一个局面也会给出自己的猜测:
              落点分布 <span className="chip">p</span> 与形势判断{" "}
              <span className="chip">v</span>。<strong>训练,就是给这两份猜测判卷</strong>,
              误差写进同一条损失:
            </p>
            <div className="formula">
              L = <span className="hl">(v − z)²</span>{" "}
              <span className="hl">− Σ π · log p</span>
            </div>
            <p>
              前一项是<em>价值损失</em>:网络说「这形势我能赢」(
              <span className="mono">v ≈ +1</span>),结果输了(
              <span className="mono">z = −1</span>
              ),均方误差逼它的形势判断向真实结局校准。后一项是<em>策略损失</em>:
              搜索把绝大部分访问投给了某格,网络却只给了它{" "}
              <span className="mono">5%</span>
              ,交叉熵逼它的直觉落点向搜索后的深思熟虑靠拢。一个管「谁占优」,
              一个管「下哪」。
            </p>
            <p>
              判卷的手法毫无玄妙:<strong>小批量随机梯度下降加动量</strong>(
              SGD + momentum)——把每份作业的误差沿梯度分摊回各层权重,
              一次只挪一小步,动量让脚步稳住方向。
            </p>

            <h3>经验池:不和昨天的自己单独约会</h3>
            <p>
              作业也不现做现扔,而是收进一只<em>滑动窗口式的经验池</em>
              (replay buffer):本轮的新样本倒进去,最旧的样本随窗口前移被淘汰。
              真实训练里,池子从第 <span className="mono">0</span> 轮的{" "}
              <span className="mono">{fmtInt(M_FIRST.buffer)}</span> 个样本,
              攒到第 <span className="mono">{M_LAST.iteration}</span> 轮的{" "}
              <span className="mono">{fmtInt(M_LAST.buffer)}</span> 个。
            </p>
            <p>
              为什么非要池子?若只用刚下完的几盘训练,网络会全力拟合
              「昨天的自己」刚下出的棋——包括其中的怪着与偏见,越学越像昨天,
              把自己绕进死胡同。经验池让相隔数轮、风格各异的局面同堂批卷,
              是<em>防过拟合昨天的自己</em>的第一道闸。
            </p>

            <h3>对称增广:白送的八倍数据</h3>
            <p>
              五子棋的棋理对旋转与镜像免疫:同一个 L 形,转{" "}
              <span className="mono">90°</span> 还是那个 L 形,该下的点还是
              「对应的那一个」。于是同一个局面可以<em>化身八份</em>——棋盘做{" "}
              <span className="mono">8</span> 种二面体变换(
              <span className="mono">4</span> 种旋转 × 是否镜像),输入不同,
              棋理相同。实现上并非真的复制七份:每步训练,每份样本随机抽{" "}
              <strong>一种</strong>变换再上阵;训练铺开,八种姿态都会被反复抽到,
              效果等同于数据量白乘 <span className="mono">8</span>。
            </p>
            <p>
              但有一个硬性前提:<strong>棋盘与 π 必须同步变换</strong>。π 是{" "}
              <span className="mono">81</span> 个格子上的分布,棋盘转了,
              每个概率都得跟着转到新坐标;只转棋盘不转 π,
              等于把「三连延四」的正确标签贴到无关的格子上——标签错位,
              越学越糊涂。价值标签 <span className="chip">z</span> 是标量,
              不受影响。
            </p>
            <div className="misconception">
              <div className="m-title">增广 ≠ 复制粘贴</div>
              卷积网络并没有内置的旋转不变性:转过的局面在它眼里是货真价实的新输入,
              却共享同一份棋理——这正是「白送的数据」仍然有效的原因。
            </div>
            <p>
              下面的变换台可以逐个查验:朱砂圆盘扮演 π 中概率最高的候选点,
              看它如何跟着棋盘一起走。
            </p>
          </div>
        </Reveal>
      </div>
      <div className="figure-col" style={{ marginTop: "1.8rem" }}>
        <Reveal>
          <figure className="figure" style={{ margin: 0 }}>
            <SymmetryLab />
            <figcaption className="figure-cap">
              <span className="cap-no">图 6-1</span>
              <span>
                局面为<strong>教学示意</strong>;变换规则与{" "}
                <span className="mono">alphagomoku/game.py</span> 的{" "}
                <span className="mono">dihedral_transform</span> 完全一致:先{" "}
                <span className="mono">np.rot90(k mod 4)</span>,
                <span className="mono">k ≥ 4</span>{" "}
                再做左右镜像。点击缩略图切换主视图:扮演 π 标签的朱砂候选点
                与棋盘始终同步变换——训练时二者必须永远一起走,否则标签错位。
              </span>
            </figcaption>
          </figure>
        </Reveal>
      </div>

      <div className="prose-col" style={{ marginTop: "2.2rem" }}>
        <Reveal>
          <div className="prose">
            <h3>怎么读这条曲线</h3>
            <p>
              横轴是训练轮次;朱砂线是<em>策略损失</em>,绿线是<em>价值损失</em>。
              灰色虚线是「乱猜线」<span className="mono">ln(81) ≈ 4.394</span>
              ——对 <span className="mono">81</span>{" "}
              个格子均匀乱猜时的交叉熵,是策略损失的起跑线。
            </p>
            <p>
              四轮之后,策略损失几乎贴在乱猜线上:不是没在学,而是搜索的 π
              本身留着探索的余地,交叉熵离 0 还远是常态;价值损失在低位打转,
              涨跌都还只是噪声。<strong>只有四轮,读趋势,别读单点</strong>;
              真正的故事,要等曲线拉到几百轮之后才讲得出来。
            </p>
          </div>
        </Reveal>
      </div>

      <div className="figure-col" style={{ marginTop: "1.8rem" }}>
        <Reveal>
          <figure className="figure" style={{ margin: 0 }}>
            <LossChart />
            <figcaption className="figure-cap">
              <span className="cap-no">图 6-2</span>
              <span>
                <strong>来自第 0–3 轮真实训练</strong>:策略损失{" "}
                <span className="mono">{fmtFloat(M_FIRST.policy_loss, 3)}</span> →{" "}
                <span className="mono">{fmtFloat(M_LAST.policy_loss, 3)}</span>,
                仍贴在乱猜线 <span className="mono">ln(81) ≈ 4.394</span> 附近;
                价值损失{" "}
                <span className="mono">{fmtFloat(M_FIRST.value_loss, 3)}</span> →{" "}
                <span className="mono">{fmtFloat(M_LAST.value_loss, 3)}</span>,
                低位波动。仅 <span className="mono">4</span>{" "}
                轮——短期是噪声,长期训练看趋势。
              </span>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}
