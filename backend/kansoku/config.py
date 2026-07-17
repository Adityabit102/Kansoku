"""Central configuration. Every seed, path, and signal constant lives here."""

from pathlib import Path

RANDOM_SEED = 42

ROOT = Path(__file__).resolve().parents[2]
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
ARTIFACTS = ROOT / "artifacts"

# CWRU drive-end accelerometer, 12 kHz sampling.
SAMPLING_RATE_HZ = 12_000
WINDOW_SIZE = 2048
WINDOW_OVERLAP = 0.5

FAULT_CLASSES = ("healthy", "inner_race", "outer_race", "ball")

# Wavelet decomposition
WAVELET = "db4"
WAVELET_LEVELS = 5

# Number of log-spaced FFT energy bands
FFT_BANDS = 6

# Significance gate: a feature must clear BOTH to reach a model.
# At N~12k, p-values alone are near-meaningless (everything is "significant"),
# so effect size is the real filter. 0.14 is Cohen's large-effect threshold.
ALPHA = 0.05
ETA_SQUARED_THRESHOLD = 0.14

TEST_SIZE = 0.2
CV_FOLDS = 5

for _d in (DATA_RAW, DATA_PROCESSED, ARTIFACTS):
    _d.mkdir(parents=True, exist_ok=True)
