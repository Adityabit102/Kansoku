"""Frozen data + API contracts.

Phase 0 fixes these so every downstream phase builds against a stable interface
instead of waiting on the previous phase's implementation.
"""

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Feature matrix contract
# ---------------------------------------------------------------------------
# Parquet at data/processed/features.parquet with exactly these columns:
#   segment_id : str   stable id, "{source_file}#{window_index}"
#   label      : str   one of config.FAULT_CLASSES
#   severity   : float fault diameter in inches (0.0 for healthy)
#   load_hp    : int   motor load, 0-3
#   <feature>  : float one column per extracted feature
#
# Feature columns are namespaced by domain so the stats layer can group them:
#   td_*  time-domain      fd_*  frequency-domain      wv_*  wavelet
METADATA_COLUMNS = ("segment_id", "label", "severity", "load_hp")
FEATURE_PREFIXES = ("td_", "fd_", "wv_")


# ---------------------------------------------------------------------------
# API contracts
# ---------------------------------------------------------------------------
class DrivingFeature(BaseModel):
    """A statistically-validated feature that contributed to a prediction."""

    name: str
    value: float
    eta_squared: float = Field(..., description="Effect size from the validation layer")
    contribution: float = Field(..., description="Normalized 0-1 contribution weight")


class PredictionResponse(BaseModel):
    predicted_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    class_probabilities: dict[str, float]
    driving_features: list[DrivingFeature]
    model_name: str
    model_version: str
    latency_ms: float


class SignificanceRow(BaseModel):
    """One feature's verdict from the statistical validation layer."""

    feature: str
    domain: Literal["time", "frequency", "wavelet"]
    test_used: Literal["anova", "kruskal_wallis"]
    levene_p: float = Field(..., description="Variance homogeneity; routes the test choice")
    statistic: float
    p_value: float
    eta_squared: float
    passes_gate: bool = Field(..., description="p < ALPHA AND eta_squared > threshold")
    separated_pairs: list[str] = Field(
        default_factory=list, description="Tukey HSD: class pairs this feature distinguishes"
    )


class ClassMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    support: int


class LeaderboardRow(BaseModel):
    model_name: str
    accuracy: float
    macro_f1: float
    cv_mean: float
    cv_std: float
    inference_latency_ms: float
    per_class: dict[str, ClassMetrics]
    confusion_matrix: list[list[int]]
    class_order: list[str]


class ClusterPoint(BaseModel):
    segment_id: str
    pc1: float
    pc2: float
    pc3: float
    cluster: int
    true_label: str
    severity: float
    load_hp: int


class ClusterSweepPoint(BaseModel):
    k: int
    inertia: float
    silhouette: float


class ClusterResponse(BaseModel):
    points: list[ClusterPoint]
    sweep: list[ClusterSweepPoint]
    chosen_k: int
    explained_variance: list[float]
    cluster_composition: dict[str, dict[str, int]]


class SignalResponse(BaseModel):
    segment_id: str
    label: str
    sampling_rate: int
    waveform: list[float]
    fft_freqs: list[float]
    fft_magnitude: list[float]


# ---------------------------------------------------------------------------
# Artifact contract
# ---------------------------------------------------------------------------
# artifacts/
#   scaler.joblib                    fitted StandardScaler
#   selected_features.json           gated feature names, in matrix column order
#   significance.json                list[SignificanceRow]
#   leaderboard.json                 list[LeaderboardRow]
#   clusters.json                    ClusterResponse
#   models/{model_name}.joblib       classical models
#   models/mlp.keras                 Keras MLP
#   manifest.json                    {version, seed, trained_at, n_segments, feature_count}
ARTIFACT_VERSION = "1.0.0"
