// Replicate Ch4 engine (copied verbatim logic) to inspect tree growth at 200 sims
const N = 9, NN = N * N, C_PUCT = 1.5
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]]
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function randn(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
function randGamma(shape, rand) { if (shape < 1) return randGamma(shape + 1, rand) * Math.pow(rand(), 1 / shape); const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { const x = randn(rand); let v = 1 + c * x; if (v <= 0) continue; v = v * v * v; const u = rand(); if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v } }
function dirichlet(alpha, k, rand) { const g = Array.from({ length: k }, () => randGamma(alpha, rand)); const s = g.reduce((a, b) => a + b, 0) || 1; return g.map((x) => x / s) }
function winner(b) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const p = b[y * N + x]; if (p === 0) continue; for (const [dx, dy] of DIRS) { let c = 1; for (let i = 1; i < 5; i++) { const xx = x + dx * i, yy = y + dy * i; if (xx < 0 || xx >= N || yy < 0 || yy >= N || b[yy * N + xx] !== p) break; c++ } if (c >= 5) return p } } return null }
function outcome(b) { const w = winner(b); if (w !== null) return w; return b.every((v) => v !== 0) ? 0 : null }
function legalMoves(b) { if (outcome(b) !== null) return []; const out = []; for (let i = 0; i < NN; i++) if (b[i] === 0) out.push(i); return out }
function bestRun(b, x, y, p) { let best = 1; for (const [dx, dy] of DIRS) { let c = 1; for (const s of [1, -1]) { let xx = x + dx * s, yy = y + dy * s; while (xx >= 0 && xx < N && yy >= 0 && yy < N && b[yy * N + xx] === p) { c++; xx += dx * s; yy += dy * s } } if (c > best) best = c } return best }
function evaluate(b, player) { const score = new Float32Array(NN); let maxAtk = 1, maxDef = 1, sum = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (b[i] !== 0) continue; const atk = bestRun(b, x, y, player), def = bestRun(b, x, y, -player); if (atk > maxAtk) maxAtk = atk; if (def > maxDef) maxDef = def; let near = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (dx === 0 && dy === 0) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < N && yy >= 0 && yy < N && b[yy * N + xx] !== 0) near++ } const ea = Math.min(atk, 2), ed = Math.min(def, 2); const s = Math.pow(5, ea) + 0.85 * Math.pow(5, ed) + 0.4 * near + 0.01; score[i] = s; sum += s } const prior = new Float32Array(NN); if (sum > 0) for (let i = 0; i < NN; i++) prior[i] = score[i] / sum; const value = Math.tanh(0.5 * (Math.min(maxAtk, 3.5) - Math.min(maxDef, 3.5))); return { prior, value } }
function newNode() { return { prior: null, children: new Map(), N: new Float32Array(NN), W: new Float32Array(NN), expanded: false } }
function createEngine(board, player, noise, seed) { return { root: newNode(), board: board.slice(), player, sims: 0, lastPath: [], lastValue: 0, noise, rand: mulberry32(seed) } }
function puctSelect(node, b) { const legal = legalMoves(b); let total = 0; for (let i = 0; i < NN; i++) total += node.N[i]; const sqrtTotal = Math.sqrt(total + 1e-8); let best = legal[0] ?? 0, bestScore = -Infinity; for (const a of legal) { const q = node.N[a] > 0 ? node.W[a] / node.N[a] : 0; const u = C_PUCT * (node.prior?.[a] ?? 0) * sqrtTotal / (1 + node.N[a]); const s = q + u; if (s > bestScore) { bestScore = s; best = a } } return best }
function simulateOnce(e) { const b = e.board.slice(); let player = e.player; let node = e.root; const path = []; const actions = []; while (node.expanded) { const a = puctSelect(node, b); path.push({ node, a }); actions.push(a); let child = node.children.get(a); if (!child) { child = newNode(); node.children.set(a, child) } b[a] = player; player = -player; node = child } let v; const out = outcome(b); if (out !== null) { v = out === 0 ? 0 : out === player ? 1 : -1 } else { const { prior, value } = evaluate(b, player); node.prior = prior; node.expanded = true; if (node === e.root && e.noise) { const legal = legalMoves(b); const d = dirichlet(0.3, legal.length, e.rand); const mixed = new Float32Array(NN); for (let i = 0; i < NN; i++) mixed[i] = 0.75 * prior[i]; legal.forEach((a, i) => { mixed[a] += 0.25 * d[i] }); node.prior = mixed } v = value } let vv = v; for (let i = path.length - 1; i >= 0; i--) { vv = -vv; const { node: nd, a } = path[i]; nd.N[a] += 1; nd.W[a] += vv } e.sims += 1; e.lastPath = actions; e.lastValue = v }
function presetBoard() { const b = new Array(NN).fill(0); const put = (x, y, p) => { b[y * N + x] = p }; put(1, 4, 1); put(2, 4, 1); put(3, 4, 1); put(4, 4, 1); put(0, 4, -1); put(2, 1, -1); put(3, 1, -1); put(4, 1, -1); put(6, 2, 1); return { board: b, player: 1 } }

const preset = presetBoard()
const e = createEngine(preset.board, preset.player, true, 42)
for (let i = 0; i < 200; i++) simulateOnce(e)
const F5 = 4 * 9 + 5
console.log("sims:", e.sims)
console.log("root.children.size:", e.root.children.size)
const visited = [...e.root.children.entries()].filter(([a, c]) => e.root.N[a] > 0 || c.expanded)
console.log("children with N>0 or expanded:", visited.length)
const top = [...e.root.N.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
console.log("root N>0 actions:", top.map(([a, n]) => `(${a % 9},${Math.floor(a / 9)})x${n}`).join(" "))
console.log("F5 N:", e.root.N[F5], "W:", e.root.W[F5])
// depth-2: children of children
let grandchildren = 0
for (const [a, c] of e.root.children) grandchildren += c.children.size
console.log("grandchildren total:", grandchildren)
