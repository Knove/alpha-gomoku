/** 第 14 课 · 训练：许多样本怎样形成一次更新。
 *  两个工程机制：环形回放池（min_buffer、随机抽批）与八重对称增广。
 *  最后用 train_step 把一批样本接回双损失与一次更新。 */
import { useState } from "react"
import { Quiz } from "../framework/quiz"
import { Ledger } from "../framework/ledger"
import { LessonGuide } from "../framework/lesson-guide"
import { ChapterEnd, Def } from "../framework/def"
import { EvidenceCard } from "../framework/evidence"
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

export default function L14() {

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
          "重新前向、算 2 笔损失、反向传播并更新权重",
        ]}
        takeaway="你能写出回放池抽批与棋盘、π 的同步增广，并复现一次 train_step 的重新前向、两笔损失与更新。"
        boundary="一条真实记录只贡献一批损失里的一小份梯度，不能说某份检查点或 best 更换全是它的功劳。"
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
          训练样本不是用完即弃。每局自我对弈产生的记录都写进回放池，由它决定更新权重时能抽到哪些旧样本。
          覆盖最旧样本正是设计意图。最旧样本通常来自训练早期、棋力较弱的网络；z 是真值、不会过时，变旧的是 π 那份搜索答案
          （预算和先验都来自旧网），参考价值相对最低。回放池按样本条数计容量，只保留最近若干样本；
          写到末尾会绕回开头，覆盖最旧的一条。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="把四项数据写入当前槽位，游标对容量取模绕回"
          source="alphagomoku/replay.py · ReplayBuffer.add_many"
        >
          <div className="codewalk">
            <pre>{`            self.boards[self.pos] = canon
            self.pis[self.pos] = pi
            self.players[self.pos] = player
            self.zs[self.pos] = z
            self.pos = (self.pos + 1) % self.capacity`}</pre>
          </div>
        </EvidenceCard>
        <Def term="回放池" en="replay buffer">
          用固定容量、写满就绕回开头的<strong>环形缓冲区</strong>（ring buffer）装旧对局样本的存储区（例 14-1 把真实容量缩到 5 个槽来演示这个绕回）。每条样本保存转成当前行棋方视角的标准棋盘、
          当时的 player、π 和 z。重启时还能从 <span className="mono">buffer.npz</span> 恢复；
          若新配置容量变小，只保留放得下的最新样本。
        </Def>
      </div>

      <BufferRing />

      <div className="prose mt-10">
        <h3>均匀有放回抽批，累积到 min_buffer 才开始更新</h3>
        <p>
          抽样是均匀、有放回的。每条样本的先后顺序被打散了，一次更新不再只代表刚刚那一小段经历。
          另一种打散顺序的做法是洗牌后无放回发牌；有放回抽样连洗牌都省了，不必每次给整个回放池洗牌。
          池子容量 5 万、每批 128 条，单批内出现的重复样本很少，批次仍近似池内分布；有放回与无放回的训练效果因此很接近。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="有放回均匀抽样并重建三个输入平面"
          source="alphagomoku/replay.py · ReplayBuffer.sample"
        >
          <div className="codewalk">
            <pre>{`    def sample(self, batch_size: int, rng: np.random.Generator):
        """Uniform with replacement -> (inputs (B,3,n,n), pis (B,n*n), zs (B,))."""
        assert self.size > 0, "cannot sample from an empty buffer"
        idx = rng.integers(0, self.size, size=batch_size)
        b = self.boards[idx].astype(np.float32)
        cur = b == 1.0
        opp = b == -1.0
        color = np.where(self.players[idx] == 1, 1.0, 0.0).astype(np.float32)
        color = np.broadcast_to(color[:, None, None], cur.shape)
        inputs = np.stack([cur, opp, color], axis=1).astype(np.float32)
        return inputs, self.pis[idx].copy(), self.zs[idx].copy()`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          随机抽出的下标 <span className="mono">idx</span> 同时取出棋盘、行棋方、策略目标 π 与终局结果 z，
          当场把规范视角棋盘拆回己方、对方、行棋方颜色三个输入平面，输出形状为{" "}
          <span className="mono">(B, 3, n, n)</span>。
        </p>
        <Def term="小批与最小样本门槛" en="mini-batch & min_buffer">
          <strong>小批</strong>（mini-batch）是一次权重更新用到的一小组样本，本项目每批 128 条。
          <strong>最小样本门槛</strong>（<span className="mono">min_buffer</span>）是开始权重更新所需的最小样本数：回放池中样本数还小于它时，本轮只继续自我对弈积累样本，
          不更新网络。回放池太浅时「随机抽一批」抽到的样本重叠很多，
          一次更新仍被一小段经历带着摇摆；累积到门槛后才开始更新，随机混合才真正成立。演示配置：池容量 5 万条、门槛 256 条；默认配置是 10 万与 512。
        </Def>
        <EvidenceCard
          fidelity="runtime-exact"
          title="回放池容量与最小样本门槛的默认配置"
          source="alphagomoku/config.py · Config"
        >
          <div className="codewalk">
            <pre>{`    buffer_size: int = 100_000
    min_buffer: int = 512`}</pre>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          演示配置的 5 万与 256 写在 <span className="mono">configs/fast.json</span> 的同名字段上，站里真实记录就出自那份配置。
        </p>

        <h3>棋盘和 π 同步变换，z 不跟着转</h3>
        <p>
          同一棋形旋转或镜像后棋理完全等价。同一份经历有 8 种等价读法，每次训练随机借其中一种；
          不增加样本条数。每条抽中的样本随机选 8 种旋转/镜像之一。
        </p>
        <Def term="数据增强" en="data augmentation，简称增广">
          从 8 个等价视图中随机取 1 个来改写当前样本；一条样本仍是一条，批次仍是 128，
          只是换了坐标系呈现。空间变换必须让样本与策略答案同步：
          棋盘上的棋形转到新坐标，π 对应格的概率也必须搬到相同位置。
          z 只表示输赢，不是坐标，所以不转。例 14-2 用真实记录演示同一种变换下
          棋盘与 π 怎样一起搬家。
        </Def>
        <EvidenceCard
          fidelity="runtime-exact"
          title="对棋盘与策略目标 π 同步做八重对称变换"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    ks = rng.integers(0, 8, size=B)
    aug_in = np.empty_like(inputs)
    aug_pi = np.empty_like(pis)
    for i in range(B):
        k = int(ks[i])
        aug_in[i] = dihedral_transform(inputs[i], k)
        aug_pi[i] = dihedral_transform_pi(pis[i], n, k)

    x = torch.from_numpy(aug_in).to(device)
    target_pi = torch.from_numpy(aug_pi).to(device)
    target_z = torch.from_numpy(zs.astype(np.float32)).to(device)`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <SymmetryTable />

      <div className="prose mt-10">
        <h3>train_step 重新作答，2 笔损失合成一次更新</h3>
        <p>
          回放池没有保存训练时的 v_net。网络用当前权重重新前向，然后算第 13 课定义过的 2 笔损失：
          用<strong>交叉熵</strong>衡量落子概率 p 离目标 π 有多远，用<strong>均方误差</strong>衡量 v_net 离终局 z 有多远，
          其中 p=softmax(logits)（训练侧写小写 p，与搜索侧的先验 P 区分开）。
          再依次清旧梯度、反向传播、由优化器更新。
        </p>
        <EvidenceCard
          fidelity="runtime-exact"
          title="重新前向计算双头损失，清梯度、反向传播并更新权重"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`    net.train()
    logits, v = net(x)
    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()`}</pre>
          </div>
        </EvidenceCard>
      </div>

      <Ledger title="alphagomoku/train.py · train_step">
        <EvidenceCard
          fidelity="runtime-exact"
          title="完整单步训练函数：八重对称增广、前向计算、双损失合成、反向传播与指标返回"
          source="alphagomoku/train.py · train_step"
        >
          <div className="codewalk">
            <pre>{`def train_step(
    net: AlphaGomokuNet,
    optimizer: torch.optim.Optimizer,
    batch,
    device: str,
    rng: np.random.Generator,
) -> dict:
    """One SGD update on a batch from ReplayBuffer.sample(). Returns metrics."""
    inputs, pis, zs = batch
    B = inputs.shape[0]
    n = inputs.shape[-1]
    ks = rng.integers(0, 8, size=B)
    aug_in = np.empty_like(inputs)
    aug_pi = np.empty_like(pis)
    for i in range(B):
        k = int(ks[i])
        aug_in[i] = dihedral_transform(inputs[i], k)
        aug_pi[i] = dihedral_transform_pi(pis[i], n, k)

    x = torch.from_numpy(aug_in).to(device)
    target_pi = torch.from_numpy(aug_pi).to(device)
    target_z = torch.from_numpy(zs.astype(np.float32)).to(device)

    net.train()
    logits, v = net(x)
    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    with torch.no_grad():
        entropy = -(logp.exp() * logp).sum(dim=-1).mean()
    return {
        "loss": float(loss.item()),
        "policy_loss": float(policy_loss.item()),
        "value_loss": float(value_loss.item()),
        "policy_entropy": float(entropy.item()),
        "lr": float(optimizer.param_groups[0]["lr"]),
    }`}</pre>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--fg-faint)" }}>
              输入 (128,3,9,9) 经前向得到 logits (128,81) 与 v (128,)，分别与 target_pi (128,81)、target_z (128,) 计算交叉熵和均方误差，更新后返回损失、策略熵与学习率。
            </p>
          </div>
        </EvidenceCard>
        <p className="mt-3">
          运行 <span className="mono">python -m pytest tests/test_train.py -q</span> 与 <span className="mono">python -m pytest tests/test_game.py -q</span>，
          可验证八重对称变换下棋盘与 <span className="mono">π</span> 的同步性，以及单步训练的输入输出形状。
        </p>
      </Ledger>

      <ChapterEnd
        summary={[
          "回放池是环形缓冲区，覆盖最旧样本；池中样本累积到 min_buffer 才开始均匀、有放回地抽小批，一次更新因此混合了新旧经历。",
          "数据增强把棋盘和 π 同步随机做 8 种之一（旋转/镜像），z 不是坐标所以不转。",
          "train_step 重新前向，用交叉熵比较 p 与 π、用均方误差比较 v_net 与 z，再清梯度、反向传播、更新权重。",
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
            q: "把回放池改成「无放回、按入库顺序读完一个 epoch」，训练动态会差在哪？",
            options: [
              "抽中的样本会从池里永久删除，池会越训越小",
              "有放回的均匀小批与池内分布同权，同一条样本一批里可能抽到两次；按序无放回会让样本带上次序，最近入库的局面被系统性排后",
              "每次只从最新一局棋抽，效果更好",
            ],
            answer: 1,
            explain: "代码用 rng.integers 为 batch 中每个位置独立产生下标，并没有把已抽中的下标移除，所以每步看到的样本分布与池内分布一致。改成按序无放回，步与步之间就带上了入库次序，近况会攒在末尾才被学到。",
          },
        ]}
      />
    </section>
  )
}

function BufferRing() {
  const [writes, setWrites] = useState(7)
  const capacity = 5
  const lastSlot = writes > 0 ? (writes - 1) % capacity : -1
  const nextSlot = writes % capacity
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
          {cells.map((value, i) => {
            const isLatest = i === lastSlot
            const isNext = i === nextSlot
            return (
              <div
                key={i}
                className="card px-4 py-3 text-center"
                style={{
                  borderColor: isLatest ? "var(--accent)" : isNext ? "var(--hairline-strong)" : undefined,
                  background: isLatest ? "var(--accent-wash)" : undefined,
                  transition: "border-color 280ms ease, background 280ms ease",
                }}
              >
                <div className="mini-label">
                  槽 {i}{isLatest ? " · 刚写" : isNext ? " · 下一格" : ""}
                </div>
                <strong className="num" style={{ color: isLatest ? "var(--accent-deep)" : undefined }}>
                  {value === null ? "空" : `样本 ${value}`}
                </strong>
              </div>
            )
          })}
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
        绕回与覆盖的实现见 alphagomoku/replay.py · ReplayBuffer.add_many 的游标行。
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
        <div className="w-full sm:w-64 sm:flex-none" data-qa="sym-board">
          <Board
            board={boardK}
            heat={piK}
            marks={[{ x: moved % 9, y: Math.floor(moved / 9), anchor: true }]}
          />
        </div>
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
        变换实现见 learn/src/engine/game.ts 的 dihedral 与 dihedralPi（镜像 alphagomoku/game.py
        的 dihedral_transform 与 dihedral_transform_pi）。换 k 前先预测 π 会搬到哪几格，再切过去对拍。
      </figcaption>
    </figure>
  )
}
