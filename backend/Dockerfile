FROM python:3.11-slim

WORKDIR /app

# Layer-cache the dependency install; it dwarfs the code copy.
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    numpy scipy scikit-learn statsmodels PyWavelets pandas pyarrow requests \
    fastapi "uvicorn[standard]" pydantic joblib python-multipart tensorflow-cpu

COPY kansoku ./kansoku

# Artifacts and data are mounted, not baked in — the image stays model-agnostic
# and a retrain doesn't require a rebuild.
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "kansoku.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
