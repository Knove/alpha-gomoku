// 对拍铁闸:TS 引擎 vs 真 torch 网络。
//
// 容差依据(2026-08-18 实测,16 输入 × 6 层全量):
//   expected.json 由全精度 checkpoint 产出(输出 6 位小数),而 weights-best.json
//   权重按 spec 舍入到 5 位小数 → 差值是舍入在 7 个残差块里的累乘传播,不是实现错误。
//   交叉验证:同样 5 位舍入权重灌回 PyTorch,TS 与 torch 逐层最大差 5.3e-5(trunk);
//   torch(rounded) vs expected.json 的最大差与 TS 几乎相同(trunk 3.154e-3 vs 3.159e-3)。
//
//   实测最大差 → 容差(实测 ×2 向上取整;trunk 超出计划草稿 2e-3 上限,据上证据放宽):
//     stem_out 6.6e-4 → 1.4e-3    trunk_out 3.2e-3 → 7e-3    p_relu 3.5e-4 → 7e-4
//     logits   1.4e-4 → 3e-4      v_hidden 5.9e-4 → 1.2e-3   value   2.2e-4 → 5e-4
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadNet, traceNet } from "../src/engine/model.ts";
import { softmax, argmax } from "../src/engine/nn.ts";

const read = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8"));

const exp = read("./fixtures/expected.json");
const weights = read("../src/data/weights-best.json");
const net = loadNet(weights);
const trace = traceNet(weights);

const TOL_LOGITS = 3e-4;
const TOL_VALUE = 5e-4;

// [expected.json per_layer 键, traceNet 键, 容差]
const LAYERS: [string, "stemOut" | "trunkOut" | "pRelu" | "logits" | "vHidden", number][] = [
  ["stem_out", "stemOut", 1.4e-3],
  ["trunk_out", "trunkOut", 7e-3],
  ["p_relu", "pRelu", 7e-4],
  ["logits", "logits", TOL_LOGITS],
  ["v_hidden", "vHidden", 1.2e-3],
];

// Tensor({data}) -> 展平;number[]/Float64Array 原样(或转普通数组)
const flat = (v: { data: Float64Array } | number[] | Float64Array): number[] =>
  "data" in v ? Array.from(v.data) : Array.from(v);

test("逐层对拍:16 输入 × 6 层全部对齐 torch expected.json", () => {
  assert.equal(exp.inputs.length, 16);
  for (let i = 0; i < exp.inputs.length; i++) {
    const t = trace(exp.inputs[i]);
    for (const [expKey, traceKey, tol] of LAYERS) {
      const got = flat(t[traceKey]);
      const want = exp.per_layer[expKey][i];
      assert.equal(got.length, want.length, `${expKey}[${i}] length`);
      for (let j = 0; j < want.length; j++)
        assert.ok(
          Math.abs(got[j] - want[j]) < tol,
          `${expKey}[${i}][${j}] ${got[j]} vs ${want[j]} (tol ${tol})`,
        );
    }
    const wantV = exp.per_layer.value[0][i];
    assert.ok(Math.abs(t.value - wantV) < TOL_VALUE, `value[${i}] ${t.value} vs ${wantV}`);
  }
});

test("loadNet 整网对拍 + softmax 归一化", () => {
  for (let i = 0; i < exp.inputs.length; i++) {
    const { logits, value } = net(exp.inputs[i]);
    const want = exp.per_layer.logits[i];
    for (let j = 0; j < logits.length; j++)
      assert.ok(Math.abs(logits[j] - want[j]) < TOL_LOGITS, `in#${i} logit#${j} ${logits[j]} vs ${want[j]}`);
    assert.ok(Math.abs(value - exp.per_layer.value[0][i]) < TOL_VALUE, `in#${i} value`);
  }
  const { logits } = net(exp.inputs[1]);
  const p = softmax(logits);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(p.every((x) => x > 0));
  assert.equal(argmax(p), argmax(logits));
});
