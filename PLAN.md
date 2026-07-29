# Alpha-Gomoku 实现计划

在五子棋上完整复刻 AlphaZero 的训练模式：自我对弈 → MCTS 生成训练目标 → 策略/价值网络训练 → 竞技场择优 → 循环进化。配一个现代前端，实时观看整个进化过程。

## 1. 总体架构

```
┌────────────────────────────────────────────────────────────┐
│ 浏览器  React 19 + Vite 6 + Tailwind 4(web/)               │
│  总览曲线 / 自我对弈直播 / 对局档案 / 人机对战              │
└──────────────▲─────────────────────────────▲───────────────┘
        REST + │ WebSocket                   │ REST(对弈)
┌──────────────┴─────────────────────────────┴───────────────┐
│ FastAPI 服务器(server/,端口 8000)                          │
│  读 data/runs/<run>/ 下的 status/events/games/metrics      │
│  管理 trainer 子进程(start/pause/stop)                     │
│  加载 checkpoint 跑 MCTS,支撑人机对战                      │
└──────────────▲─────────────────────────────────────────────┘
               │ 文件系统契约(run 目录,见 §6)
┌──────────────┴─────────────────────────────────────────────┐
│ 训练守护进程(python -m alphagomoku.trainer)                │
│  自我对弈(批量并行 MCTS)→ 经验池 → 训练 → 竞技场 → 落盘   │
└────────────────────────────────────────────────────────────┘
```

训练进程与服务器进程通过 **run 目录文件契约** 解耦：训练进程只写，服务器只读，前端经服务器观看一切。人机对战由服务器独立加载最新 checkpoint 完成，不干扰训练。

## 2. 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 训练 | Python 3.12 + PyTorch | AlphaZero 标准栈；device 自动选 MPS(Apple Silicon)否则 CPU |
| 服务器 | FastAPI + uvicorn | REST + WebSocket 一体 |
| 前端 | React 19 + Vite 6 + Tailwind CSS 4 + TypeScript | 与 alphago-vs-llm 文章同源技术栈 |
| 图表 | 全部手绘 SVG | 延续文章设计语言：朱砂单 accent、等宽数字、暖纸/墨黑双主题、无图表库、无 emoji |
| 进程通信 | run 目录文件(status.json 原子写 / events.jsonl 追加 / control.json 控制) | 简单、可观测、可回放 |

## 3. 目录结构

```
alpha-gomoku/
├── PLAN.md                  # 本文件(契约的唯一权威来源)
├── README.md                # 中文使用文档
├── requirements.txt
├── configs/                 # 训练配置(JSON)
│   ├── default.json         # 9x9 正式配置
│   ├── fast.json            # 9x9 快速演示配置
│   ├── gomoku15.json        # 15x15 标准五子棋
│   └── smoke.json           # 6x6 测试用最小配置
├── alphagomoku/             # 核心 Python 包
│   ├── config.py            # 配置 dataclass + JSON 加载
│   ├── game.py              # 五子棋规则
│   ├── mcts.py              # PUCT 树搜索(支持跨对局批量求值)
│   ├── model.py             # ResNet 策略价值网络 + 预测封装
│   ├── selfplay.py          # 批量并行自我对弈
│   ├── replay.py            # 经验回放池
│   ├── train.py             # 单轮训练(损失/增广/指标)
│   ├── arena.py             # 竞技场(新模型 vs best / baseline)
│   ├── storage.py           # run 目录读写契约
│   ├── pipeline.py          # 迭代主循环
│   └── trainer.py           # CLI 入口
├── server/
│   ├── app.py               # FastAPI:REST + WS + 静态托管 web/dist
│   ├── play.py              # 人机对战会话(MCTS + checkpoint 缓存)
│   └── tail.py              # events.jsonl 监视 → WS 广播
├── tests/                   # pytest
├── web/                     # 前端
├── scripts/dev.sh           # 一键启动(训练 + 服务器 + 前端)
└── data/runs/<run_id>/      # 运行时产物(gitignore)
```

## 4. 核心算法契约(alphagomoku 包)

### 4.1 配置 config.py

