import { useCallback, useEffect, useRef, useState } from "react"
import { get, post } from "../api"
import type { AiMoveStats, CheckpointInfo, PlaySession } from "../types"
import GomokuBoard from "../components/GomokuBoard"
import TopMoves from "../components/TopMoves"
import ValueGauge, { valueToBlackRate } from "../components/ValueGauge"
import { coordLabel, fmtInt, resultText } from "../lib/format"

/**
 * Play (#/play) — PLAN.md §7 view 4: human vs AI.
 * Setup form (color / checkpoint / thinking budget), interactive board
 * (disabled while the AI thinks), per-move AI top-3 panel + value gauge,
 * end banner + rematch, AI self-play spectate mode (800ms step timer).
 */

type HumanColor = 1 | -1 | 0
type CheckpointName = "best" | "latest" | "baseline"
type Sims = 50 | 200 | 800

/** Tolerate wire variants (2D board, action-only top-k entries). */
function normalizeSession(raw: Record<string, unknown>): PlaySession {
  const s = { ...raw } as Record<string, unknown> & PlaySession
  let board = s.board as unknown
  if (Array.isArray(board) && Array.isArray(board[0])) {
    board = (board as number[][]).flat()
  }
  const n =
    typeof s.board_size === "number"
      ? s.board_size
      : Math.round(Math.sqrt((board as number[]).length))
  const aiTop = Array.isArray(s.ai_top)
    ? s.ai_top.map((t) => {
        const x = t.x ?? ((t.action ?? 0) % n)
        const y = t.y ?? Math.floor((t.action ?? 0) / n)
        return { ...t, x, y }
      })
    : []
  return {
    sid: String(s.sid ?? ""),
    board_size: n,
    board: (board as number[]) ?? new Array(n * n).fill(0),
    human_color: s.human_color ?? 1,
    current_player: s.current_player ?? 1,
    last_move: s.last_move ?? null,
    move_count: s.move_count ?? 0,
    outcome: s.outcome ?? null,
    ai_top: aiTop,
    value: typeof s.value === "number" ? s.value : 0,
    moves: Array.isArray(s.moves) ? (s.moves as PlaySession["moves"]) : [],
    checkpoint: s.checkpoint,
    simulations: s.simulations,
  }
}

