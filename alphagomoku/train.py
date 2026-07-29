"""Training step with 8-fold symmetry augmentation. Contract: PLAN.md §4.7."""
from __future__ import annotations

import numpy as np
import torch
import torch.nn.functional as F

from .config import Config
from .game import dihedral_transform, dihedral_transform_pi
from .model import AlphaGomokuNet


def make_optimizer(net: AlphaGomokuNet, cfg: Config) -> torch.optim.Optimizer:
    return torch.optim.SGD(
        net.parameters(),
        lr=cfg.lr,
        momentum=0.9,
        weight_decay=cfg.weight_decay,
        nesterov=True,
    )


def train_step(
    net: AlphaGomokuNet,
    optimizer: torch.optim.Optimizer,
    batch,
    device: str,
    rng: np.random.Generator,
) -> dict:
    """One SGD update on a batch from ReplayBuffer.sample(). Returns metrics."""
    inputs, pis, zs = batch
    B = inputs.shape[0]
    n = inputs.shape[-1]
    ks = rng.integers(0, 8, size=B)
    aug_in = np.empty_like(inputs)
    aug_pi = np.empty_like(pis)
    for i in range(B):
        k = int(ks[i])
        aug_in[i] = dihedral_transform(inputs[i], k)
        aug_pi[i] = dihedral_transform_pi(pis[i], n, k)

    x = torch.from_numpy(aug_in).to(device)
    target_pi = torch.from_numpy(aug_pi).to(device)
    target_z = torch.from_numpy(zs.astype(np.float32)).to(device)

    net.train()
    logits, v = net(x)
    value_loss = F.mse_loss(v, target_z)
    logp = F.log_softmax(logits, dim=-1)
    policy_loss = -(target_pi * logp).sum(dim=-1).mean()
    loss = value_loss + policy_loss

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    with torch.no_grad():
        entropy = -(logp.exp() * logp).sum(dim=-1).mean()
    return {
        "loss": float(loss.item()),
        "policy_loss": float(policy_loss.item()),
        "value_loss": float(value_loss.item()),
        "policy_entropy": float(entropy.item()),
        "lr": float(optimizer.param_groups[0]["lr"]),
    }
