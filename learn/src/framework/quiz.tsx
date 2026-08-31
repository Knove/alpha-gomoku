import { createContext, useContext, useEffect, useRef, useState } from "react"

export interface QuizQ {
  q: string
  options: string[]
  answer: number
  explain: string
}

/** 过关接线:App 提供,课内 Quiz 用 `onAllCorrect={() => passLesson("l01")}` 解锁下一课。 */
export const PassLessonContext = createContext<(lessonId: string) => void>(() => {})
export const usePassLesson = () => useContext(PassLessonContext)

/**
 * 谜题(承诺装置)与小测共用:
 * - 谜题不传 onAllCorrect —— 答错也揭晓(reveal-box),不设门禁;
 * - 小测传 onAllCorrect —— 答错不揭晓,「重答」到全对为止才放行。
 */
export function Quiz({
  questions,
  onAllCorrect,
  title = "小测",
}: {
  questions: QuizQ[]
  onAllCorrect?: () => void
  title?: string
}) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const fired = useRef(false)
  const gated = !!onAllCorrect
  const allRight = questions.every((q, i) => picked[i] === q.answer)
  const done = Object.keys(picked).length === questions.length
  const wrongCount = questions.reduce(
    (n, q, i) => (picked[i] !== undefined && picked[i] !== q.answer ? n + 1 : n),
    0,
  )

  // 全对回调走 useEffect + ref 防重,不在渲染期 setState
  useEffect(() => {
    if (done && allRight && onAllCorrect && !fired.current) {
      fired.current = true
      onAllCorrect()
    }
    if (!done || !allRight) fired.current = false
  }, [done, allRight, onAllCorrect])

  return (
    <section className="mt-12">
      <div className="eyebrow mb-3">{title}</div>
      {questions.map((q, i) => {
        const sel = picked[i]
        const answered = sel !== undefined
        const right = sel === q.answer
        const reveal = answered && (right || !gated)
        return (
          <div key={i} className="quiz-card mt-4">
            <p className="font-semibold">
              {i + 1}. {q.q}
            </p>
            {q.options.map((opt, j) => {
              let cls = ""
              if (answered && j === sel) cls = right ? "correct" : "wrong"
              if (reveal && j === q.answer) cls = "correct"
              return (
                <button
                  key={j}
                  type="button"
                  className={`quiz-option ${cls}`}
                  disabled={answered}
                  onClick={() => setPicked((p) => ({ ...p, [i]: j }))}
                >
                  {opt}
                </button>
              )
            })}
            {reveal && (
              <div className="reveal-box mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
                {q.explain}
              </div>
            )}
          </div>
        )
      })}
      {gated && done && allRight && (
        <p className="mt-5 font-semibold" style={{ color: "var(--accent-deep)" }}>
          ✓ 过关,下一课已解锁——点左侧目录接着走
        </p>
      )}
      {gated && wrongCount > 0 && (
        <p className="mt-5 flex flex-wrap items-center gap-3" style={{ color: "var(--fg-muted)" }}>
          有答错的题已标出,想好后点「重答」重新选(会清空这份小测的全部答案)
          <button type="button" className="btn" onClick={() => setPicked({})}>
            重答
          </button>
        </p>
      )}
    </section>
  )
}
