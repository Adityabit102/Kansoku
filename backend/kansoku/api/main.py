"""FastAPI inference + read API."""

from __future__ import annotations

import io
import logging
import os
import time

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from scipy.io import loadmat

from kansoku.api import artifacts as art
from kansoku.config import SAMPLING_RATE_HZ, WINDOW_SIZE
from kansoku.contracts import (
    ClusterResponse,
    DrivingFeature,
    LeaderboardRow,
    PredictionResponse,
    SignalResponse,
    SignificanceRow,
)
from kansoku.signal.features import extract_all
from kansoku.signal.segment import segment

log = logging.getLogger(__name__)

app = FastAPI(title="Kansoku API", version="1.0.0",
              description="Multi-algorithm bearing fault diagnosis")

# Deployed frontends are added via ALLOWED_ORIGINS (comma-separated), e.g.
# ALLOWED_ORIGINS=https://kansoku.vercel.app
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *_extra_origins],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    try:
        m = art.manifest()
        return {"status": "ok", "artifact_version": m["version"], "best_model": m["best_model"]}
    except art.ArtifactsMissingError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.get("/manifest")
def get_manifest() -> dict:
    return art.manifest()


@app.get("/significance", response_model=list[SignificanceRow])
def get_significance() -> list[dict]:
    return art.significance()


@app.get("/leaderboard", response_model=list[LeaderboardRow])
def get_leaderboard() -> list[dict]:
    return art.leaderboard()


@app.get("/clusters", response_model=ClusterResponse)
def get_clusters() -> dict:
    return art.clusters()


@app.get("/segments")
def list_segments() -> list[dict]:
    """One representative segment per recording, for the signal viewer.

    Taking the first N windows per class would return near-identical slices of
    a single recording; one window per (label, severity, load) covers every
    machine condition in the dataset instead.
    """
    df = art.feature_frame()
    picks = (
        df.groupby(["label", "severity", "load_hp"], as_index=False)
        .head(1)
        .sort_values(["label", "severity", "load_hp"])
    )
    return picks[["segment_id", "label", "severity", "load_hp"]].to_dict("records")


@app.get("/signal/{file_id}/{idx}", response_model=SignalResponse)
def get_signal(file_id: str, idx: int) -> dict:
    """Reconstruct one window's waveform and spectrum from the raw recording.

    Addressed as /signal/{file_id}/{idx} rather than by the raw segment_id:
    segment ids are "97#3", and '#' starts the fragment in a URL, so the server
    would never receive the index. Callers split the id and pass the parts.
    """
    from kansoku.signal.dataset import CWRU_FILES, load_signal
    from kansoku.config import DATA_RAW

    rec = next((r for r in CWRU_FILES if str(r.file_id) == file_id), None)
    if rec is None:
        raise HTTPException(404, f"no recording {file_id}")

    path = DATA_RAW / f"{file_id}.mat"
    if path.exists():
        windows = segment(load_signal(path))
        if not 0 <= idx < len(windows):
            raise HTTPException(404, f"segment {idx} out of range for {file_id}")
        w = windows[idx]
    else:
        # Raw data absent (fresh clone): serve from the committed bundle,
        # which carries window 0 of every recording.
        bundle = art.signal_bundle()
        key = f"win_{file_id}_{idx}"
        if bundle is None or key not in bundle:
            raise HTTPException(
                404, f"segment {file_id}#{idx} not available without raw data; "
                "run python -m kansoku.signal.pipeline to download it"
            )
        w = bundle[key].astype(np.float64)
    spectrum = np.abs(np.fft.rfft(w * np.hanning(w.size)))
    freqs = np.fft.rfftfreq(w.size, d=1.0 / SAMPLING_RATE_HZ)
    return {
        "segment_id": f"{file_id}#{idx}",
        "label": rec.label,
        "sampling_rate": SAMPLING_RATE_HZ,
        "waveform": w.tolist(),
        "fft_freqs": freqs.tolist(),
        "fft_magnitude": spectrum.tolist(),
    }


def _driving_features(feats: dict[str, float], selected: list[str]) -> list[DrivingFeature]:
    """Rank features by how far this sample sits from the training mean.

    Deviation is measured in train-set standard deviations and weighted by the
    feature's eta-squared, so a feature only counts as 'driving' if it is both
    unusual for this sample AND known to track fault class.
    """
    mean, std = art.feature_stats()
    e2 = art.eta_squared_map()

    scored = []
    for i, name in enumerate(selected):
        z = abs((feats[name] - mean[i]) / (std[i] + 1e-12))
        scored.append((name, feats[name], e2.get(name, 0.0), z * e2.get(name, 0.0)))

    scored.sort(key=lambda s: s[3], reverse=True)
    top = scored[:6]
    total = sum(s[3] for s in top) or 1.0
    return [
        DrivingFeature(name=n, value=float(v), eta_squared=float(e), contribution=float(w / total))
        for n, v, e, w in top
    ]