```python
@dataclass
class Config:
    board_size: int = 9
    win_len: int = 5
    # 网络
    net_channels: int = 64
    net_res_blocks: int = 4
    # MCTS
    mcts_simulations: int = 100
    c_puct: float = 1.5
    dirichlet_alpha: float = 0.3
    dirichlet_epsilon: float = 0.25
    temp_threshold: int = 12      # 前 N 手 tau=1 采样,之后 argmax
    # 自我对弈
    games_per_iteration: int = 24
    parallel_games: int = 8
    # 训练
    batch_size: int = 128
    train_steps: int = 30
    lr: float = 0.01
    weight_decay: float = 1e-4
    buffer_size: int = 100_000
    min_buffer: int = 512
    # 竞技场
    arena_enabled: bool = True
    arena_every: int = 2          # 每几轮迭代评一次
    arena_games: int = 10
    arena_simulations: int = 50
    promote_threshold: float = 0.55
    # 运行
    device: str = "auto"          # auto|mps|cpu|cuda
    seed: int = 42
    keep_checkpoint_every: int = 10
```

`Config.from_json(path)` / `to_json()`;缺省字段回落默认值。

### 4.2 游戏规则 game.py

棋盘 `np.int8 (N,N)`,`0` 空、`1` 黑、`-1` 白。黑先行。动作是整数 `0..N*N-1`(`a = y*N + x`)。

```python
class Game:
    def __init__(self, board_size: int, win_len: int)
    @property
    def current_player(self) -> int          # 1 或 -1
    @property
    def last_move(self) -> int | None
    @property
    def move_count(self) -> int
    def legal_moves(self) -> np.ndarray      # (N*N,) float32,合法=1.0
    def play(self, action: int) -> None      # 非法动作抛 ValueError
    def outcome(self) -> int | None          # None=未完;1=黑胜;-1=白胜;0=和(满盘)
    def canonical_board(self) -> np.ndarray  # (N,N) float32,当前行棋方视角(己方=1)
    def clone(self) -> "Game"

def encode(game) -> np.ndarray               # (3,N,N) float32:己方/对方/行棋方颜色面
def dihedral_transform(board: np.ndarray, k: int) -> np.ndarray      # 8 对称,(...,N,N)
def dihedral_transform_pi(pi: np.ndarray, n: int, k: int) -> np.ndarray  # (N*N,) 同步变换
```

胜负判定只检查最后一手四个方向的连子数。`canonical_board` = `board * current_player`。和棋:满盘无胜者。

### 4.3 MCTS mcts.py

PUCT:`score(a) = Q(a) + c_puct * P(a) * sqrt(ΣN) / (1 + N(a))`,只遍历合法动作。叶节点取网络价值(叶节点行棋方视角),沿路径负值回传(negamax)。根节点先验混入 Dirichlet 噪声(自我对弈时)。终局叶直接用真实结果,不走网络。

```python
class SearchTree:
    def __init__(self, game: Game, cfg: Config, add_noise: bool, rng: np.random.Generator)
    def needs_eval(self) -> bool             # 上次 select 停在未扩展叶
    def select(self) -> None                 # 从根走到叶;终局叶即时回传
    def leaf_canonical_input(self) -> np.ndarray  # (3,N,N),供批量求值
    def expand_and_backup(self, policy: np.ndarray, value: float) -> None
    def root_pi(self, temperature: float = 1.0) -> np.ndarray  # (N*N,) 访问数分布(训练目标)
    def root_value(self) -> float            # 根节点平均价值(展示用胜率)
    def best_action(self) -> int             # 访问数最大
    def update_root(self, action: int) -> None  # 落子后复用子树
```

跨对局批量:selfplay 驱动器持有 `parallel_games` 棵树,轮询每棵树做 **一次** select,收集所有待求值叶,**一次批量前向**,再各自 expand_and_backup;重复 `mcts_simulations` 轮。单棵树内部严格串行,无需 virtual loss。

### 4.4 网络 model.py

输入 `(B,3,N,N)` → 躯干 `conv3x3(C)→BN→ReLU` + `R` 个残差块(每块两个 conv3x3+BN,跳跃连接)→ 双头:

- 策略头:`conv1x1(2)→BN→ReLU→flatten→FC(N*N)` logits
- 价值头:`conv1x1(1)→BN→ReLU→FC(64)→ReLU→FC(1)→tanh`

