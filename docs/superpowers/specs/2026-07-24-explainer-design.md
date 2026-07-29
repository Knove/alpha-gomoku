# Explainer 交互教程 · 设计(已获用户批准)

日期:2026-07-24。目标读者:算法初学者(用户本人)。目标:把 alphagomoku/ 核心包讲懂。

## 形态
`alpha-gomoku/explainer/` 独立前端项目(React 19 + Vite 6 + TS + Tailwind 4,与主工程零共享代码,独立 package.json)。单页中文交互长文,设计语言沿用 alphago-vs-llm 文章(暖纸/墨黑/朱砂/等宽数字/手绘 SVG/无图表库/无 emoji/章节朱砂印章)。

## 诚实约定
真实训练数据处标注「来自第 N 轮真实对局」;MCTS 模拟器的评估器为教学替身(pattern-based 启发式),图注声明;搜索引擎(PUCT/回传/访问数)为真实实现。

## 七章(每章 = 散文 + 一个可玩部件,部件均手写 SVG/Canvas,零依赖)
0. 英雄区:真实一手(第 3 轮对局的 π/top5/估值)+ 引入问题
1. 飞轮:点击推动循环动画 + 真实 4 轮 metrics 滚动
2. 棋盘与视角:客观⇄行棋方视角切换(翻转动画)+ 3 平面输入拆解
3. 网络:结构漫游(悬停高亮数据流,输入平面逐层点亮至双头输出)
4. MCTS(重头):可单步真实模拟器(选/展/回三键,树图生长,Q/U 跳动,噪声开关,50 模拟收敛)
5. 自我对弈:π 演变滑杆(0→4 轮真实数据,同手 π 由散到锐)+ 温度对照
6. 训练:8 对称变换台(棋形与 π 同步变换可视验证)+ 真实损失曲线
7. 竞技场:晋升时间线(iter0 加冕→iter2 6:0)+ 真实 arena 对局回放

## 数据管线
`explainer/scripts/export-data.mjs` 读取 `../data/runs/demo/`(一盘 iter3 自我对弈完整 JSON、metrics.jsonl、一盘 iter2 arena 对局、arena 战报)→ 生成 `src/data/real.ts`(TS 类型化常量)。构建前运行,产物随仓走,页面离线可用。

## 共享层(我先写,章节代理只读)
- `src/styles/index.css`:设计令牌 + 工具类(文章同源)
- `src/lib/board.tsx`:GomokuBoard SVG 组件(与主工程同款)
- `src/lib/format.ts`:坐标/数字格式化
- `src/lib/theme.ts`:主题切换
- `src/components/Chrome.tsx`:页眉/进度/主题

## 章节契约(并行代理)
每章一个文件 `src/chapters/Ch{N}.tsx`,默认导出 `export default function Ch{N}()`,仅可 import 共享层与 `../data/real`,不得新增依赖、不得改共享文件、辅助组件内联在自身文件内。严格 TS,共享 tsconfig 下可编译。

## App
`src/App.tsx`:长页顺序七章 + 顶部进度条 + 章节锚点侧轨(1240px+ 显示)+ 页脚。

## 验证
tsc 0 错误 + vite build 过;Playwright 截图逐章明暗两主题;一轮对抗评审(JS 正确性/讲解准确性/视觉),修复后交付。