export default function Play() {
  // setup form
  const [color, setColor] = useState<HumanColor>(1)
  const [checkpoint, setCheckpoint] = useState<CheckpointName>("best")
  const [sims, setSims] = useState<Sims>(200)
  const [available, setAvailable] = useState<string[]>([])

  // session state
  const [session, setSession] = useState<PlaySession | null>(null)
  const [thinking, setThinking] = useState(false)
  const [selfPaused, setSelfPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<PlaySession | null>(null)
  sessionRef.current = session

  // Which checkpoints exist on the server (to warn when best is absent).
  useEffect(() => {
    get<CheckpointInfo[]>("/checkpoints")
      .then((list) => {
        if (Array.isArray(list)) setAvailable(list.map((c) => c.name))
      })
      .catch(() => {})
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setThinking(true)
    try {
      const raw = await post<Record<string, unknown>>("/play/new", {
        human_color: color,
        checkpoint,
        simulations: sims,
      })
      setSession(normalizeSession(raw))
      setSelfPaused(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setThinking(false)
    }
  }, [color, checkpoint, sims])

  const playMove = useCallback(
    async (x: number, y: number) => {
      const s = sessionRef.current
      if (!s || thinking || s.outcome != null) return
      if (s.human_color === 0 || s.current_player !== s.human_color) return
      setError(null)
      setThinking(true)
      try {
        const raw = await post<Record<string, unknown>>(
          `/play/${encodeURIComponent(s.sid)}/move`,
          { x, y },
        )
        setSession(normalizeSession(raw))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setThinking(false)
      }
    },
    [thinking],
  )

  // AI self-play spectate: 800ms step timer (PLAN §7).
  useEffect(() => {
    if (!session || session.human_color !== 0) return
    if (session.outcome != null || selfPaused) return
    const t = window.setTimeout(async () => {
      const s = sessionRef.current
      if (!s) return
      setThinking(true)
      try {
        const raw = await post<Record<string, unknown>>(
          `/play/${encodeURIComponent(s.sid)}/step`,
        )
        setSession(normalizeSession(raw))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setThinking(false)
      }
    }, 800)
    return () => window.clearTimeout(t)
  }, [session, selfPaused])

  const n = session?.board_size ?? 9
  const isSelf = session?.human_color === 0
  const humanTurn =
    session != null &&
    !isSelf &&
    session.outcome == null &&
    session.current_player === session.human_color
  const interactive = humanTurn && !thinking

  const endBanner = () => {
    if (!session || session.outcome == null) return null
    let text: string
    let accent = false
    if (isSelf) {
      text = `AI 自弈结束:${resultText(session.outcome)}`
    } else if (session.outcome === 0) {
      text = "和棋"
    } else if (session.outcome === session.human_color) {
      text = "你赢了"
      accent = true
    } else {
      text = "你输了"
    }
    return (
      <div className={`banner${accent ? " accent" : ""}`}>
        <span style={{ fontSize: "1.05rem" }}>{text}</span>
        <span style={{ fontWeight: 400, fontSize: "0.88rem", color: "var(--fg-muted)" }}>
          共 {session.move_count} 手
        </span>
        <span style={{ marginLeft: "auto" }} className="flex" >
          <button type="button" className="btn primary" onClick={start}>
            再来一局
          </button>
        </span>
      </div>
    )
  }

  const top3: AiMoveStats[] = session?.ai_top?.slice(0, 3) ?? []

  // The value gauge: session.value comes from the most recent AI search, so
  // its perspective is the side that SEARCHED (the last mover carrying a
  // value), not necessarily the current player (review finding: inverted bar)
  const gaugeRate = (() => {
    const ms = session?.moves
    if (ms) {
      for (let i = ms.length - 1; i >= 0; i--) {
        const v = ms[i].value
        if (typeof v === "number") return valueToBlackRate(v, ms[i].player)
      }
    }
    return 0.5
  })()

  return (
    <div className="flex flex-col" style={{ gap: "1.2rem" }}>
      <div className="flex items-baseline" style={{ gap: 12 }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700 }}>人机对战</h1>
        <span className="mini-label">与最新模型对弈 · MCTS 搜索</span>
      </div>

      {/* setup form */}
      <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
        <div className="flex flex-wrap items-center" style={{ gap: "0.8rem" }}>
          <span className="mini-label">执子</span>
          <div className="seg">
            {([[1, "我执黑"], [-1, "我执白"], [0, "AI 自弈"]] as [HumanColor, string][]).map(
              ([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={`seg-btn${color === v ? " active" : ""}`}
                  onClick={() => setColor(v)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          <span className="mini-label">对手</span>
          <div className="seg">
            {(["best", "latest", "baseline"] as CheckpointName[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`seg-btn${checkpoint === v ? " active" : ""}`}
                onClick={() => setCheckpoint(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <span className="mini-label">思考量</span>
          <div className="seg">
            {([50, 200, 800] as Sims[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`seg-btn${sims === v ? " active" : ""}`}
                onClick={() => setSims(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={thinking}
            onClick={start}
          >
            {session ? "重新开局" : "开局"}
          </button>
        </div>
        {available.length > 0 && !available.includes(checkpoint) && (
          <div style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--accent-deep)" }}>
            服务器上尚无 {checkpoint}.pt(已有:{available.join("、")}),开局可能失败或回落其他权重
          </div>
        )}
        {error && (
          <div style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--accent-deep)" }}>
            {error}
          </div>
        )}
      </div>

      {endBanner()}

      {session ? (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
            gap: "1.2rem",
            alignItems: "start",
          }}
        >
          {/* board */}
          <div className="card" style={{ padding: "1.1rem", position: "relative" }}>
            <div style={{ opacity: interactive || isSelf || session.outcome != null ? 1 : 0.92 }}>
              <GomokuBoard
                size={n}
                board={session.board}
                lastMove={session.last_move}
                onCellClick={interactive ? playMove : undefined}
                ghostPlayer={session.human_color === 0 ? 1 : session.human_color}
              />
            </div>
            {thinking && (
              <div
                className="chip accent"
                style={{
                  position: "absolute",
                  top: 18,
                  right: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <span className="thinking-dot" /> AI 思考中
              </div>
            )}
            <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
              <span className="mono" style={{ fontSize: "0.82rem", color: "var(--fg-muted)" }}>
                {fmtInt(session.move_count)} 手 ·
                {session.outcome != null
                  ? " 已终局"
                  : `${session.current_player === 1 ? " 黑方" : " 白方"}行棋`}
              </span>
              {isSelf && session.outcome == null && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelfPaused((p) => !p)}
                >
                  {selfPaused ? "继续" : "暂停"}
                </button>
              )}
            </div>
          </div>

          {/* side panel */}
          <div className="flex flex-col" style={{ gap: "1.2rem" }}>
            <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
              <ValueGauge
                label="胜率天平(AI 估值)"
                blackRate={gaugeRate}
              />
            </div>
            <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
              <TopMoves
                title={
                  session.last_move
                    ? `AI 应手 ${coordLabel(session.last_move.x, session.last_move.y)} · 候选 TOP${Math.min(3, top3.length)}`
                    : "AI 候选"
                }
                moves={top3}
              />
            </div>
            <div className="card" style={{ padding: "0.9rem 1.25rem" }}>
              <div className="mini-label" style={{ marginBottom: 6 }}>会话</div>
              <div className="flex flex-wrap" style={{ gap: "0.45rem" }}>
                <span className="chip">{session.checkpoint ?? checkpoint}</span>
                <span className="chip">模拟 {session.simulations ?? sims}</span>
                <span className="chip">
                  {isSelf ? "AI 自弈" : session.human_color === 1 ? "我执黑" : "我执白"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card empty-state">
          <div style={{ color: "var(--fg-muted)" }}>选择执子与难度,点击「开局」</div>
          <div style={{ fontSize: "0.85rem" }}>
            我执黑先行 · AI 自弈可观战模型自我对弈
          </div>
        </div>
      )}
    </div>
  )
}
