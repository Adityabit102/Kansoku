# Cloud deployment image for the Kansoku API — built from the REPO ROOT so it
# can bake in the committed artifacts and processed features; the container is
# fully self-sufficient (no volumes, no raw-data download).
#
#   docker build -t kansoku-api .
#
# Honors $PORT (Render, Railway, Fly, HF Spaces all set it).
FROM python:3.11-slim

WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir \
    numpy scipy scikit-learn statsmodels PyWavelets pandas pyarrow requests \
    fastapi "uvicorn[standard]" pydantic joblib python-multipart \
    "tensorflow-cpu; platform_machine=='x86_64'" \
    "tensorflow; platform_machine=='aarch64'"

COPY backend/kansoku ./kansoku
COPY artifacts ./artifacts
COPY data/processed ./data/processed

ENV PYTHONPATH=/app \
    KANSOKU_ROOT=/app \
    PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn kansoku.api.main:app --host 0.0.0.0 --port ${PORT}"]
