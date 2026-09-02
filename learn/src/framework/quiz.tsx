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
 * - 小测传 onAllCorrect —— 首错先给检索提示，二错给完整解释；答对才放行。
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
  const [wrongAttempts, setWrongAttempts] = useState<Record<number, number>>({})
  const fired = useRef(false)
  const gated = !!onAllCorrect
  const allRight = questions.every((q, i) => picked[i] === q.answer)
  const done = Object.keys(picked).length === questions.length

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
        const attempts = wrongAttempts[i] ?? 0
        // 谜题立即揭晓；关卡小测则保留一次“自己回去找因果链”的检索机会，
        // 第二次错误一定给完整解释，避免只靠猜选项过关。
        const reveal = answered && (right || !gated || attempts >= 2)
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
                  onClick={() => {
                    setPicked((p) => ({ ...p, [i]: j }))
                    if (j !== q.answer)
                      setWrongAttempts((a) => ({ ...a, [i]: (a[i] ?? 0) + 1 }))
                  }}
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
            {gated && answered && !right && !reveal && (
              <div className="reveal-box mt-3 text-sm" style={{ color: "var(--fg-muted)" }}>
                <strong>提示：</strong>先回到本章“揭晓”和互动部件，找出这道题问的那条
                “因为 → 所以”链；再试一次。第二次答错会给完整因果解释。
                <button type="button" className="btn mt-3" onClick={retryOne}>
                  重答这一题
                </button>
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
    </section>
  )
}
