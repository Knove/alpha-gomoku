import { useEffect, useRef } from "react"
import type {
  ArenaEndData,
  GameEndData,
  GameProgressData,
  LogData,
  TrainEndData,
  WSEvent,
} from "../types"
import { fmtFloat, fmtPct, fmtTime, resultText } from "../lib/format"

/**
 * EventTicker — scrolling live event stream (PLAN.md §6 event types).
 * Type-colored tags, mono timestamps, auto-scrolls to the newest event
 * while the user is near the bottom.
 */

interface EventTickerProps {
  events: WSEvent[]
  height?: number
}

function describe(ev: WSEvent): { tag: string; cls: string; text: string } {
  switch (ev.type) {
    case "status":
      return { tag: "状态", cls: "", text: "训练状态更新" }
    case "iteration_start": {
      const d = ev.data as { iteration: number }
      return { tag: "迭代", cls: "ink", text: `第 ${d.iteration} 轮开始` }
    }
    case "game_progress": {
      const d = ev.data as GameProgressData
      return {
        tag: "对弈",
        cls: "",
        text: `${d.game_id} 第 ${d.move_count} 手`,
      }
    }
    case "game_end": {
      const d = ev.data as GameEndData
      return {
        tag: "终局",
        cls: "accent",
        text: `${d.game_id} ${resultText(d.result)} · ${d.moves} 手`,
      }
    }
    case "train_end": {
      const d = ev.data as TrainEndData
      return {
        tag: "训练",
        cls: "accent",
        text: `第 ${d.iteration} 轮 损失 ${fmtFloat(d.loss, 4)} · 策略 ${fmtFloat(d.policy_loss, 4)} · 价值 ${fmtFloat(d.value_loss, 4)}`,
      }
    }
    case "arena_end": {
      const d = ev.data as ArenaEndData
      return {
        tag: "竞技",
        cls: "accent",
        text: `第 ${d.iteration} 轮 vs ${d.opponent} 胜率 ${fmtPct(d.win_rate, 0)} (${d.wins}胜 ${d.losses}负 ${d.draws}和)${d.promoted ? " · 晋升 best" : ""}`,
      }
    }
    case "log": {
      const d = ev.data as LogData
      return {
        tag: "日志",
        cls: d.level === "error" || d.level === "warn" ? "accent" : "",
        text: d.message,
      }
    }
    default:
      return { tag: ev.type, cls: "", text: JSON.stringify(ev.data) }
  }
}

export default function EventTicker({ events, height = 260 }: EventTickerProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    const el = boxRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [events])

  return (
    <div
      ref={boxRef}
      className="ticker"
      style={{ height }}
      onScroll={onScroll}
    >
      {events.length === 0 ? (
        <div style={{ color: "var(--fg-faint)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
          等待事件…
        </div>
      ) : (
        events.map((ev, i) => {
          const d = describe(ev)
          return (
            <div className="ticker-row" key={i}>
              <span className="ticker-time">{fmtTime(ev.ts)}</span>
              <span className={`ticker-tag ${d.cls}`}>{d.tag}</span>
              <span className="mono" style={{ fontSize: "0.8rem", overflowWrap: "anywhere" }}>
                {d.text}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
