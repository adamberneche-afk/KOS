# ── Build stage ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ── Runtime stage ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Security: run as non-root user
RUN addgroup -S kos && adduser -S kos -G kos

COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY sql/ ./sql/
COPY package.json ./

# Cloud Run sets PORT automatically; default to 8080
ENV PORT=8080
ENV NODE_ENV=production

RUN chown -R kos:kos /app
USER kos

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "src/server.js"]
