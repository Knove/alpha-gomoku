/** 第叁章 · 一个网络,回答两个问题
 *  图 3-1 结构漫游(悬停高亮 / 点击钉住的 SVG 数据流,教学示意)
 *  图 3-2 高光手现场(REAL 第 3 轮真实对局的搜索后分布与根估值) */
import { useMemo, useState } from "react"
import ChapterHeader from "../components/ChapterHeader"
import Reveal from "../lib/reveal"
import GomokuBoard from "../lib/board"
import { REAL } from "../data/real"
import { coordLabel, fmtPct, fmtFloat, fmtInt } from "../lib/format"

/* ---------------- 图 3-1 数据:模块 / 连线 / 说明 ---------------- */

type ModuleId =
  | "input"
  | "stem"
  | "res"
  | "p_conv"
  | "p_fc"
  | "v_conv"
  | "v_fc"
  | "v_tanh"

const MOD_H = 84

interface Mod {
  id: ModuleId
  x: number
  y: number
  w: number
  name: string
  shape: string
}

/** 布局坐标(viewBox 1210×430)。主干 y=173..257,策略支 y=60..144,价值支 y=286..370。 */
const MODS: Mod[] = [
  { id: "input", x: 16, y: 173, w: 150, name: "输入平面", shape: "3 × 9 × 9" },
  { id: "stem", x: 216, y: 173, w: 180, name: "3×3 卷积 + BN + ReLU", shape: "64 × 9 × 9" },
  { id: "res", x: 446, y: 173, w: 180, name: "残差块 × 4", shape: "64 × 9 × 9" },
  { id: "p_conv", x: 736, y: 60, w: 180, name: "1×1 卷积", shape: "2 × 9 × 9" },
  { id: "p_fc", x: 966, y: 60, w: 198, name: "全连接 FC", shape: "81 logits" },
  { id: "v_conv", x: 736, y: 286, w: 150, name: "1×1 卷积", shape: "1 × 9 × 9" },
  { id: "v_fc", x: 916, y: 286, w: 130, name: "全连接 FC", shape: "64" },
  { id: "v_tanh", x: 1076, y: 286, w: 88, name: "tanh", shape: "1" },
]

interface Edge {
  id: string
  d: string
  tip: [number, number]
}

const EDGES: Edge[] = [
  { id: "e1", d: "M166,215 H216", tip: [216, 215] },
  { id: "e2", d: "M396,215 H446", tip: [446, 215] },
  { id: "e3", d: "M626,215 H676", tip: [676, 215] },
  { id: "e4", d: "M676,215 C706,215 706,102 736,102", tip: [736, 102] },
  { id: "e5", d: "M916,102 H966", tip: [966, 102] },
  { id: "e6", d: "M676,215 C706,215 706,328 736,328", tip: [736, 328] },
  { id: "e7", d: "M886,328 H916", tip: [916, 328] },
  { id: "e8", d: "M1046,328 H1076", tip: [1076, 328] },
  { id: "e9", d: "M1164,102 H1198", tip: [1198, 102] },
  { id: "e10", d: "M1164,328 H1198", tip: [1198, 328] },
]

/** 模块 → 与其直接相连的连线(用于悬停高亮前后连线)。 */
const ADJ: Record<ModuleId, string[]> = {
  input: ["e1"],
  stem: ["e1", "e2"],
  res: ["e2", "e3"],
  p_conv: ["e4", "e5"],
  p_fc: ["e5", "e9"],
  v_conv: ["e6", "e7"],
  v_fc: ["e7", "e8"],
  v_tanh: ["e8", "e10"],
}

