"""Phase 3: benchmark six classifiers on identical splits.

Every model sees exactly the same seeded split, the same gated feature set, and
the same scaler, so the leaderboard compares algorithms rather than
preprocessing luck.
"""

from __future__ import annotations

import json
import logging
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, classification_report
from sklearn.model_selection import StratifiedGroupKFold, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from kansoku.config import ARTIFACTS, CV_FOLDS, RANDOM_SEED, TEST_SIZE
from kansoku.contracts import ARTIFACT_VERSION
from kansoku.signal.pipeline import FEATURES_PARQUET
from kansoku.stats.run import SELECTED_FEATURES_JSON

log = logging.getLogger(__name__)

MODELS_DIR = ARTIFACTS / "models"
LEADERBOARD_JSON = ARTIFACTS / "leaderboard.json"
MANIFEST_JSON = ARTIFACTS / "manifest.json"
SCALER_PATH = ARTIFACTS / "scaler.joblib"

CLASSICAL = {
    "Decision Tree": DecisionTreeClassifier(random_state=RANDOM_SEED),
    "Logistic Regression": LogisticRegression(max_iter=2000, random_state=RANDOM_SEED),
    "Random Forest": RandomForestClassifier(n_estimators=200, random_state=RANDOM_SEED, n_jobs=-1),
    "Naive Bayes": GaussianNB(),
    "k-Nearest Neighbors": KNeighborsClassifier(n_neighbors=5),
}


def load_xy() -> tuple[pd.DataFrame, np.ndarray, np.ndarray, list[str]]:
    """Features, labels, and the recording each segment came from.

    The recording id is the grouping key that keeps the split honest -- see
    main() for why a random split is invalid on this dataset.
    """
    df = pd.read_parquet(FEATURES_PARQUET)
    selected = json.loads(SELECTED_FEATURES_JSON.read_text())
    groups = df["segment_id"].str.split("#").str[0].to_numpy()
    return df[selected], df["label"].to_numpy(), groups, selected


def _measure_latency(predict_fn, X: np.ndarray, n: int = 200) -> float:
    """Median single-sample inference latency in ms.

    Median, not mean: the first call pays one-off warmup and would otherwise
    dominate. Single-sample because that is what the API actually serves.
    """
    times = []
    for i in range(min(n, len(X))):
        row = X[i : i + 1]
        t0 = time.perf_counter()
        predict_fn(row)
        times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times))


