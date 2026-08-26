// localStorage 门禁,无账号
export interface Progress {
  unlocked: number // 已解锁到第几课(索引,0 = 序)
  quizPassed: Record<string, boolean>
}
// v2:课程从 11 课扩到 15 课(第 3-6 课地基篇),旧 v1 的 id 与新课撞名、
// unlocked 索引也换了含义——干净重置,不做迁移(序里有改版说明)
const KEY = "learn-progress-v2"

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