```python
class AlphaGomokuNet(nn.Module):
    def __init__(self, board_size: int, channels: int, res_blocks: int)
    def forward(self, x) -> tuple[Tensor, Tensor]   # (policy_logits (B,N*N), value (B,))

class Predictor:                            # 设备与 no_grad 封装
    def __init__(self, net, device: str)
    def predict(self, inputs: np.ndarray) -> tuple[np.ndarray, np.ndarray]  # softmax 概率 (B,N*N), value (B,)

def save_checkpoint(net, cfg, path, meta: dict) -> None   # torch.save({state_dict, config, meta})
def load_checkpoint(path, device) -> tuple[AlphaGomokuNet, dict]
```

默认 9x9 / C=64 / R=4 ≈ 1.1M 参数,CPU/MPS 都能跑。

### 4.5 自我对弈 selfplay.py

```python
def play_games(predictor, cfg, num_games, iteration, storage, rng,
               on_progress=None, should_stop=None) -> list[GameRecord]
```

- `parallel_games` 局并发推进(§4.3 的批量求值)。
- 前 `temp_threshold` 手按 `root_pi(1.0)` 采样,之后取 argmax。
- 每落一手发 `on_progress(slot, game, pi_top5, value)`(节流:每手都发,量可控)。
- 单局结束产出 `GameRecord`:`moves=[{action,x,y,player,pi(归一化),value}]`、`result`(黑=1/白=-1/和=0)、`samples=[(canonical_board(3,N,N), pi(N*N), z)]`,`z` 从该手行棋方视角(胜=+1 负=-1 和=0)。
- `should_stop()` 为真时优雅中断(已完成的局仍落盘)。

### 4.6 经验池 replay.py

定长 deque(maxlen=buffer_size)。样本以 `int8` 存 canonical 双平面 + `float32` pi + `int8` z。`sample(batch, rng)` 均匀采样,返回解码后的 `(inputs(3,N,N), pi, z)`。支持 `save(path)/load(path)`(npz),训练重启可恢复。

### 4.7 训练 train.py

```python
def train_step(net, optimizer, batch, device, rng) -> dict  # 一次更新,返回指标
```

- 每个样本随机取 8 对称之一做数据增广(`dihedral_transform` 同步作用于输入与 pi)。
- 损失 = 价值 MSE + 策略交叉熵(-Σ π·log softmax(logits)),权重衰减经 optimizer 的 weight_decay。
- 优化器 SGD(momentum=0.9, lr, weight_decay,nesterov)。
- 返回 `{loss, policy_loss, value_loss, policy_entropy, lr}`。

### 4.8 竞技场 arena.py

```python
def play_match(pred_a, pred_b, cfg, iteration, rng, *, storage=None, opponent="best", on_progress=None) -> dict
```

A(挑战者,新模型)与 B(现任 best 或 baseline)交替先后手,无 Dirichlet 噪声;**开局前 temp_threshold//2 手按访问分布采样**(否则确定性搜索下同先手的对局逐手完全相同,评审已实证),之后 argmax。返回 `{wins_a, wins_b, draws, win_rate_a, games}`(和棋计半分)。`win_rate_a >= promote_threshold` 则挑战者晋升 best。第 0 轮冻结一份随机初始权重为 `baseline.pt`,之后每逢评估额外打一组 vs baseline,产出绝对进步曲线。**对局 id 前缀编码对手**:vs best 用 `ar_`,vs baseline 用 `ab_`,两类记录同目录共存不覆盖。

### 4.9 主循环 pipeline.py / trainer.py

每轮迭代:
1. 读 `control.json` → 响应 pause(挂起轮询)/stop(落盘退出)。
2. 自我对弈 `games_per_iteration` 局(逐局落盘 + 进度事件,每 2s 心跳)。
3. 样本入池;池 ≥ min_buffer 才训练,否则只攒数据。
4. `train_steps` 步训练(训练中也每 2s 心跳),记录平均指标。
5. 逢 `arena_every` 跑竞技场 vs best,达标晋升 `best.pt`;同时打一组 vs baseline(进度事件与心跳同自我对弈)。
6. 写 `metrics.jsonl` 一行;**然后**才存 `checkpoints/latest.pt`(保证 checkpoint 的 meta.iteration 不超过 metrics 尾行,kill -9 后续训不跳轮);事件追加 `events.jsonl`。
7. `iteration += 1`,无限循环直到 stop。

暂停在迭代边界生效;所有 checkpoint 经 tmp+rename 原子落盘。

