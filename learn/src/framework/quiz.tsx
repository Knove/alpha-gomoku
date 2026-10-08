import { useState } from "react"

export interface QuizQ {
  q: string
  options: string[]
  answer: number
  explain: string
}

/** 思考题与习题共用：作答后立刻给完整解释；答错可以带着解释重答。不设门禁。 */
export function Quiz({
  questions,
  title = "习题",
}: {
  questions: QuizQ[]
  title?: string
}) {
  const [picked, setPicked] = useState<Record<number, number>>({})

  return (
    <section className="mt-12">
      <div className="eyebrow mb-3">{title}</div>
      {questions.map((q, i) => {
        const sel = picked[i]
        const answered = sel !== undefined
        const right = sel === q.answer
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
              if (answered && j === q.answer) cls = "correct"
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
            {answered && (
              <div className="reveal-box mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
                {q.explain}
                {!right && (
                  <button type="button" className="btn mt-3" onClick={retryOne}>
                    带着解释重答这一题
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
