/** 地基篇(第 3-6 课)的纯函数：梯度下降 / 点积 / XOR-ReLU / 两层反向传播。
 *  只放数学，不放 JSX:tests/ 用 node --experimental-strip-types 直跑，
 *  .tsx 进不了测试导入。所有数字例与 archive/foundations.md 的推导链一致。 */

/** 负分归零：第 5 课的「非线性变换」。 */
export const relu = (s: number): number => (s > 0 ? s : 0)

/** (v − z)²:第 3 课立的 mini-loss,与第 13 课价值损失同一口径。 */
export const quadLoss = (v: number, z: number): number => (v - z) * (v - z)

/** ∂/∂w (w·x − z)² = 2x(wx − z):「v 对 w 的账」。 */
export const linGrad = (w: number, x: number, z: number): number =>
  2 * x * (w * x - z)

/** 一步梯度下降：w ← w − lr·账。误差因子 |1 − 2·lr·x²| 决定收敛形态。 */
export const linStep = (w: number, x: number, z: number, lr: number): number =>
  w - lr * linGrad(w, x, z)

/** 点积 Σwᵢxᵢ:第 4 课「乘一乘再加起来」的真名。 */
export function dot(ws: readonly number[], xs: readonly number[]): number {
  let s = 0
  for (let i = 0; i < ws.length; i++) s += ws[i] * xs[i]
  return s
}

/** ReLU(t) + ReLU(−t) = |t|:两个镜像 ReLU 拼 V 形(XOR 例的核心恒等式)。 */
export const reluAbs = (t: number): number => relu(t) + relu(-t)

/** 两层网络 h = ReLU(w1·x), v = w2·h, loss = (v − z)² 的前向 + 反向。
 *  反向就是变化率接力：∂loss/∂w1 = 2(v−z) · w2 · [s>0] · x(四环相乘)。 */
export interface TwoLayer {
  s: number // 第一层乘加： w1·x(ReLU 之前)
  h: number // 非线性变换后： ReLU(s)(负分区归零)
  v: number // 第二层： w2·h
  loss: number // (v − z)²
  dv: number // loss 对 v 的账： 2(v−z)
  dW2: number // v 对 w2 的账 × dv:h · dv
  dW1: number // 全链接力：dv · w2 · [s>0] · x
  gate: 0 | 1 // ReLU 门：s>0 开(1)、s≤0 关(0):门关死则 dW1 归零
}

export function twoLayer(w1: number, w2: number, x: number, z: number): TwoLayer {
  const s = w1 * x
  const h = relu(s)
  const v = w2 * h
  const loss = quadLoss(v, z)
  const dv = 2 * (v - z)
  const gate: 0 | 1 = s > 0 ? 1 : 0
  return {
    s,
    h,
    v,
    loss,
    dv,
    dW2: dv * h,
    dW1: dv * w2 * gate * x,
    gate,
  }
}

/** 「走一步」(lr 固定 0.1):w1、w2 各按梯度挪一点。反向传播课的两层玩具模型。 */
export function twoLayerStep(
  w1: number,
  w2: number,
  x: number,
  z: number,
  lr = 0.1,
): { w1: number; w2: number } {
  const g = twoLayer(w1, w2, x, z)
  return { w1: w1 - lr * g.dW1, w2: w2 - lr * g.dW2 }
}
