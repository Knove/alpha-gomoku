/** 九宫格小表(3×3):第 6 课的模板/窗口/乘积、第 7 课的滑窗乘积。
 *  cells 为显示文本;tint 给非零格上底色;hot 给负数标朱砂。 */
export function MiniGrid9({
  label,
  cells,
  tint,
  hot,
}: {
  label: string
  cells: string[]
  tint: boolean[]
  hot?: boolean[]
}) {
  return (
    <div className="min-w-0">
      <div className="mini-label mb-1.5">{label}</div>
      <div className="l03-rows inline-block">
        {[0, 1, 2].map((r) => (
          <div key={r} className="flex">
            {[0, 1, 2].map((c) => {
              const i = r * 3 + c
              return (
                <span key={c} className={`l03-mini ${tint[i] ? "on" : ""}`}>
                  <span className={`num ${hot?.[i] ? "l03-neg" : ""}`}>{cells[i]}</span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
