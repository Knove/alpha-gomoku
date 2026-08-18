import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLACK,
  WHITE,
  emptyBoard,
  play,
  outcome,
  legalMoves,
  canonical,
  encode,
  dihedral,
  dihedralPi,
  type GameState,
} from "../src/engine/game.ts";

const a = (y: number, x: number) => y * 9 + x;

/** Build a state by playing (action, player) pairs from the empty board. */
function fromMoves(pairs: [number, 1 | -1][]): GameState {
  let s = emptyBoard();
  for (const [action, player] of pairs) s = play(s, action, player);
  return s;
}

test("action 40 is tengen: board[4][4] === BLACK after black plays it", () => {
  const s = play(emptyBoard(), 40, BLACK);
  assert.equal(s.board[4][4], BLACK);
  assert.equal(s.lastMove, 40);
  assert.equal(s.moveCount, 1);
  assert.equal(s.current, WHITE);
  assert.equal(s.winner, 0);
});

test("five in a column: black wins when completing the line last", () => {
  // Black completes (0..4, 4) by playing (4,4) as the final move.
  const s = fromMoves([
    [a(0, 4), BLACK], [a(0, 5), WHITE],
    [a(1, 4), BLACK], [a(1, 5), WHITE],
    [a(2, 4), BLACK], [a(2, 5), WHITE],
    [a(3, 4), BLACK], [a(3, 5), WHITE],
    [a(4, 4), BLACK],
  ]);
  assert.equal(outcome(s), BLACK);
  assert.equal(s.winner, BLACK);
});

test("win detection only reads the last move: earlier anchor still counts", () => {
  // Black plays (4,4) first, then fills (0..3,4) afterwards; the final move
  // (3,4) must see through the earlier stone to reach five.
  const s = fromMoves([
    [a(4, 4), BLACK], [a(0, 8), WHITE],
    [a(0, 4), BLACK], [a(1, 8), WHITE],
    [a(1, 4), BLACK], [a(2, 8), WHITE],
    [a(2, 4), BLACK], [a(3, 8), WHITE],
    [a(3, 4), BLACK],
  ]);
  assert.equal(outcome(s), BLACK);
});

test("four in a row is not a win: outcome stays null", () => {
  const s = fromMoves([
    [a(0, 4), BLACK], [a(0, 5), WHITE],
    [a(1, 4), BLACK], [a(1, 5), WHITE],
    [a(2, 4), BLACK], [a(2, 5), WHITE],
    [a(3, 4), BLACK], [a(3, 5), WHITE],
    [a(8, 8), BLACK],
  ]);
  assert.equal(outcome(s), null);
  assert.equal(s.winner, 0);
});

test("diagonal five: black (0,0)..(4,4) wins", () => {
  const s = fromMoves([
    [a(0, 0), BLACK], [a(0, 5), WHITE],
    [a(1, 1), BLACK], [a(1, 5), WHITE],
    [a(2, 2), BLACK], [a(2, 5), WHITE],
    [a(3, 3), BLACK], [a(3, 5), WHITE],
    [a(4, 4), BLACK],
  ]);
  assert.equal(outcome(s), BLACK);
});

test("white wins: outcome === -1 and legalMoves are all 0", () => {
  const s = fromMoves([
    [a(0, 0), BLACK], [a(0, 5), WHITE],
    [a(1, 0), BLACK], [a(1, 5), WHITE],
    [a(2, 0), BLACK], [a(2, 5), WHITE],
    [a(3, 0), BLACK], [a(3, 5), WHITE],
    [a(8, 8), BLACK], [a(4, 5), WHITE],
  ]);
  assert.equal(outcome(s), WHITE);
  assert.equal(s.winner, WHITE);
  const moves = legalMoves(s);
  assert.equal(moves.length, 81);
  assert.ok(moves.every((m) => m === 0));
});

test("play is immutable: the original state is untouched", () => {
  const s0 = fromMoves([[a(4, 4), BLACK]]);
  const before = JSON.stringify(s0);
  const s1 = play(s0, a(0, 0), WHITE);
  assert.equal(JSON.stringify(s0), before);
  assert.equal(s0.board[0][0], 0);
  assert.equal(s0.moveCount, 1);
  assert.notEqual(s1.board, s0.board);
  assert.notEqual(s1.board[4], s0.board[4]);
});

