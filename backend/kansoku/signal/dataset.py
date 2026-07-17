"""CWRU Bearing Dataset acquisition and loading.

Uses the standard 12 kHz drive-end subset: 4 normal baselines plus 4 fault
classes x 3 severities x 4 motor loads. Outer-race files are the centered
@6:00 position, which is the conventionally reported one.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import requests
from scipy.io import loadmat

from kansoku.config import DATA_RAW

log = logging.getLogger(__name__)

BASE_URL = "https://engineering.case.edu/sites/default/files/{file_id}.mat"


@dataclass(frozen=True)
class Recording:
    """One CWRU .mat file's metadata."""

    file_id: int
    label: str
    severity: float  # fault diameter in inches
    load_hp: int


# (file_id, label, severity, load_hp)
CWRU_FILES: tuple[Recording, ...] = (
    # Normal baseline
    *(Recording(fid, "healthy", 0.0, hp) for fid, hp in zip((97, 98, 99, 100), range(4))),
    # Inner race
    *(Recording(fid, "inner_race", 0.007, hp) for fid, hp in zip((105, 106, 107, 108), range(4))),
    *(Recording(fid, "inner_race", 0.014, hp) for fid, hp in zip((169, 170, 171, 172), range(4))),
    *(Recording(fid, "inner_race", 0.021, hp) for fid, hp in zip((209, 210, 211, 212), range(4))),
    # Ball
    *(Recording(fid, "ball", 0.007, hp) for fid, hp in zip((118, 119, 120, 121), range(4))),
    *(Recording(fid, "ball", 0.014, hp) for fid, hp in zip((185, 186, 187, 188), range(4))),
    *(Recording(fid, "ball", 0.021, hp) for fid, hp in zip((222, 223, 224, 225), range(4))),
    # Outer race, centered @6:00
    *(Recording(fid, "outer_race", 0.007, hp) for fid, hp in zip((130, 131, 132, 133), range(4))),
    *(Recording(fid, "outer_race", 0.014, hp) for fid, hp in zip((197, 198, 199, 200), range(4))),
    *(Recording(fid, "outer_race", 0.021, hp) for fid, hp in zip((234, 235, 236, 237), range(4))),
)


def _is_valid_mat(path: Path) -> bool:
    """A .mat that scipy can open with a drive-end channel in it.

    Size alone is not enough: the CWRU host truncates responses under load, and
    a half-written file would otherwise be cached as good forever.
    """
    try:
        return bool([k for k in loadmat(str(path)) if k.endswith("_DE_time")])
    except Exception:
        return False


def download(
    recording: Recording, dest_dir: Path = DATA_RAW, timeout: int = 120, retries: int = 4
) -> Path:
    """Fetch one .mat file, skipping if already present and valid.

    The CWRU host drops connections mid-transfer fairly often, so downloads are
    streamed, retried with backoff, and validated before being kept.
    """
    path = dest_dir / f"{recording.file_id}.mat"
    if path.exists() and _is_valid_mat(path):
        return path

    url = BASE_URL.format(file_id=recording.file_id)
    tmp = path.with_suffix(".mat.part")

    for attempt in range(1, retries + 1):
        try:
            log.info("downloading %s (attempt %s/%s)", path.name, attempt, retries)
            with requests.get(url, timeout=timeout, stream=True) as resp:
                resp.raise_for_status()
                expected = int(resp.headers.get("Content-Length", 0))
                with tmp.open("wb") as fh:
                    for chunk in resp.iter_content(1 << 16):
                        fh.write(chunk)
            if expected and tmp.stat().st_size != expected:
                raise OSError(f"truncated: {tmp.stat().st_size} of {expected} bytes")

            tmp.replace(path)
            if not _is_valid_mat(path):
                path.unlink(missing_ok=True)
                raise OSError("downloaded file is not a readable CWRU .mat")
            return path

        except Exception as exc:
            tmp.unlink(missing_ok=True)
            if attempt == retries:
                raise RuntimeError(f"failed to download {url} after {retries} attempts") from exc
            backoff = 2**attempt
            log.warning("  %s failed (%s); retrying in %ss", path.name, exc, backoff)
            time.sleep(backoff)

    raise AssertionError("unreachable")


def download_all(dest_dir: Path = DATA_RAW) -> list[Path]:
    return [download(rec, dest_dir) for rec in CWRU_FILES]


def load_signal(path: Path) -> np.ndarray:
    """Extract the drive-end accelerometer channel from a CWRU .mat file.

    CWRU keys are of the form X097_DE_time / X105_DE_time, but the numeric
    prefix does not always match the filename, so the channel is located by
    suffix rather than by constructing the key.
    """
    mat = loadmat(str(path))
    de_keys = [k for k in mat if k.endswith("_DE_time")]
    if not de_keys:
        raise KeyError(f"no drive-end channel in {path.name}; keys={list(mat)}")
    return np.asarray(mat[de_keys[0]], dtype=np.float64).ravel()
