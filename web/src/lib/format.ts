/** Number / time formatting helpers. All numeric UI is mono + tabular. */

export const COL_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ" // no I (Go convention)

/** Board coordinate label, e.g. (4, 4) -> "E5". */
export function coordLabel(x: number, y: number): string {
  return `${COL_LETTERS[x] ?? "?"}${y + 1}`
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return Math.round(n).toLocaleString("en-US")
}

export function fmtFloat(n: number | null | undefined, digits = 4): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toFixed(digits)
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—"
  return `${(n * 100).toFixed(digits)}%`
}

/** unix seconds -> "HH:MM:SS" */
export function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (v: number) => String(v).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** unix seconds -> "MM-DD HH:MM" */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (v: number) => String(v).padStart(2, "0")
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Seconds age -> compact "3s" / "2m" / "1h" */
export function fmtAge(sec: number): string {
  if (sec < 0) sec = 0
  if (sec < 60) return `${Math.floor(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

/** Duration seconds -> "1.2s" or "3.4m" */
export function fmtDur(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—"
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${(sec / 60).toFixed(1)}m`
}

/** Game result -> Chinese label. perspective: 1 black / -1 white / 0 draw. */
export function resultText(result: number | null | undefined): string {
  if (result === 1) return "黑胜"
  if (result === -1) return "白胜"
  if (result === 0) return "和棋"
  return "未完"
}

/** Trainer state -> Chinese label. */
export function stateText(state: string | undefined): string {
  switch (state) {
    case "running":
      return "运行中"
    case "paused":
      return "已暂停"
    case "stopped":
      return "已停止"
    case "idle":
      return "空闲"
    default:
      return state ?? "未知"
  }
}

/** iteration_phase -> Chinese label. */
export function phaseText(phase: string | undefined): string {
  switch (phase) {
    case "selfplay":
      return "自我对弈"
    case "train":
      return "训练中"
    case "arena":
      return "竞技场"
    case "idle":
      return "待命"
    default:
      return phase ?? "—"
  }
}
