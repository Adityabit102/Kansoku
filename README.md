# Kansoku (観測)

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
| Backend | FastAPI, Pydantic contracts, joblib + Keras artifacts, versioned manifest |
| Frontend | Next.js 16, TypeScript, Tailwind v4, Framer Motion, D3.js, Recharts, TanStack Query |
| Quality | pytest (44 tests), ruff, ESLint, GitHub Actions CI |
| Infra | Docker + docker-compose, artifact/data volumes |

## Run it

```bash
# 1. Train (downloads CWRU data ~200MB, runs full pipeline: ~10 min)
cd backend
python -m kansoku.signal.pipeline    # download + segment + extract features
python -m kansoku.stats.run          # significance gate
python -m kansoku.models.train       # 6-model benchmark
python -m kansoku.models.cluster     # k-means sweep

# 2. Serve
docker compose up --build            # web on :3000, API on :8000
```

Or without Docker: `uvicorn kansoku.api.main:app --port 8000` and `npm run dev` in `frontend/`.

## Design

An "instrument shop" theme built from four brand colors that map onto the subject literally: pine `#004437` is machine-shop enamel (surfaces), sand `#fbca89` is the brass of gauge dials (reading text, 10.8:1 on the canvas), teal `#13737a` is oscilloscope phosphor (everything interactive), and ember `#88393c` is oxide — rust, which is what a failing bearing produces (fault states). Raw teal and ember sit near 2:1 contrast, so they only ever appear as fills and borders; derived bright variants (5.8:1 / 6.4:1, WCAG AA) carry any colored text. Chart series use a CVD-validated categorical palette rather than the brand hues — identity in a scatter must survive colorblind viewing, and warm brand ramps cannot. Type is Archivo + IBM Plex Mono. Motion is one system: ≤ 280 ms, ease-out, opacity + ≤ 8px translate, disabled under `prefers-reduced-motion`.

## Docs

[PRD](PRD.md) · [Tech stack](TECHSTACK.md)
