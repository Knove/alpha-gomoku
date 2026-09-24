/**
 * 序章的“先看整条链”图。
 *
 * 不试图在这里教术语；它只给读者一个反复回看的位置，让后面每一课都有
 * 明确的系统落点。链接即使尚未解锁也会显示该课预告。
 */
const STEPS = [
  { title: "棋局", sub: "格子、动作 + 当前谁走", href: "#/l01" },
  { title: "神经网络", sub: "给出下哪 / 谁优两个判断", href: "#/l09" },
  { title: "搜索", sub: "检查候选分支，多想几步", href: "#/l10" },
  { title: "留下样本", sub: "搜索记录 + 最终输赢", href: "#/l12" },
  { title: "改权重", sub: "两种错误一起反向传播", href: "#/l13" },
  { title: "竞技场", sub: "对战看是否真的变强", href: "#/l15" },
  { title: "保存运行产物", sub: "训练事实写进 run 目录", href: "#/l17" },
] as const

export function SystemPreview() {
  return (
    <figure className="system-preview mt-8" aria-labelledby="system-preview-title">
      <div className="system-preview-head">
        <span className="mini-label" id="system-preview-title">先看整条链 · 后续逐站推导每个名字</span>
        <span className="text-xs" style={{ color: "var(--fg-faint)" }}>以后每课都会点亮其中一环</span>
      </div>
      <ol>
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <a href={step.href}>
              <strong>{step.title}</strong>
              <span>{step.sub}</span>
            </a>
            {i < STEPS.length - 1 && <i aria-hidden="true">→</i>}
          </li>
        ))}
      </ol>
      <figcaption>
        先抓住这一条主线：<strong>网络先判断、搜索再推演；结果变成样本，样本再改进判断；运行产物让这些变化可以被检查。</strong>
        这张图按系统实际发生的顺序画。课程会先补齐每一步需要的知识，再把同一份真实案例逐段接起来；
        每个概念、公式和项目对证都属于必修内容。
      </figcaption>
    </figure>
  )
}
