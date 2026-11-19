import { useEffect } from "react"
import { registerTutorQuestions } from "./question-bank"
import { useTutor } from "./tutor-context"

export interface QuizQ {
  q: string
  options: string[]
  answer: number
  explain: string
}

/**
 * 旧选择题不再出现在页面上；这里只登记题目与答案，供站内导师按需改成开放式追问。
 * 页面上的考问必须由学生在对话中主动发起。
 */
export function Quiz({
  questions,
  title = "习题",
}: {
  questions: QuizQ[]
  title?: string
}) {
  const { currentId } = useTutor()

  useEffect(() => {
    registerTutorQuestions(
      currentId || "prologue",
      title,
      questions.map((question) => ({
        question: question.q,
        referenceAnswer: question.options[question.answer] ?? "",
        explain: question.explain,
      })),
    )
  }, [currentId, questions, title])

  return null
}
