/** 第 5 课 · 非线性变换：直线画不出的形状(地基篇 3/4)。
 *  节拍：思考题(一边倒判断，线性学得会吗)→ 直线极限 / 线性叠线性 / ReLU 折痕
 *  → 例 5-1(XOR 切分器：一条直线/一个非线性变换/两个非线性变换三挡对比，|x−y| 构造)
 *  → 例 5-2(折线拼形：ReLU(t)+ReLU(−t)=|t| 徒手拖)→ 求和之后再变换
 *  → 对证(model.py 卷积求和之后接非线性变换)→ ChapterEnd → 习题。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
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
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 5 课</div>
      <h1 className="text-2xl font-bold">非线性变换：直线画不出的形状</h1>

      <LessonGuide
        question="为什么网络不能只做乘法和加法，还要在层与层之间「弯一下」？"
        why="只会乘加的计算再叠很多层，本质仍是直线；棋盘上有些「两个条件同时成立」或「恰好一方占优」的形状，直线永远分不开。"
        chain={[
          "乘加先把特征汇成直线式的分数",
          "有些分类图形无法用一条直线切开",
          "ReLU 把负分截为 0，给直线加一道折痕",
          "加权求和与非线性变换交替叠起来，机器才能拼出复杂棋形",
        ]}
        takeaway="ReLU 不是魔法名词：它只做「正数通过，负数归零」，却让多层网络能表示直线画不出的边界。"
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
        <h3>直线分不开斜对角交错的四点</h3>
        <p>
          把思考题里的判断写成两个输入：<span className="mono">x</span> 是我方三连数、
          <span className="mono">y</span> 是对方三连数。(0,0) 和 (1,1) 两边一样多，都属
          「均衡」；(1,0) 和 (0,1) 恰好一方占优，都属「一边倒」。只做乘和加的机器，
          把「分数够不够高」当作判类标准时，在二维纸上画出的边界总是一条直线。可这两组点
          斜对角交错：无论怎样画一刀直线，都不能把其中一组完整留在一边、
          另一组完整留在另一边。先接受这个四点反例；例 5-1 会让你转动直线，亲眼验证至少会分错一个点。
        </p>
        <Def term="异或" en="exclusive or,缩写 XOR">
          两个输入不同时才为「是」的逻辑关系，程序员熟悉的位运算 ⊕ 就是它的真值表。
          上面四点正是异或的几何形状：(1,0)、(0,1) 是「是」，(0,0)、(1,1) 是「否」。
          它是最小的直线不可分例子，本课用它代表一切拐弯才分得开的判断。
        </Def>
        <p>
          这个四点形状在棋理里有真实对应：「差距大不大」天生只看
          <span className="mono">|x−y|</span>，两边差得越多越一边倒。棋理里的
          「两个条件同时成立」（即「且」）、「恰好一方占优」（即「恰好」）、「先跌后涨」都属于同一类拐弯判断。
        </p>

        <h3>线性叠线性仍然是一层</h3>
        <p>
          多叠几层乘加也不会自己变弯。本例没有外加固定数时，
          <span className="mono">w₂(w₁x)=(w₂w₁)x</span>，两层可合成一层（写成矩阵也是同一结论：线性映射的复合仍是线性映射）：两个权重相乘
          仍是一个权重。即使每层还多加一个固定数，结果仍然是一条直线。
          <span className="mono">w₂(w₁x+b₁)+b₂=(w₂w₁)x+(w₂b₁+b₂)</span>，
          合并后还是「一个权重乘 x、再加一个固定数」的形状。
        </p>
        <Def term="偏置" en="bias">
          加在加权求和结果上的固定数，不与任何特征相配对。每个加权和的输出各有一个；
          卷积层里每通道一个、沿棋盘各处共享（和权重在各处重复使用是同一套路）。它移动分界线的位置：
          权重决定直线的方向，偏置决定直线平移多远。字母 b 只为在式子里和权重 w 区分角色。
          偏置也是训练学出来的数字，但它本身不改变「线性还是线性」这个事实。
          本项目的卷积层不带偏置(bias=False)，这份平移由批标准化的 β 承担（参见：第 8 课）。
        </Def>
        <p>
          所以「层多」要产生新能力，层与层之间必须插入会改变形状的步骤。若把非线性全挪到最后只做一次，前面各层仍是线性、可以并成一层，整个网络只剩一道折痕，和单个 ReLU 一样分不开那四个点；所以弯要弯在每层之后。
        </p>

        <h3>ReLU 在直线上压出一道折痕</h3>
        <p>
          插在层与层之间的这道工序，正式名字是激活函数。它对加权求和的总分做一次
          非线性的取舍：总分够正才「激活」放行，否则压成 0。
        </p>
        <Def term="激活函数" en="activation function">
          接在加权求和之后、对总分做非线性变换的函数。没有它，多少层线性都能合并成一层；
          有了它，网络的表示能力才随层数增加。
        </Def>
        <p>
          最常用的激活函数是 ReLU，规则很短：<span className="mono">ReLU(s)</span> 在
          s 为正时原样通过，s 为 0 或负时输出 0。于是原本的一条直线被压出折点，变成折线。
        </p>
        <Def term="ReLU" en="Rectified Linear Unit,线性整流单元">
          <span className="mono">ReLU(s) = max(0, s)</span>：正数通过，负数归零。
          它只添一个折点，折点两侧的梯度都是常数，几十层叠起来也好算；折点本身没有唯一斜率（不可导），实现上约定此处导数取 0（即门=0），PyTorch 同此约定，有了约定后面的链式法则才写得严格；
          一次比较就完成计算，是最省事的非线性变换。
        </Def>
        <p>
          两个镜像折痕还能拼成绝对值（不管正负，只留大小）：
          <span className="mono">ReLU(t)+ReLU(−t)=|t|</span>。
          例如 t=−3 时得到 0+3=3。把 t 设成「两边三连数的差」，就有
          <span className="mono">v=|x−y|</span>：差得越多，一边倒那两点的 v 越大。
          <span className="mono">ReLU(x−y)</span> 和 <span className="mono">ReLU(y−x)</span>
          各守一道折痕，一个不够切开四点，两个刚好把「均衡」夹进带状区域（两条平行线之间的带）。
        </p>
      </div>

      <XorCutter />

      <FoldSum />

      <div className="prose mt-8">
        <h3>非线性变换接在加权求和之后</h3>
        <p>
          网络先把多个特征加权求和成一个分数，再对这个总分做 ReLU；不是把每个格子
          单独做非线性变换。重复「加权求和 → 非线性变换」，才可以逐层拼出复杂形状：
          每道 ReLU 贡献半条线和一个折点，折线越拼越碎，能表示的边界随之迅速变丰富。
          真实网络把这套次序重复许多层，才把许多折线组合成复杂判断。
        </p>
      </div>

      <Ledger title="model.py · 怎样把 ReLU 接在乘加之后">
        <div className="codewalk">
          <pre>{`# model.py L19-21  残差块(residual block,卷积与非线性叠成的一小段):卷积(求和)→ BN(批标准化)→ 非线性变换
h = F.relu(self.bn1(self.conv1(x)))   # conv 加权求和，再整体 ReLU
...
return F.relu(x + h)                  # 出口再做一次非线性变换(h=这一小段的输出，加回输入 x)

# model.py L32-36  stem 同款：第一层也是先加权求和再非线性变换
self.stem = nn.Sequential(
    nn.Conv2d(3, channels, 3, padding=1, bias=False),
    nn.BatchNorm2d(channels),
    nn.ReLU(),                         # ← 非线性变换在最后一道
)`}</pre>
        </div>
        <p className="mt-3">
          对照这两处真实路径：卷积先完成一整次乘加，BN 调整尺度，ReLU 再处理
          得到的总分；残差块出口则先算 <span className="mono">x+h</span>，再非线性变换。
          因此本课公式对应的是「线性结果之后的非线性」，而不是把每个乘积分别截断。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "只做乘加的分界永远是直线；两个权重相乘仍是一个权重，偏置只移动分界线，线性叠线性不增加表示能力。",
          "激活函数接在加权求和之后改变形状；ReLU 是「正数通过、负数归零」的一道折痕。",
          "ReLU(t)+ReLU(−t)=|t|，两道镜像折痕拼出 V 形，用两条平行线把「均衡 / 一边倒」四点分开。",
          "变换的次序是先加权求和、再非线性变换，两者交替重复才能拼出复杂棋形。",
        ]}
        next={
          <>
            复杂棋形从哪里读进来，取决于棋盘怎么送。下一课把同一份棋盘事实拆成三张图：
            己方子一张、对方子一张、先后手身份一张。三张平面并排才是网络真正读到的输入；
            届时再看：己/敌平面与这两道镜像折痕是同一手法（一对 ReLU 各管半边），但作用对象不同：这里作用在 x−y 上，那里作用在单格符号上。
          </>
        }
      />

      <Quiz
        title="习题 · 过关解锁第 6 课"
        onAllCorrect={() => pass("l05")}
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
              "在例 5-1 里把直线怎么转怎么挪，最好也分错一个。这不是权重数量问题，是形状问题：直线没有折痕。要切开的形状是「两条平行线夹一条带状区域」，直线一根画不出两根的事。",
          },
          {
            q: "把两层线性叠起来（第二层读第一层的得分），表示能力涨了吗？",
            options: [
              "涨了：两层看得比一层深",
              "没涨：w₂·(w₁·x) = (w₂·w₁)·x，两个权重并成一个，叠一百层还是一条直线",
              "涨了，但只有叠偶数层才涨",
            ],
            answer: 1,
            explain:
              "线性套线性还是线性，所以「多叠几层就更厉害」这句话有个前提：层与层之间必须有非线性变换。真网络每个残差块里，conv1 走「卷积→批标准化→非线性变换」、conv2 只到批标准化，块出口再对 x+h 做一次非线性变换（残差块与批标准化，参见：第 8 课），就是在照这个前提做。",
          },
          {
            q: "ReLU(t) + ReLU(−t) 等于什么？这条恒等式在例 5-1 里干成了什么事？",
            options: [
              "等于 t；什么都不干",
              "等于 |t|；两个镜像 ReLU 拼出 V 形：v=|x−y| 把「均衡」两点留在最低点、「一边倒」两点推上两侧坡面；两条平行线 v=½ 从两侧夹开（0 与 1 之间任取，½ 最简）",
              "等于 2t；把分数放大一倍",
            ],
            answer: 1,
            explain:
              "ReLU(t) 只留从折点向右的半条线、ReLU(−t) 只留向左的半条（照镜子反过来），相加正好拼成 V。最低点的「均衡」两点各是 v=0，坡上的「一边倒」两点各是 v=1。把 v 相同的点连起来，是一条条跟对角线平行的线；判类规则是 v>½ 判「一边倒」、v≤½ 判「均衡」；本例四点的 v 只有 0 和 1，永远不会落在界上。v=½ 那两条把「均衡」点夹在带状区域里、「一边倒」点推到外侧（能一刀分开，是因为 V 形把斜对角两点折到了同一高度）。这道四点反例（异或）就这么被两个非线性变换切开。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 5-1 · XOR 切分器：一挡一挡看直线怎么失败 ============ */

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
        <span className="mini-label">例 5-1 · 异或切分器：谁切开了「一边倒」</span>
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
                {/* 半平面 x−y>θ 涂色：{ReLU(x−y)>0} 永远是折痕一侧的半平面。
                    带状多边形沿分界线向 +x 方向铺，伸出画面的部分由 svg 根部裁掉 */}
                <polygon
                  points={`${gx(theta)},${gy(GMIN)} ${gx(theta + GMAX - GMIN)},${gy(GMAX)} ${gx(theta + GMAX - GMIN + 3)},${gy(GMAX)} ${gx(theta + 3)},${gy(GMIN)}`}
                  style={{ fill: "var(--accent)" }} opacity={0.08} />
                <polyline
                  points={`${gx(theta + GMIN - 0.1)},${gy(GMIN - 0.1)} ${gx(theta + GMAX - 0.1)},${gy(GMAX - 0.1)}`}
                  fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2.2} />
                <text x={PW - PPR} y={gy(0.28)} fontSize={9.5} textAnchor="end" style={{ fill: "var(--fg-faint)" }}>
                  折痕 x−y={theta.toFixed(2)}
                </text>
              </g>
            )}
            {mode === "two" && (
              <g data-qa="xor-two">
                {/* 带状区域 |x−y|<½:两条平行线之间涂色，「否」点躺在里面 */}
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
                  直线分对「一边倒」那对，就分错「均衡」那对。这就是线性的极限，不是权重不够，
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
                  v = ReLU(x−y) 只有一道折痕，折痕固定在 x−y=0。你拖的 θ 只是判类界线：
                  过了 θ 的部分，永远占着折痕一侧的<strong>半平面</strong>（半个坐标面）。
                  半平面还是直线分界，极限没破。一个折痕不够，两个刚好。
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
                两个镜像 ReLU 拼出 V 形：分界线 v=½ 是两条平行线，
                <strong>两个「均衡」躺在带状区域里(v=0)，两个「一边倒」各被一条线
                推到外侧(v=1)</strong>。一条线画不出「两侧各留一个一边倒点」的形状，
                两条刚好各管一边。这就是「两个非线性变换」的全部构造。
              </p>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            回到棋盘：x、y 是同一扇窗里两边的三连数，「差距大不大」这件事，
            天生就是 |x−y| 的 V 形。棋理里的「且」「恰好」「先跌后涨」，
            全是这道非线性变换的亲戚。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 5-1</span>
        <strong>教学构造：</strong>一个隐藏层、两个镜像单元（h₁/h₂ 的 (1,−1) 镜像权重是为看清原理摆的；真实网络里这种组合由训练自己找到，没有人手摆权重（第 7 课的真实卷积核可验证））：h₁、h₂ 是两个隐藏单元（hidden unit：中间层里做一次乘加再过一道 ReLU 的计算单元），各守一道折痕，
        h₁=ReLU(x−y)、h₂=ReLU(y−x),v=h₁+h₂。
        四点逐值验证在右表：不是一个 ReLU(半平面切不开),而是两个(带状区域刚好够用)。
      </figcaption>
    </figure>
  )
}

/* ============ 例 5-2 · 折线拼形：ReLU(t)+ReLU(−t)=|t| ============ */

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
        <span className="mini-label">例 5-2 · 折线拼形：两段半截线，拼一个 V</span>
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
            负分区归零 = 半条线：ReLU(t) 只留右半边，ReLU(−t) 只留左半边，
            一拼就是 V。亲手拖到三个验算点：t=2 → 2+0=2；t=−3 → 0+3=3；
            t=0 → 0+0=0。例 5-1 切开异或的 v=|x−y|，就是这个恒等式换上
            棋盘的轴。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 5-2</span>
        <strong>教学构造：</strong>折线拼形的最基本一招：每道 ReLU 贡献半条线（带一个折点），
        几道 ReLU 就拼出几段折线。真实网络把「先加权求和再非线性变换」层层重复，
        折线越拼越碎，能拼的形状成倍增加。
      </figcaption>
    </figure>
  )
}
