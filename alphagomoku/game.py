"""Gomoku (five-in-a-row) game rules. Contract: PLAN.md §4.2."""
from __future__ import annotations

import numpy as np

EMPTY, BLACK, WHITE = 0, 1, -1
_DIRS = ((1, 0), (0, 1), (1, 1), (1, -1))


class Game:
    """Mutable game state. Actions are ints in [0, n*n): a = y*n + x.

    board[y, x]: 0 empty, 1 black, -1 white. Black moves first.
    """

    __slots__ = ("n", "win_len", "board", "_current", "_last_move", "_move_count", "_winner")

    def __init__(self, board_size: int, win_len: int):
        self.n = board_size
        self.win_len = win_len
        self.board = np.zeros((self.n, self.n), dtype=np.int8)
        self._current = BLACK
        self._last_move: int | None = None
        self._move_count = 0
        self._winner = EMPTY

    @property
    def current_player(self) -> int:
        return self._current

    @property
    def last_move(self) -> int | None:
        return self._last_move

    @property
    def move_count(self) -> int:
        return self._move_count

    @property
    def winner(self) -> int:
        return self._winner

    def legal_moves(self) -> np.ndarray:
        """(n*n,) float32 mask, 1.0 = legal."""
        if self._winner != EMPTY or self._move_count >= self.n * self.n:
            return np.zeros(self.n * self.n, dtype=np.float32)
        return (self.board.reshape(-1) == EMPTY).astype(np.float32)

    def play(self, action: int) -> None:
        n = self.n
        if not 0 <= action < n * n:
            raise ValueError(f"action {action} out of range [0, {n * n})")
        if self._winner != EMPTY:
            raise ValueError("game is already finished")
        y, x = divmod(action, n)
        if self.board[y, x] != EMPTY:
            raise ValueError(f"square ({x}, {y}) is occupied")
        self.board[y, x] = self._current
        self._last_move = action
        self._move_count += 1
        if self._is_win_at(y, x):
            self._winner = self._current
        self._current = -self._current

    def _count_dir(self, y: int, x: int, dy: int, dx: int, p: int) -> int:
        c = 0
        yy, xx = y + dy, x + dx
        while 0 <= yy < self.n and 0 <= xx < self.n and self.board[yy, xx] == p:
            c += 1
            yy += dy
            xx += dx
        return c

    def _is_win_at(self, y: int, x: int) -> bool:
        p = self.board[y, x]
        for dx, dy in _DIRS:
            if 1 + self._count_dir(y, x, dy, dx, p) + self._count_dir(y, x, -dy, -dx, p) >= self.win_len:
                return True
        return False

    def outcome(self) -> int | None:
        """None if unfinished; 1 black wins; -1 white wins; 0 draw (full board)."""
        if self._winner != EMPTY:
            return int(self._winner)
        if self._move_count >= self.n * self.n:
            return 0
        return None

    def is_terminal(self) -> bool:
        return self.outcome() is not None

    def canonical_board(self) -> np.ndarray:
        """Board from the perspective of the player to move (own stones = 1)."""
        return (self.board * self._current).astype(np.float32)

    def clone(self) -> "Game":
        g = Game.__new__(Game)
        g.n = self.n
        g.win_len = self.win_len
        g.board = self.board.copy()
        g._current = self._current
        g._last_move = self._last_move
        g._move_count = self._move_count
        g._winner = self._winner
        return g

    def __repr__(self) -> str:
        return f"Game(n={self.n}, moves={self._move_count}, to_move={self._current}, winner={self._winner})"


def encode(game: Game) -> np.ndarray:
    """(3, n, n) float32: current player's stones, opponent's stones, color plane."""
    canon = game.canonical_board()
    cur = (canon == 1).astype(np.float32)
    opp = (canon == -1).astype(np.float32)
    color = np.full_like(cur, 1.0 if game.current_player == BLACK else 0.0)
    return np.stack([cur, opp, color])


def dihedral_transform(x: np.ndarray, k: int) -> np.ndarray:
    """Apply symmetry k in [0, 8) of the square to the last two dims of x."""
    if not 0 <= k < 8:
        raise ValueError(f"k must be in [0, 8), got {k}")
    y = np.rot90(x, k % 4, axes=(-2, -1))
    if k >= 4:
        y = np.flip(y, axis=-1)
    return np.ascontiguousarray(y)


def dihedral_transform_pi(pi: np.ndarray, n: int, k: int) -> np.ndarray:
    """Transform a flat (n*n,) policy with the same symmetry k."""
    return dihedral_transform(pi.reshape(n, n), k).reshape(-1)
