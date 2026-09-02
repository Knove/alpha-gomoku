/**
 * 序章的“先看整条链”图。
 *
 * 不试图在这里教术语；它只给读者一个反复回看的位置，让后面每一课都有
 * 明确的系统落点。链接即使尚未解锁也会显示该课预告。
 */
const STEPS = [
  { title: "棋局", sub: "81 个格子 + 当前谁走", href: "#/l01" },
  { title: "判断器", sub: "网络给出下哪 / 谁优", href: "#/l10" },
  { title: "多想几步", sub: "搜索检查候选分支", href: "#/l11" },
  { title: "留下作业", sub: "搜索记录 + 最终输赢", href: "#/l12" },
  { title: "改旋钮", sub: "两种错误一起回摊", href: "#/l06" },
  { title: "真刀真枪验收", sub: "对战看是否真的变强", href: "#/l13" },
] as const

export function SystemPreview() {
  return (
    <figure className="system-preview mt-8" aria-labelledby="system-preview-title">
      <div className="system-preview-head">
        <span className="mini-label" id="system-preview-title">先看整条链 · 现在不用记名词</span>
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
        先记住一句话就够：<strong>它先判断、再推演；结果变成作业，作业再改进判断。</strong>
        这张图按<strong>系统实际发生的顺序</strong>画；课程为了先讲清更新机制，会在第 11 课先学“怎样改旋钮”，
        再在第 12 课讲“怎样把很多盘作业攒起来”。点击任何一环可看它在课程中的位置；未解锁时会显示预告。
      </figcaption>
    </figure>
  )
}
