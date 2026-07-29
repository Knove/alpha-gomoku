"""Batched-parallel self-play / match driver. Contract: PLAN.md §4.5.

Multiple games advance in lockstep: every simulation round each active
SearchTree performs one select(); all pending leaves are grouped by their
side-to-move's network and evaluated in a single batched forward pass.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

from .config import Config
from .game import Game
from .mcts import SearchTree
from .model import Predictor


@dataclass
class _Slot:
    idx: int                 # slot index (stable across games within the call)
    game_idx: int            # game index within this call
    game_id: str
    game: Game
    tree: SearchTree
    nets: dict               # {1: Predictor, -1: Predictor}
    black_name: str
    white_name: str
    moves: list = field(default_factory=list)
    samples: list = field(default_factory=list)


def strip_samples(record: dict) -> dict:
    """JSON-safe copy of a game record (drops the numpy training samples)."""
    return {k: v for k, v in record.items() if k != "samples"}


def record_idx(record: dict) -> int:
    """Trailing index of a game id like 'sp_000012_003' -> 3."""
    return int(record["id"].rsplit("_", 1)[1])


def _finalize(slot: _Slot, cfg: Config, iteration: int, kind: str) -> dict:
    result = slot.game.outcome()
    assert result is not None
    samples = []
    for canon, pi, player in slot.samples:
        z = 0 if result == 0 else (1 if player == result else -1)
        samples.append((canon, pi, player, np.int8(z)))
    return {
        "id": slot.game_id,
        "kind": kind,
        "iteration": iteration,
        "board_size": cfg.board_size,
        "win_len": cfg.win_len,
        "created_at": time.time(),
        "result": result,
        "first_player": 1,
        "meta": {"opponent": None, "black": slot.black_name, "white": slot.white_name},
        "moves": slot.moves,
        "samples": samples,
    }


def play_games(
    predictor: Predictor | None,
    cfg: Config,
    num_games: int,
    iteration: int,
    rng: np.random.Generator,
    *,
    kind: str = "selfplay",
    id_prefix: str = "sp",
    add_noise: bool = True,
    simulations: int | None = None,
    sample_temperature: bool = True,
    temp_threshold: int | None = None,   # override cfg.temp_threshold
    net_assign=None,       # fn(game_idx) -> (nets, black_name, white_name); default: predictor on both sides
    on_progress=None,      # fn(slot_idx, iteration, game_id, game, move_record)
    on_game_end=None,      # fn(record)  — record still carries "samples"
    should_stop=None,      # fn() -> bool; in-progress games are abandoned
) -> list[dict]:
    """Play `num_games` games; returns finalized records (with "samples")."""
    sims = simulations if simulations is not None else cfg.mcts_simulations
    temp_moves = temp_threshold if temp_threshold is not None else cfg.temp_threshold
    n = cfg.board_size
    completed: list[dict] = []
    next_idx = 0
    slots: list[_Slot] = []

    def start_game(slot_idx: int) -> _Slot:
        nonlocal next_idx
        gi = next_idx
        next_idx += 1
        game = Game(n, cfg.win_len)
        if net_assign is not None:
            nets, bn, wn = net_assign(gi)
        else:
            assert predictor is not None
            nets, bn, wn = {1: predictor, -1: predictor}, "self", "self"
        tree = SearchTree(game, cfg, add_noise=add_noise, rng=rng)
        gid = f"{id_prefix}_{iteration:06d}_{gi:03d}"
        return _Slot(slot_idx, gi, gid, game, tree, nets, bn, wn)

    for s in range(min(cfg.parallel_games, num_games)):
        slots.append(start_game(s))

    while slots:
        if should_stop is not None and should_stop():
            break
        # --- one search round per active game, batched across games ---
        for _ in range(sims):
            groups: dict[int, list[SearchTree]] = {}
            preds: dict[int, Predictor] = {}
            for s in slots:
                s.tree.select()
                if s.tree.needs_eval():
                    p = s.nets[s.tree.leaf_player]
                    groups.setdefault(id(p), []).append(s.tree)
                    preds[id(p)] = p
            for pid, trees in groups.items():
                batch = np.stack([t.leaf_input() for t in trees])
                probs, values = preds[pid].predict(batch)
                for t, prob, val in zip(trees, probs, values):
                    t.expand_and_backup(prob, float(val))
        # --- pick a move in every game ---
        finished: list[_Slot] = []
        for s in slots:
            pi = s.tree.root_pi(temperature=1.0)
            if sample_temperature and s.game.move_count < temp_moves:
                a = int(rng.choice(n * n, p=pi / pi.sum()))
            else:
                a = s.tree.best_action()
            # training sample: canonical position BEFORE the move
            s.samples.append((s.game.canonical_board().astype(np.int8),
                              pi.astype(np.float32), np.int8(s.game.current_player)))
            y, x = divmod(a, n)
            s.moves.append({
                "n": s.game.move_count, "x": x, "y": y, "player": s.game.current_player,
                "value": round(float(s.tree.root_value()), 4),
                "pi": [round(float(v), 4) for v in pi],
                "top": s.tree.top_actions(5),
            })
            s.tree.update_root(a)
            s.game.play(a)
            if on_progress is not None:
                on_progress(s.idx, iteration, s.game_id, s.game, s.moves[-1])
            if s.game.outcome() is not None:
                finished.append(s)
        for s in finished:
            rec = _finalize(s, cfg, iteration, kind)
            completed.append(rec)
            if on_game_end is not None:
                on_game_end(rec)
            slots.remove(s)
            if next_idx < num_games:
                slots.append(start_game(s.idx))
    return completed
