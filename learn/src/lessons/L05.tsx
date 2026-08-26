/** 第 5 课 · 弯折:直线画不出的形状(地基篇 3/4)。
 *  节拍:谜题(一边倒判断,线性学得会吗)→ 揭晓(线性天花板/XOR/
 *  线性套线性=一层/ReLU 负分归零/位置论/负功桥)→
 *  部件 1(XOR 切分器:一条直线/一个弯折/两个弯折三挡对比,|x−y| 构造)→
 *  部件 2(折线拼形:ReLU(t)+ReLU(−t)=|t| 徒手拖)→
 *  对账(model.py relu 永远在 conv 之后)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { relu, reluAbs } from "../lib/foundations"

/** 四个教学点:x=我方三连数、y=对方三连数。
 *  均衡(否):(0,0) 双方都无 / (1,1) 双方都有;一边倒(是):(1,0)(0,1)。 */
const NO: [number, number][] = [
  [0, 0],
  [1, 1],
]
const YES: [number, number][] = [
  [1, 0],
  [0, 1],
]

export default function L05() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 5 课</div>
      <h1 className="text-2xl font-bold">弯折:直线画不出的形状</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "网络要判断一扇窗的局面是不是「一边倒」:我方三连数 x、对方三连数 y——两边一样多(都无或都有)叫均衡,恰好一方有三连叫一边倒。只会乘和加(线性)的机器,学得会这道判断吗?",
            options: [
              "学得会:线性够聪明,权重多设几个就行",
              "学不会:线性画出的「等分线」永远是直线,而「均衡」和「一边倒」斜对角交错——任何直线都切不开",
              "学不会,但没关系,下棋用不上这种判断",
            ],
            answer: 1,
            explain:
              "选 B。把四个点画在纸上就看见了:两个「均衡」在一条对角线上、两个「一边倒」在另一条上,两条对角线互相穿过——直线不管怎么摆,总有一对「同类」被切开、一对「异类」留在同侧。加权重救不了:权重再怎么调,线性还是线性。出路是给机器一道会拐弯的工序——本题马上揭晓。答错了也照样放行。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 天花板、白叠、与一道折痕</h3>
        <p>
          <strong>① 线性天花板。</strong>只会乘和加的机器,分界永远是直线
          (输入更多时是一张平面):给总分设一个阈值,超过的算一类、没超过的
          算另一类——这条分界是直的。可四点里「均衡」(0,0)(1,1) 与
          「一边倒」(1,0)(0,1) 斜对角交错,两条对角线在 (½,½) 相交:
          一条直线永远切不开。严格的说法三行算完:要让前三个点分对,分界被迫是
          x+y=1 这条线;第四个点 (1,1) 给出 x+y=2,落在了「一边倒」那侧——
          矛盾,直线不存在。
        </p>
        <p>
          <strong>② 线性套线性,还是一层。</strong>那把好几层乘加叠起来呢?
          白叠:w₂·(w₁·x) = (w₂·w₁)·x——两个旋钮并成一个(2×(3×x) 与 6×x
          永远相等),叠一百层也还是一条直线。数学行话:仿射的复合还是仿射,
          表达力精确不增。所以真网络在<em>每次求和之后</em>都插一道弯折——
          层层叠起来的前提,是层与层之间有弯折把直线掰弯。
        </p>
        <p>
          <strong>③ ReLU:负分归零。</strong>这道弯折叫{" "}
          <span className="mono">ReLU(s) = s &gt; 0 ? s : 0</span>:正分区原样
          通过,负分区整片压平成 0。一条折痕,把直线掰成折线。两个镜像弯折
          还能拼形:ReLU(t) + ReLU(−t) = |t|(t=2 时 2+0=2,t=−3 时 0+3=3,
          t=0 时 0+0=0——徒手可验)。部件二让你亲手拖一遍这个恒等式;
          而四点「一边倒」的答案就藏在它里面:v = |x−y|。
        </p>
        <p>
          <strong>④ 位置论与负功桥。</strong>弯折的位置有讲究:在<em>求和之后</em>
          ——先线性计票,再把总分掰弯(掰总分,不掰每格证据)。第 7 课还会回收
          一笔旧账:正负抵消里「对方那颗子永远在做负功」,解法「拆两张 0/1 面」
          本质上就是手工做在输入端的弯折——己面 = ReLU(x)、敌面 = ReLU(−x),
          到时候对回来看,正是本课这道折痕。
        </p>
      </div>

      <XorCutter />

      <FoldSum />

      <Ledger title="model.py L21、L35(ReLU 永远跟在求和后面)">
        <div className="codewalk">
          <pre>{`# model.py L20-21  残差块:卷积(求和)→ BN → 弯折
h = F.relu(self.bn1(self.conv1(x)))   # conv 计票,再整体 ReLU
...
return F.relu(x + h)                  # 出口再折一次

# model.py L32-36  stem 同款:第一层也是先计票再弯折
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),
    nn.BatchNorm2d(channels),
    nn.ReLU(),                         # ← 弯折在最后一道
)`}</pre>
        </div>
        <p className="mt-3">
          翻遍 model.py,<span className="mono">F.relu</span> 没有一处出现在
          乘加<em>中间</em>——「先线性计票,再整体弯折」被写成了铁律。本课造的
          是一道折痕;真网络把「计票→弯折」串成 7 层,折线一层层越拼越复杂
          (第 9 课看它拼出什么)。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 6 课"
        onAllCorrect={() => pass("l05")}
        questions={[
          {
            q: "为什么线性机器切不开「均衡 / 一边倒」这四点?",
            options: [
              "因为权重太少了,加到足够多就能切开",
              "线性分界永远是直线,而两类点斜对角交错(对角线相交)——任何直线必有一对同类被切开;权重多少都改变不了「直」",
              "因为四点太少,点多一点自然就切开了",
            ],
            answer: 1,
            explain:
              "部件一拖过:直线怎么转怎么挪,最好也分错一个。这不是权重数量问题,是形状问题——直线没有折痕。要切开的形状是「两条平行线夹一条走廊」,直线一根画不出两根的事。",
          },
          {
            q: "把两层线性叠起来(第二层读第一层的得数),表达力涨了吗?",
            options: [
              "涨了:两层看得比一层深",
              "没涨:w₂·(w₁·x) = (w₂·w₁)·x,两个旋钮并成一个,叠一百层还是一条直线",
              "涨了,但只有叠偶数层才涨",
            ],
            answer: 1,
            explain:
              "线性套线性还是线性(仿射复合仍仿射)——所以「层数买复杂度」这句话有个隐含前提:层与层之间必须有弯折。真网络每层卷积后面都跟一道 ReLU,就是在兑现这个前提。",
          },
          {
            q: "ReLU(t) + ReLU(−t) 等于什么?这条恒等式在部件一里干成了什么事?",
            options: [
              "等于 t;什么都不干",
              "等于 |t|;两个镜像弯折拼出 V 形谷——v=|x−y| 把「均衡」两点留在谷底(v=0)、「一边倒」两点推上谷坡(v=1),两条平行线 v=½ 一刀分开",
              "等于 2t;把分数放大一倍",
            ],
            answer: 1,
            explain:
              "ReLU(t)=正半条射线、ReLU(−t)=负半条(镜像),相加正好拼成 V。v=|x−y| 的等值线是平行于对角线的直线族,v=½ 那两条把「否」点夹在走廊里、「是」点推到外侧——XOR 就这么被两个弯折切开。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 5-1 · XOR 切分器:一挡一挡看直线怎么失败 ============ */

const PW = 300, PH = 252, PPL = 40, PPR = 14, PPT = 14, PPB = 38
const GMIN = -0.35, GMAX = 1.35
const gx = (x: number) => PPL + ((x - GMIN) / (GMAX - GMIN)) * (PW - PPL - PPR)
const gy = (y: number) => PH - PPB - ((y - GMIN) / (GMAX - GMIN)) * (PH - PPT - PPB)

type Mode = "line" | "one" | "two"

function XorCutter() {
  const [mode, setMode] = useState<Mode>("line")
  const [angle, setAngle] = useState(45) // 直线角度(度)
  const [off, setOff] = useState(0.5) // 直线离原点的法向距离
  const [theta, setTheta] = useState(0) // 一个弯折的半平面阈值:x−y>θ

  const rad = (angle * Math.PI) / 180
  const nx = -Math.sin(rad), ny = Math.cos(rad) // 法向
  const side = (x: number, y: number) => nx * x + ny * y - off
  // 直线的两种定向都试,取错得少的
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

  // 直线两端(画面外各延 2 单位,根部裁掉)
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
        <span className="mini-label">部件 · XOR 切分器:谁切开了「一边倒」</span>
        <span className="seg" data-qa="xor-mode">
          <button type="button" className={`seg-btn ${mode === "line" ? "active" : ""}`}
            onClick={() => setMode("line")}>
            一条直线
          </button>
          <button type="button" className={`seg-btn ${mode === "one" ? "active" : ""}`}
            onClick={() => setMode("one")}>
            一个弯折
          </button>
          <button type="button" className={`seg-btn ${mode === "two" ? "active" : ""}`}
            onClick={() => setMode("two")}>
            两个弯折
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
                {/* 半平面 x−y>θ 涂色:{ReLU(x−y)>0} 永远是折痕一侧的半张面。
                    带状多边形沿分界线向 +x 方向铺,伸出画面的部分由 svg 根部裁掉 */}
                <polygon
                  points={`${gx(theta)},${gy(GMIN)} ${gx(theta + GMAX - GMIN)},${gy(GMAX)} ${gx(theta + GMAX - GMIN + 3)},${gy(GMAX)} ${gx(theta + 3)},${gy(GMIN)}`}
                  style={{ fill: "var(--accent)" }} opacity={0.08} />
                <polyline
                  points={`${gx(theta + GMIN - 0.1)},${gy(GMIN - 0.1)} ${gx(theta + GMAX - 0.1)},${gy(GMAX - 0.1)}`}
                  fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2.2} />
                <text x={gx(1.12)} y={gy(0.28)} fontSize={9.5} style={{ fill: "var(--fg-faint)" }}>
                  折痕 x=y
                </text>
              </g>
            )}
            {mode === "two" && (
              <g data-qa="xor-two">
                {/* 走廊 |x−y|<½:两条平行线之间涂色,「否」点躺在里面 */}
                <polygon
                  points={`${gx(GMIN - 0.1)},${gy(GMIN - 0.6)} ${gx(GMAX)},${gy(GMAX + 0.5)} ${gx(GMAX)},${gy(GMAX - 0.5)} ${gx(GMIN - 0.1)},${gy(GMIN + 0.4)}`}
                  style={{ fill: "var(--accent)" }} opacity={0.08} />
                <polyline
                  points={`${gx(GMIN - 0.1)},${gy(GMIN - 0.6)} ${gx(GMAX)},${gy(GMAX + 0.5)}`}
                  fill="none" strokeDasharray="5 4" style={{ stroke: "var(--accent)" }}
                  strokeWidth={1.8} />
                <polyline
                  points={`${gx(GMIN - 0.1)},${gy(GMIN + 0.4)} ${gx(GMAX)},${gy(GMAX - 0.5)}`}
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
              <div className="mini-label">转直线:{angle}°</div>
              <input type="range" min={0} max={180} step={1} value={angle}
                onChange={(e) => setAngle(Number(e.target.value))} aria-label="直线角度"
                style={{ ["--fill" as string]: `${(angle / 180) * 100}%` }} />
              <div className="mini-label mt-3">挪直线:{off.toFixed(2)}</div>
              <input type="range" min={-1} max={2} step={0.05} value={off}
                onChange={(e) => setOff(Number(e.target.value))} aria-label="直线位置"
                style={{ ["--fill" as string]: `${((off + 1) / 3) * 100}%` }} />
              <div className="reveal-box mt-3">
                <p className="num text-lg font-bold">
                  最好也分错 <span style={{ color: "var(--accent-deep)" }}>{errLine}</span> 个点
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  转满一圈、挪遍全程:两个「一边倒」斜对角,两个「均衡」也斜对角——
                  直线把这对分开,那对必撞车。这就是线性天花板,不是权重不够,
                  是「直」这个形状不行。
                </p>
              </div>
            </div>
          )}
          {mode === "one" && (
            <div data-qa="xor-one-ctl">
              <div className="mini-label">半平面阈值:x−y &gt; {theta.toFixed(2)}</div>
              <input type="range" min={-1.3} max={1.3} step={0.05} value={theta}
                onChange={(e) => setTheta(Number(e.target.value))} aria-label="阈值"
                style={{ ["--fill" as string]: `${((theta + 1.3) / 2.6) * 100}%` }} />
              <div className="reveal-box mt-3">
                <p className="num text-lg font-bold">
                  最好也分错 <span style={{ color: "var(--accent-deep)" }}>{errOne}</span> 个点
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  v = ReLU(x−y) 只有一道折痕:{">"}阈值的部分永远是折痕一侧的
                  <strong>半张面</strong>——半张面还是直线分界,天花板没破。
                  一个折痕不够,两个刚好。
                </p>
              </div>
            </div>
          )}
          {mode === "two" && (
            <div className="reveal-box" data-qa="xor-two-read">
              <div className="mini-label">v = ReLU(x−y) + ReLU(y−x) = |x−y|</div>
              <table className="mt-2 w-full text-sm">
                <tbody className="num">
                  <tr><td>(0,0) 均衡</td><td>|0−0| =</td><td><strong>0</strong></td><td>谷底 ✓</td></tr>
                  <tr><td>(1,1) 均衡</td><td>|1−1| =</td><td><strong>0</strong></td><td>谷底 ✓</td></tr>
                  <tr><td>(1,0) 一边倒</td><td>|1−0| =</td><td><strong>1</strong></td><td>谷坡 ✓</td></tr>
                  <tr><td>(0,1) 一边倒</td><td>|0−1| =</td><td><strong>1</strong></td><td>谷坡 ✓</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                两个镜像弯折拼出 V 形谷:分类面 v=½ 是两条平行线——
                <strong>两个「均衡」躺在走廊里(v=0),两个「一边倒」各被一条线
                推到外侧(v=1)</strong>。一条线画不出「两侧各留一个」的形状,
                两条刚好各管一边。这就是「两个弯折」的全部构造。
              </p>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            棋盘话头:x、y 是同一扇窗里两边的三连数——「差距大不大」这件事,
            天生就是 |x−y| 的 V 形。棋理里的「且」「恰好」「先跌后涨」,
            全是这道弯折的亲戚。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 5-1</span>
        一层结构,两个镜像单元:h₁=ReLU(x−y)、h₂=ReLU(y−x),v=h₁+h₂。
        四点逐值验证在右表——不是一个 ReLU(半平面切不开),是两个(走廊刚好)。
      </figcaption>
    </figure>
  )
}

/* ============ 部件 5-2 · 折线拼形:ReLU(t)+ReLU(−t)=|t| ============ */

const FW = 128, FH = 116, FPL = 24, FPR = 8, FPT = 10, FPB = 22
const fx = (t: number) => FPL + ((t + 3) / 6) * (FW - FPL - FPR)
const fy = (v: number) => FH - FPB - (v / 3) * (FH - FPT - FPB)

function FoldSum() {
  const [t, setT] = useState(2)

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
        <span className="mini-label">部件 · 折线拼形:两条半射线,拼一个 V</span>
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
          <div className="mini-label">拖 t(−3 → 3)</div>
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
            ReLU({t.toFixed(1)}) + ReLU(−{t.toFixed(1)}) ={" "}
            {relu(t).toFixed(1)} + {relu(-t).toFixed(1)} ={" "}
            <strong style={{ color: "var(--accent-deep)" }}>{reluAbs(t).toFixed(1)}</strong>
            {"   "}(|t| = {Math.abs(t).toFixed(1)})
          </p>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            负分区归零 = 半条射线:ReLU(t) 只留右半边,ReLU(−t) 只留左半边,
            一拼就是 V。亲手拖到三个验算点:t=2 → 2+0=2;t=−3 → 0+3=3;
            t=0 → 0+0=0。上一部件切开 XOR 的 v=|x−y|,就是这个恒等式换上
            棋盘的轴。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 5-2</span>
        折线拼形的原子操作:每道 ReLU 贡献半条射线(带一个折点),
        N 道拼出 N 段折线——真网络 7 层的「先计票再弯折」层层重复,
        折线越拼越碎,能拼的形状指数级变多(第 9 课见真家伙)。
      </figcaption>
    </figure>
  )
}
