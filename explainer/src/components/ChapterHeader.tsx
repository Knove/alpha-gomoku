/** Chapter header: cinnabar seal number + eyebrow + title (article style). */
import Reveal from "../lib/reveal"

export default function ChapterHeader({
  no,
  eyebrow,
  title,
}: {
  /** seal text, e.g. "壹" */
  no: string
  eyebrow: string
  title: string
}) {
  return (
    <Reveal>
      <header style={{ marginBottom: "1.6rem" }}>
        <div className="flex items-center" style={{ gap: "0.9rem" }}>
          <span className="seal">{no}</span>
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </h2>
          </div>
        </div>
      </header>
    </Reveal>
  )
}