const INFO: Record<ModuleId, { title: string; shape: string; desc: string; code: { ref: string; snippet: string } }> = {
  input: {
    title: "输入平面",
    shape: "3 × 9 × 9",
    desc: "三张「棋盘照片」叠在一起:己方子一张、对方子一张、行棋方颜色面一张——黑方行棋整张填 1,白方行棋整张填 0。",
    code: {
      ref: "game.py L111-117 · encode(game)",
      snippet:
        "def encode(game: Game) -> np.ndarray:\n" +
        "    canon = game.canonical_board()\n" +
        "    cur = (canon == 1).astype(np.float32)\n" +
        "    opp = (canon == -1).astype(np.float32)\n" +
        "    color = np.full_like(cur, 1.0 if game.current_player == BLACK else 0.0)  # 黑方行棋 → 全 1\n" +
        "    return np.stack([cur, opp, color])",
    },
  },
  stem: {
    title: "3×3 卷积 + BN + ReLU",
    shape: "64 × 9 × 9",
    desc: "3×3 卷积核滑过全盘,把 3 个通道织成 64 个通道的局部棋形特征;BN 把特征分布拉回标准形状稳住训练,ReLU 引入非线性。",
    code: {
      ref: "model.py L32-36 · AlphaGomokuNet.__init__",
      snippet:
        "self.stem = nn.Sequential(\n" +
        "    nn.Conv2d(3, channels, 3, padding=1, bias=False),\n" +
        "    nn.BatchNorm2d(channels),\n" +
        "    nn.ReLU(),\n" +
        ")",
    },
  },
  res: {
    title: "残差块 × 4",
    shape: "64 × 9 × 9",
    desc: "每块两层 3×3 卷积,外加一条捷径把输入原样加回输出——每层只需学「修正量」,网络加深也不怕学不动。四块串联,视野从局部棋形扩展到全局大势。",
    code: {
      ref: "model.py L18-21 · ResBlock.forward",
      snippet:
        "def forward(self, x: torch.Tensor) -> torch.Tensor:\n" +
        "    h = F.relu(self.bn1(self.conv1(x)))\n" +
        "    h = self.bn2(self.conv2(h))\n" +
        "    return F.relu(x + h)   # 捷径:x 原样加回",
    },
  },
  p_conv: {
    title: "策略头 · 1×1 卷积",
    shape: "2 × 9 × 9",
    desc: "逐点把 64 个通道压成 2 个,不改变棋盘的宽与高,为逐点打分做准备。",
    code: {
      ref: "model.py L39-40 · policy head",
      snippet:
        "self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)  # 1×1\n" +
        "self.p_bn = nn.BatchNorm2d(2)",
    },
  },
  p_fc: {
    title: "策略头 · 全连接",
    shape: "81",
    desc: "把 2×9×9 展平后线性映射成 81 个 logits——棋盘上每个交叉点一个原始分数;过 softmax 就是概率 p(先验),回答「下哪」。",
    code: {
      ref: "model.py L41 + L82 · logits → softmax",
      snippet:
        "self.p_fc = nn.Linear(2 * self.n * self.n, self.n * self.n)\n" +
        "# 推理时(model.py L82):\n" +
        "probs = torch.softmax(logits, dim=-1)",
    },
  },
  v_conv: {
    title: "价值头 · 1×1 卷积",
    shape: "1 × 9 × 9",
    desc: "把 64 个通道压成 1 个,提炼出一张「全局形势图」。",
    code: {
      ref: "model.py L43-44 · value head",
      snippet:
        "self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)  # 1×1\n" +
        "self.v_bn = nn.BatchNorm2d(1)",
    },
  },
  v_fc: {
    title: "价值头 · 全连接 + ReLU",
    shape: "64",
    desc: "把形势图浓缩成 64 维的局面判断向量。",
    code: {
      ref: "model.py L45-46 · value head",
      snippet:
        "self.v_fc1 = nn.Linear(self.n * self.n, 64)\n" +
        "self.v_fc2 = nn.Linear(64, 1)",
    },
  },
  v_tanh: {
    title: "价值头 · tanh",
    shape: "1",
    desc: "最终只剩一个数,被 tanh 压进 [−1, +1]:+1 表示当前行棋方必胜,−1 必败。回答「谁占优」,让搜索不必模拟到终局。",
    code: {
      ref: "model.py L54 · forward",
      snippet:
        "v = torch.tanh(self.v_fc2(v)).squeeze(-1)",
    },
  },
}

/** 脉动光点:输入 → 主干 → 分岔,一路至策略头尽头,一路至价值头尽头(双头都点亮)。 */
const DOT_PATH_P = "M16,215 H676 C706,215 706,102 736,102 H1198"
const DOT_PATH_V = "M16,215 H676 C706,215 706,328 736,328 H1198"

/* ---------------- 图 3-1:结构漫游 ---------------- */

