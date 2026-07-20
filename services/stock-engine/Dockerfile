FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY . /app

RUN python -m venv /app/.venv \
  && /app/.venv/bin/python -m pip install --upgrade pip setuptools wheel \
  && if [ -f requirements.txt ]; then /app/.venv/bin/pip install -r requirements.txt; fi \
  && if [ -f pyproject.toml ]; then /app/.venv/bin/pip install -e .; fi

ENV PATH="/app/.venv/bin:$PATH"
ENV STOCK_ENGINE_API_URL="http://127.0.0.1:8000"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
