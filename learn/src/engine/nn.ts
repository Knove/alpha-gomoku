// Minimal tensor ops + layers, mirroring alphagomoku/model.py (eval mode).
// Everything is a flat Float64Array plus shape metadata; no third-party deps.

export interface Tensor {
  data: Float64Array;
  shape: number[];
}

export function tensorFromJson(flat: number[], shape: number[]): Tensor {
  const total = shape.reduce((a, b) => a * b, 1);
  if (flat.length !== total)
    throw new Error(`tensorFromJson: ${flat.length} values do not fill shape [${shape}]`);
  return { data: Float64Array.from(flat), shape: [...shape] };
}

export function zeros(shape: number[]): Tensor {
  const total = shape.reduce((a, b) => a * b, 1);
  return { data: new Float64Array(total), shape: [...shape] };
}

/** Reshape is metadata-only: same data, new shape (total must match). */
export function reshape(x: Tensor, shape: number[]): Tensor {
  const total = shape.reduce((a, b) => a * b, 1);
  if (total !== x.data.length)
    throw new Error(`reshape: cannot fit ${x.data.length} values into [${shape}]`);
  return { data: x.data, shape };
}

/** View a tensor as a plain JS array (used at layer boundaries / outputs). */
export function toArray(x: Tensor): number[] {
  return Array.from(x.data);
}

/** game.ts encode() output (3 planes of N×N rows) -> Tensor [3, N, N]. */
export function fromPlanes(planes: number[][][]): Tensor {
  const c = planes.length,
    h = planes[0].length,
    w = planes[0][0].length;
  const data = new Float64Array(c * h * w);
  let k = 0;
  for (let ci = 0; ci < c; ci++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[k++] = planes[ci][y][x];
  return { data, shape: [c, h, w] };
}

/** Zero-padded, stride-1 3×3 conv. w: [outC, inC, kh, kw]. b may be null. */
export function conv2d(x: Tensor, w: Tensor, b: Tensor | null, pad: number): Tensor {
  const [outC, inC, kh, kw] = w.shape;
  const [xc, xh, xw] = x.shape;
  if (xc !== inC) throw new Error(`conv2d: input has ${xc} channels, weight expects ${inC}`);
  const oh = xh + 2 * pad - kh + 1,
    ow = xw + 2 * pad - kw + 1;
  const out = new Float64Array(outC * oh * ow);
  // Kernel offset (ky,kx) -> input offset. Hoisted so 1x1 kernels skip the
  // loops entirely: conv2d with a [*,*,1,1] weight is just a channel mix.
  const kyEnd = Math.min(kh, xh + pad),
    kxEnd = Math.min(kw, xw + pad);
  for (let oc = 0; oc < outC; oc++) {
    const wBase = oc * inC * kh * kw;
    for (let oy = 0; oy < oh; oy++) {
      for (let ox = 0; ox < ow; ox++) {
        let acc = b ? b.data[oc] : 0;
        const iy0 = oy - pad,
          ix0 = ox - pad;
        for (let ic = 0; ic < inC; ic++) {
          const xBase = ic * xh * xw,
            wCh = wBase + ic * kh * kw;
          for (let ky = Math.max(0, -iy0); ky < kyEnd; ky++) {
            const iy = iy0 + ky;
            if (iy >= xh) break;
            const xRow = xBase + iy * xw,
              wRow = wCh + ky * kw;
            for (let kx = Math.max(0, -ix0); kx < kxEnd; kx++) {
              const ix = ix0 + kx;
              if (ix >= xw) break;
              acc += x.data[xRow + ix] * w.data[wRow + kx];
            }
          }
        }
        out[(oc * oh + oy) * ow + ox] = acc;
      }
    }
  }
  return { data: out, shape: [outC, oh, ow] };
}

/** BatchNorm2d eval mode: y = gamma*(x-mean)/sqrt(var+eps) + beta, eps=1e-5 (PyTorch default). */
export function bnInference(x: Tensor, gamma: Tensor, beta: Tensor, mean: Tensor, var_: Tensor): Tensor {
  const c = x.shape[0],
    total = x.data.length;
  const out = new Float64Array(total);
  const plane = total / c;
  for (let ci = 0; ci < c; ci++) {
    const scale = gamma.data[ci] / Math.sqrt(var_.data[ci] + 1e-5),
      shift = beta.data[ci] - mean.data[ci] * scale;
    for (let k = ci * plane; k < (ci + 1) * plane; k++) out[k] = x.data[k] * scale + shift;
  }
  return { data: out, shape: [...x.shape] };
}

export function relu(x: Tensor): Tensor {
  const out = new Float64Array(x.data.length);
  for (let i = 0; i < x.data.length; i++) out[i] = x.data[i] > 0 ? x.data[i] : 0;
  return { data: out, shape: [...x.shape] };
}

/** Fully connected. x length in; w [out, in] row-major; returns length out. */
export function fc(x: number[], w: Tensor, b: Tensor): number[] {
  const [outs, ins] = w.shape;
  if (x.length !== ins) throw new Error(`fc: input length ${x.length}, weight expects ${ins}`);
  const out = new Array<number>(outs);
  for (let o = 0; o < outs; o++) {
    let acc = b.data[o];
    const row = o * ins;
    for (let i = 0; i < ins; i++) acc += x[i] * w.data[row + i];
    out[o] = acc;
  }
  return out;
}

export function tanh1(v: number[]): number[] {
  return v.map(Math.tanh);
}

/** Numerically stable softmax (subtract max). */
export function softmax(v: number[]): number[] {
  const max = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - max));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / s);
}

export function logSoftmax(v: number[]): number[] {
  const max = Math.max(...v);
  const exps = v.map((x) => Math.exp(x - max));
  const s = exps.reduce((a, b) => a + b, 0);
  const logZ = Math.log(s);
  return v.map((x) => x - max - logZ);
}

/** First occurrence of the maximum (np.argmax semantics). */
export function argmax(v: number[] | Float64Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}
