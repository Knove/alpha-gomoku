/** 第 8 课 · 叠层：看见全盘。
 *  节拍：思考题(单层 3×3 怎么看全盘)→ 正文(感受野每层 +2 与深度、
 *  残差 x+h 捷径与批标准化)→
 *  例 8-1(层深滑杆：感受野框 3×3 → 15×15)→
 *  例 8-2(真特征图墙：traceNet + weights-best,stem 与三个残差块各取前 6 通道)→
 *  源码索引与验证 → 习题。 */
import { useEffect, useMemo, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
import { encode, type GameState } from "../engine/game"
import { traceNet, type WeightsJson } from "../engine/model"
import { loadWeights } from "../lib/weights"

/* 与第 7 课同一局面：己方三连 (2,4)(3,4)(4,4),轮己方走。
 * encode 只读 board + current,直接构造状态(教学局面：只摆三连，演示用)。 */
const THREE: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
]
const STATE: GameState = (() => {
  const board = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  for (const [x, y] of THREE) board[y][x] = 1
  return { board, current: 1, winner: 0, moveCount: 3, lastMove: null }
})()

export default function L09() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 8 课</div>
      <h1 className="text-2xl font-bold">叠层：看见全盘</h1>

      <LessonGuide
        question="3×3 卷积核只能看一小块时，网络怎样逐步理解整局棋的形势？"
        why="局部三连很重要，但「哪一边整体更强、两处威胁是否能连起来」需要更大的感受野。把小卷积核直接做成全盘大小既笨重又难学。"
        chain={[
          "浅层卷积核先发现局部棋子和小棋形",
          "下一层把相邻位置的发现再组合",
          "每多叠一层，能回看的区域向外扩一圈",
          "深层把局部特征汇成整盘形势",
        ]}
        takeaway="你能算出叠层后的感受野，写出 ResBlock 里 x+h 捷径与两处批标准化（Batch Normalization，简称 BN）的位置，并区分它的训练与推理统计。"
        boundary="本站演示权重（小一号的 fast 配置，为了让网页算得快）叠 3 个残差块，共 7 层，感受野 15×15（计算见正文）。项目默认是 4 个残差块、9 层卷积。残差块、感受野都由正文定义；理论感受野只表示可能传来的范围，不保证每个位置实际影响相同。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "单个卷积核只看得见 3×3 的一小片，可「我方子力一大片、对方很稀」是全盘的事。怎么让它看见全盘？",
            options: [
              "把卷积核做大：直接造一张 9×9 的大卷积核，一步看全",
              "叠层：小卷积核一层层叠上去，能看的范围每层大一圈",
              "没办法，卷积核天生只能看局部",
            ],
            answer: 1,
            explain:
              "选第二项。单个输入平面上的 9×9 卷积核就要 81 个权重；本模型有三个输入平面，一套全盘卷积核会有 243 个。更要紧的是，它想一步认完所有东西，跳过了「先认局部、再组合整体」的层次。叠层让第二层站在第一层结果上：窗口仍是 3×3，能回看的范围却一圈圈变大。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>每叠一层，感受野边长 +2</h3>
        <p>
          一层 3×3 只看 3×3；两层叠起来，第二层的每个格子拿第一层
          <strong>九个格子的分数</strong>（在第二层眼里，那就是九个特征值）当原料。那九个格子紧挨着排成 3×3，
          每个自己都向外多看了一圈输入；九个 3×3 拼在一起，覆盖 5×5。
          于是第二层能回看的输入范围恰好是 5×5。
          规律是<strong>每多叠一层，感受野边长 +2</strong>。
        </p>
        <Def term="感受野" en="receptive field">
          一个输出格理论上能看到的输入范围。它由结构决定，与权重取值无关：
          第 1 层看 3×3，第 2 层看 5×5，每多一层边长加 2。
          「理论上」指信号可能传来的范围，不保证范围内每个位置实际影响相同。
        </Def>
        <p>
          本模型的第一层叫 stem，后面还叠 6 层；每两层编成一组，一组叫一个残差块，
          一共 3 组。这是本课程演示权重的配置（<span className="mono">configs/fast.json</span> 的{" "}
          <span className="mono">net_res_blocks = 3</span>，合起来 <strong className="num">7</strong> 层；项目默认配置{" "}
          <span className="mono">configs/default.json</span> 取 4 个残差块，合 9 层卷积）。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="主干叠层：首层 stem 之后串联 res_blocks 个残差块"
          source="alphagomoku/model.py · AlphaGomokuNet.__init__"
        >
          <div className="codewalk">
            <pre>{`        self.blocks = nn.Sequential(*[ResBlock(channels) for _ in range(res_blocks)])`}</pre>
          </div>
        </EvidenceCard>
        <div className="formula">
          感受野边长 = <span className="hl">3</span> + 2 × (层数 − 1) → 7 层：
          3 + 2×<span className="hl">6</span> = <span className="hl">15</span>
        </div>
        <p>式子念出来：层数减 1 就是乘 2 的次数。这是 stride=1、3×3 核、padding=1 下的规律（padding 不改变 +2，只保证输出图不缩水）。7 层代入得 15，9 层代入得 19。15×15 的感受野以该输出格为中心：天元的格子确实罩住全盘，角落的格子要罩住对角得 17×17（8 层），7 层时角落的半径差一格。</p>
        <p>整盘判断不因此受阻：单个格看不到对角，末端读出层却会从整张特征图汇总全部 81 个格子（下一课详解），81 个格各看 15×15、合起来早已覆盖全盘。</p>
      </div>

      <FovSlider />

      <div className="prose mt-12">
        <h3>深层把局部发现组合成更大范围</h3>
        <p>
          这种许多层堆叠的网络叫<strong>深度网络</strong>（deep network），
          用它做机器学习就是<strong>深度学习</strong>：上一层的输出到下一层就是输入特征，浅层处理小范围原始格子，深层在浅层结果上组合出更大范围的表示（本课程演示模型共 7 层卷积，项目默认 9 层）。
          层叠带来的感受野增长，正是它「深」的意义之一。
          更深的层<strong>有能力</strong>把更大范围的信息组合起来：
          浅层常更容易对局部棋形敏感，深层可能整合成更大的局面特征。
          这是一种常见倾向，不是「第几层必定懂什么」的承诺；
          每个通道实际学到什么，要看训练结果。
        </p>
      </div>

      <FeatureWall />

      <div className="prose mt-12">
        <h3>残差连接让旧信息留下</h3>
        <p>
          叠层有个隐患：层一多，原始输入的信号传到后面越来越淡，深网学得又慢又吃力。
          残差连接是一条简单的补救：每一组层不重写答案，只算一份「修正量」。
        </p>
        <p>
          记号很朴素：<span className="mono">F(x)</span> 是修正量，原输入
          <span className="mono">x</span> 不动，两路相加，出口再过一次 ReLU。
          想「什么也不修」，让 <span className="mono">F(x)</span> 学成接近 0 就行，x 原样通过
          （前提是 x≥0，见下），这是最好学的选择，
          写成一行就是 <span className="mono">y=ReLU(x+F(x))</span>。
          倒着看也一样：反向传播（把误差沿各层倒着分解求梯度的算法，第 13 课详述）时，只要出口 ReLU 的门开着，
          直通路的这份 +1 就让更新信号可以直接穿过，深层不容易收不到更新；
          直通路只保证这段梯度为 1，梯度仍可能在别处衰减。<span className="mono">F′</span> 是修正量那条路的梯度，
          这一段的梯度是 <span className="mono">1+F′</span>。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块前向计算：两层卷积后把原输入 x 加回修正量 h"
          source="alphagomoku/model.py · ResBlock.forward"
        >
          <div className="codewalk">
            <pre>{`    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          两行 <span className="mono">h</span> 是修正量分支（梯度 <span className="mono">F′</span>），<span className="mono">return F.relu(x + h)</span> 中的{" "}
          <span className="mono">x + h</span> 把直通项（梯度 1）与修正量合成为 <span className="mono">1 + F′</span>；出口的 ReLU 既保证传给下一块的{" "}
          <span className="mono">x ≥ 0</span>（<span className="mono">stem</span> 出口同样经过 ReLU），也让块与块之间保持非线性。本站{" "}
          <span className="mono">model.ts</span> 的 <span className="mono">resBlock</span> 复现这条推理路径，例 8-2 的特征图即由它逐层算出。
        </p>
        <Def term="残差连接" en="residual connection，也叫捷径连接 shortcut connection">
          把原输入不加改动地加到本组输出上的那条通路。本模型每组算的是修正量
          <span className="mono">F(x)</span>，输出为
          <span className="mono">y=ReLU(x+F(x))</span>：
          「什么也不修」（<span className="mono">F(x)</span> 接近 0）成为容易学到的选择，
          信息和更新信号都有一条较直接的路。这条捷径不减小感受野：输出能回看的范围是
          修正量那条路与直通路的并集，只会更大，上文的 +2 规律不破。
        </Def>
        <Def term="残差块" en="residual block">
          带一条残差连接的一组层。本模型每个残差块含两层 3×3 卷积，
          第一层走「卷积 + 批标准化 + ReLU」，第二层走「卷积 + 批标准化」（不带 ReLU），最后把两层算出的修正量加回原输入，再过一次 ReLU。
          演示模型叠 3 个残差块，项目默认 4 个。
        </Def>
      </div>

      <div className="prose mt-12">
        <h3>批标准化稳住各层数值尺度</h3>
        <p>
          不整理尺度会怎样：某层分数可能越滚越大或缩到接近 0，
          后面层的权重只好追着新尺度反复改，训练又慢，数值又常波动。
          训练时，批标准化用当前一批样本的统计先把每个通道标准化：
          <span className="mono">x̂ = (x − μ批) / σ批</span>
          （每通道减去自己在这批上的均值、除以自己在这批上的标准差，把数值拉回 0 附近）；
          每通道再用自己的一对可学习系数 γ、β 恢复合适表达（48 通道共 48×2=96 个数，对应{" "}
          <span className="mono">weights-best.json</span> 中的 <span className="mono">blocks.0.bn1.weight</span> 与{" "}
          <span className="mono">blocks.0.bn1.bias</span>）：
          <span className="mono">输出 = γ·x̂ + β</span>。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="残差块层定义：两层 3×3 卷积（无偏置）各配一处批标准化"
          source="alphagomoku/model.py · ResBlock.__init__"
        >
          <div className="codewalk">
            <pre>{`    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          训练与推理（inference，只前向算一遍、不做训练的使用方式）两条统计路径由 <span className="mono">net.eval()</span> 切换：<span className="mono">Predictor</span> 初始化与{" "}
          <span className="mono">load_checkpoint</span> 加载权重后都会调用一次，使推理阶段改用训练期积累的运行均值与运行方差。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="推理封装初始化：切入 eval 模式以使用运行统计量"
          source="alphagomoku/model.py · Predictor.__init__"
        >
          <div className="codewalk">
            <pre>{`    def __init__(self, net: AlphaGomokuNet, device: str = "cpu"):
        self.net = net
        self.device = torch.device(device)
        self.net.to(self.device)
        self.net.eval()`}</pre>
          </div>
        </EvidenceCard>
        <Def term="批标准化" en="Batch Normalization，简称 BN">
          <p>按通道把数值拉回同一范围的整理步骤。它的另一重身份是尺度整理的层间自动化：第 4 课讲过权重能吸收特征的尺度差，但那样训练步子会两头难顾；有了批标准化，每层输出先回到同一尺度，下一层拿到的特征值量纲相当，全局学习率才同时照顾各层。</p>
          <p>做法分三步。训练时用当前一批样本的均值与标准差做标准化 <span className="mono">x̂ = (x − μ批) / σ批</span>。再用可学习的缩放与平移 <span className="mono">γ·x̂ + β</span> 恢复表达能力（β 就是卷积层省掉的那份偏置，第 5 课）。同时积累运行统计。标准化的用处在中间过程：先让每层输入回到同一尺度、梯度好走，γ、β 只在最后把表达调回来。</p>
          <p>真正下棋时（推理）不能用眼前这一批的临时统计。推理必须是输入的确定函数：
          同一局面每次都要给出同一个 v_net（价值估计）。若输出随同批其他样本变，
          搜索每次评估同一叶节点会得到不同值，树上的访问计数就全废了（叶节点与访问计数见第 10 课）。
          所以推理改用训练期攒下的运行均值与方差（滑动平均：越新的样本权重越大；
          方差开方才是标准化用的标准差）。批标准化的统计在批与全部空间位置上一起算，
          批为 1 也不是「只有一个数」。</p>
          <p>残差在管路径，BN 在管数值尺度，两者作用不同，不能互相替代。</p>
        </Def>
      </div>

      <Ledger title="alphagomoku/model.py · ResBlock 与 blocks">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <span className="mono">alphagomoku/model.py · ResBlock</span>：<span className="mono">__init__</span> 定义两层{" "}
            <span className="mono">3×3</span> 卷积（<span className="mono">padding=1, bias=False</span>）与两处{" "}
            <span className="mono">BatchNorm2d</span>；<span className="mono">forward</span> 计算修正量{" "}
            <span className="mono">h</span> 并返回 <span className="mono">F.relu(x + h)</span>。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · AlphaGomokuNet.__init__（self.blocks）</span>：在{" "}
            <span className="mono">stem</span> 之后串联 <span className="mono">res_blocks</span> 个残差块，总卷积层数为{" "}
            <span className="mono">1 + 2 × res_blocks</span>，理论感受野边长为{" "}
            <span className="mono">3 + 2 × (层数 − 1)</span>（7 层得 15，9 层得 19）。
          </li>
          <li>
            <span className="mono">alphagomoku/model.py · Predictor.__init__ / load_checkpoint</span>：调用{" "}
            <span className="mono">net.eval()</span> 切入推理模式，确保批标准化使用保存的运行统计量。
          </li>
          <li>
            上下游衔接：主干输出 <span className="mono">h = self.blocks(self.stem(x))</span> 在第 9 课交给策略头与价值头；浏览器端{" "}
            <span className="mono">learn/src/engine/model.ts · traceNet</span> 逐层复现该主干并驱动例 8-2。
          </li>
          <li>
            验证命令：<span className="mono">pytest tests/test_model.py::test_forward_shapes_and_ranges</span> 与{" "}
            <span className="mono">cd learn && npm test</span>。
          </li>
        </ul>
      </Ledger>

      <ChapterEnd
        summary={[
          "感受野边长 = 3 + 2 × (层数 − 1)：每叠一层加 2。演示模型 7 层看 15×15，以天元计已盖过 9×9 全盘，角落的半径差一格。",
          "叠深是让机器按先局部、后整体的顺序扩大感受野；深层有能力组合更大范围，具体通道学到什么由训练结果决定。",
          "残差连接让每组只学修正量 F(x)，输出 y=ReLU(x+F(x))，旧信息与更新信号都有一条直接通路。",
          "批标准化按通道稳住数值尺度：训练用当前批次统计并积累运行记录，下棋用保存的运行统计，再施加学到的 γ 与 β。",
        ]}
        next={
          <>
            卷积主干到此把局面整理成一层层特征。下一课在网络末端接上两个头：
            一个回答「哪里更值得下」，另一个回答「这局谁更可能赢」。
            两个答案为什么共用同一条主干、各自怎样变回可用的形式，都在下一课展开。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "7 层的感受野怎么算？",
            options: [
              "7 × 3 = 21 格",
              "3 + 2 × (7 − 1) = 15：第一层 3×3，每多叠一层边长 +2",
              "算不出来，要看每个卷积核的权重才知道",
            ],
            answer: 1,
            explain:
              "规律与权重无关，是结构给的：第 1 层看 3×3，第 2 层看 5×5，第 3 层看 7×7……每层把上一层的九个分数当原料，感受野每层 +2。滑杆从 1 拨到 7 亲手数一遍：3、5、7、9、11、13、15。",
          },
          {
            q: "从结构上看，叠深网络最稳妥的说法是什么？",
            options: [
              "深层可以组合更大范围的局部特征；浅层偏局部、深层偏整体是常见倾向，但具体通道学到什么要由训练结果决定",
              "浅层认黑子，深层认白子",
              "层层都一样，只是通道数不同",
            ],
            answer: 0,
            explain:
              "每多一层，理论感受野就扩大一圈，因此深层有条件把更多局部特征放在一起。特征图里有些亮区看起来贴着棋子、有些连成大片，但这只提供观察提示，不能把单张图直接命名为「它一定在认某种棋形」。",
          },
          {
            q: "残差连接起什么作用、写在 ResBlock 的哪一处？",
            options: [
              "让棋盘刷新得更快",
              "让每层学习「在上一层答案上修一点」；修正量接近 0 时，输入就能大致原样通过",
              "把 48 个通道压缩成 2 个",
            ],
            answer: 1,
            explain:
              "捷径使「什么也不修」成为容易学到的选择：修正量 h 接近 0 时，x+h 大致保留输入。反向求梯度时，捷径还提供一条 ×1 的直通路，所以信息和更新信号都有较直接的路；它缓解梯度消失，但不保证梯度永不消失。",
          },
          {
            q: "推理脚本忘了切 eval()、BN 仍用当前批统计，对局表现会怎么坏？",
            options: [
              "没有不同：每次重新算统计更准",
              "同一局面的 v_net 会随同批其他局面变化，树上的访问计数就全废了；训练时用批统计并更新运行记录，真正下棋必须用保存的运行统计",
              "训练时关闭 BN，真正下棋时才打开",
            ],
            answer: 1,
            explain:
              "训练的一批样本足以估计通道当前的中心和尺度，BN 同时积累运行统计；真正下棋可能一次只输入少量局面，必须用训练期保存的统计，eval() 切换的就是这件事。忘切的后果不只是波动：同一叶节点每次值不同，树上的访问计数就失去意义。残差负责路径，BN 负责尺度，不能互相替代。",
          },
        ]}
      />
    </section>
  )
}

