import { useEffect, useRef, useState } from "react"
import type { Status, WSEvent } from "./types"

export interface EventsState {
  /** Rolling buffer of the most recent events (oldest first). */
  events: WSEvent[]
  /** Latest status snapshot seen on the wire (2s server heartbeat). */
  status: Status | null
  connected: boolean
}

/**
 * useEvents — WebSocket hook for PLAN.md §5 `/ws`.
 *
 * Connects (same origin; vite dev proxies to :8000), replays the server's
 * recent-event backlog, then streams live events into a capped ring buffer.
 * Reconnects with exponential backoff (1s → 2s → … → 15s cap). Cleans up
 * the socket and pending timers on unmount.
 */
/** Server frames (server/app.py + server/tail.py):
 *  {"type": "history", "events": WSEvent[]}   — once, on connect
 *  {"type": "events",  "events": WSEvent[]}   — live batches from the tail
 *  {"type": "status",  "status": Status}      — 2s heartbeat
 */
type Frame =
  | { type: "history"; events: WSEvent[] }
  | { type: "events"; events: WSEvent[] }
  | { type: "status"; status: Status }

export function useEvents(maxEvents = 240): EventsState {
  const [events, setEvents] = useState<WSEvent[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [connected, setConnected] = useState(false)
  const maxRef = useRef(maxEvents)
  maxRef.current = maxEvents

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let attempt = 0
    let timer = 0
    // dedup across history replays on reconnect (ts+type is unique enough)
    const seen = new Set<string>()

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws"
      ws = new WebSocket(`${proto}://${location.host}/ws`)

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
      }
      ws.onmessage = (ev: MessageEvent<string>) => {
        let msg: Frame
        try {
          msg = JSON.parse(ev.data) as Frame
        } catch {
          return
        }
        if (msg.type === "status") {
          if (msg.status) setStatus(msg.status)
          return
        }
        const batch = msg.events
        if (!Array.isArray(batch) || batch.length === 0) return
        const fresh = batch.filter((e) => {
          const key = `${e.ts}|${e.type}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        // FIFO trim: clearing the whole set would re-admit the next reconnect's
        // 50-event history replay (review finding)
        if (seen.size > 4000) {
          const keep = [...seen].slice(-2000)
          seen.clear()
          for (const k of keep) seen.add(k)
        }
        if (fresh.length === 0) return
        setEvents((prev) => {
          const merged = [...prev, ...fresh]
          return merged.length > maxRef.current
            ? merged.slice(merged.length - maxRef.current)
            : merged
        })
      }
      ws.onclose = () => {
        setConnected(false)
        if (closed) return
        const delay = Math.min(1000 * 2 ** attempt, 15000)
        attempt += 1
        timer = window.setTimeout(connect, delay)
      }
      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()
    return () => {
      closed = true
      window.clearTimeout(timer)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [])

  return { events, status, connected }
}