function ArchDiagram() {
  const [hover, setHover] = useState<ModuleId | null>(null)
  const [pin, setPin] = useState<ModuleId | null>(null)
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const active = hover ?? pin

  return (
    <div
      style={{
        display: "flex",
        gap: "1.2rem",
        flexWrap: "wrap",
        padding: "1.3rem 1.3rem 1.1rem",
      }}
    >
      <div style={{ flex: "1 1 640px", minWidth: 0, overflowX: "auto" }}>
        <div style={{ minWidth: 640 }}>
        <svg
          viewBox="0 0 1210 430"
          style={{ width: "100%", height: "auto", display: "block" }}
          role="group"
          aria-label="网络结构漫游:输入平面经共享主干分岔为策略头与价值头"
          onClick={() => setPin(null)}
        >
          {/* 连线(先画,垫在模块下面) */}
          {EDGES.map((e) => {
            const on = active != null && ADJ[active].includes(e.id)
            const stroke = on ? "var(--accent)" : "var(--hairline-strong)"
            return (
              <g
                key={e.id}
                opacity={active != null && !on ? 0.35 : 1}
                style={{ transition: "opacity 160ms ease" }}
              >
                <path
                  d={e.d}
                  fill="none"
                  style={{ stroke, transition: "stroke 160ms ease" }}
                  strokeWidth={on ? 2.4 : 1.6}
                />
                <polygon
                  points={`${e.tip[0]},${e.tip[1]} ${e.tip[0] - 7},${e.tip[1] - 4} ${e.tip[0] - 7},${e.tip[1] + 4}`}
                  style={{ fill: stroke, transition: "fill 160ms ease" }}
                />
              </g>
            )
          })}

          {/* 分岔点 */}
          <circle cx={676} cy={215} r={4.5} style={{ fill: "var(--fg-faint)" }} />

          {/* 脉动光点×2,分赴策略头与价值头;reduced-motion 时静止在分岔点 */}
          {reduced ? (
            <circle cx={676} cy={215} r={5.5} style={{ fill: "var(--accent)" }} opacity={0.75} />
          ) : (
            <>
              <circle r={5.5} style={{ fill: "var(--accent)" }}>
                <animateMotion dur="4.6s" repeatCount="indefinite" path={DOT_PATH_P} />
                <animate
                  attributeName="opacity"
                  values="0;0.9;0.9;0"
                  keyTimes="0;0.08;0.9;1"
                  dur="4.6s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle r={5.5} style={{ fill: "var(--accent)" }}>
                <animateMotion dur="5.8s" repeatCount="indefinite" path={DOT_PATH_V} />
                <animate
                  attributeName="opacity"
                  values="0;0.75;0.75;0"
                  keyTimes="0;0.08;0.9;1"
                  dur="5.8s"
                  repeatCount="indefinite"
                />
              </circle>
            </>
          )}

          {/* 分组标注 */}
          <text x={736} y={42} fontSize={11} className="mono"
            style={{ fill: "var(--fg-faint)", letterSpacing: "0.14em" }}>
            策略头 POLICY · 回答「下哪」
          </text>
          <text x={736} y={406} fontSize={11} className="mono"
            style={{ fill: "var(--fg-faint)", letterSpacing: "0.14em" }}>
            价值头 VALUE · 回答「谁占优」
          </text>
          <text x={421} y={290} fontSize={11} textAnchor="middle" className="mono"
            style={{ fill: "var(--fg-faint)", letterSpacing: "0.14em" }}>
            共享主干 RESNET
          </text>
          <text x={1181} y={88} fontSize={13} textAnchor="middle" className="mono"
            style={{ fill: "var(--accent-deep)" }}>
            p
          </text>
          <text x={1181} y={314} fontSize={13} textAnchor="middle" className="mono"
            style={{ fill: "var(--accent-deep)" }}>
            v
          </text>

          {/* 模块 */}
          {MODS.map((m) => {
            const on = active === m.id
            const dim = active != null && !on
            return (
              <g
                key={m.id}
                opacity={dim ? 0.4 : 1}
                style={{ cursor: "pointer", transition: "opacity 160ms ease" }}
                tabIndex={0}
                role="button"
                aria-pressed={pin === m.id}
                aria-label={`${m.name},输出形状 ${m.shape}`}
                onMouseEnter={() => setHover(m.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(m.id)}
                onBlur={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  setPin(pin === m.id ? null : m.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setPin(pin === m.id ? null : m.id)
                  }
                }}
              >
                {m.id === "res" && (
                  <>
                    <rect x={m.x - 9} y={m.y - 9} width={m.w} height={MOD_H} rx={12}
                      style={{ fill: "var(--card)", stroke: "var(--hairline)" }} />
                    <rect x={m.x - 4.5} y={m.y - 4.5} width={m.w} height={MOD_H} rx={12}
                      style={{ fill: "var(--card)", stroke: "var(--hairline)" }} />
                  </>
                )}
                <rect
                  x={m.x}
                  y={m.y}
                  width={m.w}
                  height={MOD_H}
                  rx={12}
                  strokeWidth={on ? 2 : 1.2}
                  style={{
                    fill: on ? "var(--accent-wash)" : "var(--card)",
                    stroke: on ? "var(--accent)" : "var(--hairline-strong)",
                    transition: "fill 160ms ease, stroke 160ms ease",
                  }}
                />
                <text x={m.x + m.w / 2} y={m.y + 33} textAnchor="middle"
                  fontSize={13.5} fontWeight={600} style={{ fill: "var(--fg)" }}>
                  {m.name}
                </text>
                <text x={m.x + m.w / 2} y={m.y + 57} textAnchor="middle"
                  fontSize={11.5} className="mono"
                  style={{ fill: on ? "var(--accent-deep)" : "var(--fg-faint)" }}>
                  {m.shape}
                </text>
                {pin === m.id && (
                  <circle cx={m.x + m.w - 12} cy={m.y + 12} r={3}
                    style={{ fill: "var(--accent)" }} />
                )}
              </g>
            )
          })}
        </svg>
        </div>
      </div>

      {/* 说明卡:悬停预览,点击钉住 */}
      <div style={{ flex: "0 1 258px", minWidth: 216 }}>
        <div className="card" style={{ padding: "1rem 1.1rem", height: "100%" }}>
          {active ? (
            <>
              <div className="mini-label" style={{ marginBottom: "0.4rem" }}>
                {pin === active && hover == null
                  ? "已钉住 · 再点一次取消"
                  : "点击模块可钉住"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.98rem", marginBottom: "0.4rem" }}>
                {INFO[active].title}
              </div>
              <div style={{ marginBottom: "0.55rem" }}>
                <span className="chip accent">输出 {INFO[active].shape}</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.75, color: "var(--fg-muted)" }}>
                {INFO[active].desc}
              </p>
              <div className="codewalk">
                <div className="mini-label" style={{ marginBottom: "0.35rem" }}>
                  {INFO[active].code.ref}
                </div>
                <pre>{INFO[active].code.snippet}</pre>
              </div>
            </>
          ) : (
            <>
              <div className="mini-label" style={{ marginBottom: "0.4rem" }}>结构漫游</div>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.75, color: "var(--fg-muted)" }}>
                数据从左向右流动:三张棋盘平面进入共享主干,末端分岔成两个头。把光标移到任意模块上,查看它的输出张量形状与一句话职责;点击模块可以钉住这张卡片。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- 图 3-2:高光手现场(真实数据) ---------------- */

function HeroInsight() {
  const game = REAL.selfplayGame
  const size = game.board_size
  const idx = REAL.heroIndex
  const hero = game.moves[idx]
  const prev = game.moves[idx - 1]

  /** 高光手落子之前的盘面(由真实着法重建)。 */
  const board = useMemo(() => {
    const b = new Array<number>(size * size).fill(0)
    for (let i = 0; i < idx; i++) {
      const m = game.moves[i]
      b[m.y * size + m.x] = m.player
    }
    return b
  }, [game, size, idx])

  const topMoves = useMemo(
    () => hero.top.map((t) => ({ x: t.x, y: t.y, prob: t.prob })),
    [hero],
  )

  const side = hero.player === 1 ? "黑" : "白"
  const pSide = (hero.rootValue + 1) / 2 // 搜索根估值的展示换算，不是校准胜率
  const pBlack = hero.player === 1 ? pSide : 1 - pSide
  const pWhite = 1 - pBlack
  const empties = size * size - idx
  const restEmpties = empties - hero.top.length
  const visitsTotal = hero.top.reduce((s, t) => s + t.visits, 0)

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        flexWrap: "wrap",
        padding: "1.3rem 1.4rem",
      }}
    >
      <div style={{ flex: "0 1 230px", minWidth: 190 }}>
        <GomokuBoard
          size={size}
          board={board}
          lastMove={{ x: prev.x, y: prev.y }}
          topMoves={topMoves}
          small
        />
        <div className="mini-label" style={{ textAlign: "center", marginTop: "0.5rem" }}>
          高光手之前的盘面 · 轮到{side}棋
        </div>
      </div>

      <div style={{ flex: "1 1 380px", minWidth: 280 }}>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.95rem" }}>
          <span className="chip accent">
            第 <span className="mono">{hero.n + 1}</span> 手 · {side}棋{" "}
            <span className="mono">{coordLabel(hero.x, hero.y)}</span>
          </span>
          <span className="chip">对局 <span className="mono">{game.id}</span></span>
        </div>

        <div className="mini-label" style={{ marginBottom: "0.55rem" }}>
          搜索后的访问分布(共 <span className="mono">{visitsTotal}</span> 次模拟)
        </div>
        {hero.top.map((t, i) => (
          <div
            key={t.action}
            style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "0.55rem" }}
          >
            <span className="mono" style={{ width: "1rem", fontSize: "0.78rem", color: "var(--fg-faint)" }}>
              {i + 1}
            </span>
            <span className="chip" style={{ minWidth: "2.7rem", textAlign: "center" }}>
              {coordLabel(t.x, t.y)}
            </span>
            <span className="prob-track">
              <span
                className="prob-fill"
                style={{ width: `${Math.max(t.prob * 100, 2)}%`, display: "block" }}
              />
            </span>
            <span className="mono" style={{ width: "4.4rem", textAlign: "right", fontSize: "0.85rem" }}>
              {fmtPct(t.prob, 1)}
            </span>
            <span
              className="mono"
              style={{ width: "4.2rem", textAlign: "right", fontSize: "0.75rem", color: "var(--fg-faint)" }}
            >
              {t.visits} 次
            </span>
          </div>
        ))}
        <p style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "var(--fg-muted)", margin: "0.35rem 0 0" }}>
          其余 <span className="mono">{restEmpties}</span> 个空点合计{" "}
          <span className="mono">0</span> 次访问——
          {visitsTotal} 次模拟全部投给了{" "}
          <span className="mono">{coordLabel(hero.x, hero.y)}</span>
          ,搜索在这一手达成了完全共识。
        </p>

        <hr className="hairline-hr" style={{ margin: "1rem 0" }} />

        <div className="mini-label" style={{ marginBottom: "0.55rem" }}>
          搜索根汇总 root_value = <span className="mono">{hero.rootValue >= 0 ? "+" : ""}
          {fmtFloat(hero.rootValue, 3)}</span>({side}棋视角)→ 优势天平
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
          <span className="mono" style={{ width: "4.6rem", textAlign: "right", fontSize: "0.8rem" }}>
            黑 {fmtPct(pBlack, 1)}
          </span>
          <span className="gauge" style={{ flex: 1 }}>
            <span className="g-black" style={{ width: `${pBlack * 100}%` }} />
            <span className="g-white" />
            <span className="g-mid" />
          </span>
          <span className="mono" style={{ width: "4.6rem", fontSize: "0.8rem" }}>
            白 {fmtPct(pWhite, 1)}
          </span>
        </div>
        <p style={{ fontSize: "0.8rem", lineHeight: 1.7, color: "var(--fg-faint)", margin: "0.45rem 0 0" }}>
          这里只把搜索根汇总按 <span className="mono">(root_value+1)/2</span> 线性搬到天平上，
          方便看方向；它不是校准胜率。root_value 站在「当前行棋方」的视角，也不同于网络直接输出的 v_net。
        </p>
      </div>
    </div>
  )
}

