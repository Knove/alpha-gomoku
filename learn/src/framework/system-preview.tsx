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
        <span className="mini-label" id="system-preview-title">系统全景 · 点击任意一环可直达对应课程</span>
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
        整条主线按运行顺序串起：<strong>网络先给第一眼判断，搜索再往后推演；对弈结果存成样本，样本反向传播更新权重；竞技场对战验收新权重，运行产物落盘供网页查看。</strong>
      </figcaption>
    </figure>
  )
}
