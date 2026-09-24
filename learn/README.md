# learn/ · 闯关式教学站

从零读懂这个仓库里的 AlphaZero 式五子棋系统：不仅知道每个部件做什么，还要能沿真实数据和代码说明它为什么存在、把什么交给下一环。

课程是**单一全必修主线**：序章 + 18 课 + 毕业，共 20 个导航节点。不存在“儿童版 / 成人版”或可以跳过的进阶内容；复杂章节拆成连续小步，依次完成「预测 → 动手 → 追踪 → 数字例 → 公式 → 项目对证 → 换例验证」。每一课通过后解锁下一课，进度保存在 localStorage。

主线依次覆盖：

1. 棋盘、动作与当前方视角；
2. 参数、损失、点积与 ReLU；
3. 三输入面、卷积、残差/BN 与策略价值双头；
4. MCTS、PUCT、回传、根噪声、温度和访问分布；
5. 自我对弈 `(s, π, z)`、回放池、增广、双损失与优化；
6. 竞技场、迭代恢复、run 目录、服务器与浏览器数据边界。

## 真实性口径

- 浏览器加载 demo run 导出的真实 checkpoint 权重；`tests/parity.test.ts` 用 16 个输入、6 组中间/输出张量与 torch 结果对拍。
- TypeScript 引擎遵守 Python 核心契约，但不是逐位相同的运行时：网页固定 9×9，导出权重保留 5 位小数，使用 JS 数值/RNG、单局顺序搜索和较小预算。课程将这些标为“浏览器适配”，不声称执行结果完全相同。
- 每个组件分别标明来源：训练归档的**真实记录**、按项目逻辑重新计算的**真实代码复现**、隔离机制的**教学构造**，或预算/精度不同的**浏览器适配**。不存在“页面上每个数字都来自训练记录”的总括承诺。
- 归档逐手 `value` 的含义是 MCTS 回传后的根节点平均值(`root_value`)，不是价值头裸输出；训练从 `(s, π, z)` 重算网络价值。`π` 的分母是全部根访问数，不能用 top-5 摘要重新归一化。
- `PLAN.md` 是项目设计契约；教学内容同时通过 Python 实现、TS 镜像、测试与生成产物交叉验证。发现契约漂移时先修正或明确登记，不能把冲突说法都当作正确答案。

## 运行

```bash
cd learn
npm install --registry=https://registry.npmmirror.com
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build → dist/
npm test         # 引擎、课程清单、进度迁移、产物一致性与对拍测试
```

## 重新生成真实产物

源 run 位于 gitignore 的 `data/runs/demo/`。重新训练或更换 checkpoint 后，从仓库根执行：

```bash
.venv/bin/python learn/scripts/export_weights.py
.venv/bin/python learn/scripts/dump_expected.py
.venv/bin/python learn/scripts/dump_mcts_trace.py
.venv/bin/python learn/scripts/provenance.py generate
```

随后运行 `npm test`，确认导出权重、期望张量、MCTS 轨迹和浏览器引擎仍然一致。课程使用的生成物会记录 run/config、checkpoint role/meta、SHA-256、导出 schema 与代码版本；没有源 run 的干净检出仍可运行 `.venv/bin/python learn/scripts/provenance.py verify` 校验已提交产物，但不能重新生成它们。

更长的成人讲义仍保存在 `archive/`，`../explainer/` 是介绍站；它们不替代教学主线中的任何必修概念或源码对证。
