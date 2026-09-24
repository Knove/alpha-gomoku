import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emptyBoard, play } from "../src/engine/game.ts";
import { SearchTree, type MctsConfig } from "../src/engine/mcts.ts";

interface Snapshot {
  N: number[];
  W: number[];
  prior: number[] | null;
  root_visit_total: number;
  root_value: number;
  pi: number[];
  best_action: number;
}

interface Fixture {
  board_size: number;
  initial_moves: number[];
  config: { c_puct: number; dirichlet_epsilon: number; dirichlet_alpha: number };
  simulations: {
    index: number;
    leaf: {
      path: number[];
      signature: { plane_sums: number[]; weighted_sum: number; sha256: string };
      logits: number[];
      value: number;
    };
    root: Snapshot;
  }[];
  final: Snapshot;
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/mcts-trace.json", import.meta.url)),
    "utf8",
  ),
) as Fixture;

const close = (got: number, want: number, label: string, tolerance = 1e-6) =>
  assert.ok(Math.abs(got - want) <= tolerance, `${label}: ${got} vs ${want}`);

function signature(planes: number[][][]) {
  const flat = planes.flat(2);
  const bytes = Buffer.from(Int8Array.from(flat));
  return {
    plane_sums: planes.map((p) => p.flat().reduce((a, b) => a + b, 0)),
    weighted_sum: flat.reduce((sum, value, i) => sum + (i + 1) * value, 0),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function compareVector(got: ArrayLike<number>, want: number[], label: string, tolerance = 1e-6) {
  assert.equal(got.length, want.length, `${label} length`);
  for (let i = 0; i < want.length; i++) close(Number(got[i]), want[i], `${label}[${i}]`, tolerance);
}

function compareRoot(tree: SearchTree, want: Snapshot, label: string) {
  compareVector(tree.root.N, want.N, `${label}.N`, 0);
  compareVector(tree.root.W, want.W, `${label}.W`);
  assert.equal(tree.root.prior === null, want.prior === null, `${label}.prior nullability`);
  if (tree.root.prior !== null && want.prior !== null)
    compareVector(tree.root.prior, want.prior, `${label}.prior`);
  const rootTotal = Array.from(tree.root.N).reduce((a, b) => a + b, 0);
  assert.equal(rootTotal, want.root_visit_total, `${label}.root_visit_total`);
  close(tree.rootValue(), want.root_value, `${label}.root_value`);
  compareVector(tree.rootPi(1.0), want.pi, `${label}.pi`);
  assert.equal(tree.bestAction(), want.best_action, `${label}.best_action`);
}

test("Python trace parity: select, leaf input, backup, root ledger, pi and action", () => {
  assert.equal(fixture.board_size, 9);
  let state = emptyBoard();
  for (const action of fixture.initial_moves) state = play(state, action, state.current);
  const cfg: MctsConfig = {
    cPuct: fixture.config.c_puct,
    dirichletEps: fixture.config.dirichlet_epsilon,
    dirichletAlpha: fixture.config.dirichlet_alpha,
  };
  const tree = new SearchTree(state, cfg, () => ({ logits: [], value: 0 }), () => 0.5);

  for (const sim of fixture.simulations) {
    tree.select();
    assert.equal(tree.needsEval(), true, `sim ${sim.index} needs eval`);
    assert.deepEqual(tree.pendingActions(), sim.leaf.path, `sim ${sim.index} path`);
    const planes = tree.leafInput();
    assert.deepEqual(signature(planes), sim.leaf.signature, `sim ${sim.index} leaf input`);
    tree.expandAndBackup(sim.leaf.logits, sim.leaf.value);
    compareRoot(tree, sim.root, `sim ${sim.index}`);
  }
  compareRoot(tree, fixture.final, "final");
});
