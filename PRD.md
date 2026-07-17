# Kansoku (観測) — Multi-Algorithm Fault Diagnosis Platform
### Product Requirements Document

---

## 1. Overview

Kansoku is a full-stack machine diagnostics platform that detects, classifies, and explains equipment faults from vibration/acoustic sensor signals. It benchmarks six classical + neural classification algorithms head-to-head, validates findings statistically, and discovers unlabeled fault regimes through clustering — surfaced through a fast, professional, animated web interface built for engineers who need clarity at a glance, not a cluttered notebook dump.

The name Kansoku (観測) means "observation / monitoring" — reflecting the platform's role as a continuous, data-driven eye on equipment health.

## 2. Problem Statement

Manufacturing equipment failures are costly and often preventable. Raw vibration/acoustic sensor data is rich with early fault signatures, but most predictive-maintenance tooling either:
- relies on a single black-box model with no statistical justification for why it works, or
- presents raw signal dashboards with no diagnostic interpretation for non-specialist operators.

Kansoku addresses both gaps: it extracts interpretable signal features, statistically validates which features actually separate fault classes, benchmarks multiple modeling approaches transparently, and clusters unlabeled data to catch fault modes no one has seen before.

## 3. Goals

| Goal | Success Criterion |
|---|---|
| Accurate fault classification | ≥95% accuracy on held-out test set (CWRU-style benchmark) |
| Statistically justified features | Every feature used in modeling passes a documented significance test |
| Transparent model comparison | All 6 required algorithms benchmarked on identical splits, results reproducible |
| Discover unknown fault regimes | K-means cluster analysis surfaces at least 1 sub-regime not present in labeled classes |
| Professional, navigable UI | Task-based navigation, ≤2 clicks to any core view, animated but non-distracting transitions |
| Production-quality engineering | Full test coverage on core pipeline, CI green on every merge, containerized deployment |

## 4. Target Users

- **Primary (portfolio context):** Technical interviewers/recruiters evaluating applied ML + full-stack capability, specifically against a JD requiring decision tree, logistic regression, random forest, naive bayes, k-NN, k-means, and neural network experience plus statistical hypothesis-building.
- **Secondary (product framing):** A maintenance engineer at a manufacturing plant who needs a fast read on "is this machine failing, and how confident are we."

## 5. Core Features

### 5.1 Signal Ingestion & Processing
- Accepts raw vibration/accelerometer time-series (CWRU Bearing Dataset or MAFAULDA as source data).
- Extracts time-domain features (RMS, kurtosis, skewness, crest factor, peak-to-peak).
- Extracts frequency-domain features via FFT (dominant frequency, spectral energy bands, spectral centroid).
- Extracts time-frequency features via wavelet transform for non-stationary signal segments.

### 5.2 Statistical Validation Layer
- ANOVA / Kruskal-Wallis (with Levene's test for variance-homogeneity check, routing to the appropriate test) to confirm which extracted features significantly differ across fault classes before they're used in modeling.
- Tukey HSD post-hoc testing to identify which specific fault-class pairs a feature actually distinguishes.
- Results surfaced in-app as a feature-significance table, not buried in a notebook — this is the platform's core differentiator.

### 5.3 Unsupervised Discovery
- K-means clustering on the validated feature space to surface fault sub-regimes independent of labels.
- Elbow-method / silhouette-score view for cluster count justification (shown in UI, not just picked arbitrarily).

### 5.4 Classification Benchmark Suite
Six algorithms trained and evaluated on identical data splits, matching the required stack exactly:
1. Decision Tree
2. Logistic Regression
3. Random Forest
4. Naive Bayes (Gaussian)
5. k-Nearest Neighbors
6. Neural Network (MLP)

Each reports accuracy, precision/recall/F1 per class, confusion matrix, and inference latency — presented as a live leaderboard, not a static table.

### 5.5 Inference API
- FastAPI backend serving real-time fault classification on new signal uploads, returning predicted class + confidence + which statistically-validated features drove the prediction.

### 5.6 Dashboard & Visualization
- Signal waveform + FFT spectrum viewer.
- Feature-significance panel (ANOVA/Kruskal-Wallis results).
- Cluster explorer (2D/3D projection of fault regimes).
- Model leaderboard with sortable metrics and confusion-matrix drill-down.
- Built with a professional, minimal design language and subtle motion (panel transitions, animated chart entry, hover-state micro-interactions) — clarity first, animation as polish, never as distraction.

## 6. Non-Functional Requirements

- **Performance:** inference response <200ms per signal sample.
- **Reliability:** pytest coverage on signal-processing, statistical-testing, and model-training modules; CI must pass before merge.
- **Reproducibility:** all model training seeded and versioned; statistical test results logged alongside model artifacts.
- **Deployability:** Dockerized backend, one-command local spin-up.
- **Accessibility:** clear navigation hierarchy, no more than 2 clicks from landing page to any core view; keyboard-navigable primary actions.

## 7. Out of Scope (v1)

- Live streaming sensor ingestion (v1 is batch/upload-based).
- Multi-tenant auth/user accounts.
- Mobile-native app (responsive web only).

## 8. Milestones

| Phase | Deliverable |
|---|---|
| 1 | Signal processing pipeline + feature extraction, validated against known dataset labels |
| 2 | Statistical validation layer (ANOVA/Kruskal-Wallis/Tukey HSD) with documented feature significance |
| 3 | K-means clustering + classification benchmark suite (all 6 algorithms) |
| 4 | FastAPI inference backend + Docker + CI pipeline + pytest coverage |
| 5 | Next.js frontend: dashboard, leaderboard, cluster explorer, animated UI polish |
| 6 | End-to-end testing, documentation, deployment |

## 9. Success Metrics (Portfolio Framing)

- Directly demonstrable alignment with every algorithm named in the target JD.
- A clear, defensible answer to "why did you choose this feature/model" for every component — driven by the statistical validation layer, not intuition.
- A UI that a non-technical reviewer can navigate and understand in under a minute.
