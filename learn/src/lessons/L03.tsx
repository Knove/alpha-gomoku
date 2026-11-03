/** 第 3 课 · 权重：自己变准的机器(地基篇 1/4)。
 *  节拍：思考题 → 正文(配对/损失/梯度/学习率，定义框命名，落点码 linGrad/quadLoss/linStep/train.py)→
 *  例 3-1(单权重演示)→ 例 3-2(梯度下降步进器)→ 交付物与验证 → 小结与预告 → 习题。 */
import { useEffect, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { EvidenceCard } from "../framework/evidence"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { linGrad, linStep } from "../lib/foundations"

/* 教学局面：己方双三：横 (2,4)(3,4)(4,4) + 竖 (4,4)(4,5)(4,6)。
 * 本课故意把棋局缩成一个特征 x=2(我方已成三连的个数)，并假设这局训练对局后来赢了，
 * 所以终局结果 z=+1。一个权重的玩具估价器：r = w·x,损失 (r−z)²。 */
const X = 2
const Z = 1
const W0 = 0 // 教学玩具的固定起点；真实训练只在开始时随机初始化一次
const STOPS = [-1, -0.4, 0.2, 0.8, 1.4, 2] // 开关版的六个档位(故意躲开最低点 0.5)

const DUAL: number[] = (() => {
  const b = new Array<number>(81).fill(0)
  for (const [x, y] of [
    [2, 4], [3, 4], [4, 4], [4, 5], [4, 6],
  ] as [number, number][])
    b[y * 9 + x] = 1
  return b
})()

const loss = (w: number) => (w * X - Z) * (w * X - Z)

export default function L03() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 3 课</div>
      <h1 className="text-2xl font-bold">权重：自己变准的机器</h1>

      <LessonGuide
        question="有了棋盘编码（第 1 课）和终局胜负 z（第 2 课），机器怎样给眼前的局面打分，又怎样从输赢里自己变准？"
        why="9×9 棋盘共有 3^81（约 4.4×10^38）种局面，任何查表法都装不下。机器必须靠「提取特征 × 可调权重」来给局面打分，并在每局下完后根据预测分与真结果 z 的差距自动微调权重。"
        chain={[
          "打分：把盘面特征 x 乘上权重 w，算出机器对当前局面的预测分 r = w × x",
          "算账：拿预测分 r 和终局真结果 z 对比，用平方损失 (r − z)² 量出「错了多少」",
          "找方向：算出损失对权重的变化率（梯度），判断 w 往哪边挪能让损失变小",
          "迈一步：按学习率 lr 控制步幅，走一步 w ← w − lr × 梯度",
        ]}
        takeaway="你能分清 x、w、r、z 四个量的职责，手算一次单权重的损失、梯度与更新步，并看清学习率过大或过小会发生什么。"
        boundary="真实网络有 145,050 个权重，本课先聚焦到 1 个权重上把「打分 → 算损失 → 求梯度 → 迈一步」的四步循环拆透。第 4 课再从 1 个权重扩到 3×3 窗口的 9 个权重。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "9×9 五子棋的可能局面多达 4.4×10^38 种。要让机器对从没见过的新局面也能判断好坏，该怎么设计？",
            options: [
              "背棋谱：把每种局面的最佳走法全存进一张大表，下棋时直接查表",
              "手写规则：请人类高手把所有棋形和分值一条条写成 if-else 代码",
              "固定计算公式 + 可调权重：人只定「特征 × 权重」的计算结构，让机器从胜负结果里自动调准权重",
            ],
            answer: 2,
            explain:
              "选第三项。查表法既装不下，遇到陌生局面也查不到（没有泛化能力）；手写规则能应付简单情况，但几种棋形同时出现时谁轻谁重，人很难定准。把「固定公式」和「可调数字（权重）」分开后，下棋时用权重给新局面打分，训练时根据输赢微调权重。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>1. 机器怎样给局面打分：四个角色各司其职</h3>
        <p>
          在前两课里，棋盘已经变成了 81 个数字（我方 <span className="mono">+1</span>、对方{" "}
          <span className="mono">−1</span>、空位 <span className="mono">0</span>），终局也有了明确的胜负分{" "}
          <span className="mono">z</span>（赢 <span className="mono">+1</span>、输{" "}
          <span className="mono">−1</span>、和 <span className="mono">0</span>）。现在只差最关键的一步：
          <strong>棋还没下完时，机器怎么给眼前的局面打一个优劣预测分？</strong>
        </p>
        <p>
          如果把每种局面死记硬背存进表格，遇到没见过的新棋局就束手无策。要让学到的经验在新局面上也能生效（这叫<strong>泛化</strong>），机器采用的做法是：先从棋盘上提取出<strong>特征</strong>，再给每个特征配一个代表重要程度的<strong>权重</strong>，两者相乘得出预测分。
        </p>
        <Def term="特征与权重" en="feature & weight">
          <strong>特征（记作 x）</strong>是从盘面上读出的事实数字（注意：前两课用 x 表示列坐标，从本课起在计算公式里 <span className="mono">x</span> 代表特征值）。
          <br />
          <strong>权重（记作 w，亦称参数 parameter）</strong>是配给这条特征的可调倍数，表示「特征 <span className="mono">x</span> 每增加 1，预测分变化多少」。
          <strong>下棋时权重只读不改；训练时只改权重，不改特征。</strong>
        </Def>
        <p>
          为了把这个过程看得一清二楚，我们先不管真实网络里的 14.5 万个权重，只看<strong>最简单的一个特征配一个权重</strong>：
          假设我们在盘面上只数一件事——「我方已经连成三子的条数」，在下方教学局面里正好横一条、竖一条，所以特征值{" "}
          <span className="mono">x = 2</span>（到第 6、7 课的真实网络里，我们连三连都不用替它数，直接把每个格子的 0/1 状态当特征喂给网络）。
          再假设这局棋下到最后是我方赢了，终局结果 <span className="mono">z = +1</span>。
        </p>

        <div className="card my-6 p-4 sm:p-5">
          <div className="mini-label mb-3">本课最小玩具的四个角色（先认清谁固定、谁可调）</div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="reveal-box">
              <span className="mono font-bold">① 盘面特征 x = 2</span>
              <span className="ml-2 text-xs" style={{ color: "var(--fg-faint)" }}>【输入事实 · 固定】</span>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                盘面上我方三连的条数（横 1 条 + 竖 1 条 = 2）。这是眼前的棋盘事实，训练不能篡改它。
              </p>
            </div>
            <div className="reveal-box">
              <span className="mono font-bold" style={{ color: "var(--accent-deep)" }}>② 权重 w（待调）</span>
              <span className="ml-2 text-xs" style={{ color: "var(--accent-deep)" }}>【打分标准 · 唯一可调】</span>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                机器认为「每条三连值多少分」。训练的全部任务，就是把这个旋钮调到最准的位置。
              </p>
            </div>
            <div className="reveal-box">
              <span className="mono font-bold">③ 预测分 r = w × x</span>
              <span className="ml-2 text-xs" style={{ color: "var(--fg-faint)" }}>【机器当前猜测】</span>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                机器算出的局面优劣分（对应真实网络的价值输出 <span className="mono">v_net</span>）。若 <span className="mono">w = 0</span>，预测分就是 <span className="mono">0</span>；若 <span className="mono">w = 0.5</span>，预测分就是 <span className="mono">0.5 × 2 = +1</span>。
              </p>
            </div>
            <div className="reveal-box">
              <span className="mono font-bold">④ 终局结果 z = +1</span>
              <span className="ml-2 text-xs" style={{ color: "var(--fg-faint)" }}>【事后标准答案 · 固定】</span>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                整盘棋下完后才知道的真输赢（我方赢记 <span className="mono">+1</span>）。它是用来批改预测分 <span className="mono">r</span> 的标准答案。
              </p>
            </div>
          </div>
        </div>

        <h3>2. 怎样衡量「猜错了多少」：平方损失 (r − z)²</h3>
        <p>
          起初机器什么都不懂，假设权重在起点 <span className="mono">w = 0</span>，它算出的预测分是{" "}
          <span className="mono">r = 0 × 2 = 0</span>（觉得局势五五开），可标准答案是{" "}
          <span className="mono">z = +1</span>（我方赢）。预测与真值相差 <span className="mono">r − z = −1</span>。
        </p>
        <p>
          不管是猜低了（差值为负）还是猜高了（差值为正），都是错。为了把正负误差都变成正数、而且让离谱的大错受到更重的惩罚，我们把误差平方，定义为<strong>损失</strong>：
        </p>
        <Def term="损失" en="loss">
          衡量预测分 <span className="mono">r</span> 与目标真值 <span className="mono">z</span> 差距的非负数字（直观叫它罚分也行）。本课的价值损失取<strong>平方损失</strong>：
          <span className="mono">loss = (r − z)² = (w·x − z)²</span>。
          预测完全命中（<span className="mono">r = z</span>）时损失为 <span className="mono">0</span>；偏离越远，损失按平方急剧变大。
        </Def>
        <div className="formula">
          预测分 r = <span className="hl">w</span> × x = 2w　→　损失 = (r − z)² = <span className="hl">(2w − 1)²</span>
        </div>
        <p>
          把 <span className="mono">x = 2, z = 1</span> 代入后，每一个权重 <span className="mono">w</span> 都对应一个确定的损失值。把所有 <span className="mono">w</span> 的损失连起来，就是一条开口向上的碗状抛物线——碗底最低点在{" "}
          <span className="mono">w = 0.5</span>（此时 <span className="mono">r = 2 × 0.5 = +1 = z</span>，损失为 <span className="mono">0</span>）。
          现在去下方例 3-1 亲手拖动滑杆，看调整 <span className="mono">w</span> 时预测分怎样对准靶心、小球怎样滑向碗底：
        </p>
      </div>

      <TargetRange />

      <div className="prose mt-12">
        <h3>3. 怎样找准调权重的方向：梯度（曲线的坡度）</h3>
        <p>
          在例 3-1 里只有 1 个权重，你可以用眼睛盯着曲线手动把 <span className="mono">w</span> 拖到碗底 <span className="mono">0.5</span>。
          但真实网络有 <strong>145,050 个权重</strong>，机器看不见整张图，也试不过来所有组合。它站在起点{" "}
          <span className="mono">w = 0</span> 时，怎么不用瞎试就知道<strong>「往右调，损失会变小」</strong>？
        </p>
        <p>
          办法就是看<strong>脚下这点的坡度</strong>：把 <span className="mono">w</span> 从 <span className="mono">0</span> 轻轻往右探一小步到{" "}
          <span className="mono">0.001</span>，损失从 <span className="mono">1</span> 降到了{" "}
          <span className="mono">(2 × 0.001 − 1)² ≈ 0.996</span>。
          用「损失的变化量 <span className="mono">−0.004</span>」除以「权重的步长 <span className="mono">0.001</span>」，算出来的变化率就是{" "}
          <strong>−4</strong>。这个变化率就叫<strong>梯度</strong>。
        </p>
        <Def term="梯度" en="gradient">
          损失对权重的变化率（即损失曲线在当前点的切线斜率）：
          <br />
          • <strong>梯度 &lt; 0（负坡，下坡向右）</strong>：说明 <span className="mono">w</span> 往<strong>右（变大）</strong>调，损失会下降；
          <br />
          • <strong>梯度 &gt; 0（正坡，上坡向右）</strong>：说明 <span className="mono">w</span> 往<strong>左（变小）</strong>调，损失会下降；
          <br />
          • <strong>梯度 = 0（谷底平地）</strong>：说明在这道抛物线小题里已经到达最低点 <span className="mono">w = 0.5</span>，不用再动了。
        </Def>
        <p>
          不用每次都拿 <span className="mono">0.001</span> 去试算，直接对 <span className="mono">loss = (w·x − z)²</span> 求导，两步相乘就能写出精确的梯度公式：
        </p>
        <div className="formula">
          梯度 = <span className="hl">2(r − z)</span>（误差翻倍） × <span className="hl">x</span>（特征值） = <span className="hl">2x(wx − z)</span>
        </div>
        <p>
          拿起点 <span className="mono">w = 0, x = 2, z = 1</span> 代入公式验算：
          <span className="mono">梯度 = 2 × 2 × (0 − 1) = −4</span>。
          注意看这个公式有多聪明：当 <span className="mono">w</span> 离最佳值 <span className="mono">0.5</span> 很远时，误差 <span className="mono">(r − z)</span> 大，梯度绝对值就大，催着机器大步改；当 <span className="mono">w</span> 越来越接近 <span className="mono">0.5</span> 时，误差趋近于 <span className="mono">0</span>，梯度也自动趋近于 <span className="mono">0</span>，机器就会自动放慢脚步稳稳停在碗底。
        </p>

        <h3>4. 一步该迈多远：学习率 lr 与梯度下降</h3>
        <p>
          梯度 <span className="mono">−4</span> 指出了方向（因为梯度指向损失<strong>上升</strong>的方向，所以我们要<strong>减去</strong>梯度，往反方向走），但一步到底迈多大？如果直接减去 <span className="mono">−4</span>，一步跳到 <span className="mono">w = +4</span>，早就飞出碗外了。因此训练时要乘上一个控制步幅的小数——<strong>学习率（lr）</strong>：
        </p>
        <Def term="学习率与梯度下降" en="learning rate (lr) & gradient descent">
          <strong>学习率（lr）</strong>是人为设定的步幅缩放系数（例如 <span className="mono">0.05</span> 或真实配置里的 <span className="mono">0.01</span>）。
          每次按公式 <span className="mono">w ← w − lr × 梯度</span> 朝梯度反方向更新一步的做法，就叫<strong>梯度下降</strong>。
        </Def>
        <div className="formula">
          w<sub>新</sub> = w − <span className="hl">lr</span> × 梯度
        </div>
        <p>
          以 <span className="mono">lr = 0.05</span> 为例，从起点 <span className="mono">w = 0</span>（梯度为 <span className="mono">−4</span>）迈出第 1 步：
          <span className="mono">w<sub>新</sub> = 0 − 0.05 × (−4) = +0.2</span>。
          此时预测分从 <span className="mono">0</span> 升到了 <span className="mono">0.2 × 2 = 0.4</span>，损失从 <span className="mono">1.0</span> 降到了 <span className="mono">(0.4 − 1)² = 0.36</span>——<strong>机器真的凭一局输赢，自己把自己调准了一点！</strong>
        </p>
        <EvidenceCard
          fidelity="constructed"
          title="单权重教学算子：平方损失、梯度与一步梯度下降更新"
          source="learn/src/lib/foundations.ts · quadLoss / linGrad / linStep"
        >
          <div className="codewalk">
            <pre>{`export const quadLoss = (v: number, z: number): number => (v - z) * (v - z)
export const linGrad = (w: number, x: number, z: number): number =>
  2 * x * (w * x - z)
export const linStep = (w: number, x: number, z: number, lr: number): number =>
  w - lr * linGrad(w, x, z)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          上面这 3 行函数就是下方例 3-2 的全部计算引擎。现在去例 3-2 切换 <span className="mono">0.05</span>（稳步下山）、<span className="mono">0.2</span>（步子偏大来回震荡）、<span className="mono">0.35</span>（步子太大直接飞出画面），亲眼看看步幅大小如何决定训练成败：
        </p>
      </div>

      <Descender />

      <Ledger title="alphagomoku/train.py · make_optimizer">
        <p className="mb-3">
          本课学的是 1 个权重的更新循环；在真实项目里，演示模型一共有 <strong>145,050 个权重</strong>。
          <span className="mono">alphagomoku/train.py</span> 中的 <span className="mono">make_optimizer</span> 函数把网络全体权重{" "}
          <span className="mono">net.parameters()</span> 与配置中的学习率 <span className="mono">lr=0.01</span> 交给 PyTorch 的随机梯度下降优化器（<span className="mono">torch.optim.SGD</span>），供后续训练步一键更新全部权重：
        </p>
        <div className="codewalk">
          <pre>{`def make_optimizer(net: AlphaGomokuNet, cfg: Config) -> torch.optim.Optimizer:
    return torch.optim.SGD(
        net.parameters(),
        lr=cfg.lr,
        momentum=0.9,
        weight_decay=cfg.weight_decay,
        nesterov=True,
    )`}</pre>
        </div>
        <ul className="mt-3 ml-5 list-disc">
          <li>
            手算核对：把 <span className="mono">w = 0, x = 2, z = 1</span> 代入 <span className="mono">2x(wx − z)</span> 得梯度 <span className="mono">−4</span>；按 <span className="mono">lr = 0.05</span> 走第 1 步得 <span className="mono">0 − 0.05 × (−4) = 0.2</span>，与例 3-2 读数完全一致。
          </li>
          <li>
            验证与测试：运行 <span className="mono">pytest tests/test_train.py</span> 检查训练更新；浏览器侧运行 <span className="mono">cd learn && npm test</span> 核对 <span className="mono">foundations.test.ts</span> 中的 <span className="mono">quadLoss</span>、<span className="mono">linGrad</span> 与 <span className="mono">linStep</span>。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "四个角色分工明确：特征 x 是盘面事实（固定），权重 w 是打分倍数（唯一可调），两者相乘得预测分 r = w × x，拿去和终局真结果 z（固定）对比。",
          "平方损失 (r − z)² 把误差变成一只开口向上的碗：错得越远坡越陡，越靠近碗底坡越缓。",
          "梯度 2x(wx − z) 算出当前位置的坡度与方向；梯度下降按 w ← w − lr × 梯度 朝反方向迈步。下棋时权重只读，训练时才修改权重。",
        ]}
        next={
          <>
            一扇 3×3 棋盘小窗里有 9 个格子，只靠 1 个权重怎么够看清棋形？下一课把「1 个特征 × 1 个权重」扩展成「9 个格子特征 × 9 个权重」：
            每个格子乘上自己的权重再全部加起来（加权求和 / 点积），同时看清只做乘加运算的天然局限。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "查表法（把每种局面的答案都存起来）的两个致命缺陷是？",
            options: [
              "存不下（局面多达 4.4×10^38 种），而且没有泛化能力：遇到没见过的局面只能瞎猜",
              "查表太慢，和存不下",
              "表格会坏，而且要人工维护",
            ],
            answer: 0,
            explain:
              "存不下是空间问题，没有泛化是机制问题：查表法里每条记录都是孤立的，记录之间不会举一反三。用「特征 × 权重」计算分数，才能把旧对局里学到的权重用在新局面上。",
          },
          {
            q: "为什么权重 w 要设计成可微调的连续小数，而不是几个固定的开关档位？",
            options: [
              "连续小数在计算机里占内存更少",
              "连续值可以轻轻挪一小步算出坡度（梯度），直接知道往哪边调损失会降；离散档位无法求梯度，面对 14.5 万个权重时更无法穷举组合",
              "开关档位写代码更难",
            ],
            answer: 1,
            explain:
              "只有 1 个权重时，6 个档位还能挨个试一遍；但真实网络有 145,050 个权重，档位组合数会彻底爆炸。连续权重让曲线处处有坡度（梯度），机器只需算一次梯度就知道每个权重该往哪边微调。",
          },
          {
            q: "在例 3-2 里把学习率 lr 从 0.05 拉大到 0.35 甚至 0.4，连走几步会看到什么？",
            options: [
              "只会更快到达最低点，学习率越大越好",
              "步子迈得太大，直接跨过碗底 0.5 跳到对面更高处，越弹越远直至发散飞出画面",
              "没有任何影响，只是收敛速度一样",
            ],
            answer: 1,
            explain:
              "梯度只给方向，步子迈多大由学习率 lr 控制：太小（如 0.01）走得稳但慢；适中能稳步滑向碗底；太大（本例中超过 0.125 开始来回越过碗底震荡，超过 0.25 则每步误差翻倍放大）就会越弹越远直至发散。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 3-1 · 单权重演示：连续权重 vs 开关档位 ============ */

/** 抛物线图几何(L 上限 9.5,最低点 w*=Z/X=0.5) */
const CW = 300, CH = 176, CPL = 38, CPR = 12, CPT = 12, CPB = 30
const WMIN = -1, WMAX = 2, LMAX = 9.5
const xOf = (w: number) => CPL + ((w - WMIN) / (WMAX - WMIN)) * (CW - CPL - CPR)
const yOf = (l: number) => CH - CPB - (Math.min(l, LMAX) / LMAX) * (CH - CPT - CPB)
const CURVE = Array.from({ length: 61 }, (_, i) => {
  const w = WMIN + (i / 60) * (WMAX - WMIN)
  return `${xOf(w).toFixed(1)},${yOf(loss(w)).toFixed(1)}`
}).join(" ")

function TargetRange() {
  const [mode, setMode] = useState<"knob" | "switch">("knob")
  const [w, setW] = useState(0) // 连续权重位置
  const [stop, setStop] = useState(2) // 开关档位下标(默认 0.2)

  const r = w * X
  const l = loss(w)
  const g = linGrad(w, X, Z) // 脚下的梯度(坡)
  const sw = STOPS[stop]
  const swLoss = loss(sw)

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="mini-label">例 3-1 · 一个权重的最小例子：为什么调 w，怎样才算调得更好</span>
          <span className="seg" data-qa="range-mode">
            <button type="button" className={`seg-btn ${mode === "knob" ? "active" : ""}`}
              onClick={() => setMode("knob")}>
              连续权重
            </button>
            <button type="button" className={`seg-btn ${mode === "switch" ? "active" : ""}`}
              onClick={() => setMode("switch")}>
              开关档位
            </button>
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          先固定 x 与 z，再调整 w。这局棋提供两样不会随滑杆改变的东西：机器看到的特征
          <span className="mono">x = 2</span>，以及对局结束后得到的终局结果
          <span className="mono">z = +1</span>（这里假设这局棋后来由「我」赢了）。
          z 是假设标签，与盘面上有双三无关。机器要回答的是：「两条三连说明这局对我方是好是坏？」
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          权重 <span className="mono">w</span> 表示机器目前认为<strong>每单位计数值多少分</strong>。
          它用 <span className="mono">r = w × x</span> 算出自己的判断。比如
          <span className="mono">w = 0</span> 时，机器完全不看三连，得到
          <span className="mono">r = 0</span>；可是答案是 <span className="mono">z = 1</span>，
          所以这个判断还差 1 分。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          <strong>训练不是随便调 w，而是要让 r 更接近 z。</strong>每试一个
          <span className="mono">w</span>，都把差距平方，得到损失
          <span className="mono">(r−z)²</span>。右图把各种设置画成一条曲线：横向是
          <span className="mono">w</span>，高度是损失。向更低处移动，就表示判断正在变好。
          从起点 <span className="mono">w=0</span> 看，向右轻挪会让
          <span className="mono">r</span> 靠近答案，所以方向是右；如果越过
          <span className="mono">w=0.5</span>，向左轻挪才会变好。现在拖动滑杆，观察方向怎样改变。
        </p>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[19rem]">
          <div data-qa="dual-board">
            <Board board={DUAL} lastMove={{ x: 4, y: 6 }} />
          </div>
          <div className="reveal-box mt-3 text-sm leading-relaxed">
            <div className="mini-label">本页规定的特征 x 与终局结果 z</div>
            <p className="num mt-1.5">
              x = <strong>2</strong>（本页规定：横一条 + 竖一条）
              <br />z = <strong>+1</strong>（这里<strong>假设</strong>这局训练对局后来由「我」赢了）
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              <span className="mono">x</span> 是机器这次拿到的特征，
              <span className="mono">z</span> 是下完棋才得到的答案；训练不能改它们。
              训练能改的只有 <span className="mono">w</span>，也就是机器下次该多看重这个特征。
              这只是单特征的小题，不是完整棋力。
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${CW} ${CH}`} data-qa="target-curve"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 340 }}>
            <line x1={CPL} y1={CH - CPB} x2={CW - CPR} y2={CH - CPB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[1, 4, 9].map((p) => (
              <g key={p}>
                <line x1={CPL} y1={yOf(p)} x2={CW - CPR} y2={yOf(p)}
                  style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
                <text x={CPL - 5} y={yOf(p) + 3} fontSize={9} textAnchor="end"
                  className="num" style={{ fill: "var(--fg-faint)" }}>{p}</text>
              </g>
            ))}
            {[-1, 0, 0.5, 1, 2].map((t) => (
              <text key={t} x={xOf(t)} y={CH - CPB + 13} fontSize={9.5} textAnchor="middle"
                className="num" style={{ fill: "var(--fg-faint)" }}>
                w={t === 0 ? "0" : (t > 0 ? "+" : "−") + Math.abs(t)}
              </text>
            ))}
            {/* 最低点标线：w* = z/x = 0.5 */}
            <line x1={xOf(0.5)} y1={yOf(0)} x2={xOf(0.5)} y2={yOf(9)}
              strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <text x={xOf(0.5)} y={CPT + 8} fontSize={9.5} textAnchor="middle" className="num"
              style={{ fill: "var(--fg-faint)" }}>
              损失是平方、永远 ≥0；r 恰好等于 z 时取到 0，就是最小值
            </text>
            <text x={xOf(0.5)} y={CPT + 20} fontSize={9.5} textAnchor="middle" className="num"
              style={{ fill: "var(--fg-faint)" }}>
              w×2=1 即 w=0.5 时 r=z，所以最好取 w=0.5
            </text>
            <polyline points={CURVE} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={2} />

            {mode === "knob" ? (
              <g data-qa="knob-dot">
                <circle className="motion-pos" cx={xOf(w)} cy={yOf(l)} r={6} style={{ fill: "var(--accent-deep)" }} />
                <text x={xOf(w)} y={yOf(l) - 10} fontSize={10} textAnchor="middle" className="num"
                  style={{ fill: "var(--accent-deep)" }}>
                  {l.toFixed(2)}
                </text>
              </g>
            ) : (
              <g data-qa="switch-dots">
                {STOPS.map((s, i) => (
                  <circle key={s} cx={xOf(s)} cy={yOf(loss(s))} r={i === stop ? 6 : 4}
                    style={{
                      fill: i === stop ? "var(--accent-deep)" : "var(--fg-faint)",
                    }} />
                ))}
                <text x={xOf(sw)} y={yOf(swLoss) - 10} fontSize={10} textAnchor="middle"
                  className="num" style={{ fill: "var(--accent-deep)" }}>
                  {swLoss.toFixed(2)}
                </text>
              </g>
            )}
          </svg>

          {mode === "knob" ? (
            <div data-qa="knob-panel">
              <div className="mini-label mt-2">试着改变「每单位计数值多少分」w（−1 → 2）</div>
              <input type="range" min={-1} max={2} step={0.01} value={w}
                onChange={(e) => setW(Number(e.target.value))} aria-label="w 滑杆"
                style={{ ["--fill" as string]: `${((w + 1) / 3) * 100}%` }}
                data-qa="knob-slider" />
              <div className="reveal-box mt-3">
                <p className="num">
                  r = w·x = {(w).toFixed(2)}×2 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{r.toFixed(2)}</strong>
                  {"   "}损失 = (r−z)² ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{l.toFixed(3)}</strong>
                </p>
                <p className="num mt-1.5">
                  梯度（损失对 w 的变化率） ={" "}
                  <strong>{g >= 0 ? "+" : ""}{g.toFixed(1)}</strong>
                  <span className="ml-2 font-normal" style={{ color: "var(--fg-muted)" }}>
                    {g < 0 ? "是负的 → 往右调一点，损失会降" : g > 0 ? "是正的 → 往左调一点，损失会降" : "是 0 → 这道小题已到最好位置"}
                  </span>
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                判断好不好，只看损失有没有下降。在这道平滑的小题里，除最低点外每个位置都有下降方向。
                连续权重让「小调一点」真的会留下可测的变化；这就是训练能利用的局部信息。
              </p>
            </div>
          ) : (
            <div data-qa="switch-panel">
              <div className="mini-label mt-2">档位：只能整档跳，没有中间；本演示的档位表故意不含 0.5，以显示离散档够不到最低点</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STOPS.map((s, i) => (
                  <button key={s} type="button"
                    className={`btn ${i === stop ? "active" : ""}`}
                    onClick={() => setStop(i)} data-qa="stop-btn">
                    {s > 0 ? "+" + s : s}
                  </button>
                ))}
              </div>
              <div className="reveal-box mt-3">
                <p className="num">
                  站在 {sw} 档：r = {(sw * X).toFixed(2)}、损失 ={" "}
                  <strong style={{ color: "var(--accent-deep)" }}>{swLoss.toFixed(3)}</strong>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
                  最好的两档（0.2 档和 0.8 档）并列，损失都是 0.36；连续权重能调到
                  0.5，损失为 0。六个档位还能逐个试，但真实机器有约 14.5 万个
                  可学数字，所有档位组合无法穷举。离散档位之间没有「调 0.01 格」这条
                  路，也就没有可用的局部梯度。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 3-1</span>
        同一题的两种设定：连续权重可以沿曲线小步调整；六个档位只能挨个比较。
        这个玩具说明的是为什么<strong>可学习的数字</strong>通常设为连续值，不是在说程序里不能有条件判断。
      </figcaption>
    </figure>
  )
}

