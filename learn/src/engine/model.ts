// Assemble the network + load weights, mirroring alphagomoku/model.py forward (eval mode).
// Weight names match the PyTorch state_dict exported by scripts/export_weights.py.

import {
  tensorFromJson,
  fromPlanes,
  conv2d,
  bnInference,
  relu,
  fc,
  tanh1,
  type Tensor,
} from "./nn.ts";

export interface WeightsJson {
  config: { board_size: number; channels: number; res_blocks: number };
  tensors: Record<string, number[]>; // flat, rounded to 5 decimals
  shapes: Record<string, number[]>;
}

export interface NetOutput {
  logits: number[];
  value: number;
}

/** Per-layer intermediate outputs (same keys as tests/fixtures/expected.json). */
export interface LayerTrace {
  stemOut: Tensor; // [C, N, N] after stem (conv+bn+relu)
  trunkOut: Tensor; // [C, N, N] after all residual blocks
  pRelu: Tensor; // [2, N, N] after policy head conv+bn+relu
  logits: number[];
  vHidden: number[]; // after v_fc1 + relu
  value: number;
}

function bnParams(w: WeightsJson, prefix: string): { gamma: Tensor; beta: Tensor; mean: Tensor; var_: Tensor } {
  return {
    gamma: tensorFromJson(w.tensors[`${prefix}.weight`], w.shapes[`${prefix}.weight`]),
    beta: tensorFromJson(w.tensors[`${prefix}.bias`], w.shapes[`${prefix}.bias`]),
    mean: tensorFromJson(w.tensors[`${prefix}.running_mean`], w.shapes[`${prefix}.running_mean`]),
    var_: tensorFromJson(w.tensors[`${prefix}.running_var`], w.shapes[`${prefix}.running_var`]),
  };
}

function convWeight(w: WeightsJson, name: string): Tensor {
  return tensorFromJson(w.tensors[name], w.shapes[name]);
}

/** h = relu(x + bn2(conv2(relu(bn1(conv1(x)))))) — model.py ResBlock.forward. */
function resBlock(x: Tensor, w: WeightsJson, prefix: string): Tensor {
  const conv1 = convWeight(w, `${prefix}.conv1.weight`),
    conv2 = convWeight(w, `${prefix}.conv2.weight`);
  const bn1 = bnParams(w, `${prefix}.bn1`),
    bn2 = bnParams(w, `${prefix}.bn2`);
  const h = relu(bnInference(conv2d(x, conv1, null, 1), bn1.gamma, bn1.beta, bn1.mean, bn1.var_));
  const h2 = bnInference(conv2d(h, conv2, null, 1), bn2.gamma, bn2.beta, bn2.mean, bn2.var_);
  const out = new Float64Array(x.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, x.data[i] + h2.data[i]);
  return { data: out, shape: [...x.shape] };
}

export function loadNet(w: WeightsJson): (input: number[][][]) => NetOutput {
  const fwd = traceNet(w);
  return (input) => {
    const t = fwd(input);
    return { logits: t.logits, value: t.value };
  };
}

/** Full-graph variant that also exposes intermediates (for the parity fixture + course widgets). */
export function traceNet(w: WeightsJson): (input: number[][][]) => LayerTrace {
  // shapes carry n/channels; only the block count is needed at graph-build time
  const { res_blocks: res } = w.config;
  const stemW = convWeight(w, "stem.0.weight");
  const stemBn = bnParams(w, "stem.1");
  const pConv = convWeight(w, "p_conv.weight");
  const pBn = bnParams(w, "p_bn");
  const pFcW = convWeight(w, "p_fc.weight"),
    pFcB = tensorFromJson(w.tensors["p_fc.bias"], w.shapes["p_fc.bias"]);
  const vConv = convWeight(w, "v_conv.weight");
  const vBn = bnParams(w, "v_bn");
  const vFc1W = convWeight(w, "v_fc1.weight"),
    vFc1B = tensorFromJson(w.tensors["v_fc1.bias"], w.shapes["v_fc1.bias"]);
  const vFc2W = convWeight(w, "v_fc2.weight"),
    vFc2B = tensorFromJson(w.tensors["v_fc2.bias"], w.shapes["v_fc2.bias"]);

  return (input: number[][][]) => {
    const x = fromPlanes(input);
    // stem: conv3x3(pad1) -> BN -> ReLU
    const stemOut = relu(bnInference(conv2d(x, stemW, null, 1), stemBn.gamma, stemBn.beta, stemBn.mean, stemBn.var_));
    let h = stemOut;
    for (let i = 0; i < res; i++) h = resBlock(h, w, `blocks.${i}`);
    // policy head: 1x1 conv (pad 0) -> BN -> ReLU -> fc(2*n*n -> n*n logits)
    const pRelu = relu(bnInference(conv2d(h, pConv, null, 0), pBn.gamma, pBn.beta, pBn.mean, pBn.var_));
    const logits = fc(Array.from(pRelu.data), pFcW, pFcB);
    // value head: 1x1 conv (pad 0) -> BN -> ReLU -> fc(n*n -> 64) -> relu -> fc(64 -> 1) -> tanh
    const vRelu = relu(bnInference(conv2d(h, vConv, null, 0), vBn.gamma, vBn.beta, vBn.mean, vBn.var_));
    const vHidden = fc(Array.from(vRelu.data), vFc1W, vFc1B).map((z) => Math.max(0, z));
    const value = tanh1(fc(vHidden, vFc2W, vFc2B))[0];
    return { stemOut, trunkOut: h, pRelu, logits, vHidden, value };
  };
}
