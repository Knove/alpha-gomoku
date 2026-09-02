// localStorage 门禁,无账号
export interface Progress {
  unlocked: number // 已解锁到第几课(索引,0 = 序)
  quizPassed: Record<string, boolean>
}
// v3:课程将“回摊”后移到搜索之后，旧 v2 的索引顺序已不再表示同一学习阶段。
// 为避免旧进度直接跳过新的因果链，使用新 key 从序重新开始。
const KEY = "learn-progress-v3"

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { unlocked: 0, quizPassed: {}, ...JSON.parse(raw) }
  } catch {
    /* private mode */
  }
  return { unlocked: 0, quizPassed: {} }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function passQuiz(p: Progress, lessonId: string, lessonCount: number): Progress {
  // 已过关的课再触发(重答/回点按钮)不重复推进,防止跳课
  if (p.quizPassed[lessonId]) return p
  const next = { ...p, quizPassed: { ...p.quizPassed, [lessonId]: true } }
  if (p.unlocked < lessonCount - 1) next.unlocked = p.unlocked + 1
  return next
}
