"""Iteration main loop. Contract: PLAN.md §4.9 (flow) and §6 (artifacts)."""
from __future__ import annotations

import os
import time

import numpy as np
import torch

from .arena import play_match
from .config import Config
from .model import (AlphaGomokuNet, Predictor, load_checkpoint, pick_device,
                    save_checkpoint)
from .replay import ReplayBuffer
from .selfplay import play_games, record_idx, strip_samples
from .storage import RunStorage
from .train import make_optimizer, train_step

_STATUS_HEARTBEAT_SEC = 2.0


def _metrics_tail(storage: RunStorage) -> dict:
    rows = storage.read_metrics(tail=1)
    return rows[-1] if rows else {}


def run(cfg: Config, storage: RunStorage, max_iterations: int | None = None) -> None:
    cfg.validate()
    device = pick_device(cfg.device)
    torch.manual_seed(cfg.seed)
    rng = np.random.default_rng(cfg.seed)

    net = AlphaGomokuNet(cfg.board_size, cfg.net_channels, cfg.net_res_blocks)
    iteration = 0
    latest_path = storage.checkpoint_path("latest")
    if latest_path.exists():
        net, meta = load_checkpoint(str(latest_path), device)
        iteration = int(meta.get("iteration", -1)) + 1
        storage.append_event("log", {"level": "info",
                                     "message": f"resumed from latest.pt, next iteration {iteration}"})

    buffer = ReplayBuffer(cfg.buffer_size, cfg.board_size)
    if storage.buffer_path.exists():
        try:
            buffer.load(storage.buffer_path)
        except (OSError, ValueError) as e:
            storage.append_event("log", {"level": "warn", "message": f"buffer load failed: {e}"})

    if not storage.checkpoint_path("baseline").exists():
        save_checkpoint(net, cfg.to_dict(), str(storage.checkpoint_path("baseline")),
                        meta={"iteration": -1, "note": "frozen random init"})

    tail = _metrics_tail(storage)
    best_iteration = int(tail.get("best_iteration", -1))
    games_total = int(tail.get("games_total", 0))
    samples_total = int(tail.get("samples_total", 0))

    optimizer = make_optimizer(net, cfg)
    pid = os.getpid()

    def write_status(state: str, phase: str, progress: float = 0.0) -> None:
        storage.write_status({
            "state": state,
            "iteration": iteration,
            "iteration_phase": phase,
            "progress": round(progress, 4),
            "games_done": games_total,
            "samples": samples_total,
            "buffer": len(buffer),
            "best_iteration": best_iteration,
            "board_size": cfg.board_size,
            "win_len": cfg.win_len,
            "device": device,
            "pid": pid,
        })

    storage.append_event("log", {"level": "info", "message":
        f"trainer started (device={device}, board={cfg.board_size}x{cfg.board_size}, "
        f"win={cfg.win_len}, sims={cfg.mcts_simulations})"})

    try:
        while True:
            # ---------------- control ----------------
            cmd = storage.read_control()
            if cmd == "stop":
                break
            if cmd == "pause":
                write_status("paused", "idle")
                storage.append_event("status", {"state": "paused"})
                while storage.read_control() == "pause":
                    time.sleep(1.0)
                    write_status("paused", "idle")
                if storage.read_control() == "stop":
                    break
                storage.append_event("status", {"state": "running"})
            if max_iterations is not None and iteration >= max_iterations:
                break

            # ---------------- self-play ----------------
            t0 = time.time()
            write_status("running", "selfplay", 0.0)
            storage.append_event("iteration_start", {"iteration": iteration})
            predictor = Predictor(net, device)
            # seed mixes in games_total: a rerun after a mid-selfplay stop must
            # NOT replay identical games (their samples are already in the pool)
            iter_rng = np.random.default_rng(cfg.seed * 1_000_003 + iteration * 97 + games_total)
            last_heartbeat = [time.time()]

            def heartbeat(phase: str, progress: float) -> None:
                if time.time() - last_heartbeat[0] > _STATUS_HEARTBEAT_SEC:
                    last_heartbeat[0] = time.time()
                    write_status("running", phase, progress)

            def emit_progress(slot, it, gid, game, move_rec):
                storage.append_event("game_progress", {
                    "slot": slot, "iteration": it, "game_id": gid,
                    "board": game.board.reshape(-1).tolist(),
                    "last_move": game.last_move,
                    "move_count": game.move_count,
                    "player_to_move": game.current_player,
                    "pi_top5": move_rec["top"],
                    "value": move_rec["value"],
                })

            def on_progress(slot, it, gid, game, move_rec):
                emit_progress(slot, it, gid, game, move_rec)
                heartbeat("selfplay", done_count[0] / cfg.games_per_iteration)

            def on_arena_progress(slot, it, gid, game, move_rec):
                emit_progress(slot, it, gid, game, move_rec)
                heartbeat("arena", 0.0)

            done_count = [0]

            def on_game_end(rec):
                done_count[0] += 1
                storage.append_event("game_end", {
                    "game_id": rec["id"], "kind": "selfplay", "iteration": iteration,
                    "result": rec["result"], "moves": len(rec["moves"]), "first_player": 1,
                })

            def should_stop() -> bool:
                return storage.read_control() == "stop"

            records = play_games(
                predictor, cfg, cfg.games_per_iteration, iteration, iter_rng,
                kind="selfplay", id_prefix="sp",
                on_progress=on_progress, on_game_end=on_game_end,
                should_stop=should_stop,
            )
            new_samples = 0
            for rec in records:
                rec["meta"]["black"] = rec["meta"]["white"] = f"iter{iteration}"
                storage.write_game("selfplay", iteration, record_idx(rec), strip_samples(rec))
                buffer.add_many(rec["samples"])
                new_samples += len(rec["samples"])
            games_total += len(records)
            samples_total += new_samples
            buffer.save(storage.buffer_path)
            sec_selfplay = time.time() - t0
            stopped_mid = storage.read_control() == "stop"

            # ---------------- train ----------------
            t1 = time.time()
            avg = None
            if not stopped_mid and len(buffer) >= cfg.min_buffer:
                write_status("running", "train")
                acc = []
                for i in range(cfg.train_steps):
                    acc.append(train_step(net, optimizer, buffer.sample(cfg.batch_size, rng),
                                          device, rng))
                    heartbeat("train", (i + 1) / cfg.train_steps)
                avg = {k: sum(a[k] for a in acc) / len(acc) for k in acc[0]}
                storage.append_event("train_end", {
                    "iteration": iteration, "loss": avg["loss"],
                    "policy_loss": avg["policy_loss"], "value_loss": avg["value_loss"],
                    "buffer": len(buffer),
                })
            elif not stopped_mid:
                storage.append_event("log", {"level": "info",
                                             "message": f"buffer warming up: {len(buffer)}/{cfg.min_buffer}"})
            sec_train = time.time() - t1
            if stopped_mid:
                break

            # NOTE: latest.pt / iter_XXXXXX.pt are saved AFTER append_metrics
            # below, so a checkpoint's meta.iteration can never exceed the
            # metrics tail — kill -9 mid-arena then resumes from `iteration`
            # instead of silently skipping it.

            # ---------------- arena ----------------
            arena_best = None
            arena_base = None
            if cfg.arena_enabled and iteration % cfg.arena_every == 0:
                write_status("running", "arena")
                challenger = Predictor(net, device)
                best_path = storage.checkpoint_path("best")
                if best_path.exists():
                    champ_net, _ = load_checkpoint(str(best_path), device)
                    res = play_match(challenger, Predictor(champ_net, device), cfg,
                                     iteration, iter_rng, storage=storage, opponent="best",
                                     on_progress=on_arena_progress)
                    promoted = res["win_rate_a"] >= cfg.promote_threshold
                    if promoted:
                        save_checkpoint(net, cfg.to_dict(), str(best_path),
                                        meta={"iteration": iteration})
                        best_iteration = iteration
                    arena_best = {"win_rate_a": res["win_rate_a"], "wins_a": res["wins_a"],
                                  "wins_b": res["wins_b"], "draws": res["draws"],
                                  "promoted": promoted}
                    storage.append_event("arena_end", {
                        "iteration": iteration, "opponent": "best",
                        "win_rate": res["win_rate_a"], "wins": res["wins_a"],
                        "losses": res["wins_b"], "draws": res["draws"], "promoted": promoted,
                    })
                else:
                    save_checkpoint(net, cfg.to_dict(), str(best_path),
                                    meta={"iteration": iteration})
                    best_iteration = iteration
                    storage.append_event("log", {"level": "info", "message":
                        f"iteration {iteration}: no champion yet, latest promoted to best"})
                base_net, _ = load_checkpoint(str(storage.checkpoint_path("baseline")), device)
                res_b = play_match(challenger, Predictor(base_net, device), cfg,
                                   iteration, iter_rng, storage=storage, opponent="baseline",
                                   on_progress=on_arena_progress)
                arena_base = {"win_rate_a": res_b["win_rate_a"], "wins_a": res_b["wins_a"],
                              "wins_b": res_b["wins_b"], "draws": res_b["draws"],
                              "promoted": False}
                storage.append_event("arena_end", {
                    "iteration": iteration, "opponent": "baseline",
                    "win_rate": res_b["win_rate_a"], "wins": res_b["wins_a"],
                    "losses": res_b["wins_b"], "draws": res_b["draws"], "promoted": False,
                })

            # ---------------- metrics / status ----------------
            storage.append_metrics({
                "iteration": iteration,
                "loss": avg["loss"] if avg else None,
                "policy_loss": avg["policy_loss"] if avg else None,
                "value_loss": avg["value_loss"] if avg else None,
                "policy_entropy": avg["policy_entropy"] if avg else None,
                "lr": avg["lr"] if avg else cfg.lr,
                "games": len(records),
                "games_total": games_total,
                "samples": new_samples,
                "samples_total": samples_total,
                "buffer": len(buffer),
                "sec_selfplay": round(sec_selfplay, 2),
                "sec_train": round(sec_train, 2),
                "arena_vs_best": arena_best,
                "arena_vs_baseline": arena_base,
                "best_iteration": best_iteration,
                "ts": time.time(),
            })
            # checkpoints only after metrics: meta.iteration <= metrics tail
            save_checkpoint(net, cfg.to_dict(), str(latest_path), meta={"iteration": iteration})
            if iteration % cfg.keep_checkpoint_every == 0:
                save_checkpoint(net, cfg.to_dict(),
                                str(storage.checkpoint_path(f"iter_{iteration:06d}")),
                                meta={"iteration": iteration})
            write_status("running", "idle")
            iteration += 1
    except KeyboardInterrupt:
        storage.append_event("log", {"level": "warn", "message": "interrupted by user"})
    finally:
        buffer.save(storage.buffer_path)
        save_checkpoint(net, cfg.to_dict(), str(latest_path),
                        meta={"iteration": max(iteration - 1, -1)})
        write_status("stopped", "idle")
        storage.append_event("status", {"state": "stopped"})
