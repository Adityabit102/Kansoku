"""Phase 2 gate: the validation layer must reject noise and accept real signal."""

import numpy as np
import pandas as pd

from kansoku.stats.validate import eta_squared, validate_all, validate_feature

RNG = np.random.default_rng(7)


def test_eta_squared_is_zero_for_identical_groups():
    groups = [RNG.normal(0, 1, 500) for _ in range(3)]
    assert eta_squared(groups) < 0.05


def test_eta_squared_approaches_one_for_separated_groups():
    """Far-apart, tight groups: class explains nearly all variance."""
    groups = [RNG.normal(m, 0.01, 500) for m in (0, 10, 20)]
    assert eta_squared(groups) > 0.99


def test_eta_squared_is_bounded():
    for groups in ([RNG.normal(0, 1, 100) for _ in range(4)],
                   [RNG.normal(m, 0.5, 100) for m in (0, 5, 10, 15)]):
        assert 0.0 <= eta_squared(groups) <= 1.0


def test_eta_squared_of_constant_feature_is_zero():
    """A dead feature explains nothing and must not divide by zero."""
    assert eta_squared([np.zeros(100) for _ in range(3)]) == 0.0


def test_levene_routes_equal_variance_to_anova():
    groups = [RNG.normal(m, 1.0, 400) for m in (0, 0.5, 1.0)]
    assert validate_feature(groups)["test_used"] == "anova"


def test_levene_routes_unequal_variance_to_kruskal():
    """Wildly different spreads break ANOVA's assumption; must fall back."""
    groups = [RNG.normal(0, s, 400) for s in (0.1, 5.0, 20.0)]
    assert validate_feature(groups)["test_used"] == "kruskal_wallis"


def test_gate_rejects_pure_noise():
    """The whole point: a feature with no class signal must not pass."""
    groups = [RNG.normal(0, 1, 2000) for _ in range(3)]
    assert validate_feature(groups)["passes_gate"] is False


def test_gate_rejects_significant_but_trivial_difference():
    """The reason the gate exists.

    At n=20000 a 0.05-sigma shift is overwhelmingly 'significant' by p-value,
    but explains almost none of the variance. A p-only gate would wave this
    through; the effect-size gate must not.
    """
    groups = [RNG.normal(m, 1.0, 20_000) for m in (0.0, 0.05, 0.10)]
    result = validate_feature(groups)
    assert result["p_value"] < 0.05, "sanity: huge n should make this 'significant'"
    assert result["eta_squared"] < 0.14
    assert result["passes_gate"] is False


def test_gate_accepts_real_signal():
    groups = [RNG.normal(m, 1.0, 500) for m in (0, 3, 6)]
    assert validate_feature(groups)["passes_gate"] is True


def test_validate_all_shape_and_ordering():
    df = pd.DataFrame({
        "segment_id": [f"s{i}" for i in range(600)],
        "label": ["healthy"] * 200 + ["ball"] * 200 + ["inner_race"] * 200,
        "severity": 0.0,
        "load_hp": 0,
        "td_real": np.concatenate([RNG.normal(m, 1, 200) for m in (0, 5, 10)]),
        "fd_noise": RNG.normal(0, 1, 600),
    })
    out = validate_all(df)

    assert len(out) == 2, "one row per feature, metadata columns excluded"
    assert out.iloc[0]["feature"] == "td_real", "must sort by effect size descending"
    assert out.set_index("feature").loc["td_real", "passes_gate"]
    assert not out.set_index("feature").loc["fd_noise", "passes_gate"]
    assert set(out["domain"]) == {"time", "frequency"}


def test_tukey_pairs_only_populated_for_passing_features():
    df = pd.DataFrame({
        "segment_id": [f"s{i}" for i in range(600)],
        "label": ["healthy"] * 200 + ["ball"] * 200 + ["inner_race"] * 200,
        "severity": 0.0,
        "load_hp": 0,
        "td_real": np.concatenate([RNG.normal(m, 1, 200) for m in (0, 5, 10)]),
        "fd_noise": RNG.normal(0, 1, 600),
    })
    out = validate_all(df).set_index("feature")
    # three well-separated classes -> all 3 pairwise comparisons reject
    assert len(out.loc["td_real", "separated_pairs"]) == 3
    assert out.loc["fd_noise", "separated_pairs"] == []
