import { test } from "node:test";
import assert from "node:assert/strict";
import { BLACK, WHITE, emptyBoard, outcome, play, type GameState } from "../src/engine/game.ts";
import { SearchTree, randGamma, type MctsConfig, type EvalFn } from "../src/engine/mcts.ts";

const N = 9;

/** deterministic rng (mulberry32) so Dirichlet draws are reproducible */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0, dirichletAlpha: 0.3 };
const NOISE_CFG: MctsConfig = { cPuct: 1.5, dirichletEps: 0.25, dirichletAlpha: 0.3 };

/** evalFn that answers uniform logits + a fixed value everywhere */
const evalConst =
  (value: number): EvalFn =>
  () => ({ logits: new Array<number>(N * N).fill(0), value });

function drive(tree: SearchTree, sims: number, evalFn: EvalFn): void {
  for (let i = 0; i < sims; i++) {
    tree.select();
    if (tree.needsEval()) {
      const { logits, value } = evalFn(tree.leafInput());
      tree.expandAndBackup(logits, value);
    }
  }
}

test("sim 1 only expands the root: edges untouched, rootValue records the leaf value", () => {
  const tree = new SearchTree(emptyBoard(), CFG, evalConst(0), mulberry32(1));
  tree.select();
  assert.equal(tree.needsEval(), true);
  tree.expandAndBackup(new Array<number>(N * N).fill(0), 0);
  assert.equal(tree.root.expanded, true);
  assert.equal(tree.rootValue(), 0); // empty-path backup only feeds rootValueSum
  for (let a = 0; a < N * N; a++) {
    assert.equal(tree.root.N[a], 0);
    assert.equal(tree.root.W[a], 0);
  }
});

test("sim 2 records one edge with the FLIPPED perspective; rootValue averages flips", () => {
  // value=0: W stays 0, only N moves
  const t0 = new SearchTree(emptyBoard(), CFG, evalConst(0), mulberry32(1));
  drive(t0, 2, evalConst(0));
  const visited = Array.from(t0.root.N).filter((n) => n === 1);
  assert.equal(visited.length, 1);
  for (let a = 0; a < N * N; a++) assert.equal(t0.root.W[a], 0);

  // value=+1 at every leaf: the 1-ply root edge stores -1 (leaf player's win
  // is the root player's loss); rootValue averages +1 (root sim) and -1 (sim 2)
  const t1 = new SearchTree(emptyBoard(), CFG, evalConst(1), mulberry32(1));
  drive(t1, 2, evalConst(1));
  const a1 = Array.from(t1.root.N).findIndex((n) => n === 1);
  assert.ok(a1 >= 0);
  assert.equal(t1.root.W[a1], -1);
  assert.equal(t1.rootValue(), 0);
});

test("terminal direct backup: black four-in-a-row is found via F5 (action 41), Q=+1", () => {
  // archive/mcts.md hand example, placed as a literal GameState (parity is
  // intentionally not a real-game alternation; search does not care).
  // Archive uses chess-style (x, y); put() takes (y, x).
  const board = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const put = (y: number, x: number, p: number) => (board[y][x] = p);
  put(4, 0, WHITE); // white blocks the left end of the row
  for (let x = 1; x <= 4; x++) put(4, x, BLACK); // black four: (1..4, y=4)
  put(1, 2, WHITE);
  put(1, 3, WHITE);
  put(1, 4, WHITE); // white three on row 1
  put(2, 6, BLACK); // black spare stone
  const state: GameState = { board, current: BLACK, winner: 0, moveCount: 9, lastMove: null };

  // setup self-check: black playing F5 completes five and wins
  assert.equal(outcome(play(state, 4 * N + 5, BLACK)), BLACK);

  const tree = new SearchTree(state, CFG, evalConst(0), mulberry32(1));
  drive(tree, 45, evalConst(0));
  const F5 = 4 * N + 5; // (x=5, y=4) -> a = 41
  assert.ok(tree.root.N[F5] >= 1, `F5 visits ${tree.root.N[F5]}`);
  assert.ok(Math.abs(tree.root.W[F5] / tree.root.N[F5] - 1) < 1e-9);
  assert.equal(tree.bestAction(), F5);
});

