# learn/ · 闯关式教学站

教一个不懂神经网络的人,从零看懂这套 AlphaZero 式五子棋系统的每个设计决策——
知其然,并知其所以然。序 + 9 课 + 毕业沙盒,每课「谜题 → 揭示 → 部件 → 对账 → 小测」,
小测过关解锁下一课(进度存 localStorage)。

- 上线:序可自由读;第 1 课起**每课都要动手**——摆棋盘、滑窗口、
  单步搜索、和训练出的真模型下一盘,小测过关才解锁下一课(进度存 localStorage);
- 真实性:浏览器里跑的是 demo 训练出的**真权重**(`src/data/weights-best.json`,
  1.2 MB,懒加载;由 `learn/scripts/export_weights.py` 从 `data/runs/demo/checkpoints`
  导出)与**对拍铁闸**(`tests/parity.test.ts`:TS 前向 vs torch 期望输出,
  逐张量断言)。搜索模拟器、模板墙、特征图墙、人机对弈全部走同一个 TS 引擎;
- 深度参考:`archive/` 是四卷 S 级文章(教学站的文案母本),`../explainer/`
  是介绍站(非教学),`PLAN.md` 是系统的权威设计契约。

## 运行

```bash
cd learn
npm install --registry=https://registry.npmmirror.com
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build → dist/
npm test         # 引擎单测 + 对拍铁闸(node --test)
```

重导权重(重跑训练后),从仓库根:

```bash
.venv/bin/python learn/scripts/export_weights.py   # 权重(best + 未训练 baseline)
.venv/bin/python learn/scripts/dump_expected.py    # 对拍期望 tests/fixtures/expected.json
```

再跑 `npm test` 确认引擎仍与 checkpoint 一致。
