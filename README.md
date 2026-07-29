# Alpha-Gomoku

在五子棋上复刻 AlphaZero 的训练模式:自我对弈 → MCTS 生成训练目标 → 策略/价值网络 → 竞技场择优 → 循环进化。配一个实时 Web 界面,完整观看训练过程,并能随时与最新模型对弈。

## 系统组成

| 模块 | 说明 |
| --- | --- |
| `alphagomoku/` | 核心:游戏规则、PUCT MCTS(跨对局批量求值)、ResNet 策略价值网络、自我对弈、训练、竞技场 |
| `server/` | FastAPI:REST + WebSocket,管理训练进程,支撑人机对战,托管前端 |
| `web/` | React 19 + Vite + Tailwind 4:总览曲线 / 自我对弈直播 / 对局档案 / 人机对战 |
| `configs/` | 训练配置:`fast`(9x9 演示)、`default`(9x9)、`gomoku15`(15x15 标准) |
| `data/runs/` | 运行时产物:对局、事件流、指标、checkpoint(训练进程写,服务器读) |

## 快速开始

```bash
# 1. Python 环境(需要 3.10+;推荐 uv)
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
# 网络受限时:UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ uv pip install ...

# 2. 前端依赖
cd web && npm install --registry=https://registry.npmmirror.com && cd ..

# 3. 一键开发模式(训练 + 服务器 :8000 + 前端热更新 :5173)
CONFIG=configs/fast.json bash scripts/dev.sh

# 打开 http://localhost:5173 ,在「总览」页点启动
```

生产模式(单端口):

```bash
bash scripts/start.sh        # 构建前端并启动服务器
# 打开 http://localhost:8000
```

## 训练是如何运转的

每轮迭代(iteration):

1. **自我对弈**:最新网络指导 MCTS(PUCT + 根节点 Dirichlet 噪声)同时下多盘棋,每手输出访问数分布 π 与局面估值;
2. **训练**:样本 (局面, π, 胜负 z) 进经验池,采样训练,损失 = 价值 MSE + 策略交叉熵,8 对称增广;
3. **竞技场**:新网络与现任 best 对战,胜率 ≥ 55% 才晋升;同时与第 0 轮的随机初始基线对战,画出绝对进步曲线;
4. 一切落盘:`data/runs/<run>/` 下的 `events.jsonl`(实时事件)、`metrics.jsonl`(每轮指标)、`games/`(每盘逐手 π 与估值)、`checkpoints/`。

前端通过 WebSocket 实时消费事件流:曲线在涨、棋盘墙在动、档案在累积。

## 常用操作

```bash
# 只跑训练(无界面)
.venv/bin/python -m alphagomoku.trainer --run data/runs/dev --config configs/fast.json

# 只起服务器(训练由网页上的按钮控制)
.venv/bin/python -m server.app --run data/runs/dev --port 8000

# 测试
.venv/bin/python -m pytest tests/ -q
```

## 运行细节

- **暂停语义**:「暂停」在当前迭代结束时生效(约十几秒),「停止」立即中断并落盘。续训自动从 latest.pt 与经验池恢复。
- **绑定地址**:服务器默认绑 `127.0.0.1`(控制接口无鉴权);确需局域网访问时显式 `--host 0.0.0.0`。
- **防双开**:run 目录有 `trainer.lock` 互斥锁,同一目录起第二个训练进程会直接退出。
- **数据增长**:`events.jsonl` 记录每手进度,长期训练会持续增长;后端读取按尾部扫描,不影响性能,但磁盘占用介意时可截断该文件(不影响对局档案与 checkpoint)。
- **checkpoint**:`best.pt` 是竞技场晋升的冠军,`latest.pt` 每轮更新,`baseline.pt` 是第 0 轮冻结的随机权重(进步曲线的零点),`iter_XXXXXX.pt` 定期快照。

## 配置

全部超参见 `configs/fast.json` 与 `alphagomoku/config.py` 注释:棋盘规模、MCTS 模拟次数、每轮对局数、网络规模、竞技场频率与晋升阈值等。网页「总览」页可在线修改(下次启动生效)。`gomoku15.json` 是标准 15x15 五子棋,训练成本明显更高,建议先用 9x9 看到收敛迹象再切换。

## 设计说明

界面设计语言与 [alphago-vs-llm](../.openclaw/alphago-vs-llm) 一文同源:暖纸/墨黑双主题、朱砂单 accent、等宽数字、手绘 SVG 图表,无图表库。