CLI:`python -m alphagomoku.trainer --run data/runs/dev --config configs/default.json [--resume]`。启动时若存在 `latest.pt` 与 `buffer.npz` 则恢复续训。

## 5. 服务器契约(server/)

端口 8000。CORS 放行 `http://localhost:5173`。托管 `web/dist`(若已构建,SPA 回落 index.html)。

### REST

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/status` | status.json + `trainer_alive`(心跳年龄)+ 当前配置 |
| POST | `/api/control` | `{action: start\|pause\|resume\|stop}`;start 拉起 trainer 子进程,其余写 control.json |
| GET | `/api/metrics?tail=200` | metrics.jsonl 解析为数组 |
| GET | `/api/games?limit=50&cursor=<id>&kind=selfplay\|arena` | 对局摘要列表(倒序) |
| GET | `/api/games/{id}` | 完整对局 JSON(含逐手 pi/value) |
| GET | `/api/checkpoints` | checkpoint 列表 + meta(迭代、晋升记录) |
| GET | `/api/config` / PUT `/api/config` | 读写当前训练配置(下次 start 生效) |
| POST | `/api/play/new` | `{human_color: 1\|-1\|0(0=AI 自弈), checkpoint: best\|latest, simulations: int}` → 会话 |
| POST | `/api/play/{sid}/move` | `{x,y}` 人类落子 → 返回棋盘、AI 应手及其 top-k 策略与价值 |
| POST | `/api/play/{sid}/step` | AI 自弈模式推进一步 |
| GET | `/api/play/{sid}` | 会话快照 |

对局 ID 规则:selfplay `sp_<iter:06d>_<idx:03d>`,arena `ar_<iter:06d>_<idx:03d>`(与文件名一致,无需索引库)。

### WebSocket `/ws`

连接即回放最近 50 条事件,随后实时推送 events.jsonl 新增行;每 2 秒补发 `status` 心跳。断线自动重连由前端负责。

## 6. run 目录文件契约(storage.py 实现)

```
data/runs/<run_id>/
├── config.json          # 生效配置快照
├── control.json         # {"command": "run"|"pause"|"stop"} 服务器写、训练读
├── status.json          # 原子重写:{state, iteration, games_done, samples,
│                        #  best_iteration, heartbeat, iteration_phase, progress}
├── events.jsonl         # 追加,见下
├── metrics.jsonl        # 每轮一行:{iteration, loss, policy_loss, value_loss,
│                        #  policy_entropy, games, samples, buffer, lr, sec_selfplay,
│                        #  sec_train, arena_vs_best:{...}|null, arena_vs_baseline:{...}|null,
│                        #  best_iteration}
├── buffer.npz           # 经验池快照(每轮存)
├── games/<iter:06d>/sp_<iter>_<idx>.json
├── arena/<iter:06d>/ar_<iter>_<idx>.json   # vs best;ab_<iter>_<idx>.json 为 vs baseline
├── trainer.lock         # flock 互斥锁,防止双 trainer 写同一 run 目录
└── checkpoints/
    ├── baseline.pt      # 第 0 轮冻结的随机权重
    ├── latest.pt
    ├── best.pt
    └── iter_<iter:06d>.pt   # 逢 keep_checkpoint_every 快照
