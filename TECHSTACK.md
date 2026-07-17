# Kansoku (観測) — Technical Stack

---

## 1. Data

- **Source:** CWRU Bearing Dataset and/or MAFAULDA (Machinery Fault Database) — public, standard benchmarks for vibration-based fault diagnosis.
- **Format:** raw accelerometer time-series (.mat / .csv), multiple sampling rates, multiple fault classes (healthy, inner-race, outer-race, ball fault, imbalance) at varying severities.

## 2. Signal Processing

| Purpose | Library |
|---|---|
| FFT / frequency-domain features | `scipy.signal`, `numpy.fft` |
| Wavelet transform (time-frequency features) | `PyWavelets (pywt)` |
| Time-domain statistical features | `numpy`, `scipy.stats` |
| Feature engineering / aggregation | `pandas` |

## 3. Statistical Validation

| Test | Library |
|---|---|
| ANOVA | `scipy.stats.f_oneway` |
| Levene's test (variance homogeneity check → routes to correct test) | `scipy.stats.levene` |
| Kruskal-Wallis (non-parametric fallback) | `scipy.stats.kruskal` |
| Tukey HSD post-hoc | `statsmodels.stats.multicomp.pairwise_tukeyhsd` |

## 4. Unsupervised Learning

| Purpose | Library |
|---|---|
| K-means clustering | `scikit-learn` (`sklearn.cluster.KMeans`) |
| Cluster quality (elbow/silhouette) | `scikit-learn` (`sklearn.metrics.silhouette_score`) |
| Dimensionality reduction for cluster visualization | `scikit-learn` (PCA) |

## 5. Classification Suite (exact JD-required algorithms)

| Algorithm | Library |
|---|---|
| Decision Tree | `scikit-learn` (`DecisionTreeClassifier`) |
| Logistic Regression | `scikit-learn` (`LogisticRegression`) |
| Random Forest | `scikit-learn` (`RandomForestClassifier`) |
| Naive Bayes | `scikit-learn` (`GaussianNB`) |
| k-Nearest Neighbors | `scikit-learn` (`KNeighborsClassifier`) |
| Neural Network (MLP) | `TensorFlow / Keras` |

Model evaluation: `scikit-learn.metrics` (accuracy, precision/recall/F1, confusion matrix), cross-validated with `StratifiedKFold`.

## 6. Backend / API

- **Framework:** FastAPI (Python) — serves inference endpoints, statistical-test results, and model-leaderboard data.
- **Model serving:** versioned model artifacts (`joblib` for classical models, Keras `.h5`/SavedModel for the neural net).
- **Validation:** Pydantic schemas for request/response contracts.

## 7. Frontend

- **Framework:** Next.js + TypeScript — chosen over a Dash-only dashboard specifically to deliver a professional, animated, production-grade UI (consistent with the Cove/AlgoRhythm approach rather than Rtail's Dash dashboard).
- **Styling:** Tailwind CSS for a clean, consistent design system.
- **Animation:** Framer Motion for subtle panel transitions, animated chart entry, and hover micro-interactions — polish without distraction.
- **Charts:** Recharts for standard metrics/leaderboard views; D3.js for the signal waveform/FFT spectrum viewer and cluster projection view, matching prior D3 usage in AlgoRhythm.
- **Data fetching:** TanStack Query for API state management (consistent with AlgoRhythm).

## 8. Testing & Quality

- **Unit/integration testing:** `pytest` + `httpx` (API endpoint tests), covering signal-processing, statistical-testing, clustering, and model-training modules.
- **Type safety:** TypeScript on frontend, Pydantic on backend.

## 9. Infrastructure & CI/CD

- **Containerization:** Docker (backend + frontend services).
- **CI/CD:** GitHub Actions — lint, test, build on every PR; merge blocked on failure.
- **Deployment (optional, matching AlgoRhythm pattern):** AWS EC2 (Nginx + Gunicorn/Uvicorn) for backend, versioned model artifacts on AWS S3 via `boto3`.

## 10. Why This Stack Improves on Rtail

| Rtail | Kansoku |
|---|---|
| Dash/Plotly single-app dashboard | Full-stack Next.js + FastAPI, separated frontend/backend |
| Static charts, no animation layer | Framer Motion-driven, professional animated UI |
| Offline-trained artifacts, read-only dashboard | Live FastAPI inference endpoint, real-time predictions |
| 4 classifiers/components across modules | 6 classification algorithms benchmarked head-to-head on identical splits, matching JD exactly |
| ANOVA/Kruskal-Wallis used to validate an RL pricing policy | ANOVA/Kruskal-Wallis used to validate feature selection itself — statistical rigor moved earlier in the pipeline, driving model design rather than just checking it after the fact |
