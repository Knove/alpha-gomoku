/** 第 3 课 · 权重：自己变准的机器(地基篇 1/4)。
 *  节拍：思考题 → 正文(配对/损失/梯度/学习率，定义框命名)→
 *  例 3-1(单权重演示)→ 例 3-2(梯度下降步进器)→ 对证(train.py optimizer)→ 小结与预告 → 习题。 */
import { useEffect, useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { linGrad, linStep } from "../lib/foundations"

/* 教学局面：己方双三：横 (2,4)(3,4)(4,4) + 竖 (4,4)(4,5)(4,6)。
 * 本课故意把棋局缩成一个特征 x=2(我方已成三连的个数)，并假设这局训练对局后来赢了，
 * 所以终局标签 z=+1。一个权重的玩具估价器：r = w·x,损失 (r−z)²。 */
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
        question="为什么机器不必背下每一种棋局，也能从输赢里越练越会下？"
        why="先弄清机器里什么能改、何时改、改了为什么会影响判断，后面的细节才不会只剩一串名词。"
        chain={[
          "棋盘特征进入固定的计算骨架",
          "特征与权重一对一配对，加权求和成判断",
          "终局结果 z 指出判断错了多少，告诉权重该微调哪边",
          "更准的判断配合搜索变成更好的走法，长期表现为棋力",
        ]}
        takeaway="权重是每个特征的分量，与特征一对一配对；它决定机器如何判断，但本身不是棋力。训练时才调权重，下棋时只使用已经调好的权重。"
        boundary="本课把真实网络约 14.5 万个权重缩到一对「特征 × 权重」来观察。真实机器同时学习策略目标和价值目标（两种目标的答案分别是搜索留下的 π 与终局 z）；第 4 课扩成 3×3 窗口内的 9 对，第 7 课扩成全盘滑窗的 27 对。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "要让机器对没见过的棋局也能下好，最关键的设计是什么？",
            options: [
              "背棋谱：把每种局面的最好一步都存进一张大表，下棋时查表",
              "写完所有规则：请高手把每种棋形和应手都列成「如果…就…」",
              "固定的计算骨架 + 大量可微调的数字：让输赢不断把这些数字调得更合适",
            ],
            answer: 2,
            explain:
              "选第三个。查表装不下、也不会举一反三；规则可以写出一部分棋理，但人很难把无数局面及其轻重全列完。第三种把人最擅长的事和机器最擅长的事分开：人规定计算骨架，机器从结果中调数字。那些数字的正式名字叫「权重」。它们决定机器如何判断棋局，但本身不是棋力。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>棋理写在「特征 × 权重」的配对里</h3>
        <p>
          把机器想成一台固定的计算装置：输入是眼前的棋盘，中间是人先搭好的计算骨架，
          输出是两个判断：哪里更值得下、这局的结局取值是好是坏。骨架本身不包含任何一条走法指令（如「三连要堵」）；
          但结构自带两条事先写死的偏好（见下方归纳偏置定义框）：棋形先看邻域、同型图案各处通用。
          机器的全部棋理拆成许多对
          <strong>特征 × 权重</strong>：左边一个问题的答案，右边一个分量。
          判断时把每个答案乘上自己的权重、加成分数；训练只改右边的权重，下棋只换左边的特征值。
        </p>
        <Def term="特征" en="feature">
          回答一个事先固定的问题所得的数字。问题可以问一格：「这个交叉点上有我的子吗」，
          答案记 1 或 0；也可以问一种图案：「己方三连有几条」，答案记条数。问题的粗细是
          设计选择；唯一的约定只有一条：一个问题就是一个特征，答案即特征值。问题必须
          事先定好，对任何局面都能算出一个数；换一个局面，同一问题就换一个答案。
        </Def>
        <Def term="权重" en="weight，亦称参数 parameter">
          与一条特征配对的可调分量，决定这条特征对结论占多大分量。它的单位是「特征值每增 1，
          结论分数变化 w」。权重是训练学出来的，存在模型文件里；下棋时只读不改，训练时才按误差指出的方向修改。
          后文一律用「权重」这一个名字；「参数」只在与英文 parameter 对照处出现。在同一层的同一次求和内，每个特征各配一个权重，彼此不共用；
          卷积另有一套「同一组权重在不同位置重复使用」的共用法，那是另一回事
          <span className="def-see">参见：第 7 课</span>
        </Def>
        <Def term="归纳偏置" en="inductive bias" see="第 7 课">
          结构里事先写死的「答案大概长什么样」的偏好。本模型带两条：棋形先看邻域（邻域指周围紧挨着的那圈格子）、
          同型图案各处通用（同一套权重在棋盘各处重复使用，不为每个位置各学一遍）。它不是走法指令，没有把「三连要堵」写进网络；具体棋理仍要靠数据学出来。
        </Def>
        <p>
          本课把这种配对缩到<strong>一对</strong>来看它怎样被调准。
        </p>

        <h3>先摆出一对：特征 x = 2 和它的权重 w</h3>
        <p>
          本课的玩具只提一个问题：「己方三连有几条？」计数口径是出题人定的：只数横竖、不数斜线（判胜数四方向，这里刻意简化）；同一行或同一列上连续三颗己方子、两端不再延伸，计 1 条（四连不计：恰三的口径里找不出「恰三」的一段；两端是否被堵死也不论，死三活三同样计 1）。棋局<strong>规定</strong>横一条、竖一条，
          共两条，这个问题的答案就是 <span className="mono">x = 2</span>。两条三连不是
          两个特征，它们是同一个问题的计数对象：问题问的是总数，答案只是一个数。
          棋盘是答案的来源，答案才是特征值。数三连这一步是人替机器做的；真实网络不请人
          替它认图案，而是把问题拆得更细（比如「这一格上有我的子吗」这样的九九八十一个小问题），由自己学会识别「三连」这类图案。
          输出有两个，本课先只保留「结局好坏」这一路。
        </p>
        <p>
          令 <span className="mono">w</span> 是这个特征的权重（玩具不设常数项：没有「什么都不看也自带的分」。砍掉它只为少一个变量，一元的 w×x 已足够看清训练。真实网络里那一项叫偏置 bias：卷积层不带它，那份平移由批标准化承担（第 5 课点到、第 8 课立目）；全连接层自带），
          <span className="mono">r = w × x</span> 是玩具机器给出的<strong>原始分数</strong>。
          计数每增 1（再多一条三连），原始分数就增加 <span className="mono">w</span>；<span className="mono">w</span> 为正就抬高，
          为负就压低。<span className="mono">w = 0</span> 时这个特征不计入；
          <span className="mono">w = 0.5</span> 时两条三连一共给 <span className="mono">r = 1</span>。
          在这个玩具里，<span className="mono">r</span> 越高表示机器越偏向「我方最后会赢」；这只是机器的乐观度，猜得对不对要看 z。
          w 是每单位计数的分值。权重不规定「见三连就怎样下」，它只决定一个特征对一个分数的影响。
        </p>
        <Def term="原始分数" en="raw score">
          玩具里价值那一路的输出 <span className="mono">r</span>，回答「这局的结局取值是好是坏」。它对应真实网络
          价值头的输出、价值估计 <span className="mono">v_net</span>，同一个角色；真实网络还会用 tanh 把它压进 −1…+1，以对齐 z 的标尺。
          玩具还省略另一路：「哪里该下」的策略一路。
          <span className="def-see">参见：第 9 课（策略头与标尺）、第 12 课（训练样本里的 π）</span>
        </Def>

        <h3>为什么不查表、不写死规则</h3>
        <p>
          9×9 棋盘的每格有空、黑、白三种可能，81 格各填一数，组合有 3<sup>81</sup> 种（含走不到的局面，
          真实合法局面数少一些），约是 4.4×10^38，表根本装不下。即使装得下，新局面也没有现成一行可查。
          手写规则能给出一些提示，却无法由人逐一决定所有局面、所有棋形各该有多重要。
        </p>
        <Def term="泛化" en="generalization">
          把见过的例子上的规律用到没见过的例子上。查表没有这种能力，每条记录是孤岛；
          权重的做法是人只规定「怎样计算」，由大量对局自己决定「每件事该看重多少」，
          新局面才有可能答得可靠。
        </Def>

        <h3>错误怎样变成损失</h3>
        <p>
          训练和下棋是两件事。训练开始时真实机器随机初始化权重，之后在一批批样本上持续微调，
          不会每局棋重新乱猜。          对局结束后才知道终局结果 <span className="mono">z</span>：
          赢记 +1，输记 −1，和记 0；每手各记一个，以该手行棋方为正。在这个玩具里，玩具把原始分数 <span className="mono">r</span> 同
          <span className="mono">z</span> 比较，两者之差 <span className="mono">r−z</span> 就是误差。
        </p>
        <Def term="初始化" en="initialization">
          训练开始时给全部权重设一次初始位置（本项目随机设）。随机是为了打破对称：若全设 0，多单元的层里每个单元会一模一样地更新，谁也分化不开；随机起点让它们各走各的。之后只按误差指出的方向微调，不再重新乱猜。
        </Def>
        <Def term="损失" en="loss">
          把「错多少」变成一个可比较的数。本课取误差的平方
          <span className="mono">(r−z)²</span>（直观叫它罚分也行）：损失非负，错得越远越大。本题能压到 0，是一个权重刚好拟合一个答案；
          在真实多样本、双目标下，更复杂的网络通常到不了 0：样本之间会互相矛盾（同一特征在不同局面要求的权重不一样），网络容量也有限。那时「最好」指损失最小处，不是 0。
          损失降了也不等于实战棋力涨，那是另一件事，要靠受控对战检验（参见：第 15 课）。
        </Def>
        <p>
          为什么取平方而不是绝对值？两条都能做到「非负、错得越远越大」，差别在步子上：
          平方的误差越小，损失对 w 的变化率也越小，越接近答案步子自动越轻；绝对值的变化率大小恒定，
          近底会来回过冲、反复弹；步长再小也只是抖幅变小，不会停在最低点。等下一节立好「变化率」，平方的这一条会算给你看，绝对值的对照也在那一节给出。
        </p>

        <h3>梯度：错误指出方向</h3>
        <p>
          如果把权重向右轻轻挪一点，损失会上升还是下降？这个「上升或下降的快慢」本身是一个数，它就叫梯度。
        </p>
        <Def term="梯度" en="gradient">
          损失对权重的变化率，每个权重各有一个梯度数（14.5 万个权重就是 14.5 万个梯度）。梯度指向损失上升的一边，所以训练朝它的反方向走：
          梯度为负说明向右会下降，为正说明向左会下降；为 0 只说明一阶变化为零（瞬时变化为零）。在本课这条开口向上的单权重曲线上，梯度为 0 就是最小值；多维权里为 0 还可能是最高点或鞍点（两侧上翘、另两侧下垂的路口）。
        </Def>
        <p>
          这道单权重题不必真的左右各试一次。先用数字试一小步：w=0 时把 w 挪到 0.001，
          损失从 1 变成 0.996004，「损失变化 ÷ w 变化」约是 −3.996，近似 −4。
          这个「损失随 w 变化的速度」有精确写法，叫求导（对…求导，读作求对…的变化率）。
          把 <span className="mono">r = wx</span> 代入损失再对 <span className="mono">w</span> 求导，
          走两步（链式法则）：对 r 求导得 2(r−z)，再乘 r 对 w 的变化率 x，两步相乘得
          2(wx−z)·x，即 <span className="mono">2x(wx−z)</span>。w=0、x=2、z=1 代入正好 −4，
          与上面的试算对上；它的正负给方向，大小表示变化有多快。作为对照：绝对值损失 |r−z| 对 w 的变化率大小恒为 |x|（符号看误差方向），所以它的步子不随接近答案而变轻。公式里 x=0（己方一条三连也没有）时梯度恒为 0：这样的样本推不动 w，
          要靠别的样本来教；若某特征在训练集里恒为 0，它的权重收不到样本梯度，只有权重衰减（每次更新把权重往零轻拽一点的做法，对证一节展开）会把它慢慢拽向 0；那不是学习信号，救不活这样的零特征，它等于白带着。
        </p>
        <Def term="反向传播" en="backpropagation">
          真实网络用来把错误沿许多层倒着传给每个权重的算法：按链式法则
          （chain rule，复合函数求导时沿路径逐段相乘）把误差逐段分解，算出每个权重的梯度。
          <span className="def-see">参见：第 13 课</span>
        </Def>
        <p>
          权重还必须能连续微调。若每个设置只能选几个档位，少数档位可以逐个试；
          14.5 万个权重的档位组合起来根本无法穷举。连续数字让「轻轻调一点」成为可能，
          预测和损失会连续改变，梯度才能提供局部信息。用来学习的数字要能从小变化中得到更新方向。
        </p>

        <h3>学习率：一步走多远</h3>
        <p>
          梯度只回答「往左还是往右」，不回答「这次调多少」。训练的人另设一个控制步子大小的数字。
        </p>
        <Def term="学习率" en="learning rate,代码里缩写 lr">
          每一步的步幅。更新规则是把权重<strong>减去</strong>「学习率 × 梯度」，
          也就是朝梯度反方向走这么远。学习率小则每次只调一点，稳但慢；
          太大可能一步跨过最好位置甚至越调越错；为 0 则权重完全不动，也就没有学习。
          本项目的 SGD（随机梯度下降，对证一节展开）里它是全体权重共用的一个数（即一个普通数字，不是每个权重各有一份），每一步都乘同一个学习率，各权重只在梯度上不同。也存在按权重各自调步幅的优化方法（如 Adam 一族），本项目未用。学习率由人预先设定，并非学出来的量。
        </Def>
        <Def term="梯度下降" en="gradient descent">
          「沿梯度反方向、按学习率迈步」这套更新做法的正式名字。训练和下棋的分工由此定型：
          训练时走「棋局 → 预测 → 目标 → 损失 → 梯度 → 更新」，
          下棋时走「棋局 → 已调好的权重给出判断 → 把判断变成走法」。
        </Def>
        <p>
          许多轮自动纠错后，判断更准，长期的赢棋能力通常随之提高；但损失降不必然等于实战棋力涨。这就是机器「自己变准」的全部机制，
          不是魔法，也不是把棋力塞进某一个权重。
        </p>
      </div>

      <TargetRange />

      <Descender />

      <Ledger title="train.py · make_optimizer（梯度下降加三件配套）">
        <div className="codewalk">
          <pre>{`# train.py L13-20  真训练用的优化器:梯度下降 + 三件配套(momentum、nesterov、weight_decay)
def make_optimizer(net: AlphaGomokuNet, cfg: Config) -> torch.optim.Optimizer:
    return torch.optim.SGD(
        net.parameters(),          # 全部权重(14.5 万个)
        lr=cfg.lr,                 # 步子大小：0.01(config.py)
        momentum=0.9,              # 顺着既有方向多稳一步
        weight_decay=cfg.weight_decay,  # 每次更新把权重往零轻拽(0.0001,config.py)
        nesterov=True,
    )`}</pre>
        </div>
        <p className="mt-3">
          例 3-1 里你调的是<strong>一个</strong>权重；真训练一次会更新约 14.5 万个。
          真实训练先把策略损失和价值损失按 1:1 相加成总损失（这个比例是超参数，本项目取等权当起点），再由 PyTorch
          （本项目使用的深度学习库）的
          <span className="mono">backward()</span> 沿真实网络倒着求出每个权重的梯度，
          <span className="mono">optimizer.step()</span> 才更新全部权重。这与例 3-1 里挨个试档位不同，不必到处试方向。
          深度学习（deep learning）指多层神经网络的训练方法。
        </p>
        <p className="mt-3">
          三个数都不是算出来的：lr=0.01、动量 0.9、权重衰减 0.0001 都是靠实验挑的常用起点（超参数）。当前项目使用叫 SGD 的优化器（stochastic gradient descent，随机梯度下降）：
          每次随机抽一小批旧样本（mini-batch，本项目每批 128 条），用这批的梯度更新一次，学习率从头到尾固定。随机小批是折中：全量算太贵，单条又太噪。
          三件配套是：动量（momentum，把最近若干次更新方向合成惯性，取 0.9）、
          Nesterov（动量的改法：先按惯性探一步，再在那个位置算梯度，开关打开）、
          以及权重衰减（weight decay，每次更新把权重往零轻拽，取 0.0001）。
          它们不改变「方向 + 步幅」这条主线，只改「怎么调」。
          没有「学着学着把步子调小」的安排，也没有从多个起点并行训练。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "棋理不写成规则，而是拆成一对对「特征 × 权重」：特征是固定问题的答案，权重是训练学出的分量，一个问题配一个自己的权重。",
          "损失 (r−z)² 把「错多少」变成可比较的数；平方使梯度随误差缩小而变小，步子自动越轻。",
          "梯度给方向，学习率给步幅；沿梯度反方向按学习率迈步就是梯度下降。训练改权重，下棋只读权重。",
        ]}
        next={
          <>
            下一课把问题也拆细：从「三连有几条」一个问题，换成「窗口每格是什么」9 个问题，
            特征的单位不变，仍是一个问题一个数。9 对合成一个分数的运算叫加权求和，
            也就是点积；之后是 27 对、整盘滑动（第 7 课），配对规则不变。顺带看清只做乘加为何画不出
            弯曲的分界线（第 5 课）。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "查表法（把每种局面的答案都存起来）的两个致命缺陷是？",
            options: [
              "存不下（局面多到「4.4×10^38」），而且没有泛化：没见过的局面上只能瞎猜",
              "查表太慢，和存不下",
              "表格会坏，而且要人工维护",
            ],
            answer: 0,
            explain:
              "存不下是硬件问题，没泛化是机制问题：每条记录是孤岛，记录之间互不相干。局面稍一陌生，表就帮不上忙。泛化是没见过的局面也答得可靠；查表那不是泛化差，是根本没有泛化。",
          },
          {
            q: "为什么权重要取连续值，而不能是开关档位？",
            options: [
              "连续的数在计算机里存得更省",
              "连续数可以小调一点并观察损失怎样变，提供局部更新方向；少数离散档位能逐个试，但大量档位组合无法穷举",
              "开关写代码更难",
            ],
            answer: 1,
            explain:
              "六个档位当然可以全试一遍；难点在真实机器有约 14.5 万个可学数字，组合数会爆炸。连续权重让训练能问「轻轻往这边调，损失是升还是降？」，在平滑的局部里得到方向，而不是枚举所有组合。",
          },
          {
            q: "学习率（lr）调大会怎样？",
            options: [
              "只会更快到最低点，越大越好",
              "步子大了会跨过最低点、来回弹；本玩具（x=2）有两个阈值：超过 0.125 开始过冲弹跳，超过 0.25 才越弹越发散（正好 0.125 是一步到位，正好 0.25 是永久等幅来回）",
              "没有影响，只是一个写法习惯",
            ],
            answer: 1,
            explain:
              "步子大小决定收敛形态：太小慢、合适才靠近，太大时误差会越弹越大直至发散。这些具体边界由 x=2 这道玩具题算出，不能照搬到真实网络；它们只说明学习率就是「每次改多大一步」。",
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
          <span className="mono">z = +1</span>（这里假设这局棋后来由「我」赢了；z 是假设标签，与盘面上有双三无关）。机器要回答的是：「两条三连说明这局对我方是好是坏？」
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
                <circle cx={xOf(w)} cy={yOf(l)} r={6} style={{ fill: "var(--accent-deep)" }} />
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
              <div className="mini-label mt-2">档位（只能整档跳，没有中间；本演示的档位表故意不含 0.5，以显示离散档够不到最低点）</div>
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
  const factor = 1 - 2 * lr * X * X
  const flew = Math.abs(wNow) > WMAX + 0.5 || wNow < WMIN - 0.5

  return (
    <figure className="figure mt-12">
      <div className="px-4 pt-4 sm:px-5">
        <span className="mini-label">例 3-2 · 梯度下降步进器：方向有了，步子该迈多大</span>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          图的高度代表损失：点越低，机器错得越少；高度最低的位置就叫<strong>最低点</strong>。这道玩具题的曲线只有一个最低点（开口向上的凸形曲线），
          在那里损失正好是 0，所以它一定是本题最好的权重位置。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          真实机器的损失地形不会这么简单，可能有许多高低不同的低处：某个位置若四周都不比它低，
          叫<strong>局部最低点</strong>（local minimum），整张图里最低的那个叫<strong>全局最低点</strong>（global minimum）。
          梯度只报告当前位置附近损失下降的方向，不能保证带你找到全局最低点。行业里对付这种情况的常用办法有：每次换一小批样本来算（损失地形每步略有晃动，可能把点从局部最低点里晃出来）、
          给更新加动量（更不容易停在局部最低点）、挑合适的学习率；最终还要用没参加训练的棋局（验证集 validation set）或实战成绩挑模型，
          而不是只认训练损失最低（本项目不设验证集：样本是自产自销的对局，规模也小，直接用对战得分率当外部尺子更省事，挑 best 只看得分率）。下一段会核对<strong>本项目实际用了哪些</strong>，不能把行业做法冒充当前代码。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          <strong>本项目没有为逃离局部最低点而反复重置全部权重。</strong>它从一个随机起点持续训练，
          每步随机抽取一批旧样本，并随机旋转或镜像棋盘（数据增强 data augmentation，参见：第 14 课）；优化器使用 SGD、动量和权重衰减。
          新的自我对局还会不断进入训练资料。因此它确实有「小批次变化 + 动量」，但没有在同一次
          训练中并行尝试多个权重起点。挑模型这条也用了：在有竞技场的轮次，由受控对战的得分率决定要不要换 best（竞技场按配置隔轮做，第 15 课），不认训练损失最低。
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          下面这道曲线只有一个最低点，研究的是另一个问题：方向已经知道以后，一步该走多远。
          先选学习率 <span className="mono">lr</span>，再点「走一步」或「自动」：0.05 是小步，
          0.2 会跨过最低点后折返，0.35 则大到越走越远。观察的重点不是背住数字，而是看清
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
              wv >= WMIN - 0.4 && wv <= WMAX + 0.4 ? (
                <circle key={i} cx={xOf(wv)} cy={yOf(loss(wv))} r={i === n ? 5 : 1.6}
                  style={{ fill: i === n ? "var(--accent-deep)" : "var(--fg-faint)" }} />
              ) : null,
            )}
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
              推导走三步：先认准最好位置 w*（让 r=wx 正好等于 z 的那个 w，本题 w*=z/x=0.5）。
              把误差写成 wx−z = x(w−w*)（由 z = w*·x 移项），
              代入更新式 w ← w − lr·2x(wx−z) 得 w′ = w − lr·2x²(w−w*)，
              移项即 w′−w* = (w−w*)(1−2·lr·x²)。
              每步乘上因子的是带符号的偏差 w−w*（偏差可正可负；因子为负时，偏差翻号，一步跨过最低点）。
              这个因子 1 − 2·lr·x² ={" "}
              <strong>{factor >= 0 ? "+" : ""}{factor.toFixed(3)}</strong>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed" data-qa="zone"
              style={{ color: "var(--fg-muted)" }}>
              {zoneOf(lr)}
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
            这两条刻度线只属于当前玩具（x=2、单个权重）：真实网络有许多权重和复杂
            的地形，不能直接套这两个阈值；代码里的 lr=0.01 是配置里预先设定的步长。
          </p>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 3-2</span>
        本图只有一个最低点，是为了单独看清学习率怎样控制步幅；现实训练可能有许多局部最低点。
        核心公式：本玩具每一步算 <span className="mono">w ← w − lr·2x(wx−z)</span>，
        就是「减去 学习率 × 梯度」（<span className="mono">linStep</span>）。
        0.125 与 0.25 这两个临界值来自 <span className="mono">|1−2·lr·x²|=1 或 0</span>：
        lr=0 完全不动；0 到 0.125 稳步靠近；0.125 恰好一步到最低点；
        0.125 到 0.25 会来回跨过最低点但仍在靠近；0.25 永久来回；更大则越走越远。
        这里只用来解释这个滑杆，不是现实网络的通用安全线。
      </figcaption>
    </figure>
  )
}
