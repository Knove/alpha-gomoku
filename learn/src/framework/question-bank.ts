export interface TutorQuestion {
  question: string
  referenceAnswer: string
  explain: string
}

interface QuestionSet {
  title: string
  questions: TutorQuestion[]
}

/** 页面上不再展示的选择题数据，只作为导师出题的内部线索。 */
const banks = new Map<string, QuestionSet[]>()

export function registerTutorQuestions(
  lessonId: string,
  title: string,
  questions: readonly TutorQuestion[],
) {
  if (!lessonId || questions.length === 0) return
  const sets = banks.get(lessonId) ?? []
  const next = { title, questions: [...questions] }
  const index = sets.findIndex((set) => set.title === title)
  if (index >= 0) sets[index] = next
  else sets.push(next)
  banks.set(lessonId, sets)
}

export function getTutorQuestions(lessonId: string): TutorQuestion[] {
  const seen = new Set<string>()
  const result: TutorQuestion[] = []
  for (const set of banks.get(lessonId) ?? []) {
    for (const question of set.questions) {
      if (seen.has(question.question)) continue
      seen.add(question.question)
      result.push(question)
    }
  }
  return result
}
