# Kansoku (観測)

**Multi-Algorithm Fault Diagnosis Platform** — detect, classify, and statistically explain machine faults from vibration and acoustic sensor signals.

`Python` · `scikit-learn` · `TensorFlow/Keras` · `SciPy` · `statsmodels` · `PyWavelets` · `FastAPI` · `Next.js` · `TypeScript` · `D3.js` · `Docker` | Predictive Maintenance · Signal Processing · Applied Statistics · Full Stack

> *Kansoku* (観測) means "observation / monitoring" — the platform is a continuous, data-driven eye on equipment health.

---

## Overview

Manufacturing equipment failures are expensive and usually preventable. Raw vibration data carries early fault signatures, but most predictive-maintenance tooling either hides behind a single black-box model with no justification for why it works, or dumps raw signal charts on an operator with no diagnostic interpretation.

Kansoku closes both gaps. It extracts interpretable time-, frequency-, and time-frequency-domain features from raw accelerometer signals; runs hypothesis tests to prove which features actually separate fault classes *before* they reach a model; benchmarks six classification algorithms head-to-head on identical splits; and clusters the validated feature space to surface fault regimes that were never labeled in the first place.

The statistical validation layer is the differentiator: every feature that reaches a model has a documented significance test behind it, and those results are surfaced in the UI rather than buried in a notebook.

## Architecture

```
Raw vibration signal (.mat / .csv)
        │
        ▼
┌───────────────────────┐
│  Signal Processing    │  time-domain: RMS, kurtosis, skewness, crest factor, peak-to-peak
│                       │  frequency-domain (FFT): dominant freq, spectral energy bands, centroid
│                       │  time-frequency: wavelet transform for non-stationary segments
└───────────┬───────────┘
            ▼
┌───────────────────────┐
│ Statistical Validation│  Levene's test → routes to ANOVA or Kruskal-Wallis
│                       │  Tukey HSD post-hoc → which fault-class pairs each feature separates
└───────────┬───────────┘
            │  only significant features pass through
            ├──────────────────────────────┐
            ▼                              ▼
┌───────────────────────┐     ┌───────────────────────┐
│ Unsupervised Discovery│     │ Classification Suite  │
│ K-means + silhouette/ │     │ 6 algorithms, same    │
│ elbow justification   │     │ splits, StratifiedKFold
│ PCA projection        │     └───────────┬───────────┘
└───────────────────────┘                 ▼
                              ┌───────────────────────┐
                              │  FastAPI Inference    │  class + confidence +
                              │  versioned artifacts  │  driving features
                              └───────────┬───────────┘
                                          ▼
                              ┌───────────────────────┐
                              │  Next.js Dashboard    │  waveform/FFT viewer, significance
                              │  TypeScript · D3 ·    │  panel, cluster explorer,
                              │  Recharts · Framer    │  model leaderboard
                              └───────────────────────┘
```

## Core Features

### Signal Ingestion & Feature Extraction
Accepts raw accelerometer time-series across multiple sampling rates and fault classes. Extracts three complementary feature families — time-domain statistics, FFT-derived frequency-domain features, and wavelet-based time-frequency features for non-stationary segments.

### Statistical Validation Layer
Levene's test checks variance homogeneity and routes each feature to the appropriate test — ANOVA when assumptions hold, Kruskal-Wallis when they don't. Tukey HSD post-hoc testing then identifies which specific fault-class pairs a feature actually distinguishes. Results render in-app as a feature-significance table, so "why this feature" has a defensible answer rather than an intuition.

### Unsupervised Discovery
K-means clustering over the validated feature space surfaces fault sub-regimes independent of labels. Cluster count is justified in the UI via elbow method and silhouette score rather than picked arbitrarily, with PCA projection for 2D/3D exploration.

### Classification Benchmark Suite
Six algorithms trained and evaluated on identical splits with `StratifiedKFold` cross-validation:

| Algorithm | Implementation |
|---|---|
| Decision Tree | `sklearn.tree.DecisionTreeClassifier` |
| Logistic Regression | `sklearn.linear_model.LogisticRegression` |
| Random Forest | `sklearn.ensemble.RandomForestClassifier` |
| Naive Bayes (Gaussian) | `sklearn.naive_bayes.GaussianNB` |
| k-Nearest Neighbors | `sklearn.neighbors.KNeighborsClassifier` |
| Neural Network (MLP) | `TensorFlow / Keras` |

Each reports accuracy, per-class precision/recall/F1, confusion matrix, and inference latency — presented as a live sortable leaderboard with confusion-matrix drill-down.

### Inference API
FastAPI backend serving real-time classification on uploaded signals, returning predicted fault class, confidence, and the statistically-validated features that drove the prediction. Pydantic schemas enforce request/response contracts; models are versioned as `joblib` artifacts (classical) and Keras SavedModel (neural net).

### Dashboard
Next.js + TypeScript frontend with a professional, minimal design language: signal waveform and FFT spectrum viewer (D3.js), feature-significance panel, cluster explorer, and model leaderboard (Recharts). Framer Motion drives panel transitions and animated chart entry — polish, never distraction. No more than two clicks from landing to any core view.

## Tech Stack

| Layer | Technology |
|---|---|
| **Signal Processing** | NumPy, SciPy (`scipy.signal`, `scipy.stats`), PyWavelets, pandas |
| **Statistics** | SciPy (`f_oneway`, `levene`, `kruskal`), statsmodels (`pairwise_tukeyhsd`) |
| **ML — Classical** | scikit-learn (6-algorithm suite, KMeans, PCA, silhouette, StratifiedKFold) |
| **ML — Neural** | TensorFlow / Keras (MLP) |
| **Backend** | FastAPI, Pydantic, joblib |
| **Frontend** | Next.js, TypeScript, Tailwind CSS, Framer Motion, D3.js, Recharts, TanStack Query |
| **Testing** | pytest, httpx |
| **Infrastructure** | Docker, GitHub Actions CI, AWS EC2 (Nginx + Gunicorn/Uvicorn), AWS S3 + boto3 |

## Data

Built against the **CWRU Bearing Dataset** and **MAFAULDA (Machinery Fault Database)** — public, standard benchmarks for vibration-based fault diagnosis. Fault classes span healthy, inner-race, outer-race, ball fault, and imbalance at varying severities.

## Targets

<!-- Replace each target with the measured result once the pipeline is trained and benchmarked. -->

| Goal | Target |
|---|---|
| Fault classification accuracy | ≥95% on held-out test set |
| Inference latency | <200ms per signal sample |
| Feature justification | Every modeled feature passes a documented significance test |
| Unsupervised discovery | K-means surfaces ≥1 sub-regime absent from labeled classes |
| Reproducibility | All training seeded and versioned; test results logged with model artifacts |
| Engineering quality | pytest coverage on core pipeline; CI green on every merge |

## Roadmap

- [ ] **Phase 1** — Signal processing pipeline + feature extraction, validated against known dataset labels
- [ ] **Phase 2** — Statistical validation layer (Levene → ANOVA/Kruskal-Wallis → Tukey HSD)
- [ ] **Phase 3** — K-means clustering + 6-algorithm classification benchmark suite
- [ ] **Phase 4** — FastAPI inference backend + Docker + CI + pytest coverage
- [ ] **Phase 5** — Next.js dashboard, leaderboard, cluster explorer, animated UI polish
- [ ] **Phase 6** — End-to-end testing, documentation, deployment

## Out of Scope (v1)

Live streaming sensor ingestion (v1 is batch/upload-based) · multi-tenant auth · mobile-native app (responsive web only).

## Status

🚧 In development — see roadmap above.