def _build_mlp(n_features: int, n_classes: int):
    from tensorflow import keras

    keras.utils.set_random_seed(RANDOM_SEED)
    model = keras.Sequential([
        keras.layers.Input(shape=(n_features,)),
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dropout(0.3),
        keras.layers.Dense(64, activation="relu"),
        keras.layers.Dropout(0.2),
        keras.layers.Dense(n_classes, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def _row(name, y_test, y_pred, classes, cv_mean, cv_std, latency) -> dict:
    report = classification_report(y_test, y_pred, target_names=classes, output_dict=True,
                                   zero_division=0)
    return {
        "model_name": name,
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "macro_f1": float(f1_score(y_test, y_pred, average="macro")),
        "cv_mean": float(cv_mean),
        "cv_std": float(cv_std),
        "inference_latency_ms": latency,
        "per_class": {
            c: {
                "precision": float(report[c]["precision"]),
                "recall": float(report[c]["recall"]),
                "f1": float(report[c]["f1-score"]),
                "support": int(report[c]["support"]),
            }
            for c in classes
        },
        "confusion_matrix": confusion_matrix(y_test, y_pred, labels=classes).tolist(),
        "class_order": list(classes),
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    X_df, y, groups, selected = load_xy()
    classes = sorted(np.unique(y))
    X = X_df.to_numpy(dtype=np.float64)

    # Split by RECORDING, never at random.
    #
    # Segments are cut with 50% overlap, so neighbouring windows share half
    # their samples, and every window from one .mat file is the same machine in
    # the same session. A random split therefore puts near-duplicates of each
    # training window into the test set: all six models scored ~100% that way,
    # including logistic regression, which is the tell. Grouping by recording
    # means a test file's segments were never seen in any form during training.
    splitter = StratifiedGroupKFold(n_splits=int(1 / TEST_SIZE), shuffle=True,
                                    random_state=RANDOM_SEED)
    train_idx, test_idx = next(splitter.split(X, y, groups=groups))
    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    groups_train = groups[train_idx]

    held_out = sorted(set(groups[test_idx]))
    log.info("held-out recordings (%s files, never seen in training): %s",
             len(held_out), ", ".join(held_out))
    assert not (set(groups_train) & set(groups[test_idx])), "recording leaked across the split"

    # Fit the scaler on train only; fitting before the split would leak test
    # statistics into training.
    scaler = StandardScaler().fit(X_train)
    X_train_s, X_test_s = scaler.transform(X_train), scaler.transform(X_test)
    joblib.dump(scaler, SCALER_PATH)

    # Cross-validation must respect the same grouping, or CV scores go
    # optimistic for exactly the reason the holdout did.
    cv = StratifiedGroupKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_SEED)
    cv_kwargs = {"cv": cv, "groups": groups_train}
    rows = []

    for name, model in CLASSICAL.items():
        log.info("training %s", name)
        model.fit(X_train_s, y_train)
        y_pred = model.predict(X_test_s)
        cv_scores = cross_val_score(model, X_train_s, y_train, n_jobs=-1, **cv_kwargs)
        latency = _measure_latency(model.predict, X_test_s)
        rows.append(_row(name, y_test, y_pred, classes, cv_scores.mean(), cv_scores.std(), latency))
        joblib.dump(model, MODELS_DIR / f"{name.lower().replace(' ', '_')}.joblib")
        log.info("  acc=%.4f  cv=%.4f+-%.4f  %.3fms",
                 rows[-1]["accuracy"], cv_scores.mean(), cv_scores.std(), latency)

    # --- Neural network -----------------------------------------------------
    log.info("training Neural Network (MLP)")
    class_to_idx = {c: i for i, c in enumerate(classes)}
    y_train_idx = np.array([class_to_idx[c] for c in y_train])

    mlp = _build_mlp(X_train_s.shape[1], len(classes))
    mlp.fit(X_train_s, y_train_idx, epochs=60, batch_size=64, validation_split=0.15, verbose=0)
    y_pred_mlp = np.array(classes)[mlp.predict(X_test_s, verbose=0).argmax(axis=1)]

    # Keras has no cross_val_score; fold the MLP manually on the same splits.
    fold_scores = []
    for tr_i, va_i in cv.split(X_train_s, y_train, groups=groups_train):
        fm = _build_mlp(X_train_s.shape[1], len(classes))
        fm.fit(X_train_s[tr_i], y_train_idx[tr_i], epochs=60, batch_size=64, verbose=0)
        fold_scores.append(fm.evaluate(X_train_s[va_i], y_train_idx[va_i], verbose=0)[1])
    fold_scores = np.array(fold_scores)

    latency = _measure_latency(lambda r: mlp.predict(r, verbose=0), X_test_s, n=50)
    rows.append(_row("Neural Network (MLP)", y_test, y_pred_mlp, classes,
                     fold_scores.mean(), fold_scores.std(), latency))
    mlp.save(MODELS_DIR / "mlp.keras")
    log.info("  acc=%.4f  cv=%.4f+-%.4f  %.3fms",
             rows[-1]["accuracy"], fold_scores.mean(), fold_scores.std(), latency)

    # Rank by cross-validated mean, not single-holdout accuracy. The holdout is
    # only ~8 recordings, so an easy draw can hand a weaker model a perfect
    # score; the grouped CV mean is the number worth trusting and reporting.
    rows.sort(key=lambda r: (r["cv_mean"], r["accuracy"]), reverse=True)
    LEADERBOARD_JSON.write_text(json.dumps(rows, indent=2))
    MANIFEST_JSON.write_text(json.dumps({
        "version": ARTIFACT_VERSION,
        "seed": RANDOM_SEED,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "n_segments": len(X_df),
        "feature_count": len(selected),
        "features": selected,
        "classes": list(classes),
        "best_model": rows[0]["model_name"],
    }, indent=2))

    log.info("leaderboard:\n%s", pd.DataFrame(rows)[
        ["model_name", "accuracy", "macro_f1", "cv_mean", "inference_latency_ms"]
    ].to_string(index=False))


if __name__ == "__main__":
    main()
