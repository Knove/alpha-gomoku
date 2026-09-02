/** 真权重懒加载:weights-best.json / weights-untrained.json(各约 1.2 MB)由
 *  scripts/export_weights.py 从训练 checkpoint 导出,勿手改。动态 import 让
 *  各自独立成 chunk,只有打开用到的课才会下载。 */
import type { WeightsJson } from "../engine/model"

let cached: Promise<WeightsJson> | null = null
let cachedUntrained: Promise<WeightsJson> | null = null

/** 训练后(weights-best,第 2 轮末=训到第 3 轮的最好棋力):第 4/10/11 课的真权重、真前向与叶评估。 */
export function loadWeights(): Promise<WeightsJson> {
  cached ??= import("../data/weights-best.json").then((m) => m.default as WeightsJson)
  return cached
}

/** 未训练(weights-untrained,baseline.pt:训练开始前随机初始化后冻结的权重,
 *  一步 SGD 都没走过):第 11 课的对照组。 */
export function loadWeightsUntrained(): Promise<WeightsJson> {
  cachedUntrained ??= import("../data/weights-untrained.json").then((m) => m.default as WeightsJson)
  return cachedUntrained
}
