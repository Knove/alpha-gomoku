// PUCT Monte Carlo Tree Search, mirroring alphagomoku/mcts.py (contract: PLAN.md §4.3).
//
// Protocol (driven by selfplay/arena/play):
//     const tree = new SearchTree(state, cfg, evalFn, rng);
//     for (let i = 0; i < sims; i++) {
//       tree.select();                       // descend to a leaf (may need eval)
//       if (tree.needsEval()) {
//         const { logits, value } = evalFn(tree.leafInput());
//         tree.expandAndBackup(logits, value);
//       }
//     }
//     const pi = tree.rootPi(1.0);           // training target
//     const a  = tree.bestAction();          // argmax visit count
//     const v  = tree.rootValue();           // mean backed-up value (display)
//     tree.updateRoot(a);                    // reuse subtree for the next move
//
// ONLY interface difference from python: Predictor.predict applies softmax before
// handing probs to the tree; our evalFn returns raw logits, so expandAndBackup
// applies softmax here before masking/normalizing.

import { encode, legalMoves, outcome, play, type GameState } from "./game.ts";
import { softmax } from "./nn.ts";

export interface MctsConfig {
  cPuct: number;
  dirichletEps: number;
  dirichletAlpha: number;
}

export type EvalFn = (planes: number[][][]) => { logits: number[]; value: number };

export interface MctsNode {
  prior: number[] | null; // (numActions,) masked + normalized; null until expanded
  children: Map<number, MctsNode>;
  N: Float64Array; // visit counts per action
  W: Float64Array; // total value per action
  expanded: boolean;
}

function newNode(numActions: number): MctsNode {
  return {
    prior: null,
    children: new Map(),
    N: new Float64Array(numActions),
    W: new Float64Array(numActions),
    expanded: false,
  };
}

export class SearchTree {
  root: MctsNode;
  private cfg: MctsConfig;
  private evalFn: EvalFn;
  private rng: () => number;
  private rootGame: GameState;
  private rootValueSum = 0;
  private rootValueCount = 0;
  // pending leaf (set by select, consumed by expandAndBackup)
  private pendingGame: GameState | null = null;
  private pendingPath: [MctsNode, number][] = [];
  private pendingLeaf: MctsNode | null = null;

  constructor(state: GameState, cfg: MctsConfig, evalFn: EvalFn, rng: () => number) {
    this.cfg = cfg;
    this.evalFn = evalFn;
    this.rng = rng;
    // game.ts states are immutable, so sharing the reference is the clone.
    this.rootGame = state;
    this.root = newNode(state.board.length * state.board.length);
  }

  // ------------------------------------------------------------- selection

  /** Run one simulation: descend PUCT to a leaf. Terminal leaves back up
   *  immediately; otherwise the leaf is pending until expandAndBackup(). */
  select(): void {
    if (this.pendingGame !== null) throw new Error("previous leaf not resolved");
    const numActions = this.root.N.length;
    let node = this.root;
    let game = this.rootGame;
    const path: [MctsNode, number][] = [];
    while (node.expanded) {
      const a = this.puctSelect(node, game);
      path.push([node, a]);
      let child = node.children.get(a);
      if (child === undefined) {
        child = newNode(numActions);
        node.children.set(a, child);
      }
      game = play(game, a, game.current);
      node = child;
    }
    const out = outcome(game);
    if (out !== null) {
      // terminal direct backup: draw 0, else +/-1 from the leaf player's view
      const v = out === 0 ? 0 : out === game.current ? 1 : -1;
      this.backup(path, v);
      return;
    }
    this.pendingGame = game;
    this.pendingPath = path;
    this.pendingLeaf = node;
  }

  needsEval(): boolean {
    return this.pendingGame !== null;
  }

  leafInput(): number[][][] {
    if (this.pendingGame === null) throw new Error("no pending leaf");
    return encode(this.pendingGame);
  }

  /** Convenience driver for the full simulation loop (selfplay + widgets). */
  run(sims: number): void {
    for (let i = 0; i < sims; i++) {
      this.select();
      if (this.needsEval()) {
        const { logits, value } = this.evalFn(this.leafInput());
        this.expandAndBackup(logits, value);
      }
    }
  }

