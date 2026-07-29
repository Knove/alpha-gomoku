import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { get } from "../api"
import type { GameRecord } from "../types"
import GomokuBoard from "../components/GomokuBoard"
import LineChart from "../components/LineChart"
import TopMoves from "../components/TopMoves"
import ValueGauge, { valueToBlackRate } from "../components/ValueGauge"
import {
  coordLabel,
  fmtDateTime,
  fmtFloat,
  resultText,
} from "../lib/format"

/**
 * Replay (#/games/:id) — full game playback (PLAN.md §7 view 3 detail):
 * move slider, pi heat layer of the current move, top-5 table, whole-game
 * value trend, result banner.
 */

interface ReplayProps {
  id: string
}

export default function Replay({ id }: ReplayProps) {
  const [game, setGame] = useState<GameRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0) // number of moves applied (0 = empty)

  useEffect(() => {
    let cancelled = false
    setGame(null)
    setError(null)
    setStep(0)
    get<GameRecord>(`/games/${encodeURIComponent(id)}`)
      .then((g) => {
        if (cancelled) return // a newer id already took over
        setGame(g)
        setStep(g.moves.length)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const n = game?.board_size ?? 9

  const board = useMemo(() => {
    const b = new Array<number>(n * n).fill(0)
    if (!game) return b
    for (let i = 0; i < step && i < game.moves.length; i++) {
      const m = game.moves[i]
      b[m.y * n + m.x] = m.player
    }
    return b
  }, [game, step, n])

  // Keyboard: left/right arrows step through the game.
  useEffect(() => {
    if (!game) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1))
      if (e.key === "ArrowRight") setStep((s) => Math.min(game.moves.length, s + 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [game])

  const current = game && step > 0 ? game.moves[step - 1] : null

  const valueSeries = useMemo(() => {
    if (!game) return []
    return [
      {
        key: "value",
        label: "根节点估值(黑方视角)",
        points: game.moves.map((m) => ({
          x: m.n + 1,
          y: m.player === 1 ? m.value : -m.value,
        })),
      },
    ]
  }, [game])

  if (error) {
    return (
      <div className="flex flex-col" style={{ gap: "1rem" }}>
        <a href="#/games" style={{ color: "var(--accent-deep)", fontSize: "0.9rem" }}>
          ← 返回对局档案
        </a>
        <div className="banner accent">加载失败:{error}</div>
      </div>
    )
  }

  if (!game) {
    return <div style={{ color: "var(--fg-faint)" }}>加载中…</div>
  }

  const fill = game.moves.length ? (step / game.moves.length) * 100 : 0

  return (
    <div className="flex flex-col" style={{ gap: "1.2rem" }}>
      <div className="flex items-center flex-wrap" style={{ gap: "0.9rem" }}>
        <a href="#/games" style={{ color: "var(--accent-deep)", fontSize: "0.9rem", textDecoration: "none" }}>
          ← 档案
        </a>
        <h1 className="mono" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{game.id}</h1>
        <span className="chip">{game.kind === "arena" ? "竞技场" : "自我对弈"}</span>
        <span className="chip">第 {game.iteration} 轮</span>
        {game.meta?.opponent && <span className="chip accent">对手 {game.meta.opponent}</span>}
        <span className="mini-label" style={{ marginLeft: "auto" }}>
          {fmtDateTime(game.created_at)} · {game.meta?.black ?? "?"} vs {game.meta?.white ?? "?"}
        </span>
      </div>

      {/* result banner */}
      <div className={`banner${game.result !== 0 ? " accent" : ""}`}>
        <span style={{ fontSize: "1.05rem" }}>{resultText(game.result)}</span>
        <span style={{ fontWeight: 400, fontSize: "0.88rem", color: "var(--fg-muted)" }}>
          共 {game.moves.length} 手 · {game.board_size}×{game.board_size} 连 {game.win_len}
        </span>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "1.2rem",
          alignItems: "start",
        }}
      >
        {/* board + slider */}
        <div className="card" style={{ padding: "1.1rem" }}>
          <GomokuBoard
            size={n}
            board={board}
            heat={current?.pi}
            lastMove={current ? { x: current.x, y: current.y } : null}
          />
          <div style={{ marginTop: 14 }}>
            <input
              type="range"
              min={0}
              max={game.moves.length}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              style={{ "--fill": `${fill}%` } as CSSProperties}
              aria-label="手数"
            />
            <div className="flex justify-between items-baseline" style={{ marginTop: 4 }}>
              <span className="mono" style={{ fontSize: "0.85rem" }}>
                第 {step} / {game.moves.length} 手
              </span>
              <span className="mono" style={{ fontSize: "0.8rem", color: "var(--fg-faint)" }}>
                {current
                  ? `${current.player === 1 ? "黑" : "白"} ${coordLabel(current.x, current.y)} · 估值 ${fmtFloat(current.value, 3)}`
                  : "初始局面"}
              </span>
            </div>
          </div>
        </div>

        {/* right column: top5 + gauge + value curve */}
        <div className="flex flex-col" style={{ gap: "1.2rem" }}>
          <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <ValueGauge
              label={current ? `第 ${step} 手行棋方估值` : "胜率天平"}
              blackRate={
                current ? valueToBlackRate(current.value, current.player) : 0.5
              }
            />
          </div>
          <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <TopMoves
              title={current ? `第 ${step} 手策略候选 TOP${current.top.length}` : "策略候选"}
              moves={
                current
                  ? current.top.map((t) => ({
                      x: t.action % n,
                      y: Math.floor(t.action / n),
                      prob: t.prob,
                      visits: t.visits,
                    }))
                  : []
              }
            />
          </div>
          <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <div className="mini-label" style={{ marginBottom: 10 }}>整局估值走势</div>
            <LineChart
              series={valueSeries}
              height={170}
              yMin={-1}
              yMax={1}
              formatX={(v) => `${v}`}
              formatY={(v) => v.toFixed(2)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
