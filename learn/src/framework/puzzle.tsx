/** 部件占位框:后续任务把交互部件填进来,先保证课程骨架可读。 */
export function Puzzle({ hint }: { hint: string }) {
  return (
    <div className="reveal-box mt-5 text-sm" style={{ color: "var(--fg-muted)" }}>
      部件建设中 · {hint}
    </div>
  )
}
