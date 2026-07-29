"""Policy-value ResNet. Contract: PLAN.md §4.4."""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class ResBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(x + h)


class AlphaGomokuNet(nn.Module):
    """Input (B, 3, N, N) -> (policy logits (B, N*N), value (B,))."""

    def __init__(self, board_size: int, channels: int, res_blocks: int):
        super().__init__()
        self.n = board_size
        self.channels = channels
        self.res_blocks = res_blocks
        self.stem = nn.Sequential(
            nn.Conv2d(3, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )
        self.blocks = nn.Sequential(*[ResBlock(channels) for _ in range(res_blocks)])
        # policy head
        self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)
        self.p_bn = nn.BatchNorm2d(2)
        self.p_fc = nn.Linear(2 * self.n * self.n, self.n * self.n)
        # value head
        self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)
        self.v_bn = nn.BatchNorm2d(1)
        self.v_fc1 = nn.Linear(self.n * self.n, 64)
        self.v_fc2 = nn.Linear(64, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.blocks(self.stem(x))
        p = F.relu(self.p_bn(self.p_conv(h)))
        p = self.p_fc(p.reshape(-1, 2 * self.n * self.n))
        v = F.relu(self.v_bn(self.v_conv(h)))
        v = F.relu(self.v_fc1(v.reshape(-1, self.n * self.n)))
        v = torch.tanh(self.v_fc2(v)).squeeze(-1)
        return p, v


def pick_device(name: str = "auto") -> str:
    if name != "auto":
        return name
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Predictor:
    """numpy in / numpy out inference wrapper (no_grad, eval mode)."""

    def __init__(self, net: AlphaGomokuNet, device: str = "cpu"):
        self.net = net
        self.device = torch.device(device)
        self.net.to(self.device)
        self.net.eval()

    @torch.no_grad()
    def predict(self, inputs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """inputs (B, 3, N, N) float32 -> (probs (B, N*N), values (B,))."""
        x = torch.from_numpy(np.ascontiguousarray(inputs, dtype=np.float32)).to(self.device)
        logits, v = self.net(x)
        probs = torch.softmax(logits, dim=-1)
        return probs.cpu().numpy().astype(np.float32), v.cpu().numpy().astype(np.float32)


def save_checkpoint(net: AlphaGomokuNet, cfg_dict: dict, path: str, meta: dict | None = None) -> None:
    """Atomic checkpoint write (tmp file + rename): the server process may read
    the same path at any moment, and a torn torch.save would corrupt it."""
    import os

    tmp = f"{path}.tmp"
    torch.save(
        {
            "state_dict": net.state_dict(),
            "config": {
                "board_size": net.n,
                "channels": net.channels,
                "res_blocks": net.res_blocks,
            },
            "train_config": cfg_dict,
            "meta": meta or {},
        },
        tmp,
    )
    os.replace(tmp, path)


def load_checkpoint(path: str, device: str = "cpu") -> tuple[AlphaGomokuNet, dict]:
    ckpt = torch.load(path, map_location="cpu", weights_only=True)
    c = ckpt["config"]
    net = AlphaGomokuNet(c["board_size"], c["channels"], c["res_blocks"])
    net.load_state_dict(ckpt["state_dict"])
    net.to(device)
    net.eval()
    return net, ckpt.get("meta", {})