/* ============ 例 3-2 · 梯度下降步进器：lr 与三种走法 ============ */

const MAX_STEPS = 200
/** 发散时 w 可能到 10^95 量级(200 步封顶永不溢出),大数用科学计数法 */
const fmtW = (v: number) => (Math.abs(v) < 1000 ? v.toFixed(3) : v.toExponential(2))

function zoneOf(lr: number): string {
  if (Math.abs(lr) < 1e-9) return "原地不动：学习率是 0，权重不会更新"
  if (lr < 0.125) return "稳步梯度下降（误差一步比一步小）"
  if (Math.abs(lr - 0.125) < 1e-9) return "一步到最低点（每步乘的数恰好是 0）"
  if (lr < 0.25) return "越过最低点来回弹：误差每步换一次正负号，但一直在变小"
  if (Math.abs(lr - 0.25) < 1e-9) return "每步乘的数是 −1：永久在最低点两侧来回"
  return "发散（divergence）：每步乘的数大小超过 1，误差越乘越大"
}

function Descender() {
  const [lr, setLr] = useState(0.05)
  const [hist, setHist] = useState<number[]>([W0])
  const [running, setRunning] = useState(false)

  // 换 lr 就从头走：因子变了，旧轨迹混在一起看不清形态
  const setLrReset = (v: number) => {
    setLr(v)
    setHist([W0])
    setRunning(false)
  }
  const stepOnce = () => {
    setHist((h) =>
      h.length >= MAX_STEPS ? h : [...h, linStep(h[h.length - 1], X, Z, lr)],
    )
  }
  const reset = () => {
    setHist([W0])
    setRunning(false)
  }

  useEffect(() => {
    if (!running) return
    if (hist.length >= MAX_STEPS) {
      setRunning(false)
      return
    }
    const t = setTimeout(stepOnce, 110)
    return () => clearTimeout(t)
  })

  const n = hist.length - 1
  const wNow = hist[hist.length - 1]
  const flew = Math.abs(wNow) > WMAX + 0.5 || wNow < WMIN - 0.5

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 3-2 · 梯度下降步进器：方向有了，步子该迈多大</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          图的高度代表损失：点越低，机器错得越少；高度最低的位置就是最低点。
          这道玩具题是一条开口向上的曲线，只有一个最低点，在那里损失正好是 0，
          所以它一定是本题最好的权重位置。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          本项目从一个随机起点持续训练，每步随机抽取一批训练样本，
          并随机旋转或镜像棋盘（数据增强 data augmentation，参见：第 14 课）。
          优化器使用 SGD、动量和权重衰减，本项目的实际配置带有小批次随机性与动量。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          这张图研究的是另一个问题：方向已经知道以后，一步该走多远。
          先选学习率 <span className="mono">lr</span>，再点「走一步」或「自动」：0.05 是小步，
          0.2 会跨过最低点后折返，0.35 则大到越走越远。观察的重点是看清
          <strong>太小走得慢、合适才能靠近、太大会冲过头</strong>。
        </p>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${CW} ${CH}`} data-qa="descend-curve"
            style={{ width: "100%", height: "auto", display: "block", maxWidth: 340 }}>
            <line x1={CPL} y1={CH - CPB} x2={CW - CPR} y2={CH - CPB}
              style={{ stroke: "var(--hairline-strong)" }} strokeWidth={1} />
            {[1, 4, 9].map((p) => (
              <line key={p} x1={CPL} y1={yOf(p)} x2={CW - CPR} y2={yOf(p)}
                style={{ stroke: "var(--hairline)" }} strokeWidth={0.7} />
            ))}
            <line x1={xOf(0.5)} y1={yOf(0)} x2={xOf(0.5)} y2={yOf(9)}
              strokeDasharray="4 4" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            <text x={xOf(0.5)} y={CPT + 8} fontSize={9.5} textAnchor="middle" className="num"
              style={{ fill: "var(--fg-faint)" }}>
              最低点 w=0.5（损失最低）
            </text>
            <polyline points={CURVE} fill="none" style={{ stroke: "var(--accent)" }}
              strokeWidth={2} opacity={0.55} />
            {/* 轨迹：相邻步连线(飞出画面的点由 svg 根部裁掉) */}
            <polyline data-qa="descend-trace"
              points={hist
                .map((wv) => `${xOf(wv).toFixed(1)},${yOf(loss(wv)).toFixed(1)}`)
                .join(" ")}
              fill="none" style={{ stroke: "var(--fg-faint)" }} strokeWidth={1} />
            {hist.map((wv, i) =>
              i < n && wv >= WMIN - 0.4 && wv <= WMAX + 0.4 ? (
                <circle key={i} cx={xOf(wv)} cy={yOf(loss(wv))} r={1.6}
                  style={{ fill: "var(--fg-faint)" }} />
              ) : null,
            )}
            <circle className="motion-pos" data-qa="descend-ball"
              cx={xOf(hist[n])} cy={yOf(loss(hist[n]))} r={6}
              style={{ fill: "var(--accent-deep)" }} />
            {flew && (
              <text x={CW - CPR - 4} y={CPT + 10} fontSize={10} textAnchor="end"
                style={{ fill: "var(--accent-deep)" }}>
                已飞出画面 →
              </text>
            )}
          </svg>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            还是那道题（x=2、z=+1，教学起点 w=0）：每按一次「走一步」，
            <span className="mono">w ← w − lr×梯度</span>（← 念「变成」）。以 lr=0.05 为例，第 1 步：
            0 − 0.05×(−4) = 0.2：梯度是负的，权重向右调。小圆点是走过的位置，
            线是相邻两步的连线；lr=0.2 时来回跨过最低点，说明步子虽能前进，却开始摆动。
          </p>
        </div>

        <div className="min-w-0 flex-1 md:max-w-[19rem]">
          <div className="mini-label">学习率 lr（0 → 0.5）</div>
          <input type="range" min={0} max={0.5} step={0.005} value={lr}
            onChange={(e) => setLrReset(Number(e.target.value))} aria-label="lr 滑杆"
            style={{ ["--fill" as string]: `${(lr / 0.5) * 100}%` }}
            data-qa="lr-slider" />
          {/* 双刻度线：0.125(一步到最低点)与 0.25(临界) */}
          <div className="num relative mt-1 h-7 text-xs" style={{ color: "var(--fg-faint)" }}>
            <span className="absolute" style={{ left: `${(0.125 / 0.5) * 100}%`, top: 0, transform: "translateX(-50%)" }}>
              |<br />0.125
            </span>
            <span className="absolute" style={{ left: "0.5%" }}>0</span>
            <span className="absolute" style={{ left: `${(0.25 / 0.5) * 100}%`, top: 0, transform: "translateX(-50%)", color: "var(--accent-deep)" }}>
              |<br />0.25
            </span>
            <span className="absolute" style={{ right: 0 }}>0.5</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: "var(--fg-faint)" }}>预设</span>
            {[0.05, 0.2, 0.35].map((p) => (
              <button key={p} type="button"
                className={`btn ${Math.abs(lr - p) < 1e-9 ? "active" : ""}`}
                onClick={() => setLrReset(p)} data-qa="lr-preset">
                {p}
              </button>
            ))}
            <span className="ml-auto" />
            <button type="button" className="btn" disabled={n >= MAX_STEPS}
              onClick={stepOnce} data-qa="step-btn">
              走一步
            </button>
            <button type="button" className={`btn ${running ? "active" : ""}`}
              onClick={() => setRunning((r) => !r)} data-qa="auto-btn">
              {running ? "⏸ 暂停" : "▶ 自动"}
            </button>
            <button type="button" className="btn" onClick={reset}>↺ 重置</button>
          </div>
          <div className="reveal-box mt-3">
            <p className="num">
              第 <strong>{n}</strong> 步：w ={" "}
              <strong style={{ color: "var(--accent-deep)" }}>{fmtW(wNow)}</strong>
              {"   "}损失 = <strong>{fmtW(loss(wNow))}</strong>
            </p>
            <p className="num mt-1.5">
              起点 <span className="mono">w = 0</span> 距最优位置 <span className="mono">w* = 0.5</span> 相差 <span className="mono">0.5</span>，此时梯度为 <span className="mono">−4</span>，因此 <span className="mono">lr = 0.125</span> 一步走 <span className="mono">0.125 × 4 = 0.5</span> 刚好到位。
              若取 <span className="mono">lr = 0.25</span>，一步走 <span className="mono">1.0</span> 会跨到最低点对称侧来回等幅弹跳；超过 <span className="mono">0.25</span> 则每步越弹越远。
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" data-qa="zone"
              style={{ color: "var(--fg-muted)" }}>
              {zoneOf(lr)}
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            这两条刻度线只属于当前玩具（x=2、单个权重）：真实网络有许多权重和复杂
            的地形，不能直接套这两个阈值；代码里的 lr=0.01 是配置里预先设定的步幅。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 3-2</span>
        本图只有一个最低点，是为了单独看清学习率怎样控制步幅；现实训练可能有许多局部最低点。
        每一步按 <span className="mono">w ← w − lr·2x(wx−z)</span> 更新：
        0 到 0.125 稳步靠近；0.125 恰好一步到位；0.125 到 0.25 来回跨过最低点但仍在收敛；0.25 永久等幅来回；更大则越弹越远。
        这些具体数值取决于本例的 <span className="mono">x=2</span>，不是现实网络的通用安全线。
      </figcaption>
    </figure>
  )
}