/* ============ 例 8-1 · 层深滑杆：感受野一圈圈长大 ============ */

const CELL5 = 26
const M5 = CELL5 * 4.2 // 界外余量：7 层感受野(15×15)在 9×9 外还要伸 3.5 格
const VB5 = M5 * 2 + 8 * CELL5
const px5 = (x: number) => M5 + x * CELL5

function FovSlider() {
  const [layers, setLayers] = useState(1)
  const side = 3 + 2 * (layers - 1)
  const half = side / 2

  // 感受野框(以天元 (4,4) 为中心),单位：格
  const bx = px5(4 - half)
  const by = px5(4 - half)
  const bw = side * CELL5

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 8-1 · 层深滑杆：看第几层的眼睛</span>
      </div>
      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-5">
        <div className="min-w-0 flex-1 md:max-w-[26rem]">
          <svg viewBox={`0 0 ${VB5} ${VB5}`} style={{ width: "100%", height: "auto", display: "block" }}
            role="img" aria-label={`层数 ${layers},感受野 ${side}×${side}`}>
            <rect
              x={M5 - CELL5 * 0.62}
              y={M5 - CELL5 * 0.62}
              width={VB5 - 2 * (M5 - CELL5 * 0.62)}
              height={VB5 - 2 * (M5 - CELL5 * 0.62)}
              rx={10}
              style={{ fill: "var(--board)" }}
            />
            <g style={{ stroke: "var(--board-line)" }} strokeWidth={1} opacity={0.85}>
              {Array.from({ length: 9 }, (_, i) => (
                <line key={`v${i}`} x1={px5(i)} y1={px5(0)} x2={px5(i)} y2={px5(8)} />
              ))}
              {Array.from({ length: 9 }, (_, j) => (
                <line key={`h${j}`} x1={px5(0)} y1={px5(j)} x2={px5(8)} y2={px5(j)} />
              ))}
            </g>
            {/* 己方三连(与第 7 课同一局面) */}
            {THREE.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={px5(x)} cy={px5(y)} r={CELL5 * 0.36}
                style={{ fill: "var(--stone-b)", stroke: "var(--stone-b-lo)", strokeWidth: 1.5 }} />
            ))}
            {/* 感受野框：中心在天元；伸出棋盘的部分=界外(补 0) */}
            <rect
              x={bx} y={by} width={bw} height={bw} rx={8}
              style={{
                fill: "var(--accent)",
                stroke: "var(--accent)",
                strokeWidth: 2.5,
                // CSS 几何属性可过渡的浏览器里平滑缩放；不支持则直接跳变(属性兜底)
                transition: "x 260ms ease, y 260ms ease, width 260ms ease, height 260ms ease",
              }}
              fillOpacity={0.06}
              strokeDasharray={side > 9 ? "9 6" : undefined}
            />
            <text x={bx + bw} y={by - 7} textAnchor="end" fontSize={13}
              fontFamily="ui-monospace, SF Mono, Menlo, monospace" style={{ fill: "var(--accent-deep)" }}>
              {side}×{side}
            </text>
            {side > 9 && (
              <text x={bx + bw / 2} y={by + bw + 16} textAnchor="middle" fontSize={12}
                style={{ fill: "var(--fg-faint)" }}>
                伸出棋盘的部分 = 界外，按 0 算
              </text>
            )}
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">层数(1 → 7)</div>
          <input
            type="range" min={1} max={7} step={1} value={layers}
            onChange={(e) => setLayers(Number(e.target.value))}
            aria-label="层数"
            style={{ ["--fill" as string]: `${((layers - 1) / 6) * 100}%` }}
            data-qa="fov-slider"
          />
          <div className="mt-1 flex justify-between text-xs num" style={{ color: "var(--fg-faint)" }}>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="reveal-box mt-4">
            <p className="num text-lg font-bold">
              感受野边长 = 3 + 2 × ({layers} − 1) ={" "}
              <span data-qa="fov-side" style={{ color: "var(--accent-deep)" }}>{side}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              {layers === 1 && "第 1 层：窗口 3×3，只能看一个短局部片段。"}
              {layers > 1 && layers < 7 && `叠到第 ${layers} 层：盖住 ${side}×${side}。`}
              {layers === 7 &&
                "7 层 = stem 1 层 + 残差块 3 × 2 层（演示模型的配置）：以天元计 15×15 盖过 9×9 全盘。"}
            </p>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            从 1 拨到 7，看感受野框一圈圈长大：
            <span className="num font-bold">3 → 5 → 7 → 9 → 11 → 13 → 15</span>。
            到第 4 层恰好罩住 9×9；演示模型 7 层，界外还有一圈余量。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 8-1</span>
        窗口始终是 3×3，每叠一层感受野边长 +2。棋盘上是第 7 课那个三连局面。
      </figcaption>
    </figure>
  )
}

