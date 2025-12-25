# Multi-stage build for execution client
FROM oven/bun:1 AS builder

# Install git (required for lefthook prepare script)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY turbo.json ./

# Copy all package.json files for workspace dependencies
COPY packages/*/package.json ./packages/
RUN find packages -name "package.json" -exec mkdir -p {} \; -exec true \;

# Initialize a minimal git repo to satisfy lefthook (used in prepare script)
# This allows lefthook install to run successfully during bun install
RUN git init && \
    git config user.email "docker@build" && \
    git config user.name "Docker Build" && \
    git add . && \
    git commit -m "Initial commit for Docker build" || true

# Install dependencies
RUN bun install 

# Copy source code
COPY . .

# Build all packages
RUN bun run build

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built packages and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/turbo.json ./

# Expose ports
# P2P port (default 9000)
EXPOSE 9000
# RPC port (default 9300 = 9000 + 300)
EXPOSE 9300
# Metrics port (default 9400)
EXPOSE 9400

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://localhost:9400/metrics').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use CLI directly as entrypoint (like Lodestar)
ENTRYPOINT ["bun", "./packages/cli/bin/simple-p2p.ts"]

# Default command is to start the node
CMD ["node"]