```

**events.jsonl 事件类型**(每行 `{ts, type, data}`):

| type | data | 频率 |
| --- | --- | --- |
| `status` | status.json 全量 | 状态变化时 |
| `iteration_start` | `{iteration}` | 每轮 |
| `game_progress` | `{slot, iteration, game_id, board(一维 N*N), last_move, move_count, player_to_move, pi_top5:[{action,prob}], value}` | 每手(所有并发局) |
| `game_end` | `{game_id, iteration, result, moves, first_player}` | 每局 |
| `train_end` | `{iteration, loss, policy_loss, value_loss, buffer}` | 每轮 |
| `arena_end` | `{iteration, opponent: best\|baseline, win_rate, wins, losses, draws, promoted}` | 评估时 |
| `log` | `{level, message}` | 稀疏 |

**对局 JSON**(games 与 arena 同构):

```json
{
  "id": "sp_000012_003", "kind": "selfplay", "iteration": 12,
  "board_size": 9, "win_len": 5, "created_at": 1753344000.0,
  "result": 1, "first_player": 1,
  "meta": {"opponent": null, "black": "iter12", "white": "iter12"},
  "moves": [
    {"n": 0, "x": 4, "y": 4, "player": 1, "value": 0.031,
     "pi": [0.01, ...], "top": [{"action": 40, "prob": 0.61, "visits": 61}]}
  ]
}
```

`pi` 为长度 N*N 的归一化访问分布(训练目标),`value` 为该手行棋前根节点估值(该方视角),`top` 为访问数前 5。

## 7. 前端契约(web/)

技术栈与 alphago-vs-llm 文章一致:React 19 + Vite 6 + Tailwind CSS 4,设计令牌直接沿用(暖纸 #f5f1e8 / 墨黑 #171512 / 朱砂 accent、等宽数字、明暗双主题、手绘 SVG、无 emoji、无图表库)。中文文案。hash 路由(无路由库)。

### 四个视图

1. **总览 `#/`**:状态卡(运行状态/迭代/对局/样本/best 轮次/心跳)、策略与价值损失双线曲线、vs baseline 胜率进化曲线、经验池水位、训练控制(启动/暂停/继续/停止)、配置摘要、实时事件流。
2. **自我对弈直播 `#/live`**:当前轮所有并发局的实时小棋盘墙(game_progress 驱动),点击放大单局:逐手滑杆、策略热力叠加(朱砂透明度)、价值走势、top5 候选。
3. **对局档案 `#/games`**:自我对弈 / 竞技场对局列表(分页、按轮次与胜负过滤),完整回放(同放大单局的交互)。
4. **人机对战 `#/play`**:选先后手、难度(搜索次数 50/200/800)、对手(best/latest);棋盘交互(悬停影子、点击落子、最后手标记);AI 思考态;每手展示 AI 的 top3 候选与胜率天平;支持 AI 自弈观战(定时器驱动 step)。

### 关键组件

`GomokuBoard`(SVG:木纹底色、星位、渐变棋子、最后手标记、热力层、点击回调)、`LineChart`(多序列手绘 SVG,悬停十字与 tooltip)、`PolicyHeat`、`TopMoves`、`ValueGauge`(胜率天平)、`StatCard`、`EventTicker`、`ThemeToggle`。数字一律 mono + tabular-nums。

## 8. 测试策略(tests/)

- `test_game.py`:四个方向胜负判定、五连才算胜(四连不判)、满盘和棋、非法落子、canonical 视角、8 对称变换(pi 与棋盘一致)。
- `test_mcts.py`:访问数守恒(ΣN=模拟次数)、噪声只加在根、一步必杀局面下搜索选中杀着(用常数价值假网络)、终局回传符号、pi 归一化且非法位为 0。
- `test_model.py`:输出形状与值域、checkpoint 存取往返一致。
- `test_selfplay.py`:6x6 最小配置完整打一局,样本 z 与结果一致、pi 归一化。
- `test_train.py`:过拟合单批数据损失显著下降。
- `test_smoke.py`:smoke.json 跑 1 轮完整迭代,校验 run 目录产物齐全且格式正确。
- `test_server.py`:TestClient 覆盖 status/games/play 主路径(用假 run 目录)。

## 9. 性能预算(9x9,Apple Silicon CPU)

单局约 45 手 × 100 模拟 = 4500 次求值;8 局并行批量后约 100 次批量前向/手。预计单局 20-40 秒,单轮(24 局 + 30 步训练 + 隔轮竞技场)3-6 分钟。fast.json 将模拟数降到 40、每轮 12 局,单轮约 1 分钟,适合演示。15x15 配置供有余力时切换。

## 10. 里程碑与验收

1. M1 契约与脚手架(PLAN.md、配置、包骨架)
2. M2 核心引擎 + 单测(game/mcts/model)
3. M3 训练管线 + smoke 端到端
4. M4 服务器 + 人机对战
5. M5 前端四视图
6. M6 集成验证(全量测试、真实训练数轮留档演示数据、前端构建、服务器托管)
7. M7 对抗性评审与修复
8. M8 README 与一键脚本,交付验收

**验收清单**:全部 pytest 通过;`web` 构建成功;一条命令起全栈;前端可实时看到训练曲线、自我对弈棋盘墙、对局回放,并能与最新模型对弈;data/runs 留有真实训练演示数据。
