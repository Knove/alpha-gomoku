/** 真权重懒加载:weights-best.json / weights-iter0.json(各约 1.2 MB)由
 *  scripts/export_weights.py 从训练 checkpoint 导出,勿手改。动态 import 让
 *  各自独立成 chunk,只有打开用到的课(第 4/5/6/7 课)才会下载。 */
import type { WeightsJson } from "../engine/model"

let cached: Promise<WeightsJson> | null = null
let cachedIter0: Promise<WeightsJson> | null = null

/** 训练后(weights-best):第 6/7 课的真前向与叶评估。 */
export function loadWeights(): Promise<WeightsJson> {
  cached ??= import("../data/weights-best.json").then((m) => m.default as WeightsJson)
  return cached
}

/** 未训练(weights-iter0,第 0 轮前的随机初始化):第 6 课的对照组。 */
export function loadWeightsIter0(): Promise<WeightsJson> {
  cachedIter0 ??= import("../data/weights-iter0.json").then((m) => m.default as WeightsJson)
  return cachedIter0
}
