"""Model tests: shapes, value range, checkpoint round-trip."""
import numpy as np
import torch

from alphagomoku.model import AlphaGomokuNet, Predictor, load_checkpoint, save_checkpoint


def test_forward_shapes_and_ranges():
    net = AlphaGomokuNet(9, 16, 2)
    x = torch.randn(5, 3, 9, 9)
    p, v = net(x)
    assert p.shape == (5, 81)
    assert v.shape == (5,)
    assert torch.all(v <= 1.0) and torch.all(v >= -1.0)


def test_predictor_numpy_roundtrip():
    net = AlphaGomokuNet(9, 16, 2)
    pred = Predictor(net, "cpu")
    x = np.random.default_rng(0).normal(size=(4, 3, 9, 9)).astype(np.float32)
    probs, values = pred.predict(x)
    assert probs.shape == (4, 81)
    np.testing.assert_allclose(probs.sum(axis=-1), 1.0, atol=1e-5)
    assert values.shape == (4,)


def test_checkpoint_roundtrip(tmp_path):
    net = AlphaGomokuNet(9, 16, 2)
    path = tmp_path / "ck.pt"
    save_checkpoint(net, {"board_size": 9}, str(path), meta={"iteration": 3})
    net2, meta = load_checkpoint(str(path), "cpu")
    assert meta["iteration"] == 3
    x = torch.randn(2, 3, 9, 9)
    net.eval(); net2.eval()
    with torch.no_grad():
        p1, v1 = net(x)
        p2, v2 = net2(x)
    torch.testing.assert_close(p1, p2)
    torch.testing.assert_close(v1, v2)
