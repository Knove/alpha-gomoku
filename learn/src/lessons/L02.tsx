/** 第 2 课 · 视角：一条约定。
 *  节拍：思考题(黑白两套棋理的代价)→ 规范视角(落点码 canonical_board、例 2-1 视角开关)
 *  → 交付物与验证 → ChapterEnd → 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import Board from "../lib/board"
import { NumTable } from "../lib/numview"

/* 教学局面(archive/game.md 手算例子)：5 黑 4 白共 9 手，轮白。 */
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
        takeaway="你能在任意局面算出规范视角棋盘（canonical board），写对那行翻号乘法，写对终局结果 z 的记分规则，并写对它与价值估计共用 −1…+1 标尺的约定。"
        boundary="本课翻的是棋子编码与价值估计的视角；棋盘坐标没有旋转，落子编号不变。先后手身份不靠这套符号承载，颜色平面会把它单独保留下来。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "三连（三颗同色子成一排）若不堵，会长成五连。「三连要堵」这句棋理黑白通用。若让机器分学「黑方怎么下」「白方怎么下」两门功课，会发生什么？",
            options: [
              "没问题，各学各的正好",
              "同一局面换一套符号就要重学：一样的棋理被迫学两遍",
              "机器会当场混乱，什么都学不会",
            ],
            answer: 1,
            explain:
              "选第二项。同一条「该堵三连」的关系若有时叫黑方规则、有时叫白方规则，机器得分别学会两种说法。统一成「我方 / 对方」后，黑白双方产生的棋局例子都能训练同一个规律，省下的是把同一关系拆成两套的开销。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>规范视角把「我方 / 对方」写成同一种语言</h3>
        <p>
          棋子编码有一条固定约定，叫规范视角。它只做一件事：把「轮到谁下」的立场写进棋子编码里。
          送进网络前，棋子编码还会被改写成两个 0/1 平面。事实不变，变的只是写法。
        </p>
        <Def term="规范视角" en="canonical perspective">
          从当前行棋方的立场重写棋子编码的约定：己方子记 +1、对方子记 −1、空点记 0，
          轮白时白子就是 +1。实现是原始棋盘整体乘以当前行棋方的颜色值（黑 +1、白 −1）。
          棋盘坐标不动、棋子位置不动，变的只是「从谁的立场看」。
        </Def>
        <p>
          行棋方对应一个颜色值：黑 +1、白 −1，做法是整盘乘这个值
          （乘一下就能完成翻号，这正是把黑白编成相反数的原因）：轮到黑乘 +1，原样；
          轮到白乘 −1，黑白符号互换，空格 0 不动。
          <strong>送进网络的棋子编码，一律把当前行棋方记为 +1、对手记为 −1。</strong>
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="整盘乘以当前行棋方，一步完成视角翻号"
          source="alphagomoku/game.py · Game.canonical_board"
        >
          <div className="codewalk">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <pre className="min-w-0 flex-1">{`def canonical_board(self) -> np.ndarray:
    """Board from the perspective of the player to move (own stones = 1)."""
    return (self.board * self._current).astype(np.float32)`}</pre>
              <div className="text-xs leading-relaxed sm:w-56" style={{ color: "var(--fg-faint)" }}>
                <div>def 行：输出一张 9×9 的浮点数表（np.float32），形状与原棋盘相同。</div>
                <div className="mt-1">说明行：源码注释 own stones = 1，注明「己方记 +1」。</div>
                <div className="mt-1">
                  return 行：一次乘法；<span className="mono">self._current</span> 是标量，
                  取值两档：黑 +1、白 −1。
                </div>
              </div>
            </div>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          末尾的 <span className="mono">astype(np.float32)</span> 只把结果转成网络计算所需的浮点数格式，不改变棋子关系。
        </p>
        <p>
          换完后，不管真实颜色是什么，棋子关系都写成同一句话：<strong>我方 = +1，
          对方 = −1。</strong>于是双方的棋局例子都只教一门「轮到我时怎样下」。
          这条约定省下的是重复学习，也让「+1 到底是谁」不再含糊。
          同一局面换立场看，已有子的格整体翻号，空格仍是 0。
        </p>
        <PerspectiveSwitch />
        <p>
          这条约定没有抹掉「这方拿的是黑棋还是白棋」的事实：
          执黑的身份（本项目黑先）仍可能影响棋局，因为先手更主动，但它不靠这套符号承载，而是交给第三个输入平面（<strong>颜色平面</strong>：轮到黑填 1、轮到白填 0）单独标明。
          若不另给颜色平面，网络得从「哪边多一子」间接猜轮谁，而早期各层只读邻近几格的卷积，数不出全盘的子数对比。
        </p>
        <p>
          棋盘没有旋转，落子坐标也没有换地方；本课只统一棋子编码及价值估计的立场。
          这条约定会一路传下去：网络的价值估计 <span className="mono">v_net</span> 和终局结果
          <span className="mono">z</span>，都站在当时行棋方一边回答「是好是坏」。
        </p>
        <Def term="终局结果" en="outcome">
          对局结束后补上的目标数字（记作 z），每手棋各记一个 z：若该手行棋方最终赢，记 +1，输记 −1，和记 0。
          一局有几手就留下几个 z。每手的 z 以该手行棋方为正，固定不随视角开关翻转：
          同一胜负结果，在胜方的各手记 +1、负方的各手记 −1。z 和规范视角都从行棋方出发，
          因此可以直接和网络的价值估计比较。两边共用 −1…+1 这把标尺（z 的记分就是这三档）。价值头用双曲正切（hyperbolic tangent，缩写 tanh，把任意数平滑压进 −1…+1 的函数）把输出压进同一标尺。
        </Def>
      </div>

      <Ledger title="alphagomoku/game.py · Game.canonical_board">
        <p className="mb-3">
          本课的核心实现是上方已完整展示的 <span className="mono">alphagomoku/game.py</span> 中 <span className="mono">Game.canonical_board</span> 方法（共 3 行）：将 <span className="mono">self.board</span> 整盘乘以 <span className="mono">self._current</span> 并转为 <span className="mono">np.float32</span>。下游由 <span className="mono">encode</span> 拆成输入平面，自我对弈记录样本时调用本方法；终局结果 <span className="mono">z</span> 的按手回填则由 <span className="mono">_finalize</span> 完成。
        </p>
        <ul className="ml-5 list-disc">
          <li>
            手算核对：对本课教学局面（5 黑 4 白、轮白），确认乘以 −1 后 4 个白子格变为 +1、5 个黑子格变为 −1、其余空格仍为 0。
          </li>
          <li>
            验证与测试：运行 <span className="mono">pytest tests/test_game.py::test_canonical_board_perspective</span>；浏览器侧运行 <span className="mono">cd learn && npm test</span> 核对 <span className="mono">game.test.ts</span> 中的 <span className="mono">canonical</span> 用例。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "规范视角把当前行棋方记 +1、对手记 −1：原始棋盘乘以当前行棋方的颜色值，空格 0 不动。",
          "统一的是「我方 / 对方」的关系，不是抹掉先后手。同一局面换立场看，已有子的格整体翻号。",
          "终局结果 z 按同一立场记分：赢 +1、输 −1、和 0，因此能直接和网络价值估计比较。",
        ]}
        next={
          <>
            立场统一之后，才谈得上判断好坏。下一课把这套编码送进一台会学习的机器：
            每条特征配一个可调的权重，终局结果 z 与预测的差指出判断错了多少，权重便朝减少误差的方向微调。
            先在一对「特征 × 权重」上看清训练改什么、下棋用什么。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "训练代码漏写了规范视角的乘 −1，会造出什么样的脏样本？",
            options: [
              "没有影响，只是数组里的数字写法不同",
              "白方样本棋盘与 z 错位：棋盘停在黑方视角，z 却按行棋方记，等于往训练里掺系统性噪声；样本要连行棋方一起存才能拦住",
              "只影响内存布局，重新归一化就好",
            ],
            answer: 1,
            explain:
              "乘以当前行棋方（白 = −1）是每条样本的立场基准：每一格 +1 变 −1、−1 变 +1，0 不动。漏写后白方样本的棋盘停在黑方视角，与按行棋方记的 z 错位，而且是同一个方向的错。样本里存下行棋方（player）：棋盘按行棋方翻号，z 在终局按 player 补上，两边才是同一个视角。排查时可对拍 learn/tests/game.test.ts 的 canonical 用例：浏览器端的 engine/game.ts · canonical() 以不同写法实现同一约定。",
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
              "行棋方从 +1 换成 −1（或反过来），乘数一换，每个已有子的格整体翻一次号：+1 变 −1、−1 变 +1，空格仍是 0。拿黑棋还是拿白棋仍可能有用，那项身份由颜色平面单独告诉机器。",
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
        教学局面：5 黑 4 白共 9 手，轮白；开关拨动看到的翻号，就是 alphagomoku/game.py ·
        canonical_board 里 return 行的 <span className="mono">self.board * self._current</span> 乘法。
        轮白时乘 −1，数组逐格取反，棋子颜色随之互换。
      </figcaption>
    </figure>
  )
}
