"""Run the validation layer over the feature matrix and persist the verdicts."""

from __future__ import annotations

import json
import logging

import pandas as pd

from kansoku.config import ARTIFACTS
from kansoku.signal.pipeline import FEATURES_PARQUET
from kansoku.stats.validate import validate_all

log = logging.getLogger(__name__)

SIGNIFICANCE_JSON = ARTIFACTS / "significance.json"
SELECTED_FEATURES_JSON = ARTIFACTS / "selected_features.json"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    df = pd.read_parquet(FEATURES_PARQUET)
    results = validate_all(df)

    SIGNIFICANCE_JSON.write_text(results.to_json(orient="records", indent=2))
    selected = results.loc[results["passes_gate"], "feature"].tolist()
    SELECTED_FEATURES_JSON.write_text(json.dumps(selected, indent=2))

    log.info("top 10 by effect size:\n%s",
             results[["feature", "test_used", "p_value", "eta_squared", "passes_gate"]].head(10)
             .to_string(index=False))
    log.info("selected %s/%s features -> %s", len(selected), len(results), SELECTED_FEATURES_JSON.name)


if __name__ == "__main__":
    main()
