"""K-means over the validated feature space.

Runs unlabeled: the point is to find structure the fault labels do not encode.
CWRU labels 4 fault types but each was recorded at 3 fault diameters and 4 motor
loads, so if clustering finds k > 4 the extra regimes should line up with
severity and load rather than being noise.
"""

from __future__ import annotations

import json
import logging

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from kansoku.config import ARTIFACTS, RANDOM_SEED
from kansoku.signal.pipeline import FEATURES_PARQUET
from kansoku.stats.run import SELECTED_FEATURES_JSON

log = logging.getLogger(__name__)

CLUSTERS_JSON = ARTIFACTS / "clusters.json"
K_RANGE = range(2, 13)
SILHOUETTE_SAMPLE = 4000  # silhouette is O(n^2); subsample for the sweep


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    df = pd.read_parquet(FEATURES_PARQUET)
    selected = json.loads(SELECTED_FEATURES_JSON.read_text())
    X = StandardScaler().fit_transform(df[selected].to_numpy(dtype=np.float64))

    sweep = []
    for k in K_RANGE:
        km = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10).fit(X)
        sil = float(silhouette_score(X, km.labels_, sample_size=SILHOUETTE_SAMPLE,
                                     random_state=RANDOM_SEED))
        sweep.append({"k": k, "inertia": float(km.inertia_), "silhouette": sil})
        log.info("k=%2d  inertia=%12.1f  silhouette=%.4f", k, km.inertia_, sil)

    chosen_k = max(sweep, key=lambda s: s["silhouette"])["k"]
    log.info("chosen k=%s by peak silhouette", chosen_k)

    km = KMeans(n_clusters=chosen_k, random_state=RANDOM_SEED, n_init=10).fit(X)
    pca = PCA(n_components=3, random_state=RANDOM_SEED)
    coords = pca.fit_transform(X)

    composition: dict[str, dict[str, int]] = {}
    for c in range(chosen_k):
        mask = km.labels_ == c
        composition[str(c)] = df.loc[mask, "label"].value_counts().to_dict()

    points = [
        {
            "segment_id": row.segment_id,
            "pc1": float(coords[i, 0]), "pc2": float(coords[i, 1]), "pc3": float(coords[i, 2]),
            "cluster": int(km.labels_[i]),
            "true_label": row.label,
            "severity": float(row.severity),
            "load_hp": int(row.load_hp),
        }
        for i, row in enumerate(df.itertuples())
    ]

    CLUSTERS_JSON.write_text(json.dumps({
        "points": points,
        "sweep": sweep,
        "chosen_k": chosen_k,
        "explained_variance": [float(v) for v in pca.explained_variance_ratio_],
        "cluster_composition": composition,
    }, indent=2))

    joblib.dump(km, ARTIFACTS / "models" / "kmeans.joblib")
    log.info("PCA explains %.1f%% of variance in 3 components",
             100 * pca.explained_variance_ratio_.sum())
    log.info("cluster composition:\n%s", json.dumps(composition, indent=2))


if __name__ == "__main__":
    main()
