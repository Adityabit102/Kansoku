"""Export a small self-contained signal bundle.

The raw CWRU download is ~200MB and gitignored, which would leave a fresh
clone with a working leaderboard but a dead signal viewer and demo buttons.
This bundle keeps the app fully functional from git alone:

  - one representative window per recording (40 x 2048 samples), for the
    signal viewer
  - the first ~4s of each demo recording, enough for a 16-window majority
    vote on /predict/demo

float32 throughout; ~1.5MB total. The API prefers raw data when present and
falls back to this bundle.
"""

from __future__ import annotations

import logging

import numpy as np

from kansoku.config import ARTIFACTS
from kansoku.signal.dataset import CWRU_FILES, download, load_signal
from kansoku.signal.segment import segment

log = logging.getLogger(__name__)

BUNDLE_NPZ = ARTIFACTS / "signal_bundle.npz"
DEMO_IDS = (97, 105, 118, 130, 234)  # UI demos + the test-contract recording
DEMO_SAMPLES = 50_000  # ~4.2s @ 12kHz -> ~47 windows, plenty for the vote


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    arrays: dict[str, np.ndarray] = {}

    for rec in CWRU_FILES:
        sig = load_signal(download(rec))
        # Window 0 of each recording — matches what /segments points at.
        arrays[f"win_{rec.file_id}_0"] = segment(sig)[0].astype(np.float32)
        if rec.file_id in DEMO_IDS:
            arrays[f"demo_{rec.file_id}"] = sig[:DEMO_SAMPLES].astype(np.float32)

    np.savez_compressed(BUNDLE_NPZ, **arrays)
    log.info("wrote %s: %s arrays, %.1f KB", BUNDLE_NPZ.name, len(arrays),
             BUNDLE_NPZ.stat().st_size / 1024)


if __name__ == "__main__":
    main()