  private puctSelect(node: MctsNode, game: GameState): number {
    const legal = legalMoves(game);
    const { N, W, prior } = node;
    if (prior === null) throw new Error("select through an unexpanded node");
    let total = 0;
    for (let i = 0; i < N.length; i++) total += N[i];
    const sqrtTotal = Math.sqrt(total + 1e-8);
    let best = -1;
    let bestScore = -Infinity;
    for (let a = 0; a < N.length; a++) {
      if (legal[a] === 0) continue; // illegal: score -inf
      const q = N[a] > 0 ? W[a] / N[a] : 0;
      const u = (this.cfg.cPuct * prior[a] * sqrtTotal) / (1 + N[a]);
      const score = q + u;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best; // first max among legal (argmax semantics)
  }

  // ------------------------------------------------------------- expansion

  /** Expand the pending leaf with the net prior and back up its value.
   *  value: from the perspective of the player to move at the leaf. */
  expandAndBackup(logits: number[], value: number): void {
    const node = this.pendingLeaf;
    const game = this.pendingGame;
    if (node === null || game === null) throw new Error("no pending leaf");
    const legal = legalMoves(game);
    // interface difference vs python: probs arrive as logits, softmax here
    const probs = softmax(logits);
    let sum = 0;
    const prior = new Array<number>(probs.length);
    for (let a = 0; a < probs.length; a++) {
      prior[a] = probs[a] * legal[a];
      sum += prior[a];
    }
    if (sum > 1e-8) {
      for (let a = 0; a < prior.length; a++) prior[a] /= sum;
    } else {
      const n = legal.reduce((x, y) => x + y, 0);
      for (let a = 0; a < prior.length; a++) prior[a] = legal[a] / n;
    }
    node.prior = prior;
    node.expanded = true;
    if (node === this.root && this.cfg.dirichletEps > 0) this.mixNoise(node, legal);
    this.backup(this.pendingPath, value);
    this.pendingGame = null;
    this.pendingPath = [];
    this.pendingLeaf = null;
  }

  private mixNoise(node: MctsNode, legal: number[]): void {
    const eps = this.cfg.dirichletEps;
    if (eps <= 0 || node.prior === null) return;
    // Dirichlet via per-component Gamma draws: g = (-ln U)^(1/alpha), then normalize
    const idx: number[] = [];
    for (let a = 0; a < legal.length; a++) if (legal[a] > 0) idx.push(a);
    // clamp U away from 0: -ln(0) = Infinity would NaN the normalized noise
    const g = idx.map(() => Math.pow(-Math.log(Math.max(this.rng(), 1e-12)), 1 / this.cfg.dirichletAlpha));
    const gSum = g.reduce((x, y) => x + y, 0);
    const mixed = node.prior.map((p) => (1 - eps) * p);
    idx.forEach((a, i) => (mixed[a] += (eps * g[i]) / gSum));
    node.prior = mixed;
  }

  /** Each ply flips the value sign before bookkeeping; afterwards the final
   *  (root-perspective) v feeds the root value average — python semantics:
   *  the loop body flips first, and the post-loop sum sees the LAST flip. */
  private backup(path: [MctsNode, number][], v: number): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const [node, a] = path[i];
      v = -v;
      node.N[a] += 1;
      node.W[a] += v;
    }
    this.rootValueSum += v;
    this.rootValueCount += 1;
  }

  // ----------------------------------------------------------------- output

  rootPi(temperature: number): number[] {
    const counts = this.root.N;
    let total = 0;
    for (let i = 0; i < counts.length; i++) total += counts[i];
    if (total <= 0) {
      const legal = legalMoves(this.rootGame);
      const s = legal.reduce((x, y) => x + y, 0);
      return s > 0 ? legal.map((l) => l / s) : legal.slice();
    }
    if (temperature <= 1e-3) {
      const pi = new Array<number>(counts.length).fill(0);
      pi[this.bestAction()] = 1;
      return pi;
    }
    const c = Array.from(counts, (n) => Math.pow(n, 1 / temperature));
    const s = c.reduce((x, y) => x + y, 0);
    return c.map((x) => x / s);
  }

  /** Argmax visit count among LEGAL actions (all-zero falls back to first legal). */
  bestAction(): number {
    const legal = legalMoves(this.rootGame);
    const { N } = this.root;
    let best = -1;
    let bestN = -Infinity;
    for (let a = 0; a < N.length; a++) {
      if (legal[a] === 0) continue;
      if (N[a] > bestN) {
        bestN = N[a];
        best = a;
      }
    }
    return best;
  }

  rootValue(): number {
    if (this.rootValueCount === 0) return 0;
    return this.rootValueSum / this.rootValueCount;
  }

  /** Advance the root after a real move, keeping the searched subtree. */
  updateRoot(action: number): void {
    if (this.pendingGame !== null) throw new Error("previous leaf not resolved");
    const child = this.root.children.get(action);
    this.rootGame = play(this.rootGame, action, this.rootGame.current);
    this.root = child !== undefined ? child : newNode(this.rootGame.board.length ** 2);
    this.rootValueSum = 0;
    this.rootValueCount = 0;
    if (this.root.expanded && this.cfg.dirichletEps > 0) {
      // fresh Dirichlet noise for the new search root (AlphaZero does this per move)
      this.mixNoise(this.root, legalMoves(this.rootGame));
    }
  }
}