/* ---------------- 本章装配 ---------------- */

/** 参数量(按 alphagomoku/model.py 结构逐层清点):默认 64 通道 / 4 残差块,
 *  与本页数据快照的 48 通道 / 3 残差块。 */
const PARAMS_DEFAULT = 316_506
const PARAMS_SNAPSHOT = 145_050

export default function Ch3() {
  return (
    <section id="ch-3">
      <div className="prose-col">
        <ChapterHeader
          no="叁"
          eyebrow="POLICY-VALUE NETWORK"
          title="一个网络,回答两个问题"
        />
      </div>

      <Reveal>
        <div className="prose-col">
          <div className="prose">
            <h3>先把「网络」想明白</h3>
            <p>
              先放下「神经网络」这四个字。把它想成一个装着{" "}
              <span className="mono">{fmtInt(PARAMS_SNAPSHOT)}</span> 个旋钮的函数:
              把 <span className="mono">9×9</span> 的棋盘送进去,它吐出{" "}
              <span className="mono">81</span> 个「下这里」的分数,外加一个「谁占优」的判断。
              上一章已经把局面编码成三张「照片」(己方子、对方子、行棋方颜色面,见{" "}
              <span className="chip mono">game.py L111</span>),这一章,这个{" "}
              <span className="mono">3 × 9 × 9</span> 的张量被送进整个系统唯一的大脑——
              <strong>一个策略-价值网络</strong>(<span className="chip mono">model.py</span>)。
              它一次前向传播,同时回答两个问题:<em>下哪?</em> 和 <em>谁占优?</em>
            </p>
            <p>
              所谓「训练」,就是拿第伍章那沓作业去拧这些旋钮:输出和老师(搜索的 π、终局的 z)
              差多少,就往反方向拧一点点。拧完几千次,这个函数就从乱猜变成了会下五子棋。
              下面先把行话扫掉,再看它长什么样。
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="prose-col">
          <div className="prose">
            <h3>三个名词,扫盲完就够用</h3>
            <p>
              <strong>通道(channel)</strong> 是看同一块棋盘的一个视角。输入的 3 个通道是人给的:
              「我的子在哪」「对手的子在哪」「该谁下」。网络往里又开了几十个通道
              (默认 <span className="mono">64</span>,本页快照 <span className="mono">48</span>),
              不再是人给的视角,而是它自己学出来的——有的盯着「活三」,有的盯着「对手的冲四」。
            </p>
            <p>
              <strong>卷积(convolution)</strong> 是把同一把 <span className="mono">3×3</span>{" "}
              的「尺子」滑过全部 <span className="mono">81</span> 个交叉点,每到一个点量一次。
              尺子只有一把(权重共享),所以同一个棋形无论长在天元还是角落,都触发同一个反应——
              这就是 <span className="chip mono">model.py L33</span> 里的{" "}
              <span className="mono">nn.Conv2d</span>。卷积只是线性加减,叠再多层也只是一次大加减,
              所以每层后面都跟着一个开关:<strong>ReLU</strong>,正数放行、负数归零
              (<span className="chip mono">model.py L35</span>)。
              这一个开关,让网络能把棋盘「弯折」出任意复杂的判断边界。
            </p>
            <p>
              <strong>残差(residual)</strong> 是给每两层卷积加一条「捷径」:输入{" "}
              <span className="mono">x</span> 原样加回输出(<span className="chip mono">model.py L21</span>{" "}
              的 <span className="mono">x + h</span>)。于是每层只需学「在现有判断上修正一点」,
              而不是从头重学,网络加深了也不会越训越差。每个卷积之后的{" "}
              <strong>BN(批归一化)</strong> 则把每一批特征的分布拉回标准形状,让训练又快又稳。
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="figure-col" style={{ margin: "2.2rem auto" }}>
          <figure className="figure" style={{ margin: 0 }}>
            <ArchDiagram />
            <figcaption className="figure-cap">
              <span className="cap-no">图 3-1</span>
              <span>
                结构漫游:数据沿主干向右,末端分岔为策略头与价值头;两枚光点沿两条支路脉动,分赴双头。悬停任一模块可高亮它与前后连线,点击钉住说明卡。
                <strong>教学示意</strong>:张量形状按仓库默认配置(9×9 棋盘 / 64 通道 / 4 残差块)标注;生成本页真实数据的快照采用更小的{" "}
                <span className="mono">48</span> 通道 / <span className="mono">3</span> 残差块,结构完全相同。
              </span>
            </figcaption>
          </figure>
        </div>
      </Reveal>

      <Reveal>
        <div className="prose-col">
          <div className="prose">
            <p>
              <strong>策略头回答「下哪」。</strong>它先用 <span className="mono">1×1</span>{" "}
              卷积把 <span className="mono">64</span> 个通道压成{" "}
              <span className="mono">2</span> 个(<span className="chip mono">model.py L39</span>),
              展平后经全连接层输出 <span className="mono">81</span> 个 logits
              (<span className="chip mono">model.py L41</span>)——棋盘上每个交叉点一个分数。
              分数还不是概率,过一个 softmax 才是(推理时见{" "}
              <span className="chip mono">model.py L82</span>):
            </p>
            <div className="formula">
              p<sub>i</sub> = e<sup>z<sub>i</sub></sup> / Σ<sub>j</sub> e<sup>z<sub>j</sub></sup>
              {"  "}→{" "}
              <span className="hl">81 个交叉点「下这里」的概率,加起来正好等于 1——已占点的份额,搜索时会屏蔽</span>
            </div>
            <p>
              <strong>价值头回答「谁占优」。</strong>它把通道压到{" "}
              <span className="mono">1</span> 个,经两层全连接浓缩成一个数
              (<span className="chip mono">model.py L45-46</span>),再用 tanh 压进{" "}
              <span className="mono">[−1, +1]</span>(<span className="chip mono">model.py L54</span>):
              <span className="mono">+1</span>{" "}
              表示当前行棋方必胜,<span className="mono">−1</span> 必败,<span className="mono">0</span>{" "}
              附近是均势。注意它的视角——永远是「现在轮到的这一方」;黑白一换手,符号也跟着翻转。
            </p>
            <div className="misconception">
              <div className="m-title">常见误解</div>
              「价值头输出的是黑棋的胜率?」两层都不对。第一,它站在
              <strong>当前行棋方</strong>的视角,不固定于黑或白;第二,它是{" "}
              <span className="mono">[−1, +1]</span> 的期望终局,不是{" "}
              <span className="mono">[0, 1]</span> 的概率——想读胜率,要自己按{" "}
              <span className="mono">(v+1)/2</span> 换算。
            </div>
            <p>
              这样一颗大脑有多重?按默认配置(64 通道 / 4 残差块)把每层权重数一遍,共约{" "}
              <span className="mono">{fmtInt(PARAMS_DEFAULT)}</span> 个参数;生成本页数据的训练快照更小(48 通道 / 3 残差块),只有约{" "}
              <span className="mono">{fmtInt(PARAMS_SNAPSHOT)}</span> 个——一台笔记本的 CPU
              就足以训练。AlphaGo Zero 同骨架的网络约有 4,800 万参数,是这颗快照大脑的三百多倍,
              但「一个网络、两个问题」的骨架一字不差。
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="figure-col" style={{ margin: "2.2rem auto" }}>
          <figure className="figure" style={{ margin: 0 }}>
            <HeroInsight />
            <figcaption className="figure-cap">
              <span className="cap-no">图 3-2</span>
              <span>
                它在高光手上说了什么:左为落子前的盘面(朱砂点是上一手),右为第{" "}
                <span className="mono">10</span> 手(白{" "}
                <span className="mono">E5</span>)得到的两个答案。
                <strong>来自第 3 轮真实训练</strong>(自我对局{" "}
                <span className="mono">sp_000003_000</span>)。必须诚实说明:概率条是该手
                <strong>搜索后</strong>的访问分布,天平是<strong>搜索后</strong>的根估值——网络的原始先验只是搜索的起点,图中已是{" "}
                <span className="mono">40</span> 次模拟放大后的结论。
              </span>
            </figcaption>
          </figure>
        </div>
      </Reveal>

      <Reveal>
        <div className="prose-col">
          <div className="prose">
            <div className="tl-dr">
              <span className="tl-tag">小结</span>
              <div>
                策略头给全盘一个「第一印象」概率 p,价值头给出一个「局势判断」
                v。网络的原始输出记作 p——π 要留给下一章搜索打磨后的分布。
                但单看网络,这两个答案还很粗糙——下一章,蒙特卡洛树搜索将把它们当作起点,用几十次模拟反复打磨,长出远超网络裸输出的棋力。
                想读代码?一条线:<span className="chip mono">game.py</span> 的{" "}
                <span className="mono">encode()</span> 把局面变成{" "}
                <span className="mono">(3,9,9)</span> →{" "}
                <span className="chip mono">model.py</span> 的{" "}
                <span className="mono">forward()</span> 六行走完主干与两个头 →{" "}
                <span className="chip mono">model.py L82</span> 的{" "}
                <span className="mono">softmax</span> 得到概率。照这条线读,这一章就在你的代码里活过来了。
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
