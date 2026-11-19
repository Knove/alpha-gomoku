const STEPS = [
  { n: 1, label: "棋盘", detail: "9×9" },
  { n: 2, label: "输入平面", detail: "3×9×9" },
  { n: 3, label: "首层卷积", detail: "48×9×9" },
  { n: 4, label: "残差主干", detail: "3 个残差块" },
  { n: 5, label: "双头读出", detail: "策略 81 · 价值 1" },
] as const

/** 第 6–9 课共用：始终告诉读者，当前零件在整张网络里的位置。 */
export function NetPipeline({ step }: { step: 2 | 3 | 4 | 5 }) {
  return (
    <nav className="net-pipeline" aria-label="网络数据流">
      <span className="net-pipeline-label">网络数据流</span>
      <ol>
        {STEPS.map((item, i) => {
          const current = item.n === step
          return (
            <li key={item.n}>
              {i > 0 && <span className="net-arrow" aria-hidden="true">→</span>}
              <span
                className={`net-stage${current ? " current" : ""}`}
                aria-current={current ? "step" : undefined}
              >
                <span className="net-stage-label">{item.label}</span>
                <span className="net-stage-detail mono">{item.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
