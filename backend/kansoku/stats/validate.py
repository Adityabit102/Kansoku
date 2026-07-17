"""Statistical validation layer.

Gates which features are allowed to reach a model. Two-stage:

  1. Levene's test checks variance homogeneity, routing each feature to ANOVA
     (assumption holds) or Kruskal-Wallis (it does not).
  2. Eta-squared measures effect size.

Stage 2 is the one that matters. At N in the thousands, p-values are near
useless -- an arbitrarily small difference in means becomes "significant" once
the sample is large enough, so a p-only gate would pass nearly every feature and
justify nothing. Eta-squared is sample-size independent: it asks how much of the
variance in a feature the fault class actually explains.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd

from kansoku.config import ALPHA, ETA_SQUARED_THRESHOLD
from kansoku.contracts import METADATA_COLUMNS

log = logging.getLogger(__name__)

_DOMAIN = {"td_": "time", "fd_": "frequency", "wv_": "wavelet"}


def eta_squared(groups: list[np.ndarray]) -> float:
    """Proportion of a feature's total variance explained by class membership.

    eta^2 = SS_between / SS_total, in [0, 1]. Cohen: 0.01 small, 0.06 medium,
    0.14 large.
    """
    all_values = np.concatenate(groups)
    grand_mean = all_values.mean()

    ss_total = float(((all_values - grand_mean) ** 2).sum())
    if ss_total < 1e-12:
        return 0.0  # constant feature explains nothing

    ss_between = float(sum(len(g) * (g.mean() - grand_mean) ** 2 for g in groups))
    return ss_between / ss_total


def validate_feature(groups: list[np.ndarray]) -> dict:
    """Run the Levene -> ANOVA/Kruskal route plus effect size for one feature."""
    _, levene_p = stats.levene(*groups)

    if levene_p > ALPHA:
        test_used = "anova"
        statistic, p_value = stats.f_oneway(*groups)
    else:
        # Unequal variances break ANOVA's assumptions; fall back to the
        # rank-based test rather than reporting a result we can't defend.
        test_used = "kruskal_wallis"
        statistic, p_value = stats.kruskal(*groups)

    e2 = eta_squared(groups)
    return {
        "test_used": test_used,
        "levene_p": float(levene_p),
        "statistic": float(statistic),
        "p_value": float(p_value),
        "eta_squared": e2,
        "passes_gate": bool(p_value < ALPHA and e2 > ETA_SQUARED_THRESHOLD),
    }


def tukey_pairs(values: np.ndarray, labels: np.ndarray) -> list[str]:
    """Class pairs a feature separates, per Tukey HSD post-hoc.

    Reads the public summary table rather than the internal pair indices, which
    are private API and have moved between statsmodels releases.
    """
    table = pairwise_tukeyhsd(values, labels, alpha=ALPHA).summary().data
    header, rows = table[0], table[1:]
    g1_i, g2_i, rej_i = header.index("group1"), header.index("group2"), header.index("reject")
    return [f"{r[g1_i]} vs {r[g2_i]}" for r in rows if bool(r[rej_i])]


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in METADATA_COLUMNS]


def validate_all(df: pd.DataFrame) -> pd.DataFrame:
    """Validate every feature against the fault-class labels."""
    labels = df["label"].to_numpy()
    classes = sorted(df["label"].unique())
    rows = []

    for feat in feature_columns(df):
        values = df[feat].to_numpy(dtype=np.float64)
        groups = [values[labels == c] for c in classes]

        row = {"feature": feat, "domain": _DOMAIN[feat[:3]], **validate_feature(groups)}
        row["separated_pairs"] = tukey_pairs(values, labels) if row["passes_gate"] else []
        rows.append(row)

    out = pd.DataFrame(rows).sort_values("eta_squared", ascending=False).reset_index(drop=True)
    log.info(
        "significance: %s/%s features pass p<%s; %s also clear eta2>%s",
        int((out["p_value"] < ALPHA).sum()), len(out), ALPHA,
        int(out["passes_gate"].sum()), ETA_SQUARED_THRESHOLD,
    )
    return out
