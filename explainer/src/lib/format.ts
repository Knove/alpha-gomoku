/** Number / coordinate formatting. All numeric UI is mono + tabular. */

export const COL_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ" // no I (Go convention)

/** Board coordinate label, e.g. (4, 4) -> "E5". */
export function coordLabel(x: number, y: number): string {
  return `${COL_LETTERS[x] ?? "?"}${y + 1}`
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return Math.round(n).toLocaleString("en-US")
}

export function fmtFloat(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return "—"
  // toFixed 保留符号:-0.0045 → "-0.00",归一化为 "0.00"
  return n.toFixed(digits).replace(/^-(0\.0+)$/, "$1")
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—"
  return `${(n * 100).toFixed(digits)}%`
}

/** unix seconds -> "MM-DD HH:MM" */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (v: number) => String(v).padStart(2, "0")
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Game result -> Chinese label. 1 black / -1 white / 0 draw. */
export function resultText(result: number | null | undefined): string {
  if (result === 1) return "黑胜"
  if (result === -1) return "白胜"
  if (result === 0) return "和棋"
  return "未完"
}
