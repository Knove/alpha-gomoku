"""Arena: challenger vs champion/baseline matches. Contract: PLAN.md §4.8."""
from __future__ import annotations

import numpy as np

from .config import Config
from .model import Predictor
from .selfplay import play_games, record_idx, strip_samples
from .storage import RunStorage


def play_match(
    pred_a: Predictor,
    pred_b: Predictor,
    cfg: Config,
    iteration: int,
    rng: np.random.Generator,
    *,
    storage: RunStorage | None = None,
    opponent: str = "best",
    name_a: str = "challenger",
    name_b: str | None = None,
    on_progress=None,
) -> dict:
    """A (challenger) plays B over cfg.arena_games games, alternating colors.

    No Dirichlet noise, but the opening moves (half of temp_threshold) are
    sampled from the visit distribution — otherwise deterministic play makes
    same-color games move-for-move identical (review finding: 10 games
    degenerated into 2). Returns {wins_a, wins_b, draws, win_rate_a, games};
    win_rate_a counts draws as half.
    """
    name_b = name_b or opponent
    # id prefix encodes the opponent so vs-best and vs-baseline records coexist
    id_prefix = "ab" if opponent == "baseline" else "ar"

    def net_assign(gi: int):
        if gi % 2 == 0:
            return ({1: pred_a, -1: pred_b}, name_a, name_b)
        return ({1: pred_b, -1: pred_a}, name_b, name_a)

    on_end = None
    if storage is not None:
        def on_end(rec: dict) -> None:
            rec["meta"]["opponent"] = opponent
            storage.write_game("arena", iteration, record_idx(rec), strip_samples(rec))
            storage.append_event("game_end", {
                "game_id": rec["id"], "kind": "arena", "iteration": iteration,
                "result": rec["result"], "moves": len(rec["moves"]), "first_player": 1,
            })

    records = play_games(
        None, cfg, cfg.arena_games, iteration, rng,
        kind="arena", id_prefix=id_prefix,
        add_noise=False, simulations=cfg.arena_simulations,
        sample_temperature=True, temp_threshold=max(2, cfg.temp_threshold // 2),
        net_assign=net_assign,
        on_progress=on_progress, on_game_end=on_end,
    )
    wins_a = wins_b = draws = 0
    for rec in records:
        a_is_black = rec["meta"]["black"] == name_a
        r = rec["result"]
        if r == 0:
            draws += 1
        elif (r == 1) == a_is_black:
            wins_a += 1
        else:
            wins_b += 1
    total = max(len(records), 1)
    return {
        "wins_a": wins_a,
        "wins_b": wins_b,
        "draws": draws,
        "win_rate_a": (wins_a + 0.5 * draws) / total,
        "games": len(records),
    }
