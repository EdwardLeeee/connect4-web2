ARG NODE_IMAGE=docker.io/library/node:22-bookworm-slim
ARG RUST_IMAGE=docker.io/library/rust:1.88-slim-bookworm
ARG PYTHON_IMAGE=docker.io/library/python:3.10-slim-bookworm

FROM ${NODE_IMAGE} AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The app's on-device AI imports the reply table from native_solver/data by a relative path.
COPY native_solver/data/reply-table.bin /build/native_solver/data/reply-table.bin
RUN npm run build

FROM ${RUST_IMAGE} AS rust-toolchain

FROM ${PYTHON_IMAGE} AS python-builder

ENV CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:${PATH}

COPY --from=rust-toolchain /usr/local/cargo /usr/local/cargo
COPY --from=rust-toolchain /usr/local/rustup /usr/local/rustup

RUN apt-get update \
    && apt-get install --yes --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml README.md THIRD_PARTY_NOTICES.md ./
COPY backend/ ./backend/
COPY native_solver/ ./native_solver/

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip wheel --wheel-dir /wheels .

FROM ${PYTHON_IMAGE} AS runtime

ENV CONNECT4_FRONTEND_DIST=/app/frontend/dist \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --gid 10001 connect4 \
    && useradd --uid 10001 --gid connect4 --create-home --home-dir /home/connect4 connect4

COPY --from=python-builder /wheels /wheels
# /wheels holds exactly one connect4-web wheel (built above from pyproject.toml), so no
# version pin: pinning here broke every release whose pyproject version moved.
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels connect4-web \
    && rm -rf /wheels

WORKDIR /app
COPY --from=frontend-builder --chown=connect4:connect4 /build/frontend/dist ./frontend/dist

USER connect4
EXPOSE 55555

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:55555/api/health', timeout=4)"]

CMD ["uvicorn", "connect4_app.app:app", "--host", "0.0.0.0", "--port", "55555", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