def _resolve_model(model: str | None):
    """Pick the serving model: the leaderboard winner unless one is named."""
    if model is None:
        return art.best_model()
    valid = {row["model_name"] for row in art.leaderboard()}
    if model not in valid:
        raise HTTPException(400, f"unknown model {model!r}; one of {sorted(valid)}")
    return model, art.model_by_name(model)


def _classify(sig: np.ndarray, t0: float, model: str | None = None) -> PredictionResponse:
    """Segment, featurize, and majority-vote a raw signal.

    Shared by file upload and the demo endpoint so both paths stay identical.
    """
    if sig.size < WINDOW_SIZE:
        raise HTTPException(
            400, f"signal too short: {sig.size} samples, need at least {WINDOW_SIZE}"
        )

    manifest = art.manifest()
    selected = manifest["features"]
    classes = manifest["classes"]
    model_name, mdl = _resolve_model(model)

    windows = segment(sig)
    # Cap the vote at 16 windows, evenly spaced across the capture. A full CWRU
    # recording segments into ~120-240 windows and extracting features for all
    # of them costs ~2s; with per-window accuracy this high, a 16-window vote
    # is statistically indistinguishable from voting them all, at ~1/10 cost.
    if len(windows) > 16:
        windows = windows[np.linspace(0, len(windows) - 1, 16, dtype=int)]
    X = np.array([[extract_all(w)[f] for f in selected] for w in windows])
    Xs = art.scaler().transform(X)

    if model_name == "Neural Network (MLP)":
        probs = mdl.predict(Xs, verbose=0)
    elif hasattr(mdl, "predict_proba"):
        probs = mdl.predict_proba(Xs)
    else:
        raise HTTPException(500, f"{model_name} cannot produce probabilities")

    mean_probs = probs.mean(axis=0)
    best_i = int(mean_probs.argmax())

    return PredictionResponse(
        predicted_class=classes[best_i],
        confidence=float(mean_probs[best_i]),
        class_probabilities={c: float(p) for c, p in zip(classes, mean_probs)},
        driving_features=_driving_features(extract_all(windows[0]), selected),
        model_name=model_name,
        model_version=manifest["version"],
        latency_ms=(time.perf_counter() - t0) * 1000,
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...), model: str | None = None) -> PredictionResponse:
    """Classify an uploaded vibration signal (.mat or .csv).

    Signals longer than one window are segmented and majority-voted, which is
    how a real deployment would treat a continuous capture.
    """
    t0 = time.perf_counter()
    raw = await file.read()
    name = (file.filename or "").lower()

    try:
        if name.endswith(".mat"):
            mat = loadmat(io.BytesIO(raw))
            keys = [k for k in mat if k.endswith("_DE_time")]
            if not keys:
                raise ValueError("no *_DE_time channel found in .mat")
            sig = np.asarray(mat[keys[0]], dtype=np.float64).ravel()
        elif name.endswith((".csv", ".txt")):
            sig = np.loadtxt(io.BytesIO(raw), delimiter=",").ravel().astype(np.float64)
        else:
            raise ValueError(f"unsupported file type: {file.filename!r}; expected .mat or .csv")
    except Exception as exc:
        raise HTTPException(400, f"could not parse signal: {exc}") from exc

    return _classify(sig, t0, model)


@app.get("/predict/demo/{file_id}", response_model=PredictionResponse)
def predict_demo(file_id: str, model: str | None = None) -> PredictionResponse:
    """Diagnose one of the bundled CWRU recordings by id.

    Lets the UI offer one-click demo diagnoses without requiring the visitor to
    have raw .mat files on hand.
    """
    from kansoku.config import DATA_RAW
    from kansoku.signal.dataset import CWRU_FILES, load_signal

    t0 = time.perf_counter()
    rec = next((r for r in CWRU_FILES if str(r.file_id) == file_id), None)
    if rec is None:
        raise HTTPException(404, f"no recording {file_id}")

    path = DATA_RAW / f"{file_id}.mat"
    if path.exists():
        sig = load_signal(path)
    else:
        bundle = art.signal_bundle()
        key = f"demo_{file_id}"
        if bundle is None or key not in bundle:
            raise HTTPException(404, f"no recording {file_id}")
        sig = bundle[key].astype(np.float64)
    return _classify(sig, t0, model)
