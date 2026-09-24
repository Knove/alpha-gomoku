/** 例占位框：后续任务把交互例填进来，先保证课程骨架可读。 */
export function Puzzle({ hint }: { hint: string }) {
  return (
    <div className="reveal-box mt-5 text-sm" style={{ color: "var(--fg-muted)" }}>
      例建设中 · {hint}
    </div>
  )
}
