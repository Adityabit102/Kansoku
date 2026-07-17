"""Phase 1 gate: extractors are checked against analytically known values."""

import numpy as np
import pytest

from kansoku.signal.features import extract_all, feature_names, frequency_domain, time_domain
from kansoku.signal.segment import segment

FS = 12_000
N = 2048


@pytest.fixture
def sine_5g_200hz() -> np.ndarray:
    """5.0 amplitude, 200 Hz. RMS is analytically 5/sqrt(2) = 3.5355.

    200 Hz over 2048 samples at 12 kHz is 34.13 cycles, not a whole number, so
    the truncated final cycle shifts RMS off the ideal by ~0.1%. Tolerances
    below allow for that rather than pretending the window is periodic.
    """
    t = np.arange(N) / FS
    return 5.0 * np.sin(2 * np.pi * 200 * t)


@pytest.fixture
def gaussian_noise() -> np.ndarray:
    return np.random.default_rng(42).standard_normal(N)


# --- segmenter -------------------------------------------------------------
def test_segment_shape_and_count():
    sig = np.arange(10_240, dtype=np.float64)
    seg = segment(sig, window=2048, overlap=0.5)
    # stride 1024 -> 1 + (10240-2048)//1024 = 9
    assert seg.shape == (9, 2048)


def test_segment_overlap_is_real():
    sig = np.arange(4096, dtype=np.float64)
    seg = segment(sig, window=2048, overlap=0.5)
    # second window starts one stride in
    assert seg[1][0] == 1024.0
    # and its first half is the first window's second half
    np.testing.assert_array_equal(seg[0][1024:], seg[1][:1024])


def test_segment_rejects_short_signal():
    with pytest.raises(ValueError, match="shorter than one window"):
        segment(np.zeros(100), window=2048)


def test_segment_rejects_bad_overlap():
    with pytest.raises(ValueError, match="overlap"):
        segment(np.zeros(4096), overlap=1.0)


def test_segment_does_not_alias_source():
    """as_strided returns a view; the .copy() must decouple it from the source."""
    sig = np.arange(4096, dtype=np.float64)
    seg = segment(sig)
    seg[0][0] = -999.0
    assert sig[0] == 0.0


# --- time domain -----------------------------------------------------------
def test_rms_of_known_sine(sine_5g_200hz):
    assert time_domain(sine_5g_200hz)["td_rms"] == pytest.approx(5 / np.sqrt(2), rel=5e-3)


def test_peak_to_peak_of_known_sine(sine_5g_200hz):
    assert time_domain(sine_5g_200hz)["td_peak_to_peak"] == pytest.approx(10.0, rel=1e-3)


def test_crest_factor_of_sine_is_sqrt2(sine_5g_200hz):
    assert time_domain(sine_5g_200hz)["td_crest_factor"] == pytest.approx(np.sqrt(2), rel=5e-3)


def test_gaussian_kurtosis_is_three(gaussian_noise):
    """Non-fisher kurtosis of a normal distribution is 3 — the healthy baseline."""
    assert time_domain(gaussian_noise)["td_kurtosis"] == pytest.approx(3.0, abs=0.35)


def test_impulsive_signal_raises_kurtosis(gaussian_noise):
    """A bearing impact train must be measurably more impulsive than noise."""
    impulsive = gaussian_noise.copy()
    impulsive[::256] += 12.0
    assert time_domain(impulsive)["td_kurtosis"] > time_domain(gaussian_noise)["td_kurtosis"] + 2


def test_zero_signal_does_not_divide_by_zero():
    """Guard the _EPS denominators — a dead sensor channel is all zeros."""
    feats = time_domain(np.zeros(N))
    assert all(np.isfinite(v) for v in feats.values())


# --- frequency domain ------------------------------------------------------
def test_dominant_frequency_of_known_sine(sine_5g_200hz):
    got = frequency_domain(sine_5g_200hz, fs=FS)["fd_dominant_freq"]
    # bin width is 12000/2048 = 5.86 Hz
    assert got == pytest.approx(200.0, abs=6.0)


def test_dominant_frequency_tracks_input():
    t = np.arange(N) / FS
    for f0 in (100.0, 1000.0, 3000.0):
        sig = np.sin(2 * np.pi * f0 * t)
        assert frequency_domain(sig, fs=FS)["fd_dominant_freq"] == pytest.approx(f0, abs=6.0)


def test_band_energies_sum_to_one(gaussian_noise):
    feats = frequency_domain(gaussian_noise, fs=FS)
    bands = [v for k, v in feats.items() if k.startswith("fd_band_")]
    assert sum(bands) == pytest.approx(1.0, rel=1e-6)


def test_pure_tone_has_lower_entropy_than_noise(sine_5g_200hz, gaussian_noise):
    tone = frequency_domain(sine_5g_200hz, fs=FS)["fd_spectral_entropy"]
    noise = frequency_domain(gaussian_noise, fs=FS)["fd_spectral_entropy"]
    assert tone < noise


# --- full vector -----------------------------------------------------------
def test_extract_all_is_finite_and_stable(gaussian_noise):
    feats = extract_all(gaussian_noise)
    assert all(np.isfinite(v) for v in feats.values()), "NaN/inf in feature vector"
    assert list(feats) == feature_names(), "feature ordering is not stable"


def test_feature_count_and_namespacing(gaussian_noise):
    feats = extract_all(gaussian_noise)
    assert all(k[:3] in ("td_", "fd_", "wv_") for k in feats)
    assert len(feats) == len(set(feats)), "duplicate feature names"
