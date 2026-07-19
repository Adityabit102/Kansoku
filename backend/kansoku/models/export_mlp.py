"""Export the trained Keras MLP to plain NumPy weights.

The MLP is Dense(128, relu) -> Dropout -> Dense(64, relu) -> Dropout ->
Dense(4, softmax): at inference dropout is identity, so the whole network is
three matmuls and two activations. Exporting the weights lets every
deployment serve the MLP without TensorFlow (~500MB of RAM it exists to
avoid), with bit-comparable outputs — verified here before writing.
"""

from __future__ import annotations

import logging

import numpy as np

from kansoku.config import ARTIFACTS

log = logging.getLogger(__name__)

WEIGHTS_NPZ = ARTIFACTS / "models" / "mlp_weights.npz"


def numpy_forward(weights: dict[str, np.ndarray], X: np.ndarray) -> np.ndarray:
    """The MLP's inference pass, dependency-free."""
    h = np.maximum(X @ weights["W1"] + weights["b1"], 0)
    h = np.maximum(h @ weights["W2"] + weights["b2"], 0)
    logits = h @ weights["W3"] + weights["b3"]
    logits -= logits.max(axis=1, keepdims=True)  # numerically stable softmax
    e = np.exp(logits)
    return e / e.sum(axis=1, keepdims=True)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from tensorflow import keras

    mlp = keras.models.load_model(ARTIFACTS / "models" / "mlp.keras")
    W1, b1, W2, b2, W3, b3 = mlp.get_weights()
    weights = {"W1": W1, "b1": b1, "W2": W2, "b2": b2, "W3": W3, "b3": b3}

    # Prove equivalence on random inputs before trusting the export.
    rng = np.random.default_rng(0)
    X = rng.standard_normal((256, W1.shape[0])).astype(np.float32)
    keras_out = mlp.predict(X, verbose=0)
    np_out = numpy_forward(weights, X)
    max_err = float(np.abs(keras_out - np_out).max())
    assert max_err < 1e-5, f"numpy forward diverges from keras: {max_err}"

    np.savez_compressed(WEIGHTS_NPZ, **weights)
    log.info("wrote %s (%.1f KB), max |keras - numpy| = %.2e",
             WEIGHTS_NPZ.name, WEIGHTS_NPZ.stat().st_size / 1024, max_err)


if __name__ == "__main__":
    main()
