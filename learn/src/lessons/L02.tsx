/** 第 2 课 · 视角：一条约定。
 *  节拍：思考题(黑白两套棋理的代价)→ 规范视角(例 2-1 视角开关)
 *  → 对证(game.py canonical_board)→ ChapterEnd → 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { NumTable } from "../lib/numview"

/* 教学局面(archive/game.md 手算例子):5 黑 4 白共 9 手，轮白。 */
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

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 2 课</div>
      <h1 className="text-2xl font-bold">视角：一条约定</h1>

      <LessonGuide
        question="黑棋和白棋都要学同一条棋理时，怎样让一套规则不把「我方」和「对方」搞反？"
        why="若同一局面里 +1 有时代表我、有时代表对手，机器得先猜角色再学棋理；统一视角能把「轮到谁下」的关系固定下来。"
        chain={[
          "原始棋盘按颜色记录：黑 +1、白 −1",
          "整盘乘以当前行棋方的颜色值（黑 +1、白 −1），统一成我方 +1、对方 −1",
          "换手后同一格上的数整体翻转符号",
          "终局结果按同一立场记分：赢 +1、输 −1、和 0",
        ]}
        takeaway="你能解释规范视角统一的是「我 / 对手的关系」，不是抹掉「这方拿黑还是拿白」这一事实。"
        boundary="本课翻的是棋子编码和价值的视角；棋盘坐标没有旋转，落子编号不变。先后手身份不靠这套符号承载，颜色平面会把它单独保留下来。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "三连（三颗同色子成一排）若不堵，会长成五连。「三连要堵」这句棋理黑白通用。若让机器分学「黑方怎么下」「白方怎么下」两门功课，会发生什么？",
            options: [
              "没问题，各学各的正好",
              "同一条棋理学两遍：一样的样本，每套规则只分到一半",
              "机器会当场混乱，什么都学不会",
            ],
            answer: 1,
            explain:
              "选第二项。同一条「该堵三连」的关系若有时叫黑方规则、有时叫白方规则，机器得分别学会两种说法。统一成「我方 / 对方」后，黑白双方产生的棋局例子都能训练同一个规律。样本数量并没有翻倍，省下的是把同一关系拆成两套的开销。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>规范视角把「我方 / 对方」写成同一种语言</h3>
        <p>
          这里有一条固定约定，中文叫「规范视角」。它只做一件事：
          <strong>送进网络的棋子编码，一律把当前行棋方记为 +1、对手记为 −1。</strong>这份 ±1 是规范视角的记法；送进网络前它还会被改写成两个 0/1 平面（写法见下方输入平面定义框；为什么要拆成两个，第 6 课讲原因）。事实不变，变的只是写法。
          行棋方对应一个颜色值：黑 +1、白 −1。做法是整盘乘这个值（乘一下就能完成翻号，这正是第 1 课把黑白编成相反数的原因）：
          轮到黑乘 +1，原样；轮到白乘 −1，黑白符号互换，空格 0 不动。
        </p>
        <Def term="规范视角" en="canonical perspective">
          从当前行棋方的立场重写棋子编码的约定：己方子记 +1、对方子记 −1、空点记 0，
          轮白时白子就是 +1。实现是原始棋盘整体乘以当前行棋方的颜色值（黑 +1、白 −1）。
          棋盘坐标不动、棋子位置不动，变的只是「从谁的立场看」。
        </Def>
        <p>
          换完后，不管真实颜色是什么，棋子关系都写成同一句话：<strong>我方 = +1，
          对方 = −1。</strong>于是双方的棋局例子都只教一门「轮到我时怎样下」。
        </p>
        <p>
          这条约定省下的是重复学习，也让「+1 到底是谁」永远不含糊。同一局面换立场看，已有子的格整体翻号，空格仍是 0。它没有抹掉「这方拿的是黑棋还是白棋」的事实：
          执黑的身份（本项目黑先）仍可能影响棋局（先手更主动），但不靠这套符号承载，由专门的输入保留：若不另给颜色平面，网络得从「哪边多一子」间接猜轮谁，早期只看邻近几格的卷积核（第 4 课引入「窗口」）可猜不出来。
        </p>
        <Def term="输入平面" en="input plane" see="第 6 课">
          一张 9×9 的数表，棋盘的一种 0/1 写法。三个输入平面（两个记棋子、一个记先后手）叠起来送进网络。这里的 0/1 是送网写法，与上文的 ±1 是同一事实的两种写法。
        </Def>
        <Def term="颜色平面" en="color plane" see="第 6 课">
          一张 9×9 平面，每格填同一个数：轮到黑（先手）填 1，轮到白（后手）填 0，向网络单独标明当前行棋方拿的是先手还是后手。它记的是绝对行棋方身份（谁执黑先行），不随视角翻转，不是棋子在盘上的颜色。
          它与记棋子的平面并排送进网络，因此先后手身份不依赖棋子符号来承载。
        </Def>
        <p>
          棋盘没有旋转，落子坐标也没有换地方；本课只统一棋子编码及价值判断的立场。
          这条约定会一路传下去：网络的价值估计 <span className="mono">v_net</span> 和终局结果
          <span className="mono">z</span>，都站在当时行棋方一边回答「是好是坏」。
        </p>
        <Def term="终局结果" en="outcome，记作 z">
          对局结束后补上的目标数字，每手棋各记一个 z：若该手行棋方最终赢，记 +1，输记 −1，和记 0。
          一局 N 手就留下 N 个 z。每手的 z 以该手行棋方为正，固定不随视角开关翻转：
          同一胜负结果，在胜方的各手记 +1、负方的各手记 −1。z 和规范视角都从行棋方出发，
          因此可以直接和网络的价值估计比较；两边共用 −1…+1 这把标尺（z 的记分就是这三档），价值头用 tanh（把任意数平滑压进 −1…+1 的函数）把输出压进同一标尺。
          <span className="def-see">参见：第 9 课</span>
        </Def>
      </div>

      <PerspectiveSwitch />

      <Ledger title="game.py · Game.canonical_board">
        <div className="codewalk">
          <pre>{`def canonical_board(self) -> np.ndarray:
    """Board from the perspective of the player to move (own stones = 1)."""
    return (self.board * self._current).astype(np.float32)`}</pre>
        </div>
        <p className="mt-3">
          代码里那句英文注释说明输入和输出：从当前行棋方的眼睛看，自己的子应为 1。
          <span className="mono">self._current</span> 是当前轮到谁：黑 +1、白 −1；
          轮白时整盘乘 −1，正是例 2-1 拨动开关看到的变化。
          <span className="mono">astype(np.float32)</span> 把输出存成网络使用的小数格式，
          不改变棋子关系。浏览器的 <span className="mono">engine/game.ts · canonical()</span>
          用不同的写法遵守相同的约定；
          <span className="mono">learn/tests/game.test.ts</span> 会检查
          浏览器端遵守同一约定。阅读时可核对：「当前方」在哪一处参与了计算，
          输出中哪些格子会变、哪些空格不会变。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "规范视角把当前行棋方记 +1、对手记 −1：原始棋盘乘以当前行棋方的颜色值，空格 0 不动。",
          "统一的是「我方 / 对方」的关系，不是抹掉先后手。同一局面换立场看，已有子的格整体翻号。",
          "终局结果 z 按同一立场记分：赢 +1、输 −1、和 0，因此能直接和网络价值估计比较。",
        ]}
        next={
          <>
            立场统一之后，才谈得上判断好坏。下一课把这套编码送进一台会学习的判断装置：
            每条特征配一个可调的权重，对局结果 z 与预测的差指出判断错了多少，权重便朝减少误差的方向微调。
            先在一对「特征 × 权重」上看清训练改什么、下棋用什么。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "轮到白棋走时，规范视角（canonical）对数组做了什么操作？",
            options: [
              "什么都不做，原样读入",
              "整盘乘 −1：黑白的数互换，每一格的符号随之翻转",
              "把棋盘旋转 180 度再读",
            ],
            answer: 1,
            explain:
              "乘以当前行棋方（白 = −1），于是每一格的数翻转：+1 变 −1、−1 变 +1，0 还是 0。棋盘本身没有转、没有动，变的只是「从谁的立场看」。",
          },
          {
            q: "这条约定主要避免了什么？",
            options: [
              "省了内存：数组变小了",
              "省了判胜的扫描次数",
              "把「黑方怎么下 / 白方怎么下」统一成「轮到我时怎样下」，让双方样本训练同一条关系",
            ],
            answer: 2,
            explain:
              "数组还是 9×9，判胜次数也没变。省的是重复任务：黑方和白方的棋局例子都能训练「我方 / 对方」的同一种关系。样本并没有变多，只是不同颜色的例子说同一种语言。",
          },
          {
            q: "把同一局面改换立场看，已有子的格子上的数会怎么变？",
            options: [
              "不变：棋盘又没动",
              "符号翻转：+1 变 −1、−1 变 +1，0 还是 0",
              "全部清零重新记",
            ],
            answer: 1,
            explain:
              "行棋方从 +1 换成 −1（或反过来），乘数一换，每个已有子的格整体翻一次号：+1 变 −1、−1 变 +1，空格仍是 0。拿黑棋还是拿白棋仍可能有用，那项身份由颜色平面单独告诉机器（第 6 课）。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 2-1 · 视角开关 ============ */

function PerspectiveSwitch() {
  const [canon, setCanon] = useState(false) // false 客观视角 / true 白方视角

  return (
    <figure className="figure mt-8" data-qa="fig-switch">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <span className="mini-label">例 2-1 · 同一局面，两种看法</span>
        <span className="seg">
          <button type="button" className={`seg-btn ${!canon ? "active" : ""}`}
            onClick={() => setCanon(false)}>
            客观视角
          </button>
          <button type="button" className={`seg-btn ${canon ? "active" : ""}`}
            onClick={() => setCanon(true)}>
            白方视角（网络）
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[24rem]">
          <Board board={OBJ} swap={canon} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">棋盘写成数的样子：{canon ? "乘 −1 之后（规范）" : "原始记录"}</div>
          <div className="mt-2 overflow-x-auto">
            <NumTable board={OBJ} canon={canon} />
          </div>
          <div className="reveal-box mt-4 text-sm leading-relaxed">
            {canon ? (
              <>
                <p>
                  轮白，乘数是 <strong>−1</strong>：整盘取反符号。数一数：现在 +1 恰好{" "}
                  <strong>4</strong> 个，−1 恰好 <strong>5</strong> 个。
                  棋盘没动，变的只是编码的立场。
                </p>
                <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
                  棋盘上的颜色也跟着对调了：白子（己方）现在画成黑色，
                  网络里的 +1 永远画成黑子。这正是网络每次读到的规范画法。
                </p>
              </>
            ) : (
              <>
                <p>
                  这就是左边「客观视角」的画面：黑 = +1（5 颗），白 = −1（4 颗），
                  <strong>轮到白下</strong>。客观视角没错，但「该堵三连」这条关系
                  编码后的正负会随拿黑拿白而变。拨到白方视角后，这个关系就固定成同一种写法。
                </p>
                <p className="mt-2" style={{ color: "var(--fg-muted)" }}>
                  拨到「白方视角」，看约定如何改写这份编码。
                </p>
              </>
            )}
            <p className="mt-3 font-semibold" style={{ color: "var(--accent-deep)" }}>
              网络看到的永远是：我方 = +1，对方 = −1。
            </p>
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 2-1</span>
        教学局面：5 黑 4 白共 9 手，轮白。开关拨动即 game.py 的{" "}
        <span className="mono">board × (−1)</span>：数组逐格取反，棋子颜色随之互换。
      </figcaption>
    </figure>
  )
}
