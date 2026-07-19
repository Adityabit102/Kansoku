"""Phase 4 gate: endpoint contracts and the <200ms latency requirement."""

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from kansoku.api.main import app
from kansoku.config import ARTIFACTS, WINDOW_SIZE

# These tests exercise the real trained artifacts. On a clean clone (CI) they
# don't exist yet, so the whole module skips rather than failing; the signal
# and stats suites still run everywhere.
pytestmark = pytest.mark.skipif(
    not (ARTIFACTS / "manifest.json").exists(),
    reason="trained artifacts not present; run the training pipeline first",
)

client = TestClient(app)


@pytest.fixture
def csv_signal() -> bytes:
    """A synthetic impulsive signal long enough to segment."""
    rng = np.random.default_rng(0)
    sig = rng.standard_normal(WINDOW_SIZE * 3)
    sig[::128] += 8.0
    buf = io.BytesIO()
    np.savetxt(buf, sig, delimiter=",")
    return buf.getvalue()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_leaderboard_has_all_six_models():
    r = client.get("/leaderboard")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 6, "the benchmark must report every required algorithm"
    names = {row["model_name"] for row in rows}
    assert names == {
        "Decision Tree", "Logistic Regression", "Random Forest",
        "Naive Bayes", "k-Nearest Neighbors", "Neural Network (MLP)",
    }


def test_leaderboard_is_ranked_by_cv_not_holdout():
    """The lucky-holdout trap: ranking must use the cross-validated mean."""
    rows = client.get("/leaderboard").json()
    cv = [r["cv_mean"] for r in rows]
    assert cv == sorted(cv, reverse=True)


def test_leaderboard_confusion_matrix_is_square_and_totals_support():
    for row in client.get("/leaderboard").json():
        n = len(row["class_order"])
        cm = row["confusion_matrix"]
        assert len(cm) == n and all(len(r) == n for r in cm)
        assert sum(map(sum, cm)) == sum(c["support"] for c in row["per_class"].values())


def test_significance_gate_is_consistent():
    rows = client.get("/significance").json()
    assert rows, "significance table must not be empty"
    for row in rows:
        expected = row["p_value"] < 0.05 and row["eta_squared"] > 0.14
        assert row["passes_gate"] == expected
        # Tukey pairs are only computed for features that clear the gate.
        assert row["separated_pairs"] == [] or row["passes_gate"]


def test_significance_is_sorted_by_effect_size():
    e2 = [r["eta_squared"] for r in client.get("/significance").json()]
    assert e2 == sorted(e2, reverse=True)


def test_clusters_shape():
    c = client.get("/clusters").json()
    assert c["chosen_k"] == max(c["sweep"], key=lambda s: s["silhouette"])["k"]
    assert len(c["explained_variance"]) == 3
    assert {p["cluster"] for p in c["points"]} == set(range(c["chosen_k"]))


