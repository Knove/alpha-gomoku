import { useCallback, useEffect, useRef, useState } from "react"
import { get } from "../api"
import type { GameListResponse, GameSummary } from "../types"
import { fmtDateTime, resultText } from "../lib/format"

/**
 * Games (#/games) — PLAN.md §7 view 3: self-play / arena archive with
 * kind switch, result filter, cursor pagination (PLAN §5 GET /api/games).
 */

const PAGE = 30

type Kind = "selfplay" | "arena"
type ResultFilter = "all" | "1" | "-1" | "0"

export default function Games() {
  const [kind, setKind] = useState<Kind>("selfplay")
  const [filter, setFilter] = useState<ResultFilter>("all")
  const [items, setItems] = useState<GameSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0) // request sequence: stale responses are dropped

  const load = useCallback(
    async (cursor: string | null, stack: (string | null)[]) => {
      const seq = ++seqRef.current
      setLoading(true)
      setError(null)
      try {
        const q = `/games?kind=${kind}&limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
        const r = await get<GameListResponse | GameSummary[]>(q)
        if (seq !== seqRef.current) return // a newer request already fired
        // Tolerate either {games, next_cursor} or a bare array.
        const games = Array.isArray(r) ? r : (r.games ?? [])
        const nc = Array.isArray(r) ? null : (r.next_cursor ?? null)
        setItems(games)
        setNextCursor(nc)
        setCursorStack(stack)
      } catch (e) {
        if (seq === seqRef.current) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [kind],
  )

  useEffect(() => {
    load(null, [null])
  }, [load])

  const filtered =
    filter === "all" ? items : items.filter((g) => String(g.result) === filter)

  const resultBadge = (result: number) => (
    <span className={`chip${result !== 0 ? "" : ""}`} style={{
      borderColor: result === 0 ? "var(--hairline-strong)" : "var(--accent)",
      color: result === 0 ? "var(--fg-muted)" : "var(--accent-deep)",
      background: result === 0 ? "transparent" : "var(--accent-wash)",
    }}>
      {resultText(result)}
    </span>
  )

  return (
    <div className="flex flex-col" style={{ gap: "1.2rem" }}>
      <div className="flex flex-wrap items-center" style={{ gap: "0.9rem" }}>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 700, marginRight: 6 }}>对局档案</h1>
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${kind === "selfplay" ? " active" : ""}`}
            onClick={() => setKind("selfplay")}
          >
            自我对弈
          </button>
          <button
            type="button"
            className={`seg-btn${kind === "arena" ? " active" : ""}`}
            onClick={() => setKind("arena")}
          >
            竞技场
          </button>
        </div>
        <div className="seg">
          {(
            [
              ["all", "全部"],
              ["1", "黑胜"],
              ["-1", "白胜"],
              ["0", "和棋"],
            ] as [ResultFilter, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`seg-btn${filter === v ? " active" : ""}`}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="mini-label" style={{ marginLeft: "auto" }}>
          {loading ? "加载中…" : `本页 ${filtered.length} 局`}
        </span>
      </div>

      {error && <div className="banner accent">{error}</div>}

      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.length === 0 && !loading ? (
          <div className="empty-state">
            <div style={{ color: "var(--fg-muted)" }}>暂无对局记录</div>
            <div style={{ fontSize: "0.85rem" }}>训练运行后,对局会逐局落盘归档</div>
          </div>
        ) : (
          filtered.map((g) => (
            <div
              key={g.id}
              className="game-row"
              onClick={() => {
                location.hash = `#/games/${g.id}`
              }}
            >
              <span className="mono" style={{ fontSize: "0.85rem" }}>{g.id}</span>
              <span className="mono" style={{ color: "var(--fg-muted)", fontSize: "0.82rem" }}>
                #{g.iteration}
              </span>
              <span>{resultBadge(g.result)}</span>
              <span className="mono" style={{ color: "var(--fg-muted)", fontSize: "0.82rem" }}>
                {g.moves}手
              </span>
              <span className="hide-s" style={{ color: "var(--fg-faint)", fontSize: "0.82rem" }}>
                {g.kind === "arena" && g.meta?.opponent
                  ? `对手 ${g.meta.opponent} · ${g.meta.black ?? ""} vs ${g.meta.white ?? ""}`
                  : `${g.meta?.black ?? ""}`}
              </span>
              <span className="mono hide-s" style={{ color: "var(--fg-faint)", fontSize: "0.78rem" }}>
                {fmtDateTime(g.created_at)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* cursor pagination */}
      <div className="flex items-center" style={{ gap: "0.7rem" }}>
        <button
          type="button"
          className="btn"
          disabled={loading || cursorStack.length <= 1}
          onClick={() => {
            const stack = cursorStack.slice(0, -1)
            load(stack[stack.length - 1] ?? null, stack)
          }}
        >
          上一页
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading || !nextCursor}
          onClick={() => {
            if (!nextCursor) return
            load(nextCursor, [...cursorStack, nextCursor])
          }}
        >
          下一页
        </button>
        <span className="mono" style={{ fontSize: "0.78rem", color: "var(--fg-faint)" }}>
          第 {cursorStack.length} 页
        </span>
      </div>
    </div>
  )
}
