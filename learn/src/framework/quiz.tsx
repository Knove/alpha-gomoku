import { createContext, useContext, useEffect, useRef, useState } from "react"

export interface QuizQ {
  q: string
  options: string[]
  answer: number
  explain: string
}

/** 过关接线：App 提供，课内 Quiz 用 `onAllCorrect={() => passLesson("l01")}` 解锁下一课。 */
export const PassLessonContext = createContext<(lessonId: string) => void>(() => {})
export const usePassLesson = () => useContext(PassLessonContext)

/**
 * 思考题(承诺装置)与习题共用：
 * - 思考题不传 onAllCorrect : 答错也给完整解释(reveal-box),不设门禁；
 * - 习题传 onAllCorrect : 首错立即给完整因果解释，再用同题重试；答对才放行。
 */
export function Quiz({
  questions,
  onAllCorrect,
  title = "习题",
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

  // 全对回调走 useEffect + ref 防重，不在渲染期 setState
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
        // 第一次作答就给完整因果解释；答错后带着解释重试，避免把挫败当检索训练。
        const reveal = answered
        const retryOne = () => {
          setPicked((p) => {
            const next = { ...p }
            delete next[i]
            return next
          })
        }
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
                {gated && !right && (
                  <button type="button" className="btn mt-3" onClick={retryOne}>
                    带着解释重答这一题
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {gated && done && allRight && (
        <p className="mt-5 font-semibold" style={{ color: "var(--accent-deep)" }}>
          ✓ 过关，下一章已解锁。点左侧目录接着走
        </p>
      )}
    </section>
  )
}
