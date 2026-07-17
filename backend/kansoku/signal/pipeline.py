"""Raw .mat files -> feature matrix parquet."""

from __future__ import annotations

import logging

import pandas as pd

from kansoku.config import DATA_PROCESSED
from kansoku.signal.dataset import CWRU_FILES, download, load_signal
from kansoku.signal.features import extract_all
from kansoku.signal.segment import segment

log = logging.getLogger(__name__)

FEATURES_PARQUET = DATA_PROCESSED / "features.parquet"


def build_feature_matrix() -> pd.DataFrame:
    """Download, segment, and featurize the full CWRU subset."""
    rows: list[dict] = []

    for rec in CWRU_FILES:
        path = download(rec)
        sig = load_signal(path)
        windows = segment(sig)
        log.info("%s: %s samples -> %s windows", rec.file_id, sig.size, len(windows))

        for idx, w in enumerate(windows):
            rows.append(
                {
                    "segment_id": f"{rec.file_id}#{idx}",
                    "label": rec.label,
                    "severity": rec.severity,
                    "load_hp": rec.load_hp,
                    **extract_all(w),
                }
            )

    return pd.DataFrame(rows)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    df = build_feature_matrix()
    df.to_parquet(FEATURES_PARQUET, index=False)
    log.info("wrote %s: %s segments x %s cols", FEATURES_PARQUET.name, len(df), df.shape[1])
    log.info("class balance:\n%s", df["label"].value_counts())


if __name__ == "__main__":
    main()