def test_signal_roundtrip():
    seg = client.get("/segments?limit=4").json()[0]
    file_id, idx = seg["segment_id"].split("#")
    r = client.get(f"/signal/{file_id}/{idx}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["waveform"]) == WINDOW_SIZE
    assert len(body["fft_freqs"]) == len(body["fft_magnitude"]) == WINDOW_SIZE // 2 + 1


def test_signal_404_on_unknown_recording():
    assert client.get("/signal/99999/0").status_code == 404


def test_signal_404_on_out_of_range_index():
    assert client.get("/signal/97/999999").status_code == 404


def test_signal_422_on_non_integer_index():
    assert client.get("/signal/97/abc").status_code == 422


def test_predict_csv(csv_signal):
    r = client.post("/predict", files={"file": ("sig.csv", csv_signal, "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["predicted_class"] in {"healthy", "ball", "inner_race", "outer_race"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert sum(body["class_probabilities"].values()) == pytest.approx(1.0, abs=1e-5)
    assert body["driving_features"], "a prediction must explain itself"


def test_predict_driving_features_are_gated_and_normalized(csv_signal):
    body = client.post("/predict", files={"file": ("s.csv", csv_signal, "text/csv")}).json()
    feats = body["driving_features"]
    assert all(f["eta_squared"] > 0.14 for f in feats), "only validated features may drive"
    assert sum(f["contribution"] for f in feats) == pytest.approx(1.0, abs=1e-6)


def test_predict_rejects_short_signal():
    buf = io.BytesIO()
    np.savetxt(buf, np.zeros(100), delimiter=",")
    r = client.post("/predict", files={"file": ("s.csv", buf.getvalue(), "text/csv")})
    assert r.status_code == 400
    assert "too short" in r.json()["detail"]


def test_predict_rejects_unsupported_type():
    r = client.post("/predict", files={"file": ("s.wav", b"RIFF", "audio/wav")})
    assert r.status_code == 400


def test_predict_demo_diagnoses_known_recording():
    """130.mat is a labeled outer-race fault; the demo path must agree."""
    r = client.get("/predict/demo/130")
    assert r.status_code == 200
    body = r.json()
    assert body["predicted_class"] == "outer_race"
    assert body["confidence"] > 0.9


def test_predict_demo_404_on_unknown_recording():
    assert client.get("/predict/demo/99999").status_code == 404


def test_predict_demo_with_named_model():
    """Any leaderboard model can serve; NB is the weakest but 105 is easy."""
    r = client.get("/predict/demo/105?model=Naive Bayes")
    assert r.status_code == 200
    body = r.json()
    assert body["model_name"] == "Naive Bayes"
    assert body["predicted_class"] == "inner_race"


def test_predict_rejects_unknown_model():
    r = client.get("/predict/demo/105?model=SVM")
    assert r.status_code == 400
    assert "unknown model" in r.json()["detail"]


def test_disabled_model_rejected_and_default_reroutes(monkeypatch):
    """A memory-limited host can refuse a model without breaking defaults."""
    monkeypatch.setenv("DISABLED_MODELS", "Random Forest")
    r = client.get("/predict/demo/105?model=Random Forest")
    assert r.status_code == 400
    assert "not served on this deployment" in r.json()["detail"]
    # default serving skips the disabled winner and uses the runner-up
    body = client.get("/predict/demo/105").json()
    assert body["model_name"] != "Random Forest"
    assert body["predicted_class"] == "inner_race"
    assert "Random Forest" in client.get("/manifest").json()["disabled_models"]


def test_mlp_serves_without_tensorflow_import():
    """The MLP must serve from exported weights via the numpy wrapper."""
    from kansoku.api import artifacts as art

    art.model_by_name.cache_clear()
    mdl = art.model_by_name("Neural Network (MLP)")
    assert type(mdl).__name__ == "_NumpyMLP", "npz path must be preferred over keras"
    r = client.get("/predict/demo/105?model=Neural Network (MLP)")
    assert r.status_code == 200
    body = r.json()
    assert body["model_name"] == "Neural Network (MLP)"
    assert body["predicted_class"] == "inner_race"


def test_numpy_mlp_matches_keras():
    """Exported weights must reproduce Keras outputs to float32 precision."""
    tf = pytest.importorskip("tensorflow")
    from kansoku.api.artifacts import MODELS_DIR, _NumpyMLP

    keras_mlp = tf.keras.models.load_model(MODELS_DIR / "mlp.keras")
    np_mlp = _NumpyMLP(MODELS_DIR / "mlp_weights.npz")
    rng = np.random.default_rng(1)
    X = rng.standard_normal((64, keras_mlp.input_shape[1])).astype(np.float32)
    assert float(np.abs(keras_mlp.predict(X, verbose=0) - np_mlp.predict(X)).max()) < 1e-5


def test_signal_bundle_fallback_matches_contract():
    """Every /segments entry must be servable from the committed bundle alone."""
    from kansoku.api import artifacts as art

    bundle = art.signal_bundle()
    assert bundle is not None, "run python -m kansoku.export_bundle"
    for row in client.get("/segments").json():
        file_id, idx = row["segment_id"].split("#")
        assert f"win_{file_id}_{idx}" in bundle, f"bundle missing {row['segment_id']}"


def test_segments_cover_every_recording_condition():
    """One representative per (label, severity, load) — 40 distinct recordings."""
    rows = client.get("/segments").json()
    conditions = {(r["label"], r["severity"], r["load_hp"]) for r in rows}
    assert len(rows) == 40
    assert len(conditions) == 40, "picker must span all machine conditions"


def test_predict_latency_under_200ms(csv_signal):
    """The PRD's non-functional requirement, asserted rather than assumed."""
    latencies = []
    for _ in range(10):
        r = client.post("/predict", files={"file": ("s.csv", csv_signal, "text/csv")})
        assert r.status_code == 200
        latencies.append(r.json()["latency_ms"])
    p95 = float(np.percentile(latencies, 95))
    assert p95 < 200.0, f"p95 latency {p95:.1f}ms exceeds the 200ms budget"
