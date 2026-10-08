/** 第 14 课 · 训练：许多样本怎样形成一次更新。
 *  节拍：思考题 → 回放环 → 随机批次/min_buffer → 同步对称 → 精确 train_step →
 *  例 14-1/14-2 → 对证（ReplayBuffer/train_step/优化器）→ 小结 → 习题。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import Board from "../lib/board"
import { REAL } from "../data/real"
import { dihedral, dihedralPi, emptyBoard, play, type GameState } from "../engine/game"

const GAME = REAL.selfplayGame
const MOVES = GAME.moves
const SYM_IDX = Math.min(17, MOVES.length - 1)

const STATES: GameState[] = (() => {
  const arr: GameState[] = [emptyBoard()]
  for (const m of MOVES) arr.push(play(arr[arr.length - 1], m.y * 9 + m.x, m.player as 1 | -1))
  return arr
})()

const coord = (a: number) => `(${a % 9},${Math.floor(a / 9)})`
const argmaxPi = (pi: number[]) => {
  let a = 0
  for (let i = 1; i < pi.length; i++) if (pi[i] > pi[a]) a = i
  return a
}

export default function L15() {

  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <div className="eyebrow mb-3">第 14 课</div>
      <h1 className="text-2xl font-bold">训练：许多样本怎样形成一次更新</h1>

      <LessonGuide
        question="前后相邻的棋局彼此很像，机器怎样把它们整理成更可靠的一次权重更新？"
        why="直接按产生顺序学习容易被最近几局带着摇摆；而且棋盘方向不同、棋理却相同，可以等价改写，不增加样本条数。回放池、随机批次和数据增强先把样本整理好，真实 train_step 才开始算损失和更新。"
        chain={[
          "样本写进回放池",
          "累积到 min_buffer 才随机抽一批",
          "每张棋盘与 π 同步做一种旋转或镜像",
          "重新前向、算 2 笔损失、反传并更新权重",
        ]}
        takeaway="回放池决定从哪些旧样本抽样，数据增强决定怎样等价改写样本，train_step 才负责重新前向、计算损失并更新。"
        boundary="一条真实记录只贡献一批损失里的一小份梯度，不能说某份 checkpoint 或 best 更换全是它的功劳。"
      />

      <Quiz
        title="思考题 · 先选一个答案"
        questions={[
          {
            q: "为什么训练不只拿刚结束的最后一局棋，按顺序从头学到尾？",
            options: [
              "因为最后一局没有 z，不能训练",
              "相邻局面高度相关；随机混合新旧样本能减少被一小段经历带偏，也减轻遗忘",
              "因为回放池会自动把输棋改成赢棋",
            ],
            answer: 1,
            explain: "随机批次不会改变样本答案，但会把不同时间、不同棋局的样本混在一起，让一次更新不只代表刚刚那一小段经历。",
          },
        ]}
      />

      <div className="prose mt-10">
        <h3>回放池用环形缓冲区装下新旧样本</h3>
        <p>
          训练样本不是用完即弃。每局自我对弈产生的记录都写进回放池，由它决定更新权重时能抽到哪些旧样本；
          写到容量末尾会绕回开头覆盖最旧样本。覆盖最旧样本正是设计意图：
          最旧的样本出自最弱的网络：z 是真值、不会变旧，变旧的是 π 那份搜索答案（预算和先验都来自旧网），棋理价值最低。回放池是一扇跟着棋力向前滑的窗，不是仓库。
        </p>
        <Def term="环形缓冲区" en="ring buffer">
          固定容量、写满就绕回开头的存储。例 14-1 把真实容量缩到 5 个槽来演示这个绕回。
        </Def>
        <Def term="回放池" en="replay buffer">
          用环形缓冲区装旧对局样本的存储区。每条样本保存转成当前行棋方视角的标准棋盘、
          当时的 player、π 和 z。重启时还能从 <span className="mono">buffer.npz</span> 恢复；
          若新配置容量变小，只保留放得下的最新样本。
        </Def>

        <h3>均匀有放回抽批，累积到 min_buffer 才开始更新</h3>
        <p>
          抽样是均匀、有放回的。每个下标由随机数独立抽取：五万条里抽 128 条，从一条样本看一个批次，它本批一次都不出现是常态（约 99.7%），
          也有个别样本被抽中两次；每条样本的先后顺序被打散了，一次更新不再只代表刚刚那一小段经历。
          另一种打散顺序的做法是洗牌后无放回发牌；有放回抽样连洗牌都省了，不必每次给整个回放池洗牌。撞车率分两个口径：从单条样本看，
          它在一批里被抽中两次的概率极低；从整批看，128 条里出现至少一次撞车的概率约 15%。
          两种抽法「几乎一样」的根据不是「不撞车」，而是结论上几乎等效（更新的平均效果相同，随机波动只是略大）。
        </p>
        <Def term="小批" en="mini-batch">
          一次权重更新用到的一小组样本，本项目每批 128 条。
        </Def>
        <Def term="最小样本门槛" en="min_buffer">
          开始权重更新所需的最小样本数。回放池中样本数还小于它时，本轮只继续自我对弈积累样本，
          不更新网络：回放回放池太浅时「随机抽一批」抽到的样本重叠很多，
          一次更新仍被一小段经历带着摇摆。累积到门槛后才开始更新，随机混合才真正成立。演示配置：池容量 5 万条、门槛 256 条；默认配置是 10 万与 512。
        </Def>

        <h3>棋盘和 π 同步变换，z 不跟着转</h3>
        <p>
          同一棋形旋转或镜像后棋理完全等价。每条抽中的样本随机选 8 种旋转/镜像之一。
          同一份经历有 8 种等价读法，每次训练随机借其中一种；不增加样本条数。
        </p>
        <Def term="数据增强" en="data augmentation，简称增广">
          从 8 个等价视图中随机取 1 个来改写当前样本；一条样本仍是一条，批次仍是 128，
          只是换了坐标系呈现。空间变换必须让样本与策略答案同步：
          棋盘上的棋形转到新坐标，π 对应格的概率也必须搬到相同位置。
          z 只表示输赢，不是坐标，所以不转。例 14-2 用真实记录演示同一种变换下
          棋盘与 π 怎样一起搬家。
        </Def>

        <h3>train_step 重新作答，2 笔损失合成一次更新</h3>
        <p>
          回放池没有保存训练时的 v_net。网络用当前权重重新前向，然后算 2 笔损失：
          概率 p 离 π 有多远，v_net 离 z 有多远；p=softmax(logits)（训练侧写小写 p，
          与搜索侧的先验 P 区分开）。
          再依次清旧梯度、反向传播、由优化器更新。这 2 笔损失是交叉熵与均方误差（见下）。
        </p>
        <Def term="交叉熵" en="cross-entropy" see="第 13 课">
          策略损失，衡量概率 p 离目标 π 有多远。
        </Def>
        <Def term="均方误差" en="mean squared error, MSE" see="第 13 课">
          价值损失，衡量 v_net 离 z 有多远，取平方。
        </Def>
      </div>

      <BufferRing />
      <SymmetryTable />

      <Ledger title="replay.py · ReplayBuffer / train.py · train_step">
        <div className="codewalk">
          <pre>{`# ReplayBuffer.sample：有放回随机抽样，再重建 3 个输入平面
idx = rng.integers(0, self.size, size=batch_size)
b = self.boards[idx].astype(np.float32)
cur = b == 1.0
opp = b == -1.0
color = np.where(self.players[idx] == 1, 1.0, 0.0).astype(np.float32)
color = np.broadcast_to(color[:, None, None], cur.shape)
inputs = np.stack([cur, opp, color], axis=1).astype(np.float32)`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# train_step：样本与 π 同步变换，再重新前向计算损失
aug_in[i] = dihedral_transform(inputs[i], k)
aug_pi[i] = dihedral_transform_pi(pis[i], n, k)
#（net.train()、把增广后的批次转成张量、送入设备的几行从这里略去）
logits, v = net(x)
value_loss = F.mse_loss(v, target_z)
logp = F.log_softmax(logits, dim=-1)
policy_loss = -(target_pi * logp).sum(dim=-1).mean()
loss = value_loss + policy_loss
optimizer.zero_grad()
loss.backward()
optimizer.step()`}</pre>
        </div>
        <div className="codewalk">
          <pre>{`# make_optimizer：本项目当前真实更新规则
# lr=0.01、weight_decay=1e-4(config.py)；momentum=0.9 写死在 train.py
def make_optimizer(net: AlphaGomokuNet, cfg: Config) -> torch.optim.Optimizer:
    return torch.optim.SGD(
        net.parameters(),
        lr=cfg.lr,
        momentum=0.9,
        weight_decay=cfg.weight_decay,
        nesterov=True,
    )`}</pre>
        </div>
        <p className="mt-3">
          下面 3 个正则化/加速手段（动量、Nesterov、权重衰减）各管一件事，只改变「怎么调」，不改变「算什么损失」。
        </p>
        <Def term="动量" en="momentum">
          把最近几次的更新方向合成一股惯性，不让单批噪声把权重来回拽。每个权重各有一份这样的惯性记录。本项目 momentum=0.9。
        </Def>
        <Def term="Nesterov" en="Nesterov accelerated gradient">
          动量的一种改法：先按惯性探一步，再在那个位置算梯度。本项目开启 nesterov=True。
        </Def>
        <Def term="权重衰减" en="weight decay">
          每次更新把每个权重往零轻拽一点点，防止数值无节制长大。本项目 weight_decay=1e-4。
        </Def>
        <p className="mt-3">
          学习率在一次进程内固定，lr=0.01；目前没有「学着学着自动调整学习率」的装置（scheduler）。
          训练器若中途崩溃，恢复走 checkpoint 与 latest 这条路，口径如下。
        </p>
        <Def term="检查点" en="checkpoint">
          训练中保存的一份模型文件，内容是网络权重、配置和 meta。
          不保存优化器的状态（含各权重的动量记录）和随机数发生器的状态：不存是为了文件简单、加载路径统一（第 16 课展开）；代价是恢复后头几步没有惯性、方向比平时颠簸，几步后惯性重建。
        </Def>
        <Def term="最近保存点" en="latest">
          指最近一次保存的 checkpoint。按项目方式恢复训练时加载 latest 与
          <span className="mono">buffer.npz</span>：权重能接上；但带着更新惯性的动量记录、
          以及随机数序列，都无法原样续接（pipeline 会新建优化器并重设种子）。
        </Def>
      </Ledger>

      <ChapterEnd
        summary={[
          "回放池是环形缓冲区，覆盖最旧样本；池中样本累积到 min_buffer 才开始均匀、有放回地抽小批，一次更新因此混合了新旧经历。",
          "数据增强把棋盘和 π 同步随机做 8 种之一（旋转/镜像），z 不是坐标所以不转。",
          "train_step 重新前向，用交叉熵比较概率 p 与 π、用均方误差比较 v_net 与 z，再清梯度、反传、由优化器更新；动量、Nesterov、权重衰减只改「怎么调」。",
          "checkpoint 只存网络权重、配置和 meta；恢复时权重能接上，动量记录和随机数序列不能原样接上。",
        ]}
        next={
          <>
            下一课回答「损失下降了，能不能换 best」。竞技场让新旧网络在受控对战里相遇，
            按胜 1、和 0.5、负 0 记分，用得分率门槛决定晋升不晋升。顺带分清 challenger、best、
            baseline 和 latest 四个名字各指哪一份权重，以及有限场次的证据到底能证明什么。
          </>
        }
      />

      <Quiz
        title="习题"
        questions={[
          {
            q: "棋盘顺时针转 90° 时，π 和 z 应分别怎样处理？",
            options: [
              "π 的 81 个位置跟棋盘一起转，z 保持原值",
              "π 保持原坐标，只有 z 改正负号",
              "π 与 z 都乘以 90",
            ],
            answer: 0,
            explain: "π 的每一项对应一个棋盘坐标，所以样本旋转时答案坐标也要旋转。z 是输赢关系，没有空间坐标。",
          },
          {
            q: "回放池 sample 为什么叫「有放回」抽样？",
            options: [
              "抽中的样本会从池里永久删除",
              "每个下标独立随机产生，同一条样本在一批里可能再次被抽到",
              "每次只从最新一局棋抽",
            ],
            answer: 1,
            explain: "代码用 rng.integers 为 batch 中每个位置独立产生下标，并没有把已抽中的下标移除。",
          },
          {
            q: "按项目方式恢复训练后（加载 latest checkpoint 与 buffer.npz，前者是最近一次保存），哪些东西当前不会原样恢复？",
            options: [
              "网络权重和棋盘大小",
              "优化器的动量记录与随机数状态",
              "checkpoint 里记录的第几轮等信息",
            ],
            answer: 1,
            explain: "checkpoint 保存网络、配置和 meta；pipeline 会新建优化器并重新设随机种子，所以动量历史与随机过程不是逐位续接。",
          },
        ]}
      />
    </section>
  )
}

function BufferRing() {
  const [writes, setWrites] = useState(7)
  const capacity = 5
  const cells = Array.from({ length: capacity }, (_, i) => {
    const start = Math.max(0, writes - capacity)
    const values = Array.from({ length: Math.min(writes, capacity) }, (_, j) => start + j + 1)
    const value = values.find((v) => (v - 1) % capacity === i)
    return value ?? null
  })

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5"><span className="mini-label">例 14-1 · 容量 5 的环形回放池</span></div>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" data-qa="replay-ring">
          {cells.map((value, i) => (
            <div key={i} className="card px-4 py-3 text-center">
              <div className="mini-label">槽 {i}</div>
              <strong className="num">{value === null ? "空" : `样本 ${value}`}</strong>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => setWrites((n) => Math.max(0, n - 1))}>少写一条</button>
          <button type="button" className="btn primary" onClick={() => setWrites((n) => n + 1)}>再写一条</button>
          <span className="num text-sm" style={{ color: "var(--fg-muted)" }}>已写 {writes} 条，下一格 {(writes % capacity)}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          第 6 条会覆盖第 1 条，第 7 条覆盖第 2 条。真实容量由 config 决定，原理相同。
        </p>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 14-1</span>
        教学缩小的容量 5，用来看清「写满绕回、覆盖最旧」这一条；真实回放池的容量大得多。
      </figcaption>
    </figure>
  )
}

function SymmetryTable() {
  const [k, setK] = useState(0)
  const mv = MOVES[SYM_IDX]
  const boardK = dihedral(STATES[SYM_IDX].board, k).flat()
  const piK = dihedralPi(mv.pi, k)
  const original = argmaxPi(mv.pi)
  const moved = argmaxPi(piK)

  return (
    <figure className="figure mt-8">
      <div className="px-4 pt-3 sm:px-5"><span className="mini-label">例 14-2 · 棋盘与 π 同步做 8 种变换（演示可逐个查看 8 个视图，训练时每次只取其一）</span></div>
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
        <div className="w-full sm:w-64 sm:flex-none" data-qa="sym-board"><Board board={boardK} heat={piK} /></div>
        <div className="min-w-0 flex-1">
          <div className="mini-label">k=0..3 旋转；k=4..7 旋转后镜像</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} type="button" className={`btn ${k === i ? "active" : ""}`}
                onClick={() => setK(i)} data-qa="sym-k">{i}</button>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            π 最热坐标从 <span className="mono">{coord(original)}</span> 搬到
            <span className="mono" style={{ color: "var(--accent-deep)" }}> {coord(moved)}</span>。
            棋盘与 π 热力若不用同一个 k，样本与答案就会错位。
          </p>
          <div className="reveal-box mt-3 text-sm" data-qa="sym-argmax">
            z 仍是同一个输赢数；空间旋转不会把赢家变成输家。
          </div>
        </div>
      </div>
      <figcaption className="figure-cap">
        <span className="cap-no">例 14-2</span>
        棋盘由真实自我对弈记录重建，π 直接取自记录；换 k 时两者必须用同一个变换。
      </figcaption>
    </figure>
  )
}
