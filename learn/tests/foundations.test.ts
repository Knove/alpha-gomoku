import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relu,
  quadLoss,
  linGrad,
  linStep,
  dot,
  reluAbs,
  twoLayer,
  twoLayerStep,
} from "../src/lib/foundations.ts";

test("relu:负分归零", () => {
  assert.equal(relu(3), 3);
  assert.equal(relu(0), 0);
  assert.equal(relu(-1), 0);
});

test("quadLoss / linGrad:第 3 课 mini-loss 的账(有限差分对拍)", () => {
  const w = 0.7, x = 2, z = 1;
  assert.equal(quadLoss(w * x, z), (1.4 - 1) ** 2);
  // 有限差分:账 ≈ (loss(w+h) − loss(w−h)) / 2h
  const h = 1e-6;
  const fd =
    (quadLoss((w + h) * x, z) - quadLoss((w - h) * x, z)) / (2 * h);
  assert.ok(Math.abs(fd - linGrad(w, x, z)) < 1e-9);
  assert.equal(linGrad(0, 2, 1), -4); // 站在 w=0:账 = 2·2·(0−1) = −4
});

test("linStep:x=2 时临界 lr=0.25,lr=0.125 一步到谷底", () => {
  const x = 2, z = 1; // 谷底 w* = z/x = 0.5
  assert.ok(Math.abs(linStep(0, x, z, 0.125) - 0.5) < 1e-12); // 因子 1−8lr=0
  // lr=0.2:因子 −0.6,误差每步 ×(−0.6) —— 跨谷震荡但收敛
  let w = 0;
  w = linStep(w, x, z, 0.2);
  assert.ok(Math.abs(w - 0.5) < Math.abs(0 - 0.5)); // 误差在缩
  // lr=0.35:因子 −1.8,误差每步 ×1.8 —— 发散
  let d = 0, prev = Math.abs(d - 0.5);
  d = linStep(d, x, z, 0.35);
  assert.ok(Math.abs(d - 0.5) > prev);
});

test("dot:九份证据并成一个分", () => {
  assert.equal(dot([1, 1, 1], [1, 1, 1]), 3);
  assert.equal(dot([1, 1, 1], [1, -1, 1]), 1); // 第 6 课抵消例:1+(−1)+1
  assert.equal(dot([0.5, -2], [4, 3]), -4); // 2 + (−6)
});

test("reluAbs:ReLU(t)+ReLU(−t) = |t|(t=2,−3,0 徒手验)", () => {
  assert.equal(reluAbs(2), 2);
  assert.equal(reluAbs(-3), 3);
  assert.equal(reluAbs(0), 0);
});

test("twoLayer 正例:x=2, w1=0.5, w2=1.5, z=1(第 11 课手推数字)", () => {
  const g = twoLayer(0.5, 1.5, 2, 1);
  assert.equal(g.s, 1);
  assert.equal(g.h, 1);
  assert.equal(g.v, 1.5);
  assert.equal(g.loss, 0.25);
  assert.equal(g.dW2, 1); // 2(v−z)·h = 1
  assert.equal(g.dW1, 3); // 2(v−z)·w2·1·x = 3
  assert.equal(g.gate, 1);
});

test("twoLayer 负例:w1=−0.5 门关死,两个旋钮的账全为 0(梯度死)", () => {
  const g = twoLayer(-0.5, 1.5, 2, 1);
  assert.equal(g.s, -1);
  assert.equal(g.h, 0);
  assert.equal(g.v, 0);
  assert.equal(g.loss, 1);
  assert.ok(g.dW2 === 0); // h=0:v 对 w2 的账恰是它乘的 h(strictEqual 会把 −0 拒之门外,用 ===)
  assert.ok(g.dW1 === 0); // 门关死:接力链在 [s>0] 那环断掉
  assert.equal(g.gate, 0);
});

test("twoLayerStep:lr=0.1 一步,w1 0.5→0.2、w2 1.5→1.4,玩具原始分跨过 z", () => {
  const n = twoLayerStep(0.5, 1.5, 2, 1);
  assert.ok(Math.abs(n.w1 - 0.2) < 1e-12);
  assert.ok(Math.abs(n.w2 - 1.4) < 1e-12);
  const after = twoLayer(n.w1, n.w2, 2, 1);
  assert.ok(Math.abs(after.v - 0.56) < 1e-12); // 1.5 → 0.56,跨过 z=1
  assert.ok(Math.abs(after.loss - 0.1936) < 1e-12);
});
