/** 真权重懒加载:weights-best.json(1.2 MB)由 scripts/export_weights.py
 *  从训练 checkpoint 导出,勿手改。动态 import 让它独立成 chunk,
 *  只有打开用到的课(第 4/5 课)才会下载。 */
import type { WeightsJson } from "../engine/model"

let cached: Promise<WeightsJson> | null = null

export function loadWeights(): Promise<WeightsJson> {
  cached ??= import("../data/weights-best.json").then((m) => m.default as WeightsJson)
  return cached
}
