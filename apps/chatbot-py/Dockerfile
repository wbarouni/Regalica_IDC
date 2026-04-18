# syntax=docker/dockerfile:1.7
ARG PYTHON_VERSION=3.12-slim

# ---- builder ---------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS builder
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml README.md ./
COPY app ./app

RUN uv sync --no-dev

# ---- runtime ---------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS runtime
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/app /app/app

USER app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import httpx,sys; sys.exit(0 if httpx.get('http://localhost:8000/health/',timeout=3).status_code==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
