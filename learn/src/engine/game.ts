// Gomoku rules engine, mirroring alphagomoku/game.py (contract: PLAN.md §4.2).
// Pure functions: every transition returns a new GameState, never mutates input.
// Board is fixed 9x9; actions are ints in [0, 81): a = y * 9 + x.
// board[y][x]: 0 empty, 1 black, -1 white. Black moves first.

export const BLACK = 1,
  WHITE = -1,
  EMPTY = 0;

export interface GameState {
  board: number[][]; // [y][x] 0/1/-1
  current: 1 | -1;
  winner: number; // 0 unfinished; 1 black; -1 white; draw = winner==0 && moveCount==81
  moveCount: number;
  lastMove: number | null;
}

const N = 9;
const WIN_LEN = 5;
// (dy, dx) pairs, same set as game.py _DIRS.
const DIRS: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
];

export function emptyBoard(): GameState {
  return {
    board: Array.from({ length: N }, () => new Array<number>(N).fill(0)),
    current: BLACK,
    winner: 0,
    moveCount: 0,
    lastMove: null,
  };
}

export function play(s: GameState, action: number, player: 1 | -1): GameState {
  if (!Number.isInteger(action) || action < 0 || action >= N * N)
    throw new RangeError(`action ${action} out of range [0, ${N * N})`);
  if (s.winner !== EMPTY) throw new Error("game is already finished");
  if (player !== s.current)
    throw new Error(`out of turn: current player is ${s.current}, got ${player}`);
  const y = Math.floor(action / N),
    x = action % N;
  if (s.board[y][x] !== EMPTY) throw new Error(`square (${x}, ${y}) is occupied`);

  const board = s.board.map((row) => row.slice());
  board[y][x] = player;
  return {
    board,
    current: (-player) as 1 | -1,
    winner: isWinAt(board, y, x) ? player : 0,
    moveCount: s.moveCount + 1,
    lastMove: action,
  };
}

function countDir(board: number[][], y: number, x: number, dy: number, dx: number, p: number): number {
  let c = 0,
    yy = y + dy,
    xx = x + dx;
  while (0 <= yy && yy < N && 0 <= xx && xx < N && board[yy][xx] === p) {
    c++;
    yy += dy;
    xx += dx;
  }
  return c;
}

/** Win check reads only the last move (game.py _is_win_at). */
function isWinAt(board: number[][], y: number, x: number): boolean {
  const p = board[y][x];
  for (const [dy, dx] of DIRS) {
    if (1 + countDir(board, y, x, dy, dx, p) + countDir(board, y, x, -dy, -dx, p) >= WIN_LEN)
      return true;
  }
  return false;
}

/** null if unfinished; 1 black wins; -1 white wins; 0 draw (full board). */
export function outcome(s: GameState): number | null {
  if (s.winner !== EMPTY) return s.winner;
  if (s.moveCount >= N * N) return 0;
  return null;
}

/** 81-length 0/1 mask; all 0 once the game is over. */
export function legalMoves(s: GameState): number[] {
  if (s.winner !== EMPTY || s.moveCount >= N * N) return new Array<number>(N * N).fill(0);
  const mask = new Array<number>(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) mask[y * N + x] = s.board[y][x] === EMPTY ? 1 : 0;
  return mask;
}

/** Board from the perspective of the player to move (own stones = 1). */
export function canonical(s: GameState): number[][] {
  // Guard the 0 case: 0 * -1 is -0 in JS, which strict deep-equal treats as != 0.
  return s.board.map((row) => row.map((v) => (v === 0 ? 0 : v * s.current)));
}

/** [own, opponent, color] planes, 3x9x9; color plane is 1 iff black is to move. */
export function encode(s: GameState): number[][][] {
  const c = canonical(s);
  const own = c.map((row) => row.map((v) => (v === 1 ? 1 : 0)));
  const opp = c.map((row) => row.map((v) => (v === -1 ? 1 : 0)));
  const color = s.current === BLACK ? 1 : 0;
  return [own, opp, Array.from({ length: N }, () => new Array<number>(N).fill(color))];
}

/** np.rot90 once, CCW: r[y][x] = m[x][n-1-y]. */
function rot90(m: number[][]): number[][] {
  const n = m.length;
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => m[x][n - 1 - y]),
  );
}

/** Symmetry k in [0,8): k%4 CCW quarter-turns, then a left-right mirror if k>=4. */
export function dihedral(x: number[][], k: number): number[][] {
  if (!Number.isInteger(k) || k < 0 || k >= 8) throw new RangeError(`k must be in [0, 8), got ${k}`);
  let y = x.map((row) => row.slice());
  for (let i = 0; i < k % 4; i++) y = rot90(y);
  if (k >= 4) y = y.map((row) => row.slice().reverse());
  return y;
}

/** Transform a flat 81 policy with the same symmetry k. */
export function dihedralPi(pi: number[], k: number): number[] {
  const grid: number[][] = Array.from({ length: N }, (_, y) => pi.slice(y * N, y * N + N));
  return dihedral(grid, k).flat();
}