test("play throws on occupied square, wrong turn, finished game, bad action", () => {
  const s = fromMoves([[a(4, 4), BLACK]]);
  assert.throws(() => play(s, a(4, 4), WHITE)); // occupied
  assert.throws(() => play(s, a(0, 0), BLACK)); // wrong turn (white to move)
  const won = fromMoves([
    [a(0, 4), BLACK], [a(0, 5), WHITE],
    [a(1, 4), BLACK], [a(1, 5), WHITE],
    [a(2, 4), BLACK], [a(2, 5), WHITE],
    [a(3, 4), BLACK], [a(3, 5), WHITE],
    [a(4, 4), BLACK],
  ]);
  assert.throws(() => play(won, a(8, 8), WHITE)); // already finished
  assert.throws(() => play(s, 81, WHITE)); // out of range
  assert.throws(() => play(s, -1, WHITE)); // out of range
});

test("legalMoves: 81-length 0/1 mask on empty board", () => {
  const moves = legalMoves(emptyBoard());
  assert.equal(moves.length, 81);
  assert.ok(moves.every((m) => m === 1));
  const s = play(emptyBoard(), 40, BLACK);
  assert.equal(legalMoves(s)[40], 0);
  assert.equal(legalMoves(s)[0], 1);
});

test("canonical: with white to move, white stones are +1 and black -1", () => {
  // Black (4,4), white (0,0), black (8,8) -> white to move.
  const s = fromMoves([[a(4, 4), BLACK], [a(0, 0), WHITE], [a(8, 8), BLACK]]);
  assert.equal(s.current, WHITE);
  const c = canonical(s);
  assert.equal(c[0][0], 1); // own (white) stone
  assert.equal(c[4][4], -1); // black stone
  assert.equal(c[8][8], -1);
});

test("encode: three planes [own, opp, color] from the mover's perspective", () => {
  // Black to move: own plane = black stones, color plane = 1.
  const sB = fromMoves([[a(4, 4), BLACK], [a(0, 0), WHITE]]);
  assert.equal(sB.current, BLACK);
  const eB = encode(sB);
  assert.equal(eB.length, 3);
  assert.equal(eB[0][4][4], 1); // own (black)
  assert.equal(eB[0][0][0], 0);
  assert.equal(eB[1][0][0], 1); // opponent (white)
  assert.equal(eB[1][4][4], 0);
  assert.ok(eB[2].every((row) => row.every((v) => v === 1))); // black to move
  // White to move: own plane = white stones, color plane = 0.
  const sW = play(sB, a(8, 8), BLACK);
  const eW = encode(sW);
  assert.equal(eW[0][0][0], 1); // own (white)
  assert.equal(eW[1][8][8], 1); // opponent (black)
  assert.ok(eW[2].every((row) => row.every((v) => v === 0))); // white to move
});

test("dihedral k=0 is identity and k=1 follows np.rot90 CCW", () => {
  const m = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  m[0][0] = 1; // (y,x) = (0,0)
  m[1][0] = 1; // (y,x) = (1,0)
  assert.deepEqual(dihedral(m, 0), m);
  // np.rot90 once (CCW): r[y][x] = m[x][8-y]  =>  (0,0)->(8,0), (1,0)->(8,1)
  const r = dihedral(m, 1);
  assert.equal(r[8][0], 1);
  assert.equal(r[8][1], 1);
  const sum = (g: number[][]) => g.flat().reduce((s, v) => s + v, 0);
  assert.equal(sum(r), 2);
  assert.throws(() => dihedral(m, 8));
  assert.throws(() => dihedral(m, -1));
});

test("dihedral k=4 is a pure left-right mirror", () => {
  const m = Array.from({ length: 9 }, () => new Array<number>(9).fill(0));
  m[0][1] = 1;
  m[2][7] = 1;
  const r = dihedral(m, 4);
  assert.equal(r[0][7], 1); // x -> 8 - x, row unchanged
  assert.equal(r[2][1], 1);
  assert.equal(r[0][1], 0);
});

test("dihedralPi moves mass consistently with dihedral", () => {
  const pi = new Array(81).fill(0);
  pi[0] = 1; // (y,x) = (0,0)
  const t = dihedralPi(pi, 1);
  assert.equal(t.length, 81);
  assert.equal(t.reduce((s, v) => s + v, 0), 1); // mass preserved
  assert.equal(t[8 * 9 + 0], 1); // (8,0), same target as dihedral k=1
  assert.equal(t.filter((v) => v !== 0).length, 1);
  // Cross-check against dihedral on the reshaped grid for every k.
  for (let k = 0; k < 8; k++) {
    const p = new Array(81).fill(0);
    p[3] = 0.25; // (y,x) = (0,3)
    p[9 + 5] = 0.75; // (1,5)
    const got = dihedralPi(p, k);
    const grid: number[][] = Array.from({ length: 9 }, (_, y) => p.slice(y * 9, y * 9 + 9));
    const want = dihedral(grid, k).flat();
    assert.deepEqual(got, want, `k=${k}`);
  }
});
