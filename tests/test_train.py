"""Training tests: overfitting a fixed batch, metric sanity."""
import numpy as np

from alphagomoku.config import Config
from alphagomoku.model import AlphaGomokuNet
from alphagomoku.train import make_optimizer, train_step


def test_overfit_fixed_batch():
    cfg = Config.from_dict(dict(board_size=6, win_len=4, net_channels=16,
                                net_res_blocks=2, lr=0.05, weight_decay=0.0))
    net = AlphaGomokuNet(6, 16, 2)
    opt = make_optimizer(net, cfg)
    rng = np.random.default_rng(0)
    B = 64
    inputs = (rng.normal(size=(B, 3, 6, 6)) > 0).astype(np.float32)
    pis = np.zeros((B, 36), dtype=np.float32)
    pis[np.arange(B), rng.integers(0, 36, B)] = 1.0  # one-hot targets
    zs = rng.integers(-1, 2, size=B).astype(np.int8)
    batch = (inputs, pis, zs)

    first = train_step(net, opt, batch, "cpu", rng)
    last = first
    for _ in range(200):
        last = train_step(net, opt, batch, "cpu", rng)
    assert last["loss"] < 0.2 * first["loss"], (first["loss"], last["loss"])
    for k in ("loss", "policy_loss", "value_loss", "policy_entropy", "lr"):
        assert k in last and np.isfinite(last[k])


def test_train_step_metrics_finite_on_real_positions():
    """Batch from an actual tiny game flows through training without NaN."""
    from alphagomoku.replay import ReplayBuffer
    from alphagomoku.selfplay import play_games
    from alphagomoku.model import Predictor

    cfg = Config.from_dict(dict(board_size=6, win_len=4, mcts_simulations=4,
                                net_channels=16, net_res_blocks=2, buffer_size=100))
    pred = Predictor(AlphaGomokuNet(6, 16, 2), "cpu")
    rng = np.random.default_rng(3)
    records = play_games(pred, cfg, 1, iteration=0, rng=rng)
    buf = ReplayBuffer(100, 6)
    for rec in records:
        buf.add_many(rec["samples"])
    net = AlphaGomokuNet(6, 16, 2)
    opt = make_optimizer(net, cfg)
    m = train_step(net, opt, buf.sample(16, rng), "cpu", rng)
    assert np.isfinite(m["loss"])
