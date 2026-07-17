"""Feature extraction across three domains.

Column names are namespaced by domain (td_/fd_/wv_) per the Phase 0 contract so
the statistical layer can group them.
"""

from __future__ import annotations

import numpy as np
import pywt
from scipy import stats

from kansoku.config import FFT_BANDS, SAMPLING_RATE_HZ, WAVELET, WAVELET_LEVELS

_EPS = 1e-12


# ---------------------------------------------------------------------------
# Time domain
# ---------------------------------------------------------------------------
def time_domain(w: np.ndarray) -> dict[str, float]:
    """Classical vibration health indicators.

    Kurtosis and crest factor are the impulsiveness markers: a healthy bearing
    is near-Gaussian (kurtosis ~3), while spalling produces periodic impacts
    that drive both up.
    """
    abs_w = np.abs(w)
    rms = float(np.sqrt(np.mean(w**2)))
    peak = float(abs_w.max())
    mean_abs = float(abs_w.mean())
    std = float(w.std())

    # scipy returns NaN for kurtosis/skew at zero variance. A flatlined channel
    # (dead sensor) is exactly that, and one NaN row poisons the feature matrix,
    # so collapse to the Gaussian-baseline values instead.
    if std < _EPS:
        kurtosis, skewness = 3.0, 0.0
    else:
        kurtosis = float(stats.kurtosis(w, fisher=False))
        skewness = float(stats.skew(w))

    return {
        "td_rms": rms,
        "td_std": std,
        "td_kurtosis": kurtosis,
        "td_skewness": skewness,
        "td_peak": peak,
        "td_peak_to_peak": float(w.max() - w.min()),
        "td_crest_factor": peak / (rms + _EPS),
        "td_shape_factor": rms / (mean_abs + _EPS),
        "td_impulse_factor": peak / (mean_abs + _EPS),
        "td_clearance_factor": peak / (float(np.mean(np.sqrt(abs_w))) ** 2 + _EPS),
    }


# ---------------------------------------------------------------------------
# Frequency domain
# ---------------------------------------------------------------------------
def frequency_domain(
    w: np.ndarray, fs: int = SAMPLING_RATE_HZ, bands: int = FFT_BANDS
) -> dict[str, float]:
    """FFT-derived spectral shape and band energy.

    A Hann window is applied before the transform to suppress spectral leakage
    from the non-integer-period truncation the segmenter introduces.
    """
    windowed = w * np.hanning(w.size)
    spectrum = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(w.size, d=1.0 / fs)

    power = spectrum**2
    total = power.sum() + _EPS
    norm = power / total

    centroid = float((freqs * norm).sum())
    spread = float(np.sqrt(((freqs - centroid) ** 2 * norm).sum()))

    out = {
        "fd_dominant_freq": float(freqs[np.argmax(spectrum)]),
        "fd_dominant_mag": float(spectrum.max()),
        "fd_spectral_centroid": centroid,
        "fd_spectral_spread": spread,
        "fd_spectral_entropy": float(-(norm * np.log2(norm + _EPS)).sum()),
        "fd_spectral_rolloff": float(freqs[np.searchsorted(np.cumsum(norm), 0.85)]),
        "fd_total_power": float(total),
    }

    # Linear bands across the usable spectrum; bearing fault harmonics spread
    # broadly, so linear spacing tracks them better than log spacing here.
    edges = np.linspace(0, freqs[-1], bands + 1)
    for i in range(bands):
        # The final band must include its right edge, or the Nyquist bin falls
        # outside every band and its energy vanishes from the totals.
        upper = freqs <= edges[i + 1] if i == bands - 1 else freqs < edges[i + 1]
        mask = (freqs >= edges[i]) & upper
        out[f"fd_band_{i}_energy"] = float(power[mask].sum() / total)

    return out


# ---------------------------------------------------------------------------
# Wavelet (time-frequency)
# ---------------------------------------------------------------------------
def wavelet_domain(
    w: np.ndarray, wavelet: str = WAVELET, levels: int = WAVELET_LEVELS
) -> dict[str, float]:
    """Per-level energy and entropy from a discrete wavelet decomposition.

    Bearing impacts are transient and non-stationary; the FFT smears them
    across the spectrum, while wavelet levels localize them in time-frequency.
    """
    coeffs = pywt.wavedec(w, wavelet, level=levels)
    energies = np.array([float((c**2).sum()) for c in coeffs])
    total = energies.sum() + _EPS

    out: dict[str, float] = {}
    # coeffs[0] is the approximation; the rest are details, coarse -> fine.
    for i, (c, e) in enumerate(zip(coeffs, energies)):
        name = "approx" if i == 0 else f"detail_{levels - i + 1}"
        out[f"wv_{name}_energy"] = float(e / total)
        out[f"wv_{name}_std"] = float(c.std())

    out["wv_energy_entropy"] = float(-((energies / total) * np.log2(energies / total + _EPS)).sum())
    return out


def extract_all(w: np.ndarray) -> dict[str, float]:
    """Full feature vector for one window."""
    return {**time_domain(w), **frequency_domain(w), **wavelet_domain(w)}


def feature_names() -> list[str]:
    """Stable feature ordering, derived from a probe window."""
    return list(extract_all(np.random.default_rng(0).standard_normal(2048)))
