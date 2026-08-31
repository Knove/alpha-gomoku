/** 第 2 课 · 视角:一条铁约。
 *  节拍:谜题(黑白两套棋理的代价)→ 揭晓(canonical 铁约)→
 *  部件(视角开关:同一中盘,客观 ⇄ 白方视角,棋子换色 + 数组逐格翻号)→
 *  对账(game.py canonical_board)→ 小测。 */
import { useState } from "react"
import { Quiz, usePassLesson } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import Board from "../lib/board"
import { NumTable } from "../lib/numview"

/* 教学局面(archive/game.md 手算例子):5 黑 4 白共 9 手,轮白。 */
const BLACK_POS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 5],
  [3, 5],
]
const WHITE_POS: [number, number][] = [
  [5, 4],
  [4, 3],
  [5, 3],
  [6, 4],
]

const OBJ: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of BLACK_POS) b[y * 9 + x] = 1
  for (const [x, y] of WHITE_POS) b[y * 9 + x] = -1
  return b
})()

export default function L02() {
  const pass = usePassLesson()

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 2 课</div>
      <h1 className="text-2xl font-bold">视角:一条铁约</h1>

      <Quiz
        title="谜题 · 先选一个答案"
        questions={[
          {
            q: "「三连要堵」这句棋理(三连:三颗同色子排成一排;不堵住,它长成五连就赢了),黑棋适用,白棋也适用。如果让网络(就是咱们要造的那台自己学下棋的机器)分别学「黑方怎么下」「白方怎么下」两门功课,会发生什么?",
            options: [
              "没问题,各学各的正好",
              "同一条棋理学两遍——花一样的工夫,进步只有一半",
              "网络会当场混乱,什么都学不会",
            ],
            answer: 1,
            explain:
              "选第二项。一句「三连要堵」写进两门功课:黑方课学一遍,白方课再学一遍。攒数据(数据就是记下来给它学的一盘盘棋)本来最费工夫,这么学等于把一半功力花在重复上。选第三项也不算全错——两套视角搅在一起确实容易学岔,但说到底,第二项亏就亏在同一份力气花了两遍。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>揭晓 · 规范视角(canonical):所有数都站在「当前轮到谁下」那边</h3>
        <p>
          解法是一条全站通行的铁约(铁约 = 谁都必须守、一个字不能改的约定)。
          这条铁约英文叫 <em>canonical</em>,中文叫「规范视角」:
          <strong>所有数值,都从「当前轮到谁下」的视角记录</strong>。
          做法朴素得可爱:把原始数组<strong>乘以当前行棋方</strong>——
          轮到黑,乘 +1(原样);轮到白,乘 −1(整盘黑白互换,+1 变 −1、−1 变 +1,
          0 不动)。
        </p>
        <p>
          换完之后,不管棋盘上真实颜色是什么,网络看到的永远是同一句话:
          <strong>我方 = +1,对方 = −1</strong>。「白方怎么下」和「黑方怎么下」
          从两门功课并成一门:「轮到谁下,就学谁怎么下」。
        </p>
        <p>
          这条铁约有两份收益:一份数据当两份用(棋理只学一遍);黑白再也不会搞混
          (代码里凡是跟黑白有关的判断,先问一句「现在轮到谁」)。它还会贯穿全站:
          以后你喂给网络的每个数、网络打出的每个分,全都站在「现在轮到谁」那边——
          后面每一课你都会再遇到它,所以现在就去下面的部件,把视角开关亲手
          拨几遍,拨到熟。
        </p>
      </div>

      <PerspectiveSwitch />

      <Ledger title="game.py 规范视角(canonical_board,L92-94)">
        <div className="codewalk">
          <pre>{`def canonical_board(self) -> np.ndarray:
    """Board from the perspective of the player to move (own stones = 1)."""
    return (self.board * self._current).astype(np.float32)`}</pre>
        </div>
        <p className="mt-3">
          第一行和引号里那句英文都是写给程序员的备注,跳过不读(它的意思:从当前
          行棋方的眼睛看,自己的子记 1)。真正干活的就最后一行。
          <span className="mono">self._current</span> 是「当前轮到谁下」:
          黑 +1、白 −1。轮白时整盘乘 −1——你刚才在部件里拨动开关,就是执行了这一行。
          末尾那串 <span className="mono">astype(np.float32)</span> 不用管,它只是电脑
          记小数用的格式。本站引擎 <span className="mono">learn/src/engine/game.ts</span> 的{" "}
          <span className="mono">canonical()</span> 与它逐条对齐。
        </p>
      </Ledger>

      <Quiz
        title="小测 · 过关解锁第 3 课"
        onAllCorrect={() => pass("l02")}
        questions={[
          {
            q: "轮到白棋走时,规范视角(canonical)对数组做了什么操作?",
            options: [
              "什么都不做,原样读入",
              "整盘乘 −1:黑白的数互换,白(己方)变 +1,黑(对手)变 −1",
              "把棋盘旋转 180 度再读",
            ],
            answer: 1,
            explain:
              "乘以当前行棋方(白 = −1),于是每一格的数翻转:+1 变 −1、−1 变 +1,0 还是 0。棋盘本身没有转、没有动——变的只是「从谁的眼睛看」。",
          },
          {
            q: "这条铁约省下了什么?",
            options: [
              "省了内存——数组变小了",
              "省了判胜的扫描次数",
              "同一条棋理黑白只学一遍:一份数据当两份用,还再也不会把黑白搞混",
            ],
            answer: 2,
            explain:
              "数组还是 9×9,一个数没省;判胜更是跟它没关系。省的是学习量:「白方怎么下」与「黑方怎么下」并成「轮到我下怎么下」,棋理只学一遍——攒数据最费工夫,这个改法却一分力不花。",
          },
          {
            q: "黑白一换手(对方落完子,轮到另一方下),同一格上的数会怎么变?",
            options: [
              "不变——棋盘又没动",
              "符号翻转:+1 变 −1、−1 变 +1,0 还是 0",
              "全部清零重新记",
            ],
            answer: 1,
            explain:
              "行棋方从 +1 换成 −1(或反过来),乘数一换,每个不是 0 的格子,数就整体翻一次。所以网络眼里「+1 永远是我」——至于这局里「我」拿的是黑还是白,它根本不需要知道。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 部件 · 视角开关 ============ */

function PerspectiveSwitch() {
  const [canon, setCanon] = useState(false) // false 客观视角 / true 白方视角

  return (
    <figure className="figure mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">部件 · 同一局面,两种看法</span>
        <span className="seg">
          <button type="button" className={`seg-btn ${!canon ? "active" : ""}`}
            onClick={() => setCanon(false)}>
            客观视角
          </button>
          <button type="button" className={`seg-btn ${canon ? "active" : ""}`}
            onClick={() => setCanon(true)}>
            白方视角(网络)
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          <Board board={OBJ} swap={canon} lastMove={{ x: 4, y: 4 }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">棋盘写成数的样子:{canon ? "乘 −1 之后(规范)" : "原始记录"}</div>
          <div className="mt-2 overflow-x-auto">
            <NumTable board={OBJ} canon={canon} />
          </div>
          <div className="reveal-box mt-4 text-sm leading-relaxed">
            {canon ? (
              <>
                <p>
                  轮白,乘数是 <strong>−1</strong>:整盘翻号。数一数——现在 +1 恰好{" "}
                  <strong>4</strong> 个(真身是白的,己方),−1 恰好 <strong>5</strong> 个
                  (真身是黑的,对手)。棋盘没动,动的只是眼睛。
                </p>
                <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
                  棋盘上的颜色也跟着对调了:真身的白子(己方)换上黑衣出镜——
                  「+1」的脸,永远是黑子的模样。这正是网络每次看到的画面。
                </p>
              </>
            ) : (
              <>
                <p>
                  这就是左边「客观视角」按钮的画面(客观 = 谁都不帮,像上帝在天上
                  看,所以也叫「上帝视角」):黑 = +1(5 颗),白 = −1(4 颗),
                  <strong>轮到白下</strong>。如果把这份原始数组直接喂给网络,
                  它还得自己弄清「这局我拿的是黑还是白」——凭什么让它多操这份心?
                </p>
                <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
                  拨到「白方视角」,看铁约怎么动手。
                </p>
              </>
            )}
            <p className="mt-3 font-semibold" style={{ color: "var(--accent-deep)" }}>
              网络看到的永远是:我方 = +1,对方 = −1。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">部件 2-1</span>
        教学局面:5 黑 4 白共 9 手,轮白。开关拨动 = game.py 的{" "}
        <span className="mono">board × (−1)</span>:棋子换色、数组逐格翻号,颜色慢慢互换。
      </figcaption>
    </figure>
  )
}
