import { useCallback, useEffect, useMemo, useState } from "react"
import { get, post } from "../api"
import type {
  MetricsRow,
  Status,
  TrainConfig,
  TrainEndData,
  WSEvent,
} from "../types"
import StatCard from "../components/StatCard"
import LineChart from "../components/LineChart"
import EventTicker from "../components/EventTicker"
import {
  fmtAge,
  fmtDur,
  fmtFloat,
  fmtInt,
  fmtPct,
  phaseText,
  stateText,
} from "../lib/format"

/**
 * Dashboard (#/) — PLAN.md §7 view 1: status cards, training controls,
 * loss curves (policy/value), arena evolution curve, buffer water level,
 * config summary, live event stream.
 */

interface DashboardProps {
  events: WSEvent[]
  status: Status | null
  connected: boolean
}

export default function Dashboard({ events, status, connected }: DashboardProps) {
  const [metrics, setMetrics] = useState<MetricsRow[]>([])
  const [fallbackStatus, setFallbackStatus] = useState<Status | null>(null)
  const [config, setConfig] = useState<TrainConfig | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now() / 1000)

  const st = status ?? fallbackStatus

  // Initial REST snapshot (WS delivers status every 2s afterwards).
  useEffect(() => {
    get<Status>("/status").then(setFallbackStatus).catch(() => {})
    get<TrainConfig>("/config").then(setConfig).catch(() => {})
  }, [])

  // Metrics polling (5s) per PLAN §7.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      get<MetricsRow[]>("/metrics?tail=400")
        .then((rows) => {
          if (!cancelled && Array.isArray(rows)) setMetrics(rows)
        })
        .catch(() => {})
    }
    load()
    const t = window.setInterval(load, 5000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  // Tick for the heartbeat age display.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => window.clearInterval(t)
  }, [])

  // WS train_end: append the finished iteration immediately (dedup by iteration).
  useEffect(() => {
    const last = events[events.length - 1]
    if (!last || last.type !== "train_end") return
    const d = last.data as TrainEndData
    setMetrics((prev) => {
      if (prev.some((r) => r.iteration === d.iteration)) return prev
      const row: MetricsRow = {
        iteration: d.iteration,
        loss: d.loss,
        policy_loss: d.policy_loss,
        value_loss: d.value_loss,
        policy_entropy: NaN,
        games: NaN,
        samples: NaN,
        buffer: d.buffer,
        lr: NaN,
        sec_selfplay: NaN,
        sec_train: NaN,
        arena_vs_best: null,
        arena_vs_baseline: null,
        best_iteration: st?.best_iteration ?? 0,
      }
      return [...prev, row]
    })
  }, [events, st?.best_iteration])

  const control = useCallback(async (action: string) => {
    if (action === "stop" && !window.confirm("确认停止训练?训练进程将落盘后退出。")) {
      return
    }
    setBusy(action)
    setError(null)
    try {
      await post("/control", { action })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [])

  const lastRow = metrics.length ? metrics[metrics.length - 1] : null
  const cfg: TrainConfig = st?.config ?? config ?? {}

  const lossSeries = useMemo(
    () => [
      {
        key: "policy",
        label: "策略损失",
        points: metrics
          .filter((r): r is MetricsRow & { policy_loss: number } =>
            Number.isFinite(r.policy_loss),
          )
          .map((r) => ({ x: r.iteration, y: r.policy_loss })),
      },
      {
        key: "value",
        label: "价值损失",
        points: metrics
          .filter((r): r is MetricsRow & { value_loss: number } =>
            Number.isFinite(r.value_loss),
          )
          .map((r) => ({ x: r.iteration, y: r.value_loss })),
      },
    ],
    [metrics],
  )

  const arenaSeries = useMemo(
    () => [
      {
        key: "baseline",
        label: "vs baseline",
        points: metrics
          .filter((r) => r.arena_vs_baseline)
          .map((r) => ({ x: r.iteration, y: r.arena_vs_baseline!.win_rate_a })),
      },
      {
        key: "best",
        label: "vs best",
        dashed: true,
        points: metrics
          .filter((r) => r.arena_vs_best)
          .map((r) => ({ x: r.iteration, y: r.arena_vs_best!.win_rate_a })),
      },
    ],
    [metrics],
  )

  const running = st?.state === "running"
  const paused = st?.state === "paused"
  const heartbeatAge = st?.heartbeat ? now - st.heartbeat : null
  const bufferSize = typeof cfg.buffer_size === "number" ? cfg.buffer_size : 0
  const buffer = lastRow?.buffer ?? st?.samples ?? 0
  const bufferPct = bufferSize > 0 ? Math.min(1, buffer / bufferSize) : 0

  const tickerEvents = useMemo(
    () => events.filter((e) => e.type !== "game_progress" && e.type !== "status"),
    [events],
  )

  const configChips: [string, string][] = [
    ["棋盘", cfg.board_size ? `${cfg.board_size}×${cfg.board_size}` : "—"],
    ["连子", cfg.win_len != null ? String(cfg.win_len) : "—"],
    ["模拟", cfg.mcts_simulations != null ? String(cfg.mcts_simulations) : "—"],
    ["每轮对局", cfg.games_per_iteration != null ? String(cfg.games_per_iteration) : "—"],
    ["并发", cfg.parallel_games != null ? String(cfg.parallel_games) : "—"],
    ["训练步", cfg.train_steps != null ? String(cfg.train_steps) : "—"],
    ["批量", cfg.batch_size != null ? String(cfg.batch_size) : "—"],
    ["学习率", cfg.lr != null ? String(cfg.lr) : "—"],
    ["竞技间隔", cfg.arena_every != null ? String(cfg.arena_every) : "—"],
  ]

  return (
    <div className="flex flex-col" style={{ gap: "1.2rem" }}>
      {/* status cards */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.9rem",
        }}
      >
        <StatCard
          label="运行状态"
          value={
            <span className="flex items-center" style={{ gap: 8 }}>
              <span
                className={`conn-dot${running ? " on" : ""}`}
                style={{ width: 10, height: 10 }}
              />
              <span style={{ fontSize: "1.25rem" }}>{stateText(st?.state)}</span>
            </span>
          }
          sub={
            st
              ? `${phaseText(st.iteration_phase)} · ${fmtPct(st.progress ?? 0, 0)}`
              : "等待服务器"
          }
        />
        <StatCard label="当前迭代" value={fmtInt(st?.iteration)} />
        <StatCard label="累计对局" value={fmtInt(st?.games_done)} />
        <StatCard label="样本数" value={fmtInt(st?.samples)} />
        <StatCard
          label="经验池"
          value={fmtInt(buffer)}
          sub={bufferSize ? `${fmtPct(bufferPct, 1)} / ${fmtInt(bufferSize)}` : undefined}
        />
        <StatCard label="BEST 轮次" value={fmtInt(st?.best_iteration)} accent />
        <StatCard
          label="心跳"
          value={heartbeatAge != null ? fmtAge(heartbeatAge) : "—"}
          sub={
            heartbeatAge != null && heartbeatAge > 10
              ? "训练进程无响应"
              : connected
                ? "实时连接正常"
                : "连接中断,重连中"
          }
        />
      </div>

      {/* controls + config summary */}
      <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
        <div className="flex flex-wrap items-center" style={{ gap: "0.7rem" }}>
          <span className="mini-label" style={{ marginRight: 4 }}>训练控制</span>
          <button
            type="button"
            className="btn primary"
            disabled={busy !== null || running || paused}
            onClick={() => control("start")}
          >
            启动
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !running}
            onClick={() => control("pause")}
          >
            暂停
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || !paused}
            onClick={() => control("resume")}
          >
            继续
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || (!running && !paused)}
            onClick={() => control("stop")}
          >
            停止
          </button>
          {error && (
            <span style={{ color: "var(--accent-deep)", fontSize: "0.85rem" }}>
              {error}
            </span>
          )}
        </div>
        <div className="flex flex-wrap" style={{ gap: "0.45rem", marginTop: 14 }}>
          {configChips.map(([k, v]) => (
            <span className="chip" key={k}>
              {k} {v}
            </span>
          ))}
        </div>
      </div>

      {/* charts */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
          gap: "1.2rem",
        }}
      >
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div className="mini-label" style={{ marginBottom: 12 }}>
            损失曲线{lastRow ? ` · 第 ${lastRow.iteration} 轮` : ""}
          </div>
          <LineChart
            series={lossSeries}
            height={230}
            formatX={(v) => `#${v}`}
            formatY={(v) => fmtFloat(v, 3)}
          />
          {lastRow && (
            <div
              className="mono"
              style={{ fontSize: "0.75rem", color: "var(--fg-faint)", marginTop: 8 }}
            >
              本轮:对弈 {fmtDur(lastRow.sec_selfplay)} · 训练 {fmtDur(lastRow.sec_train)}
              {Number.isFinite(lastRow.lr) ? ` · lr ${lastRow.lr}` : ""}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div className="mini-label" style={{ marginBottom: 12 }}>
            进化曲线 · 竞技场胜率
          </div>
          <LineChart
            series={arenaSeries}
            height={230}
            yMin={0}
            yMax={1}
            formatX={(v) => `#${v}`}
            formatY={(v) => fmtPct(v, 0)}
          />
        </div>
      </div>

      {/* buffer water level + event stream */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
          gap: "1.2rem",
        }}
      >
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div className="mini-label" style={{ marginBottom: 10 }}>经验池水位</div>
          <div className="gauge" style={{ height: 22 }}>
            <div
              style={{
                width: `${bufferPct * 100}%`,
                background: "var(--accent)",
                transition: "width 400ms ease",
              }}
            />
            <div className="g-white" />
          </div>
          <div
            className="mono flex justify-between"
            style={{ fontSize: "0.78rem", marginTop: 8, color: "var(--fg-muted)" }}
          >
            <span>{fmtInt(buffer)} 样本</span>
            <span>
              {bufferSize ? `容量 ${fmtInt(bufferSize)} · ${fmtPct(bufferPct, 1)}` : "—"}
            </span>
          </div>
          {cfg.min_buffer != null && (
            <div style={{ fontSize: "0.78rem", color: "var(--fg-faint)", marginTop: 6 }}>
              达到 {fmtInt(cfg.min_buffer)} 后开始训练
            </div>
          )}
        </div>
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div className="mini-label" style={{ marginBottom: 8 }}>实时事件</div>
          <EventTicker events={tickerEvents} height={210} />
        </div>
      </div>
    </div>
  )
}