test("negamax backup: 2-ply path with leaf value +1 -> root edge W=+1, child edge W=-1", () => {
  // peaked logits keep every simulation on the same path; value is +1 only at
  // the 2-stone leaf so earlier backups contribute 0 and signs stay readable
  const logits = new Array<number>(N * N).fill(-10);
  logits[40] = 10; // root: tengen
  logits[0] = 5; // below: top-left corner
  const stones = (planes: number[][][]) =>
    planes[0].flat().reduce((x, y) => x + y, 0) + planes[1].flat().reduce((x, y) => x + y, 0);
  const evalFn: EvalFn = (planes) => ({ logits, value: stones(planes) === 2 ? 1 : 0 });
  const tree = new SearchTree(emptyBoard(), CFG, evalFn, mulberry32(1));
  drive(tree, 3, evalFn);
  // sim 3 path: (root, 40) -> (child, 0), leaf value +1. Backup flips per ply:
  // child edge records -1, then root edge +1; rootValue uses the last flip (+1)
  const root = tree.root;
  const child = root.children.get(40)!;
  assert.ok(child.expanded);
  assert.equal(root.N[40], 2); // sims 2 and 3 both crossed this edge
  assert.equal(root.W[40], 1); // sim 2 gave 0, sim 3's flip gave +1
  assert.equal(child.N[0], 1);
  assert.equal(child.W[0], -1);
  assert.ok(Math.abs(tree.rootValue() - 1 / 3) < 1e-12); // (0 + 0 + 1) / 3
});

test("rootPi: uniform-legal before any visits, visit proportions at tau=1, one-hot when tau->0", () => {
  const tree = new SearchTree(emptyBoard(), CFG, evalConst(0), mulberry32(1));
  // no simulations: uniform over 81 legal
  let pi = tree.rootPi(1.0);
  assert.equal(pi.length, N * N);
  assert.ok(Math.abs(pi.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  assert.ok(Math.abs(pi[0] - 1 / (N * N)) < 1e-12);

  // 4 sims, uniform eval: sim 1 expands the root, sims 2-4 visit three actions once each
  drive(tree, 4, evalConst(0));
  pi = tree.rootPi(1.0);
  const total = pi.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const visited = Array.from(tree.root.N).filter((n) => n > 0);
  assert.equal(visited.length, 3);
  for (let a = 0; a < N * N; a++) {
    if (tree.root.N[a] > 0) assert.ok(Math.abs(pi[a] - 1 / 3) < 1e-9);
    else assert.equal(pi[a], 0);
  }

  // near-zero temperature: one-hot on bestAction
  pi = tree.rootPi(1e-4);
  assert.equal(pi[tree.bestAction()], 1);
  assert.equal(pi.reduce((x, y) => x + y, 0), 1);
});

test("root Dirichlet noise: prior stays a distribution and follows 0.75*prior + 0.25*noise", () => {
  const seed = 7;
  const tree = new SearchTree(emptyBoard(), NOISE_CFG, evalConst(0), mulberry32(seed));
  tree.select();
  tree.expandAndBackup(new Array<number>(N * N).fill(0), 0);

  // Gamma rejection sampling consumes a variable number of rng() draws, so the
  // noise cannot be replayed exactly; assert the mixture structure instead:
  // prior = 0.75*uniform + 0.25*noise with noise >= 0 summing to 1.
  const prior = tree.root.prior!;
  assert.ok(Math.abs(prior.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  const uniform = 1 / (N * N);
  let noiseSum = 0;
  for (let a = 0; a < N * N; a++) {
    const noise = (prior[a] - 0.75 * uniform) / 0.25;
    assert.ok(noise >= -1e-12, `a=${a}: negative noise share ${noise}`);
    noiseSum += noise;
  }
  assert.ok(Math.abs(noiseSum - 1) < 1e-9);
});

test("randGamma gives a true Dirichlet(0.3), not the sharper Weibull bug", () => {
  // normalized Gamma(0.3) draws over 81 actions: mean of the max component.
  // A true Dirichlet(0.3) lands near 0.12; the old -(ln U)^(1/alpha) sampler
  // (actually Weibull) landed near 0.32.
  const trials = 300;
  let maxSum = 0;
  for (let t = 0; t < trials; t++) {
    const rng = mulberry32(t + 1);
    const g = Array.from({ length: N * N }, () => randGamma(NOISE_CFG.dirichletAlpha, rng));
    const s = g.reduce((x, y) => x + y, 0);
    maxSum += Math.max(...g.map((x) => x / s));
  }
  const meanMax = maxSum / trials;
  assert.ok(meanMax > 0.08 && meanMax < 0.17, `mean max component ${meanMax}`);
});

test("updateRoot keeps the searched subtree and resets the root value ledger", () => {
  const logits = new Array<number>(N * N).fill(-10);
  logits[40] = 10; // everything funnels through tengen
  const evalFn: EvalFn = () => ({ logits, value: 0 });
  const tree = new SearchTree(emptyBoard(), CFG, evalFn, mulberry32(1));
  drive(tree, 3, evalFn);
  const rootChild = tree.root.children.get(40)!;
  assert.ok(rootChild.expanded);
  const kept = Array.from(rootChild.N).reduce((x, y) => x + y, 0);
  assert.ok(kept >= 1, "subtree must carry visits before updateRoot");

  tree.updateRoot(40);
  assert.equal(tree.root, rootChild);
  const keptAfter = Array.from(tree.root.N).reduce((x, y) => x + y, 0);
  assert.equal(keptAfter, kept); // N preserved across the root move
  assert.equal(tree.rootValue(), 0); // value ledger cleared
  assert.ok(tree.root.expanded);
});
