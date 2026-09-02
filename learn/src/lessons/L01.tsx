/** 第 1 课 · 棋盘:81 个数。
 *  节拍:谜题(表示法)→ 揭晓 1(9×9 数组 / action=y×9+x)→ 部件(点格子:
 *  双向换算,摆棋子 + 反向猜格子)→ 揭晓 2(判胜:只看最后一手,四方向数连子)
 *  → 部件(判胜计数演示:黑落 (4,4) 未胜 / (6,4) 胜)→ 对账(game.py)→ 小测。 */
import { useMemo, useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import Board, { type BoardMark } from "../lib/board"
import { NumTable } from "../lib/numview"

const EMPTY_BOARD: number[] = new Array<number>(81).fill(0)

export default function L01() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 1 课</div>
      <h1 className="text-2xl font-bold">棋盘:81 个数</h1>

      <LessonGuide
        question="怎样把一盘棋和一手落子写成计算机能准确处理的数字？"
        why="网络、搜索和判胜都不能直接处理“黑子”“天元”这些词；先有稳定、可逆的数字记法，后面每一步才对得上同一格棋盘。"
        chain={[
          "每个交叉点记为空、黑、白三种数字",
          "9×9 棋盘成为固定的 81 个位置",
          "坐标用 y×9+x 变成唯一动作编号",
          "只从新落子向四个方向数，就能快速判胜",
        ]}
        takeaway="你能把坐标和动作编号来回换算，也能说明为什么新出现的五连一定包含刚落下的子。"
        boundary="本章的 0/+1/−1 是游戏引擎保存棋盘的记法；第 6 课会为网络另做“三张输入面”，两者用途不同，并不矛盾。"
      />

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "计算机没有眼睛,也不认识「棋盘」这两个字。如果你要把它眼里的五子棋局面写下来,你会用什么?",
            options: [
              "一张图片——让计算机「看」棋盘照片",
              "一张表格:每个交叉点记一个数",
              "一段文字——「黑子在中间偏左,白子在角落……」",
            ],
            answer: 1,
            explain:
              "选第二项。数是电脑的积木:它只搬得动数,照片和文字都得先拆成数才搬得动。81 个交叉点,一点一个数,整盘棋就是一个 9×9 的数组——就是排成 9 行 9 列的一组数。既然绕不开数,不如一开始就用数,还省掉翻译这道工序。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 1 · 一盘棋就是一个 9×9 数组</h3>
        <p>
          先把游戏本身说清(会下的可以跳这句):五子棋,黑白两方轮流在棋盘的空交叉点上
          各放一颗自己的子。子落下之后不动、也不被吃掉。谁先让自己的
          <strong>五颗</strong>子横着、竖着或斜着连成一排,谁赢。棋盘是 9×9,
          共 81 个交叉点。
        </p>
        <p>
          现在把它变成数。给每个交叉点记一个数：<strong>0 = 空，1 = 黑，−1 = 白</strong>。
          −1 是比 0 小的数，像零下 1 度；黑和白恰好用一正一负表示。于是开局、中盘、终局
          都是同一种形状：9×9 = 81 个数。这是游戏程序保存棋盘的方便记法；第 6 课会为了
          让网络更容易找棋形，把同一份事实改写成三张 0/1 图。
        </p>
        <p>
          还要给每个位置一个动作编号。x 是列号（向右，0 到 8），y 是行号（向下，0 到 8）。
          约定 <strong>action = y × 9 + x</strong>，就能把一对坐标拼成一个 0 到 80 的整数；
          反过来除以 9，又能拆回 x、y。棋盘正中的<em>天元</em>是 (x=4, y=4)，所以
          4 × 9 + 4 = <strong>40</strong>。这是本项目选择的编号规则，不是棋盘天生自带的规则；
          重要的是它固定、没有重复、可以来回还原。
        </p>
      </div>

      <figure className="figure mt-6 max-w-[19rem]">
        <div className="p-4">
          <Board board={EMPTY_BOARD.map((_, i) => (i === 40 ? 1 : 0))}
            lastMove={{ x: 4, y: 4 }} />
        </div>
        <figcaption className="figure-cap">
          <span className="cap-no">图 1-1</span>
          天元 (x=4, y=4):4 × 9 + 4 = 40。x 向右,y 向下,都从 0 数起。
        </figcaption>
      </figure>

      <div className="prose mt-8">
        <p>
          落子这个动作,在数组眼里就是<strong>一次「赋值」</strong>:把那一格的数换成
          当前方的数——黑落写 1,白落写 −1。上面这三行约定(0/1/−1、y×9+x、赋值落子)
          就是五子棋的全部「机器语法」。下面亲手练熟它——注意右侧表格里,你点下的
          每一步都变成一个数。
        </p>
      </div>

      <TapGrid />

      <div className="prose mt-12">
        <h3>揭晓 2 · 判胜:只看最后一手,往四个方向数</h3>
        <p>
          每落一子都要回答一次:「赢了吗?」最笨的办法是把全盘扫一遍找五连——可以,
          但没必要。留意一个事实:<strong>赢,只可能赢在刚落下的那颗子上</strong>。
          别的棋子上一手就摆在那里,要是它们已经凑成五连,上一手就该判出来了,轮不到现在。
        </p>
        <p>
          所以判胜只做一件事:以刚落的子为<strong>锚点</strong>。锚就是钉住船的大铁钩——
          数连子的起点,钉死在刚落的这颗子上。接着沿横、竖、两种斜共 4 个方向,
          往一边数一遍同色连子、再往另一边数一遍:
        </p>
        <div className="formula">
          连成数 = <span className="hl">1</span>(锚点)+ 一边的连子 + 另一边的连子 ≥ 5 ?
        </div>
        <p>
          式子末尾的 ≥ 读作「达到或超过」,在这里就是「够 5」的意思。任何一个方向
          够 5,当场判胜。用手算一遍最踏实:括号里写成 (x, y)——前一个数是列 x、
          后一个是行 y。横排上已有黑子 (2,4)、(3,4)、(5,4),黑落 (4,4)——从 (4,4)
          往左数到 2 颗、往右数到 1 颗:1 + 2 + 1 = 4,还没赢。若黑接着落 (6,4),
          <em>锚点换成刚落的 (6,4)</em>:往左数到 4 颗、往右 0 颗:1 + 4 + 0 = 5,
          黑胜。下面把这两手棋摆给你亲手数——每按一次「数下一方向」,棋盘上就点亮
          那个方向数到的子。
        </p>
      </div>

      <WinCount />

      <Ledger title="game.py(数组怎么存、怎么判胜)">
        <p className="mt-0 mb-3">
          (「对账」= 像核对账单一样,把课文讲的道理和真正的代码一行行对上。
          下面这些代码是给大人和未来的你看的,现在跳过也行。)
        </p>
        <div className="codewalk">
          <pre>{`# L6  一个数装一个格子
EMPTY, BLACK, WHITE = 0, 1, -1`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L49-63  落子 = 一次赋值 + 换手
def play(self, action: int) -> None:
    y, x = divmod(action, n)        # ← y×9+x 倒回去算:action ÷ 9,商是 y,余数是 x
    if self.board[y, x] != EMPTY:
        raise ValueError(f"square ({x}, {y}) is occupied")
    self.board[y, x] = self._current
    self._last_move = action
    self._move_count += 1
    if self._is_win_at(y, x):
        self._winner = self._current
    self._current = -self._current  # 黑白换手:1 变 −1,−1 变 1`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# L65-79  判胜:锚点 + 四方向,1 + 正 + 反 ≥ 5
def _count_dir(self, y, x, dy, dx, p) -> int:
    c = 0
    yy, xx = y + dy, x + dx
    while 0 <= yy < self.n and 0 <= xx < self.n and self.board[yy, xx] == p:
        c += 1; yy += dy; xx += dx
    return c

def _is_win_at(self, y, x) -> bool:
    p = self.board[y, x]
    for dx, dy in _DIRS:            # 横、竖、两种斜,共 4 个方向
        if 1 + self._count_dir(y, x, dy, dx, p) \\
             + self._count_dir(y, x, -dy, -dx, p) >= self.win_len:
            return True
    return False`}</pre>
        </div>
        <p className="mt-3">
          「引擎」就是让游戏真正跑起来的那套程序。本站引擎 <span className="mono">learn/src/engine/game.ts</span> 是
          照着上面这段 Python 一行一行写出来的。注释里标了行号(L6、L49-63 这些),
          你可以自己数一数,看每行是不是真的对得上。给大人:tests/game.test.ts
          里另有一套自动检查。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 2 课"
        onAllCorrect={() => pass("l01")}
        questions={[
          {
            q: "动作 40 是棋盘上哪个点?(action = y×9+x)",
            options: [
              "(4,4)——棋盘正中的天元",
              "(5,4)——天元右边一格",
              "第 4 行、第 40 列",
              "没法确定,要看下棋的人怎么编号",
            ],
            answer: 0,
            explain:
              "40 ÷ 9 = 4 余 4，所以 y = 4、x = 4，落在棋盘正中。倒过来验证：4 × 9 + 4 = 40。本项目约定每个点对应一个 0…80 的整数；也可以另定别的可逆编号，但所有程序必须一直遵守同一套。",
          },
          {
            q: "为什么恰好是 81 个动作?",
            options: [
              "为了凑个整数,其实 80 或 82 也行",
              "棋盘 9×9 = 81 个交叉点,y×9+x 给每格一个 0…80 的编号,一格一个,恰好 81 个",
              "因为「大脑」只装得下 81 个数",
            ],
            answer: 1,
            explain:
              "81 个交叉点各占一个编号，一个不多一个不少。第 9 课你会看到：那个学下棋的“大脑”也要给 81 个格子各打一个分。为什么也正好是 81 个？就是从棋盘这里定下的。",
          },
          {
            q: "判胜为什么只看最后一手就够?",
            options: [
              "为了省内存",
              "赢只可能赢在刚落的这颗子上——其余棋子上一手就在,要能赢早就判出来了",
              "因为全盘扫描会出错",
            ],
            answer: 1,
            explain:
              "落子只新增一颗子,新出现的五连里一定有这颗新子。所以只要从落点往四个方向数连子:几行算术,就省下了每落一子都翻遍全盘的大工夫——用一点观察换一大笔计算。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 1 · 点格子:摆棋子 / 反向猜格子 ============ */

const rnd81 = (avoid?: number) => {
  let a = Math.floor(Math.random() * 81)
  if (a === avoid) a = (a + 7) % 81
  return a
}

function TapGrid() {
  const [mode, setMode] = useState<"place" | "guess">("place")
  // 摆棋子:记录依次落的 action,黑先白后
  const [placed, setPlaced] = useState<number[]>([])
  // 猜格子:随机 action,读者点对应的格
  const [target, setTarget] = useState(() => rnd81())
  const [streak, setStreak] = useState(0)
  const [hitCell, setHitCell] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const board = useMemo(() => {
    const b = new Array<number>(81).fill(0)
    placed.forEach((a, i) => (b[a] = i % 2 === 0 ? 1 : -1))
    return b
  }, [placed])

  const last = placed.length > 0 ? placed[placed.length - 1] : null
  const lastY = last !== null ? Math.floor(last / 9) : 0
  const lastX = last !== null ? last % 9 : 0
  const nextBlack = placed.length % 2 === 0

  const place = (x: number, y: number) => {
    if (board[y * 9 + x] !== 0) return
    setPlaced((p) => [...p, y * 9 + x])
  }

  const guess = (x: number, y: number) => {
    const a = y * 9 + x
    if (a === target) {
      setStreak((s) => s + 1)
      setHitCell(a)
      setFeedback({ ok: true, msg: `✓ (${x},${y}):${y} × 9 + ${x} = ${a},连对 ${streak + 1} 题。换一个:下面这个数是哪格?` })
      setTarget(rnd81(target))
    } else {
      setHitCell(null)
      setFeedback({ ok: false, msg: `你点的是 (${x},${y}):${y} × 9 + ${x} = ${a},不等于 ${target}。再想想:y 该是 ${target} ÷ 9 的商,x 是余数。` })
    }
  }

  const marks: BoardMark[] | undefined =
    mode === "guess" && hitCell !== null
      ? [{ x: hitCell % 9, y: Math.floor(hitCell / 9), anchor: true }]
      : undefined

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 亲手换算</span>
        <span className="seg">
          <button type="button" className={`seg-btn ${mode === "place" ? "active" : ""}`}
            onClick={() => setMode("place")}>
            摆棋子
          </button>
          <button type="button" className={`seg-btn ${mode === "guess" ? "active" : ""}`}
            onClick={() => setMode("guess")}>
            猜格子
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          {mode === "place" ? (
            <Board board={board} onCellClick={place} ghostPlayer={nextBlack ? 1 : -1}
              lastMove={last !== null ? { x: lastX, y: lastY } : null} />
          ) : (
            <Board board={EMPTY_BOARD} onCellClick={guess} marks={marks} ghostPlayer={1} />
          )}
          {mode === "place" && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
                下一手:{nextBlack ? "黑(+1)" : "白(−1)"}
              </span>
              <button type="button" className="btn" disabled={placed.length === 0}
                onClick={() => setPlaced([])}>
                清空
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {mode === "place" ? (
            <div>
              <div className="mini-label">棋盘写成数的样子(同一步,两张脸)</div>
              <div className="mt-2 overflow-x-auto">
                <NumTable board={board} lastIdx={last} />
              </div>
              <div className="reveal-box mt-4">
                <div className="mini-label">最后一手的算式</div>
                {last === null ? (
                  <p className="mt-1.5 text-sm" style={{ color: "var(--fg-muted)" }}>
                    点棋盘任意交叉点,这里就会出现它的编号算式。
                  </p>
                ) : (
                  <p className="num mt-1.5 text-lg font-bold">
                    action = y×9 + x ={" "}
                    <span className="l01-hl-y">{lastY}</span> × 9 +{" "}
                    <span className="l01-hl-x">{lastX}</span> ={" "}
                    <span style={{ color: "var(--accent-deep)" }}>{last}</span>
                  </p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  <span className="l01-hl-y">y</span> 行号(上下,红)、
                  <span className="l01-hl-x">x</span> 列号(左右,下划线);反着算:
                  y = action ÷ 9 的商(不带余数的那一半),x = 余数。
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="mini-label">反向:看到一个数,找到那个格</div>
              <p className="num mt-2 text-3xl font-bold" style={{ color: "var(--accent-deep)" }}>
                action = {target}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
                这个数对应棋盘上哪一格?点它。
              </p>
              {feedback && (
                <p className={`mt-3 text-sm leading-relaxed ${feedback.ok ? "l01-ok" : "l01-bad"}`}>
                  {feedback.msg}
                </p>
              )}
              <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                连对 {streak} 题。熟练标准:不加思索地点对 5 题——
                这套换算是后面每一课的地基。
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 1-1</span>
        {mode === "place"
          ? "点交叉点落子(黑白轮流):右侧数组即时更新,最后一手给出 y×9+x 的算式。"
          : "反向练习:给你一个 action 数字,点出它对应的格子——答对打勾换下一题。"}
      </figcaption>
    </figure>
  )
}

/* ============ 部件 2 · 判胜计数演示 ============ */

const DIRS: [number, number, string][] = [
  [0, 1, "横 ↔"],
  [1, 0, "竖 ↕"],
  [1, 1, "斜 ↘"],
  [-1, 1, "斜 ↗"],
]

function countDir(b: number[], y: number, x: number, dy: number, dx: number): number {
  let c = 0,
    yy = y + dy,
    xx = x + dx
  while (0 <= yy && yy < 9 && 0 <= xx && xx < 9 && b[yy * 9 + xx] === 1) {
    c++
    yy += dy
    xx += dx
  }
  return c
}

function WinCount() {
  const [placed, setPlaced] = useState<0 | 1 | 2>(0)
  const [dir, setDir] = useState(-1) // -1 未开始;0..3 正在数第几个方向;4 数完

  const board = useMemo(() => {
    const b = new Array<number>(81).fill(0)
    for (const x of [2, 3, 5]) b[4 * 9 + x] = 1 // 预置黑 (2,4)(3,4)(5,4)
    if (placed >= 1) b[4 * 9 + 4] = 1
    if (placed >= 2) b[4 * 9 + 6] = 1
    return b
  }, [placed])

  const anchor = placed === 2 ? { x: 6, y: 4 } : placed === 1 ? { x: 4, y: 4 } : null

  // 每个方向:正/反连子数,以及数到的格子(供棋盘点亮)
  const rows = anchor
    ? DIRS.map(([dy, dx, label]) => {
        const cells: BoardMark[] = []
        for (const [sy, sx] of [
          [dy, dx],
          [-dy, -dx],
        ] as [number, number][]) {
          let yy = anchor.y + sy,
            xx = anchor.x + sx
          while (0 <= yy && yy < 9 && 0 <= xx && xx < 9 && board[yy * 9 + xx] === 1) {
            cells.push({ x: xx, y: yy })
            yy += sy
            xx += sx
          }
        }
        const c1 = countDir(board, anchor.y, anchor.x, dy, dx)
        const c2 = countDir(board, anchor.y, anchor.x, -dy, -dx)
        return { label, c1, c2, total: 1 + c1 + c2, cells }
      })
    : []

  const marks: BoardMark[] = []
  if (anchor && dir >= 0) {
    marks.push({ ...anchor, anchor: true })
    for (let i = 0; i <= Math.min(dir, 3); i++) marks.push(...rows[i].cells)
  }

  const reset = () => {
    setPlaced(0)
    setDir(-1)
  }

  return (
    <figure className="figure mt-8">
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          <Board board={board} marks={marks} lastMove={anchor} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={placed !== 0}
              onClick={() => { setPlaced(1); setDir(-1) }}>
              黑落 (4,4)
            </button>
            <button type="button" className="btn" disabled={placed !== 1 || dir !== 4}
              onClick={() => { setPlaced(2); setDir(-1) }}>
              黑落 (6,4)
            </button>
            <button type="button" className="btn active"
              disabled={!anchor || dir >= 4}
              onClick={() => setDir((d) => d + 1)}>
              {dir < 0 ? `开始数:${DIRS[0][2]}` : dir >= 3 ? "数完 ↗,出结论" : `数下一方向:${DIRS[dir + 1][2]}`}
            </button>
            <button type="button" className="btn" onClick={reset}>
              ↺ 重置
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mini-label">从锚点出发,逐方向清点</div>
          <div className="mt-2">
            {rows.length === 0 && (
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                棋盘上已摆好黑 (2,4)、(3,4)、(5,4)。先按「黑落 (4,4)」,
                再逐个方向数连子。
              </p>
            )}
            {rows.map((r, i) => (
              <div key={i} className={`l01-dir-row${dir === i ? " on" : ""}`}>
                <span>{r.label}</span>
                <span className="num">
                  {i <= dir ? (
                    <>
                      1 + {r.c2} + {r.c1} ={" "}
                      <strong style={{ color: r.total >= 5 ? "var(--accent-deep)" : undefined }}>
                        {r.total}
                      </strong>
                    </>
                  ) : (
                    "1 + ? + ?"
                  )}
                </span>
              </div>
            ))}
          </div>
          {dir >= 4 && (
            <div className="reveal-box mt-4">
              {placed === 1 ? (
                <p className="text-sm font-semibold">
                  四个方向数完:最多 1 + 2 + 1 = <strong>4</strong> &lt; 5,还没赢。
                  现在按「黑落 (6,4)」——注意锚点会换到新落的子上。
                </p>
              ) : (
                <p className="text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
                  横排 1 + 4 + 0 = <strong>5</strong> ≥ 5,黑胜!锚点换了,同一条横排就被数满了。
                </p>
              )}
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            为了让你专心看「数数」,这里让黑棋连走了两手(真实对局是黑白轮流的)。
            顺带:81 格填满仍无五连,判和棋。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 1-2</span>
        手算例子的动手版:1 + 一边 + 另一边 ≥ 5,锚点永远是刚落的那颗子。
      </figcaption>
    </figure>
  )
}
