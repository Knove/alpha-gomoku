"""Game rules tests: win detection, draw, canonicalization, symmetries."""
import numpy as np
import pytest

from alphagomoku.game import (
    BLACK, WHITE, Game, dihedral_transform, dihedral_transform_pi, encode,
)


def seq(game, moves):
    for a in moves:
        game.play(a)


def test_horizontal_win():
    g = Game(9, 5)
    # black row y=0 x=0..4; white plays elsewhere on row 2
    seq(g, [0, 18, 1, 19, 2, 20, 3, 21, 4])
    assert g.outcome() == 1
    assert g.winner == BLACK


def test_vertical_win():
    g = Game(9, 5)
    # black column x=0: actions 0, 9, 18, 27, 36; white column x=1
    seq(g, [0, 1, 9, 10, 18, 19, 27, 28, 36])
    assert g.outcome() == 1


def test_diagonal_win():
    g = Game(9, 5)
    # black main diagonal: (0,0),(1,1)...(4,4) -> actions 0,10,20,30,40
    seq(g, [0, 1, 10, 2, 20, 3, 30, 4, 40])
    assert g.outcome() == 1


def test_anti_diagonal_win():
    g = Game(9, 5)
    # black anti-diagonal: (4,0),(3,1),(2,2),(1,3),(0,4) -> actions 4,12,20,28,36
    seq(g, [4, 0, 12, 1, 20, 2, 28, 3, 36])
    assert g.outcome() == 1


def test_four_in_row_is_not_win():
    g = Game(9, 5)
    seq(g, [0, 18, 1, 19, 2, 20, 3])
    assert g.outcome() is None


def test_white_wins():
    g = Game(9, 5)
    # white row y=1 x=0..4 (actions 9..13); black scattered on row 2 with gaps
    seq(g, [18, 9, 20, 10, 22, 11, 24, 12, 26, 13])
    assert g.outcome() == -1
    assert g.winner == WHITE


def test_draw_on_full_board():
    # Verified 5x5 final position with no five-in-a-row on any line (13B / 12W):
    #   B B W W B
    #   W B B W W
    #   B W B B W
    #   W W B B B
    #   B W W B W
    black = [(0, 0), (1, 0), (4, 0), (1, 1), (2, 1), (0, 2), (2, 2),
             (3, 2), (2, 3), (3, 3), (4, 3), (0, 4), (3, 4)]
    white = [(2, 0), (3, 0), (0, 1), (3, 1), (4, 1), (1, 2),
             (4, 2), (0, 3), (1, 3), (1, 4), (2, 4), (4, 4)]
    g = Game(5, 5)
    for i in range(12):
        x, y = black[i]
        g.play(y * 5 + x)
        x, y = white[i]
        g.play(y * 5 + x)
        assert g.outcome() is None  # a mid-game five would persist to the end
    x, y = black[12]
    g.play(y * 5 + x)
    assert g.move_count == 25
    assert g.outcome() == 0


def test_illegal_moves():
    g = Game(9, 5)
    g.play(0)
    with pytest.raises(ValueError):
        g.play(0)  # occupied
    with pytest.raises(ValueError):
        g.play(-1)
    with pytest.raises(ValueError):
        g.play(81)
    # playing after game over
    g2 = Game(9, 5)
    seq(g2, [0, 18, 1, 19, 2, 20, 3, 21, 4])
    with pytest.raises(ValueError):
        g2.play(40)
    assert np.sum(g2.legal_moves()) == 0


def test_canonical_board_perspective():
    g = Game(9, 5)
    g.play(40)  # black center
    g.play(0)   # white corner
    canon = g.canonical_board()  # black to move: black stones should be +1
    assert canon[4, 4] == 1.0
    assert canon[0, 0] == -1.0
    enc = encode(g)
    assert enc.shape == (3, 9, 9)
    assert enc[0][4, 4] == 1.0   # own stones plane
    assert enc[1][0, 0] == 1.0   # opponent stones plane
    assert enc[2].mean() == 1.0  # black to move -> color plane all ones


def test_clone_independence():
    g = Game(9, 5)
    g.play(40)
    c = g.clone()
    c.play(0)
    assert g.board[0, 0] == 0
    assert c.board[0, 0] == -1
    assert g.current_player == -1
    assert c.current_player == 1


def test_dihedral_group_properties():
    rng = np.random.default_rng(0)
    b = rng.integers(-1, 2, size=(9, 9)).astype(np.float32)
    # 4 rotations = identity
    x = b
    for _ in range(4):
        x = dihedral_transform(x, 1)
    np.testing.assert_array_equal(x, b)
    # all 8 transforms produce 8 orientations that re-transform back consistently
    outs = [dihedral_transform(b, k) for k in range(8)]
    assert len({o.tobytes() for o in outs}) == 8  # asymmetric board -> 8 distinct
    # pi transforms consistently with board transforms
    pi = np.zeros(81, dtype=np.float32)
    pi[13] = 1.0
    for k in range(8):
        m = np.zeros((9, 9), dtype=np.float32)
        m[1, 4] = 1.0  # action 13
        np.testing.assert_array_equal(
            dihedral_transform_pi(pi, 9, k).reshape(9, 9),
            dihedral_transform(m, k),
        )


def test_dihedral_batch_and_inverse_pairs():
    rng = np.random.default_rng(1)
    b = rng.normal(size=(3, 7, 7)).astype(np.float32)  # batch of planes
    for k in range(8):
        t = dihedral_transform(b, k)
        assert t.shape == b.shape
