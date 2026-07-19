# Kansoku (観測)

**[Live Demo](https://kansoku-weld.vercel.app)** · **[API](https://kansoku-api.onrender.com/docs)** · **[GitHub](https://github.com/Adityabit102/Kansoku)**

**Multi-Algorithm Fault Diagnosis Platform** — detect, classify, and statistically explain machine faults from vibration sensor signals.

`Python` · `scikit-learn` · `TensorFlow/Keras` · `SciPy` · `statsmodels` · `PyWavelets` · `FastAPI` · `Next.js` · `TypeScript` · `D3.js` · `Docker` | Predictive Maintenance · Signal Processing · Applied Statistics · Full Stack

> *Kansoku* (観測) means "observation / monitoring" — the platform is a continuous, data-driven eye on equipment health.

---

## Results

Measured on the CWRU Bearing Dataset (40 recordings, 12 kHz drive-end accelerometer), **5,886** overlapping 2,048-sample segments, four classes. All models share one seeded, **recording-grouped** split and the same 34 statistically-gated features. Ranked by grouped 5-fold cross-validated accuracy — see [Honest evaluation](#honest-evaluation) for why that is the only number reported first.

| Model | CV accuracy (grouped 5-fold) | Holdout | Inference |
|---|---|---|---|
| **Random Forest** | **99.92% ± 0.06** | 100% | 13.4 ms |
| k-Nearest Neighbors | 98.83% ± 1.63 | 99.38% | 0.51 ms |
| Logistic Regression | 98.57% ± 1.28 | 100% | 0.06 ms |
| Neural Network (Keras MLP) | 96.93% ± 4.05 | 98.99% | 18.8 ms |
| Decision Tree | 94.05% ± 6.69 | 99.61% | 0.05 ms |
| Naive Bayes (Gaussian) | 91.84% ± 6.64 | 85.71% | 0.07 ms |

The spread is the point. Naive Bayes trails because vibration features are strongly correlated (spectral centroid, rolloff, and band energies move together), violating its independence assumption — the benchmark discriminates between algorithms rather than rubber-stamping all of them.

**Other measured results**

- **34 / 36** extracted features pass the two-stage significance gate; the 2 rejections are the methodological story (below).
- K-means (labels withheld) selects **k = 9** by peak silhouette (0.529) against only 4 labeled classes — the extra clusters recover **fault severity** (0.007″ / 0.014″ / 0.021″), a physical dimension the labels never encoded, at 0.88–1.00 per-cluster label purity. Ball faults refuse to split by severity, which is physically expected; motor load separates nothing.
- `/predict` end-to-end: **~85 ms p95** per windowed signal, **~215 ms** for a full ~120-window recording (16-window majority vote), against a 200 ms per-sample budget.
- **44 pytest tests** across signal processing, statistics, and API contracts; extractors are validated against analytically known values (RMS of a known sine, kurtosis of Gaussian noise ≈ 3).

## The differentiator: statistics before models

Most fault-diagnosis demos pick features by intuition. Kansoku gates them:

1. **Levene's test** checks variance homogeneity per feature, routing to **ANOVA** (assumptions hold) or **Kruskal–Wallis** (they don't). On CWRU all 36 features route to Kruskal–Wallis — fault classes change feature *spread*, not just means.
2. **Eta-squared (effect size)** is the real filter. At n ≈ 5,900, p-values are vacuous — *every* feature clears p < 0.05, many at p ≈ 0, because large samples make trivial differences "significant". The gate demands **η² > 0.14** (Cohen's large-effect threshold) on top of p < 0.05.
3. **Tukey HSD post-hoc** identifies *which* fault-class pairs each surviving feature actually separates.

The showcase rejection: `wv_detail_5_std` reaches **p = 5.7 × 10⁻¹²⁸** — as significant as statistics gets — while explaining **3%** of variance (η² = 0.03). A p-only gate waves it through; the effect-size gate rejects it. Predictions expose the same layer: `/predict` returns the driving features weighted by deviation × effect size, so every diagnosis is explainable in terms of statistically validated evidence.

## Honest evaluation

Two decisions that keep the numbers defensible:

- **Recording-grouped splits, never random.** Segments are cut with 50% overlap, so neighboring windows share half their samples — a random split leaks near-duplicates of training data into the test set. All six models scored ~100% under a random split (including logistic regression: the tell). `StratifiedGroupKFold` keyed on source recording guarantees a test recording is never seen in any form during training.
- **Ranked by CV, not holdout.** The holdout is only ~8 recordings; an easy draw hands a weaker model a perfect score (two models hit 100% on it). The grouped cross-validated mean, with its σ, is the headline number.

## Architecture

```
Raw vibration (.mat, 12 kHz)
   │  segment: 2048-sample windows, 50% overlap
   ▼
Feature extraction ──────────── 36 features
   time domain    RMS · kurtosis · skew · crest · impulse · clearance …
   frequency      FFT (Hann): centroid · rolloff · entropy · 6 energy bands
   time-frequency wavelet (db4 ×5): per-level energy · std · entropy
   ▼
Statistical gate ────────────── 34 survive
   Levene → ANOVA / Kruskal-Wallis · η² > 0.14 · Tukey HSD pairs
   ├──────────────────────────────┐
   ▼                              ▼
K-means discovery              6-model benchmark
   silhouette sweep k∈[2,12]      identical StratifiedGroupKFold splits
   PCA projection (81.6% var)     DT · LogReg · RF · GNB · kNN · Keras MLP
                                  ▼
                               FastAPI ─ /predict /significance /leaderboard /clusters /signal
                                  ▼
                               Next.js 16 · TypeScript · Tailwind v4 · Framer Motion
                                  D3 waveform/FFT viewer · cluster explorer
                                  significance table · leaderboard w/ confusion drill-down
```

## Stack

| Layer | Technology |
|---|---|
| Signal processing | NumPy, SciPy (`signal`, `stats`), PyWavelets, pandas |
| Statistics | SciPy (`levene`, `f_oneway`, `kruskal`), statsmodels (Tukey HSD), eta-squared |
| ML — classical | scikit-learn (5 classifiers, KMeans, PCA, silhouette, StratifiedGroupKFold) |
| ML — neural | TensorFlow/Keras MLP (128→64, dropout, seeded) |
| Backend | FastAPI, Pydantic contracts, joblib + Keras artifacts (MLP also exported to NumPy weights for TF-free serving), versioned manifest |
| Frontend | Next.js 16, TypeScript, Tailwind v4, Framer Motion, D3.js, Recharts, TanStack Query |
| Quality | pytest (44 tests), ruff, ESLint, GitHub Actions CI |
| Infra | Docker + docker-compose, artifact/data volumes |

## Run it

Everything the app needs to serve is committed — trained models, the scaler, gated features, cluster artifacts, and a ~700KB signal bundle — so it works from a fresh clone with no training step:

```bash
docker compose up --build            # web on :3000, API on :8000
```

Or without Docker:

```bash
cd backend  && pip install -e ".[dev]" && uvicorn kansoku.api.main:app --port 8000
cd frontend && npm ci && npm run dev
```

To retrain from scratch (downloads the raw CWRU data, ~200MB; ~10 min):

```bash
cd backend
python -m kansoku.signal.pipeline    # download + segment + extract features
python -m kansoku.stats.run          # significance gate
python -m kansoku.models.train       # 6-model benchmark
python -m kansoku.models.cluster     # k-means sweep
python -m kansoku.export_bundle      # refresh the committed signal bundle
```

## Interface

A session-gated welcome (anime.js × three.js cube lattice, typewriter tagline, engineering graffiti) opens onto a scroll-scrubbed **bearing teardown**: a 3D deep-groove bearing idles beside the hero, flows to center, explodes into a labeled engineering view component by component, reassembles, and spins up while its defect writes an impact train onto a live trace. Beyond it: live simulated telemetry with real windowed RMS/kurtosis/peak, count-up stats, an anime.js dot-grid ripple, and five working views — signals with **characteristic fault-frequency overlays** (BPFI/BPFO/BSF per shaft speed), the significance table, a drag-to-rotate 3D cluster explorer, the leaderboard with confusion drill-downs, and a diagnosis page where **any of the six benchmarked models can serve the prediction**.

## Design

An "engineer's report" theme: cream `#F2EBE2` paper as the ground, near-white panels mounted like plates (layered contact + ambient shadows), tan `#D2B48C` hairlines as rules, sage `#8F9779` as the instrument green of *within tolerance*, and brick red `#A52A2A` as the inspector's pen — carrying both interaction and fault semantics, because on a report the red ink is what you must read. Measured contrast: ink 12.5:1, muted 4.9:1, red 6.6:1, sage-deep 5.7:1 — all AA; raw tan and sage never carry text. Chart series use a CVD-validated categorical palette rather than the brand hues — identity in a scatter must survive colorblind viewing. Type is Archivo + IBM Plex Mono.

Motion is two disciplined layers: 2D — ≤ 280 ms ease-out entrances, opacity + ≤ 8px translate, disabled under `prefers-reduced-motion`; 3D — a mouse-tracking perspective tilt on cards, and the cluster explorer's rotating PCA projection: a canvas-rendered, drag-to-rotate 3D scatter of all 5,886 segments across PC1×PC2×PC3, with depth-encoded size/opacity and hover identification. The third component was computed all along; the 3D view is what finally spends it.

## Deployment

Backend on **Render** (free tier, no card), frontend on **Vercel**:

```bash
# 1. Backend: render.com -> New + -> Blueprint -> connect this repo
#    (render.yaml configures everything: python runtime, health check, pinned
#     deps. TensorFlow stays off the 512MB host — the MLP serves from exported
#     NumPy weights with outputs identical to Keras, so all six models run)
#    -> https://kansoku-api.onrender.com

# 2. Frontend: import the GitHub repo in Vercel
#    Root Directory: frontend
#    Env var:        NEXT_PUBLIC_API_URL=https://kansoku-api.onrender.com

# 3. Back on Render (Environment), allow the Vercel origin:
#    ALLOWED_ORIGINS=https://<your-app>.vercel.app
```

Alternative hosts: `deploy/deploy_hf.sh` pushes to a Hugging Face Space
(Gradio SDK wrapper in app.py), and the root [Dockerfile](Dockerfile) works on
any Docker host with the full model set including TensorFlow.

The root [Dockerfile](Dockerfile) bakes in the committed artifacts and processed features, so the deployed API is fully self-sufficient — no raw-data download, no volumes. It honors `$PORT` and installs the right TensorFlow wheel per architecture.

## Docs

[PRD](PRD.md) · [Tech stack](TECHSTACK.md)
