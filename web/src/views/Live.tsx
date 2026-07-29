import { useMemo, useState } from "react"
import type {
  GameEndData,
  GameProgressData,
  Status,
  WSEvent,
} from "../types"
import GomokuBoard from "../components/GomokuBoard"
import ValueGauge, { valueToBlackRate } from "../components/ValueGauge"
import { coordLabel, fmtInt, resultText } from "../lib/format"

/**
 * Live (#/live) — PLAN.md §7 view 2: real-time wall of the current
 * iteration's concurrent self-play games (game_progress events), click a
 * slot to inspect it (pi_top5 bubbles + value gauge); finished games of the
 * current round (game_end) listed below, linking into the archive.
 */

interface LiveProps {
  events: WSEvent[]
  status: Status | null
}

interface FinishedGame extends GameEndData {}

export default function Live({ events, status }: LiveProps) {
  const [selected, setSelected] = useState<number | null>(null)

  // game_id -> game_end record (also used to drop finished games off the wall)
  const finishedById = useMemo(() => {
    const m = new Map<string, FinishedGame>()
    for (const e of events) {
      if (e.type === "game_end") {
        const d = e.data as FinishedGame
        m.set(d.game_id, d)
      }
    }
    return m
  }, [events])

  // slot -> latest game_progress snapshot, in-progress games only:
  // a slot whose game already ended would otherwise sit on the wall showing
  // its final position as if still "live" (review finding)
  const slots = useMemo(() => {
    const m = new Map<number, GameProgressData>()
    for (const e of events) {
      if (e.type === "game_progress") {
        const d = e.data as GameProgressData
        if (!finishedById.has(d.game_id)) m.set(d.slot, d)
      }
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [events, finishedById])

  // finished games of the CURRENT iteration only (newest first); the ring
  // buffer can span iterations, and arena games mix with self-play
  const finished = useMemo(() => {
    const it = status?.iteration
    return [...finishedById.values()]
      .filter((g) => it == null || g.iteration === it)
      .reverse()
  }, [finishedById, status?.iteration])

  const boardSize = useMemo(() => {
    const first = slots[0]?.[1]
    if (first) return Math.round(Math.sqrt(first.board.length))
    const n = status?.config?.board_size
    return typeof n === "number" ? n : 9
  }, [slots, status])

  const detail = selected != null ? slots.find(([s]) => s === selected)?.[1] : null

  const lastMoveOf = (d: GameProgressData) =>
    d.last_move != null
      ? { x: d.last_move % boardSize, y: Math.floor(d.last_move / boardSize) }
      : null

  const topMovesOf = (d: GameProgressData) =>
    d.pi_top5.map((t) => ({
      x: t.action % boardSize,
      y: Math.floor(t.action / boardSize),
      prob: t.prob,
    }))

  return (
    <div className="flex flex-col" style={{ gap: "1.2rem" }}>
      <div className="flex items-baseline" style={{ gap: 12 }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700 }}>自我对弈直播</h1>
        <span className="mini-label">
          {status?.state === "running"
            ? `第 ${status.iteration} 轮 · ${phaseLabel(status.iteration_phase)}`
            : "训练未在运行"}
        </span>
      </div>

      {slots.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: "1.05rem", color: "var(--fg-muted)" }}>
            当前没有进行中的自我对弈
          </div>
          <div style={{ fontSize: "0.88rem" }}>
            训练运行后,这里会实时展示本轮所有并发对局
          </div>
          <a className="btn primary" href="#/" style={{ textDecoration: "none" }}>
            去总览启动训练
          </a>
        </div>
      ) : (
        <>
          {/* board wall */}
          <div className="board-wall">
            {slots.map(([slot, d]) => (
              <div
                key={slot}
                className={`card wall-cell${selected === slot ? " selected" : ""}`}
                style={{ padding: "0.6rem" }}
                onClick={() => setSelected(selected === slot ? null : slot)}
              >
                <GomokuBoard
                  size={boardSize}
                  board={d.board}
                  lastMove={lastMoveOf(d)}
                  small
                />
                <div
                  className="flex justify-between items-baseline"
                  style={{ marginTop: 6 }}
                >
                  <span className="mono" style={{ fontSize: "0.72rem", color: "var(--fg-faint)" }}>
                    #{slot} · {fmtInt(d.move_count)} 手
                  </span>
                  <span className="mono" style={{ fontSize: "0.72rem", color: "var(--accent-deep)" }}>
                    {d.value >= 0 ? "+" : ""}{d.value.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* single-game detail */}
          {detail && (
            <div className="card" style={{ padding: "1.2rem" }}>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
                  gap: "1.4rem",
                }}
              >
                <div>
                  <GomokuBoard
                    size={boardSize}
                    board={detail.board}
                    lastMove={lastMoveOf(detail)}
                    topMoves={topMovesOf(detail)}
                    ghostPlayer={detail.player_to_move}
                  />
                </div>
                <div className="flex flex-col" style={{ gap: "1.1rem" }}>
                  <div>
                    <div className="mini-label" style={{ marginBottom: 6 }}>对局</div>
                    <div className="mono" style={{ fontSize: "0.95rem" }}>
                      {detail.game_id}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--fg-muted)", marginTop: 4 }}>
                      第 {detail.iteration} 轮 · {fmtInt(detail.move_count)} 手 ·
                      {detail.player_to_move === 1 ? " 黑方" : " 白方"}行棋
                    </div>
                  </div>
                  <ValueGauge
                    label="胜率天平(行棋方估值)"
                    blackRate={
                      // value was computed BEFORE the last move; its perspective
                      // is the side that just played = -player_to_move
                      valueToBlackRate(detail.value, -detail.player_to_move)
                    }
                  />
                  <div>
                    <div className="mini-label" style={{ marginBottom: 8 }}>
                      策略候选 TOP5(访问数占比)
                    </div>
                    <div className="flex flex-col" style={{ gap: 6 }}>
                      {detail.pi_top5.map((t, i) => {
                        const x = t.action % boardSize
                        const y = Math.floor(t.action / boardSize)
                        const max = detail.pi_top5[0]?.prob || 1
                        return (
                          <div key={i} className="flex items-center" style={{ gap: 10 }}>
                            <span className="chip">{coordLabel(x, y)}</span>
                            <div className="prob-track">
                              <div className="prob-fill" style={{ width: `${(t.prob / max) * 100}%` }} />
                            </div>
                            <span className="mono" style={{ fontSize: "0.8rem", width: "3.4rem", textAlign: "right" }}>
                              {(t.prob * 100).toFixed(1)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* finished games of the current round */}
      {finished.length > 0 && (
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div className="mini-label" style={{ marginBottom: 10 }}>
            本轮已结束对局({finished.length})
          </div>
          <div className="flex flex-wrap" style={{ gap: "0.5rem" }}>
            {finished.map((g) => (
              <a
                key={g.game_id}
                href={`#/games/${g.game_id}`}
                className="chip"
                style={{ textDecoration: "none" }}
              >
                {g.game_id} · {resultText(g.result)} · {g.moves}手
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function phaseLabel(phase: string | undefined): string {
  switch (phase) {
    case "selfplay":
      return "自我对弈中"
    case "train":
      return "训练中"
    case "arena":
      return "竞技场对战中"
    default:
      return phase ?? ""
  }
}
