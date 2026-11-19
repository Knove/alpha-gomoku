import { useState } from "react"
import { useFeynmanNote } from "./feynman-notes"

export function FeynmanNoteCard({ lessonId, compact = false }: { lessonId: string; compact?: boolean }) {
  const note = useFeynmanNote(lessonId)
  const [copied, setCopied] = useState(false)
  if (!note) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className={`feynman-note-card${compact ? " compact" : ""}`} aria-label="本课费曼定稿">
      <div className="feynman-note-head">
        <div>
          <span className="feynman-note-kicker">本课费曼定稿 · 导师整理 · 本机保存</span>
          <strong>导师根据你本轮讲对的内容整理的干净版本</strong>
        </div>
        <button type="button" onClick={() => void copy()}>{copied ? "已复制" : "复制"}</button>
      </div>
      <p>{note.text}</p>
      <small>由导师把本轮讲对的因果压缩成笔记，不是掌握判定，也不能代替下一次主动回忆。</small>
    </section>
  )
}
