import { Fragment, type RefObject } from "react"
import {
  CURRICULUM,
  STAGES,
  isStageCheckpoint,
  practiceForLesson,
  requiredFeynmanTurns,
  stageForLesson,
} from "./curriculum"
import { cheatSheetFor } from "./cheat-sheets"
import { FeynmanNoteCard } from "./feynman-note-card"
import { useFeynmanNote } from "./feynman-notes"
import { useLearningProgress } from "./progress-context"
import { useLessonReading } from "./reading-context"
import { RECALL_QUESTIONS } from "./reflection"
import {
  CAPSTONE,
  CORE_UNITS,
  SEVEN_DAY_PATH,
  SIGNAL_RESOURCES,
  coreUnitCompleted,
  coreUnitForLesson,
  coreUnitMasteryCount,
  stageSelfTestReady,
} from "./study-system"
import { useTutor, type QuizPlan, type TutorMode } from "./tutor-context"
import { usePracticeArtifact } from "./use-practice-artifact"

export function StudyRail({
  currentId,
  open = false,
  onClose,
  containerRef,
}: {
  currentId: string | null
  /** 窄屏抽屉是否展开；桌面端始终可见，不依赖此状态。 */
  open?: boolean
  onClose?: () => void
  containerRef?: RefObject<HTMLElement | null>
}) {
  const { openTutor, session } = useTutor()
  const {
    progress,
    isMastered,
    isUnlocked,
    frontierIndex,
    masteredCount,
    storageError,
    corruptProgress,
    resetDamagedProgress,
  } = useLearningProgress()
  const activeId = currentId ?? "prologue"
  const currentIndex = Math.max(0, CURRICULUM.findIndex((unit) => unit.id === activeId))
  const current = CURRICULUM[currentIndex]
  const next = currentIndex < CURRICULUM.length - 1 ? CURRICULUM[currentIndex + 1] : null
  const previous = currentIndex > 0 ? CURRICULUM[currentIndex - 1] : null
  const currentStage = stageForLesson(current.id)
  const activeLevel = Math.max(0, STAGES.findIndex((stage) => stage.id === currentStage?.id))
  const currentCoreUnit = coreUnitForLesson(current.id)
  const currentPractice = practiceForLesson(current.id)
  const previousRecall = previous ? cheatSheetFor(previous.id)?.qa[0] ?? null : null
  const checkpoint = isStageCheckpoint(current.id)
  // 自测是“进入下一阶段前”的诊断，不是通关后的装饰；阶段末课本身通过前就应可用。
  const stageReadyForSelfTest = stageSelfTestReady(currentStage, isMastered)
  const requiredTurns = requiredFeynmanTurns(current.id)
  const practiceTurns = session.feynmanTurns
  const enoughEvidence = practiceTurns >= requiredTurns
  const mastered = isMastered(current.id)
  const reading = useLessonReading()
  const practiceArtifact = usePracticeArtifact(current.id)
  const artifactReady = Boolean(practiceArtifact?.text.trim())
  const feynmanNote = useFeynmanNote(current.id)
  const resourceByTitle = new Map(SIGNAL_RESOURCES.map((resource) => [resource.title, resource]))
  const phase = mastered
    ? "done"
    : !reading.reachedEnd
      ? "read"
      : !artifactReady
        ? "practice"
        : enoughEvidence
          ? "judge"
          : "reflect"
  const progressPercent = Math.round((masteredCount / CURRICULUM.length) * 100)
  const reviewQueue = CURRICULUM
    .filter((unit) => isMastered(unit.id))
    .sort((left, right) => (
      Date.parse(progress.mastered[left.id]?.passedAt ?? "") - Date.parse(progress.mastered[right.id]?.passedAt ?? "")
    ))
  const openTutorFromRail = (mode: TutorMode, quizPlan?: QuizPlan) => {
    onClose?.()
    openTutor(mode, quizPlan)
  }
  const openChapterCheatSheet = () => {
    onClose?.()
    const sheet = document.querySelector<HTMLDetailsElement>("#lesson-cheat-sheet")
    if (!sheet) return
    sheet.open = true
    requestAnimationFrame(() => {
      sheet.scrollIntoView({ block: "start", behavior: "instant" })
      sheet.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true })
    })
  }

  return (
    <aside
      ref={containerRef}
      id="study-rail"
      className={`study-rail${open ? " is-open" : ""}`}
      aria-label="学习路径与当前位置"
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
    >
      <div className="study-rail-summary">
        <div className="study-rail-head">
          <span className="mini-label">学习路径</span>
          <span className="study-rail-step num">已通过 {masteredCount} / {CURRICULUM.length}</span>
          <button type="button" className="study-rail-close" onClick={onClose} aria-label="关闭学习路径">
            ×
          </button>
        </div>

        <div className="study-rail-now">
          <span className="study-rail-now-label">正在读</span>
          <a className="study-rail-now-title" href={`#/${current.id}`}>
            <span className="num">{current.num}</span>{current.title}
          </a>
          <span className="study-rail-phase">
            第 {activeLevel + 1} 级 · {STAGES[activeLevel].title} · {current.phase}
          </span>
          <span className={`study-rail-checkpoint${checkpoint ? " final" : ""}`}>
            {checkpoint ? "阶段末课 · 额外做一次跨课验收" : `本阶段第 ${(currentStage?.lessonIds.indexOf(current.id) ?? 0) + 1} / ${currentStage?.lessonIds.length ?? 1} 课`}
          </span>
          <p className="study-rail-goal"><strong>这一级要能：</strong>{STAGES[activeLevel].goal}</p>
          <div className="study-rail-meter" aria-hidden="true">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="study-rail-note">只有导师判定通过才解锁下一课；进度只保存在本机浏览器。</p>
          {storageError && (
            <div className="study-rail-storage-error" role="alert">
              <p>{storageError}</p>
              {corruptProgress && (
                <button type="button" onClick={() => resetDamagedProgress()}>
                  先备份，再重置进度
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="study-rail-scroll">
        <div className="study-rail-section study-rail-now-section">
          <div className="study-rail-section-title">
            现在做什么
            <span>{phase === "read" ? "读" : phase === "practice" ? "做" : phase === "reflect" ? "讲" : phase === "judge" ? "判" : "下一课"}</span>
          </div>
          {phase === "read" && previous && previousRecall && (
            <details className="study-rail-recall">
              <summary>
                <span>上一课 · 30 秒回忆</span>
                <strong>{previousRecall.q}</strong>
              </summary>
              <p>{previousRecall.a}</p>
              <p className="study-rail-recall-note">
                先在心里答，再展开对一下。想不起来就回上一课看速查卡；它不判分，也不影响本课进度。
              </p>
              <a href={`#/${previous.id}`}>回到 {previous.num === "序" ? "序章" : `第 ${previous.num} 课`} →</a>
            </details>
          )}
          <div className={`study-rail-action ${phase}`}>
            <span className="study-rail-action-kicker">
              {phase === "read"
                ? "第 1 件 · 读到末尾"
                : phase === "practice"
                  ? "第 2 件 · 先交动手产物"
                  : phase === "reflect"
                    ? `第 3 件 · 还差 ${Math.max(0, requiredTurns - practiceTurns)} 轮追问`
                    : phase === "judge"
                      ? "第 4 件 · 交给导师判定"
                      : "已通过 · 可以前进"}
            </span>
            <strong>
              {phase === "read"
                ? "继续读，卡住就当场问"
                : phase === "practice"
                  ? "先把这一课亲手做一遍"
                  : phase === "reflect"
                    ? checkpoint ? "阶段末：还要完成跨课迁移" : "先别翻小结，讲一遍"
                    : phase === "judge"
                      ? "最低轮次到了，交给独立判定"
                      : "下一课已经解锁"}
            </strong>
            <p>
              {phase === "read"
                ? "读到本章收束处。遇到跳步、术语或对不上的数字，直接打开导师问清楚。"
                : phase === "practice"
                  ? currentPractice?.task ?? "把本课的动手结果写进导师；没有产物不能进入复述。"
                  : phase === "reflect"
                    ? checkpoint
                      ? "除了本课因果，导师还会追一个跨课场景；用自己的话答，不要复述原文。"
                      : "导师会从解释、应用、纠错三个面追问。每次只补最小的缺口，不替你背答案。"
                    : phase === "judge"
                      ? "最低轮次只是入场券。打开导师点“交给导师判定”；只有三类证据齐全，下一课才解锁。"
                      : "你的掌握判定已记录在本机。可以进入下一课，也可以继续复盘或提问。"}
            </p>
            <div className="study-rail-action-buttons">
              {phase === "read" && (
                <button type="button" onClick={() => openTutorFromRail("ask")}>遇到卡点，问导师</button>
              )}
              {phase === "practice" && (
                <>
                  <button type="button" className="primary" onClick={() => openTutorFromRail("feynman")}>打开导师 · 提交产物</button>
                  <button type="button" onClick={() => openTutorFromRail("ask")}>先问清楚再动手</button>
                </>
              )}
              {phase === "reflect" && (
                <>
                  <button type="button" className="primary" onClick={() => openTutorFromRail("feynman")}>继续用自己的话讲</button>
                  <button type="button" onClick={() => openTutorFromRail("ask")}>先问清楚</button>
                </>
              )}
              {phase === "judge" && (
                <>
                  <button type="button" className="primary" onClick={() => openTutorFromRail("feynman")}>打开导师 · 申请判定</button>
                  <button type="button" onClick={() => openTutorFromRail("ask")}>还有疑问</button>
                </>
              )}
              {phase === "done" && (
                <>
                  <button type="button" className="primary" onClick={() => openTutorFromRail("quiz", "quick")}>3 分钟快问 · 考我</button>
                  <button type="button" onClick={() => openTutorFromRail("quiz", "full")}>完整 10 题 · 考我</button>
                  <button type="button" onClick={openChapterCheatSheet}>打开一页速查卡</button>
                  {!artifactReady && <button type="button" onClick={() => openTutorFromRail("feynman")}>补做本课产物</button>}
                  <button type="button" onClick={() => openTutorFromRail("ask")}>再复盘一个点</button>
                </>
              )}
            </div>
          </div>

          <div className="study-rail-checks">
            <div>
              <span>读到末尾</span>
              <strong>{reading.reachedEnd ? "✓" : `${reading.percent}%`}</strong>
            </div>
            <div>
              <span>导师判定</span>
              <strong>{mastered ? "✓ 通过" : `证据 ${Math.min(practiceTurns, requiredTurns)}/${requiredTurns} 轮`}</strong>
            </div>
            <div className="wide">
              <span>动手产物</span>
              <strong>
                {artifactReady
                  ? "✓ 已记录"
                  : mastered
                    ? "旧记录 · 无产物"
                    : reading.reachedEnd
                      ? "待提交"
                      : "读到末尾后"}
              </strong>
            </div>
            {checkpoint && (
              <div className="wide">
                <span>本课要求</span>
                <strong>阶段末验收</strong>
              </div>
            )}
          </div>
        </div>

        {feynmanNote && (
          <details className="study-rail-details study-rail-feynman-note">
            <summary>
              本课费曼定稿 · 导师整理
              <span>{feynmanNote.updatedAt.slice(0, 10)} 保存</span>
            </summary>
            <FeynmanNoteCard lessonId={current.id} compact />
          </details>
        )}

        <details className="study-rail-details study-rail-review-index">
          <summary>
            速查卡复习队列
            <span>{reviewQueue.length > 0 ? `${reviewQueue.length} 张 · 最早通过的先复习` : "通过第一课后加入"}</span>
          </summary>
          {reviewQueue.length > 0 ? (
            <>
              <p className="study-rail-details-note">
                这里只放已经通过导师判定的课，按通过时间从早到晚排。点任意一课会直接展开那张速查卡，做 5 分钟闭卷回忆；这里不排自动闹钟，也不假装知道你的遗忘曲线。
              </p>
              <ol className="study-rail-review-list">
                {reviewQueue.map((unit, index) => (
                  <li key={unit.id}>
                    <a
                      href={`#/${unit.id}?review=sheet`}
                      onClick={unit.id === current.id ? (event) => {
                        event.preventDefault()
                        openChapterCheatSheet()
                      } : undefined}
                    >
                      <span className="study-rail-plan-no num">{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{unit.num} · {unit.title}</strong>
                        <small>{progress.mastered[unit.id]?.passedAt.slice(0, 10)} 通过</small>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="study-rail-details-note">
              通过第一课后，这里会自动长出复习队列。速查卡用于短时回忆，不参与新的掌握判定，也不能替你完成合书复述。
            </p>
          )}
        </details>

        <div className="study-rail-section">
          <div className="study-rail-section-title">五级台阶</div>
          <ol className="study-rail-levels">
            {STAGES.map((stage, index) => {
              const active = index === activeLevel
              const stagePassed = isMastered(stage.lessonIds.at(-1) ?? "")
              const stageStart = CURRICULUM.findIndex((unit) => unit.id === stage.entryId)
              const unlocked = stageStart <= frontierIndex
              const state = stagePassed ? "已通过" : active ? "当前" : unlocked ? "可回看" : "未解锁"
              const content = (
                <>
                  <span className="study-rail-level-no num">{stagePassed ? "✓" : index + 1}</span>
                  <span className="study-rail-level-copy">
                    <strong>{stage.title}</strong>
                    <small>{stage.range} · {state}</small>
                  </span>
                </>
              )
              return (
                <li key={stage.id}>
                  {unlocked ? (
                    <a
                      className={`${active ? "active" : ""}${stagePassed ? " passed" : ""}`.trim()}
                      href={`#/${stage.entryId}`}
                      aria-current={active ? "step" : undefined}
                    >
                      {content}
                    </a>
                  ) : (
                    <span className="locked" aria-disabled="true">{content}</span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>

        {currentStage && (
          <details className="study-rail-details study-rail-stage">
            <summary>
              本级阶梯卡
              <span>{currentStage.range} · 约 {currentStage.hours} 小时</span>
            </summary>
            <div className="study-rail-stage-block">
              <span>达到这一级要能</span>
              <p>{currentStage.goal}</p>
            </div>
            <div className="study-rail-stage-block">
              <span>核心概念</span>
              <ul>
                {currentStage.core.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="study-rail-stage-block">
              <span>动手练习</span>
              <p>{currentStage.practice}</p>
            </div>
            <div className="study-rail-stage-block">
              <span>阶段里程碑</span>
              <p>{currentStage.checkpoint}</p>
            </div>
            <div className="study-rail-stage-block mistake">
              <span>常见错误</span>
              <p>{currentStage.commonMistake}</p>
            </div>
            <div className="study-rail-stage-block">
              <span>闭卷自测</span>
              <ol>
                {currentStage.selfTests.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </div>
            {stageReadyForSelfTest ? (
              <button
                type="button"
                className="study-rail-mini-action"
                onClick={() => openTutorFromRail("quiz", "stage")}
              >
                用本级自测考我
              </button>
            ) : (
              <p className="study-rail-details-note">先通过本阶段前面的课，再用本级自测做验收前诊断；它只暴露漏洞，不参与放行。</p>
            )}
          </details>
        )}

        <details className="study-rail-details study-rail-stage-map">
          <summary>
            五级全图 · 每一级要过什么
            <span>只展开验收标准，不会解锁课程</span>
          </summary>
          <p className="study-rail-details-note">
            文章里的阶梯不是五个标题，而是每一级各有目标、里程碑、练习、常见错误和闭卷自测。这里把五级契约放在一起，方便你提前看路，也方便回头确认自己卡在哪一级。
          </p>
          <ol className="study-rail-stage-map-list">
            {STAGES.map((stage, index) => {
              const stagePassed = isMastered(stage.lessonIds.at(-1) ?? "")
              const stageStart = CURRICULUM.findIndex((unit) => unit.id === stage.entryId)
              const state = stagePassed ? "已通过" : stage.id === currentStage?.id ? "当前级" : stageStart <= frontierIndex ? "可回看" : "未解锁"
              return (
                <li key={stage.id}>
                  <details className={`study-rail-stage-map-item${stage.id === currentStage?.id ? " current" : ""}`}>
                    <summary>
                      <span className="study-rail-plan-no num">{stagePassed ? "✓" : index + 1}</span>
                      <span>
                        <strong>{stage.title}</strong>
                        <small>{stage.range} · 约 {stage.hours} 小时 · {state}</small>
                      </span>
                    </summary>
                    <div className="study-rail-stage-block">
                      <span>达到这一级要能</span>
                      <p>{stage.goal}</p>
                    </div>
                    <div className="study-rail-stage-block">
                      <span>核心概念</span>
                      <ul>
                        {stage.core.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div className="study-rail-stage-block">
                      <span>动手练习</span>
                      <p>{stage.practice}</p>
                    </div>
                    <div className="study-rail-stage-block">
                      <span>阶段里程碑</span>
                      <p>{stage.checkpoint}</p>
                    </div>
                    <div className="study-rail-stage-block mistake">
                      <span>常见错误</span>
                      <p>{stage.commonMistake}</p>
                    </div>
                    <div className="study-rail-stage-block">
                      <span>闭卷自测</span>
                      <ol>
                        {stage.selfTests.map((item) => <li key={item}>{item}</li>)}
                      </ol>
                    </div>
                  </details>
                </li>
              )
            })}
          </ol>
          <p className="study-rail-details-note">提前看标准不等于提前解锁；只有阶段末课的导师判定能推进边界。</p>
        </details>

        <details className="study-rail-details study-rail-plan">
          <summary>
            20 小时主线 · 10 个单元
            <span>{currentCoreUnit ? `现在：${currentCoreUnit.range}` : "规划框架"}</span>
          </summary>
          <p className="study-rail-details-note">
            这 10 个单元就是本项目的主干 20%：目标不是背完每个实现细节，而是能读懂并改动整条系统。每个单元约 2 小时，掌握不够就停下补，不按表硬赶。
          </p>
          <ol className="study-rail-plan-list">
            {CORE_UNITS.map((unit, index) => {
              const active = unit.id === currentCoreUnit?.id
              const doneCount = coreUnitMasteryCount(unit, isMastered)
              const completed = coreUnitCompleted(unit, isMastered)
              const showWork = active || completed
              const firstUnlocked = isUnlocked(unit.lessonIds[0])
              return (
                <li
                  key={unit.id}
                  className={`${active ? "current " : ""}${completed ? "passed" : ""}`.trim()}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="study-rail-plan-no num">{completed ? "✓" : index + 1}</span>
                  <div>
                    <strong>{unit.title}</strong>
                    <small>{unit.range} · 约 {unit.hours} 小时 · {doneCount}/{unit.lessonIds.length} 课通过</small>
                    <p>{unit.goal}</p>
                    <p className="study-rail-unit-why"><b>为什么先学：</b>{unit.why}</p>
                    <p className="study-rail-unit-concepts"><b>核心：</b>{unit.coreConcepts.join(" · ")}</p>
                    <p className="study-rail-unit-resource"><b>去查：</b>{unit.resource.replaceAll("`", "")}</p>
                    {showWork && (
                      <>
                        <em>练习：{unit.exercise}</em>
                        <em>产出：{unit.output}</em>
                        <p className="study-rail-details-note">
                          这里是本单元的复习提纲，不另设单元通关；真正放行仍以这两课各自的产物和导师判定为准。
                        </p>
                      </>
                    )}
                    {completed ? (
                      <>
                        <details className="study-rail-unit-review">
                          <summary>复习这 5 个问题</summary>
                          <ol>
                            {unit.reviewQuestions.map((question) => <li key={question}>{question}</li>)}
                          </ol>
                        </details>
                        {active ? (
                          <button
                            type="button"
                            className="study-rail-mini-action"
                            onClick={() => openTutorFromRail("quiz", "unit")}
                          >
                            用本单元 5 问考我
                          </button>
                        ) : (
                          <a className="study-rail-unit-link" href={`#/${unit.lessonIds[0]}`}>回到本单元复习 →</a>
                        )}
                      </>
                    ) : active ? (
                      <p className="study-rail-details-note">5 个复习问题在本单元全部通过后出现；现在先做上面的练习。</p>
                    ) : firstUnlocked ? (
                      <a className="study-rail-unit-link" href={`#/${unit.lessonIds[0]}`}>进入本单元 →</a>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="study-rail-details-note">
            先抓能读懂并改动系统的主干，不是要求 20 小时背完每个实现细节。每单元结束仍以导师判定为准；没掌握就停下来补，不按表硬赶。
          </p>
        </details>

        <details className="study-rail-details study-rail-resources">
          <summary>
            5 个信号源 · 7 天冲刺
            <span>少收藏，多对证</span>
          </summary>
          <p className="study-rail-details-note">
            不要求你把五本书都读完。下面按推荐使用顺序排列；每个源都写清“为什么值得看”“覆盖哪一段”和“不要拿它做什么”。
          </p>
          <ol className="study-rail-resource-list">
            {SIGNAL_RESOURCES.map((resource, index) => (
              <li key={resource.title}>
                <span className="study-rail-plan-no num">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>
                    <a
                      href={resource.href}
                      {...(resource.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })}
                    >
                      {resource.title}
                    </a>
                  </strong>
                  <small>{resource.kind} · {resource.level}</small>
                  <p>{resource.why}</p>
                  <p><b>覆盖：</b>{resource.covers}</p>
                  <p><b>适合：</b>{resource.fit}</p>
                  <p><b>怎么用：</b>{resource.use}</p>
                  <p><b>别拿来：</b>{resource.avoid}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="study-rail-sprint">
            <div className="study-rail-resource-title">只用这五个源的 7 天节奏</div>
            <ol>
              {SEVEN_DAY_PATH.map((day) => (
                <li key={day.day}>
                  <span className="num">{day.day}</span>
                  <div>
                    <strong>{day.range}</strong>
                    <small>{day.focus}</small>
                    <small className="study-rail-day-resources">
                      查：
                      {day.resources.map((title, index) => {
                        const resource = resourceByTitle.get(title)
                        return (
                          <Fragment key={title}>
                            {index > 0 && " · "}
                            {resource ? (
                              <a
                                href={resource.href}
                                {...(resource.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })}
                              >
                                {title}
                              </a>
                            ) : title}
                          </Fragment>
                        )
                      })}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            <p>7 天是复习/冲刺节奏，不是初次学习的硬期限；没过导师判定就停下补。</p>
          </div>
          <div className="study-rail-capstone">
            <div className="study-rail-resource-title">毕业项目 · {CAPSTONE.title}</div>
            <p>{CAPSTONE.goal}</p>
            <p><b>交付：</b>{CAPSTONE.deliverable}</p>
            <ul>
              {CAPSTONE.acceptance.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </details>

        <details className="study-rail-ask">
          <summary>复述时讲哪三件事？</summary>
          <ol>
            {RECALL_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
          </ol>
          <p>导师会看解释、应用和纠错三类证据；阶段末再加一次跨课迁移。答错只补最小缺口。</p>
        </details>
      </div>

      {mastered ? (
        next ? (
          <a className="study-rail-next" href={`#/${next.id}`} title={`${next.num} · ${next.title}`}>
            <span>{checkpoint ? "阶段验收通过 · 下一阶段" : "导师判定通过 · 下一课"}</span>
            <strong>{next.num} · {next.title}</strong>
            <i aria-hidden="true">→</i>
          </a>
        ) : (
          <div className="study-rail-done">
            <span>课程完成</span>
            <strong>{CURRICULUM.length} / {CURRICULUM.length} · 毕业</strong>
            <p>已通过的课仍可从左侧回看；想复盘任意一课，直接打开导师。</p>
          </div>
        )
      ) : (
        <div className="study-rail-gate">
          <div className="study-rail-gate-head">
            <span>{!reading.reachedEnd ? "还在读" : !artifactReady ? "先动手" : enoughEvidence ? "等待判定" : "复述进行中"}</span>
            <strong>
              {!reading.reachedEnd
                ? `${reading.percent}%`
                : !artifactReady
                  ? "待交产物"
                  : enoughEvidence
                    ? "交给导师"
                    : `${practiceTurns}/${requiredTurns} 轮`}
            </strong>
          </div>
          <div className="study-rail-gate-meter" aria-hidden="true">
            <i style={{ width: `${!reading.reachedEnd ? reading.percent : !artifactReady ? 55 : Math.min(100, (practiceTurns / requiredTurns) * 100)}%` }} />
          </div>
          <p>
            {!reading.reachedEnd
              ? "读到底后，才进入复述。遇到卡点先问，不靠猜。"
              : !artifactReady
                ? "先把这一课亲手做一遍并记录产物；应用证据必须能回到产物，不能只复述概念。"
                : enoughEvidence
                  ? "证据轮次够了。打开导师，点“交给导师判定”；没有通过就不会解锁下一课。"
                  : `已经讲 ${practiceTurns} 轮。继续回答导师的追问，凑齐解释、应用、纠错三类证据。`}
          </p>
        </div>
      )}
    </aside>
  )
}

