"""Artifact loading. Models are loaded once at import, not per request."""

from __future__ import annotations

import functools
import json
import logging

import joblib
import numpy as np
import pandas as pd

from kansoku.config import ARTIFACTS
from kansoku.signal.pipeline import FEATURES_PARQUET

log = logging.getLogger(__name__)

MODELS_DIR = ARTIFACTS / "models"


class ArtifactsMissingError(RuntimeError):
    """Raised when the API starts before the training pipeline has been run."""


def _require(path):
    if not path.exists():
        raise ArtifactsMissingError(
            f"{path.name} not found. Run the pipeline first:\n"
            "  python -m kansoku.signal.pipeline\n"
            "  python -m kansoku.stats.run\n"
            "  python -m kansoku.models.train\n"
            "  python -m kansoku.models.cluster"
        )
    return path


@functools.lru_cache(maxsize=1)
def manifest() -> dict:
    return json.loads(_require(ARTIFACTS / "manifest.json").read_text())


@functools.lru_cache(maxsize=1)
def significance() -> list[dict]:
    return json.loads(_require(ARTIFACTS / "significance.json").read_text())


@functools.lru_cache(maxsize=1)
def leaderboard() -> list[dict]:
    return json.loads(_require(ARTIFACTS / "leaderboard.json").read_text())


@functools.lru_cache(maxsize=1)
def clusters() -> dict:
    return json.loads(_require(ARTIFACTS / "clusters.json").read_text())


@functools.lru_cache(maxsize=1)
def scaler():
    return joblib.load(_require(ARTIFACTS / "scaler.joblib"))


@functools.lru_cache(maxsize=8)
def model_by_name(name: str):
    """Load any benchmarked model by its leaderboard name."""
    if name == "Neural Network (MLP)":
        from tensorflow import keras

        return keras.models.load_model(_require(MODELS_DIR / "mlp.keras"))
    slug = name.lower().replace(" ", "_").replace("-", "-")
    return joblib.load(_require(MODELS_DIR / f"{slug}.joblib"))


def best_model():
    """The leaderboard's top model, the default for /predict."""
    name = manifest()["best_model"]
    return name, model_by_name(name)


@functools.lru_cache(maxsize=1)
def signal_bundle():
    """Small committed fallback for raw signals (see kansoku.export_bundle).

    Returns None when absent; callers prefer the raw download when present.
    """
    path = ARTIFACTS / "signal_bundle.npz"
    if not path.exists():
        return None
    return np.load(path)


@functools.lru_cache(maxsize=1)
def eta_squared_map() -> dict[str, float]:
    return {r["feature"]: r["eta_squared"] for r in significance()}


@functools.lru_cache(maxsize=1)
def feature_frame() -> pd.DataFrame:
    return pd.read_parquet(_require(FEATURES_PARQUET))


@functools.lru_cache(maxsize=1)
def feature_stats() -> tuple[np.ndarray, np.ndarray]:
    """Train-set mean/std per selected feature, for scoring driving features."""
    s = scaler()
    return s.mean_, np.sqrt(s.var_)
