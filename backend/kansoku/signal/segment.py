"""Sliding-window segmentation of raw accelerometer signals."""

from __future__ import annotations

import numpy as np

from kansoku.config import WINDOW_OVERLAP, WINDOW_SIZE


def segment(
    sig: np.ndarray, window: int = WINDOW_SIZE, overlap: float = WINDOW_OVERLAP
) -> np.ndarray:
    """Split a 1-D signal into overlapping windows.

    Returns shape (n_windows, window). Trailing samples that cannot fill a
    whole window are dropped rather than zero-padded: padding would inject
    artificial zeros into RMS and the FFT spectrum.
    """
    if not 0.0 <= overlap < 1.0:
        raise ValueError(f"overlap must be in [0, 1), got {overlap}")
    sig = np.asarray(sig, dtype=np.float64).ravel()
    if sig.size < window:
        raise ValueError(f"signal shorter than one window ({sig.size} < {window})")

    stride = int(window * (1.0 - overlap))
    n = 1 + (sig.size - window) // stride
    # as_strided is safe here: read-only view, indices bounded by n above.
    return np.lib.stride_tricks.as_strided(
        sig, shape=(n, window), strides=(sig.strides[0] * stride, sig.strides[0])
    ).copy()
