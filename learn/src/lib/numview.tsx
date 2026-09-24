/** 9×9 数值方阵：棋盘的「数值形态」。
 *  - canon 为 null:静态单层(第 1 课，数字随落子出现);
 *  - canon 为 boolean:双层交叉淡化，客观值 ↔ canonical 值逐格取反(第 2 课视角开关)。 */
export function NumTable({
  board,
  canon = null,
  lastIdx = null,
}: {
  board: number[]
  canon?: boolean | null
  lastIdx?: number | null
}) {
  const txt = (v: number) => (v === 0 ? "·" : v === 1 ? "+1" : "−1")
  const cls = (v: number) => (v === 1 ? "l01-v1" : v === -1 ? "l01-vm1" : "l01-v0")
  const dual = canon !== null

  return (
    <div className="inline-block">
      <div className="flex">
        <span className="l01-axis" />
        {Array.from({ length: 9 }, (_, x) => (
          <span key={`h${x}`} className={`l01-axis num w-[1.5rem] text-center`}>
            {x}
          </span>
        ))}
      </div>
      {Array.from({ length: 9 }, (_, y) => (
        <div key={`r${y}`} className="flex">
          <span className="l01-axis num leading-[1.5rem]">{y}</span>
          {Array.from({ length: 9 }, (_, x) => {
            const i = y * 9 + x
            const v = board[i]
            return (
              <div key={i} data-i={i} className="l01-cell"
                style={lastIdx === i ? { background: "var(--accent-wash)" } : undefined}>
                {dual ? (
                  <>
                    <span className={`l01-v ${cls(v)}`} style={{ opacity: canon ? 0 : 1 }}>
                      {txt(v)}
                    </span>
                    <span className={`l01-v ${cls(-v)}`} style={{ opacity: canon ? 1 : 0 }}>
                      {txt(-v)}
                    </span>
                  </>
                ) : (
                  <span className={`l01-v ${cls(v)}`}>{txt(v)}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
