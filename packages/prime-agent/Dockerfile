# ─── Stage 1: Build Gensyn AXL from source ────────────────────────────────────
# AXL has no pre-built releases — must be compiled with Go.
# Docs: https://docs.gensyn.ai/tech/agent-exchange-layer
FROM golang:1.25-bookworm AS axl-builder

ENV GOTOOLCHAIN=auto

RUN apt-get update && apt-get install -y --no-install-recommends git openssl && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/gensyn-ai/axl.git /axl

WORKDIR /axl
RUN go build -o /axl/axl ./cmd/node && chmod +x /axl/axl

# ─── Stage 2: Talos Prime Agent runtime ───────────────────────────────────────
FROM python:3.11-slim

# ── System dependencies ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget gnupg2 ca-certificates openssl \
    chromium fonts-freefont-ttf fonts-liberation \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libglib2.0-0 \
    libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxrandr2 libxss1 libxtst6 xvfb \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 (required for Stagehand) ───────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── uv (fast Python package manager) ──────────────────────────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# ── Copy AXL binary from builder stage ────────────────────────────────────────
COPY --from=axl-builder /axl/axl /usr/local/bin/axl

# ── Generate AXL ed25519 private key ─────────────────────────────────────────
RUN mkdir -p /root/.talos-agent/axl && \
    openssl genpkey -algorithm ed25519 -out /root/.talos-agent/axl/private.pem && \
    echo '{"PrivateKeyPath":"/root/.talos-agent/axl/private.pem","Peers":["tls://34.46.48.224:9001"],"api_port":9002,"bridge_addr":"0.0.0.0","tcp_port":7000}' \
    > /root/.talos-agent/axl/node-config.json

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY src/ ./src/

RUN uv sync --frozen --no-dev

ENV PYTHONUNBUFFERED=1
ENV BROWSER_HEADLESS=true
ENV STAGEHAND_HEADLESS=true
ENV AXL_BINARY=/usr/local/bin/axl

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD uv run python -c "from talos_agent.config import Settings; Settings()" || exit 1

CMD ["uv", "run", "talos-agent", "start"]