/* ============ 例 8-2 · 真特征图：观察各层怎样保留与组合信号 ============ */

const CHANNELS_SHOWN = 6

function FeatureWall() {
  const [w, setW] = useState<WeightsJson | null>(null)
  useEffect(() => {
    let alive = true
    loadWeights().then((x) => {
      if (alive) setW(x)
    })
    return () => {
      alive = false
    }
  }, [])

  // 单次前向(~16ms),缓存；滑杆/交互只切展示，不重算
  const trace = useMemo(() => {
    if (!w) return null
    return traceNet(w)(encode(STATE))
  }, [w])

  const rows: { label: string; sub: string; planes: Float64Array }[] = useMemo(() => {
    if (!trace) return []
    return [
      { label: "第 1 层 · stem", sub: "局部响应", planes: trace.stemOut.data },
      { label: "第 2-3 层 · 残差块 1", sub: "", planes: trace.blockOuts[0].data },
      { label: "第 4-5 层 · 残差块 2", sub: "", planes: trace.blockOuts[1].data },
      { label: "第 6-7 层 · 残差块 3", sub: "更大范围的组合", planes: trace.blockOuts[2].data },
    ]
  }, [trace])

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 8-2 · 真特征图：每层都有 48 张特征图</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          观察亮区如何随层变化：有的贴近棋子，有的覆盖更大区域。它们是训练后的数值响应，
          不是已经被人命名好的「棋理标签」。
        </p>
      </div>
      <div className="overflow-x-auto p-4 md:p-5">
        {!trace ? (
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            正在加载真权重（weights-best.json，约 1.2 MB）……
          </p>
        ) : (
          <div className="flex flex-col gap-5" data-qa="fwall">
            {rows.map((r, ri) => (
              <div key={ri} data-qa="frow" className="flex flex-wrap items-center gap-4">
                <div className="w-[7.5rem] flex-none">
                  <div className="mini-label">{r.label}</div>
                  {r.sub && (
                    <div className="text-xs" style={{ color: "var(--fg-faint)" }}>{r.sub}</div>
                  )}
                </div>
                {Array.from({ length: CHANNELS_SHOWN }, (_, ch) => (
                  <FeatureMap key={ch} planes={r.planes} ch={ch} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 8-2</span>
        真引擎 + 真权重：<span className="mono">traceNet</span>（model.ts）对三连局面从头到尾算一遍。
        每层 48 个卷积核，就有 48 张特征图，一张叫一个「通道」；这里每组出口摆出前 {CHANNELS_SHOWN} 张。
        亮 = 这张图在这里的相对响应高。每张图都按<strong>自己</strong>的最大值着色，所以不同通道的亮度不能直接比较大小。滚动前先猜哪一层还亮在横三连那三格上，再往下对照。
      </figcaption>
    </figure>
  )
}

/** 一张 9×9 特征图：planes 为 [48, 9, 9] 布局，通道在前；每通道按自身最大值归一。 */
function FeatureMap({ planes, ch }: { planes: Float64Array; ch: number }) {
  const off = ch * 81
  let max = 0
  for (let k = 0; k < 81; k++) max = Math.max(max, planes[off + k])
  return (
    <svg viewBox="0 0 90 90" width="86" height="86" data-qa="fmap" role="img"
      aria-label={`通道 ${ch} 特征图`}
      style={{ borderRadius: 6, background: "var(--card-sunken)", flex: "none" }}>
      {Array.from({ length: 9 }, (_, y) =>
        Array.from({ length: 9 }, (_, x) => {
          const v = planes[off + y * 9 + x]
          const t = max > 0 ? v / max : 0
          return (
            <rect key={`${x}-${y}`} x={x * 10 + 0.5} y={y * 10 + 0.5} width={9} height={9}
              style={{ fill: "var(--accent)" }} opacity={0.05 + t * 0.85} />
          )
        }),
      )}
    </svg>
  )
}
