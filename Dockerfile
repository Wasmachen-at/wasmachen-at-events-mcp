# syntax=docker/dockerfile:1
# Self-contained: build context is this mcp-app/ directory.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install deps first (better layer caching).
COPY package*.json ./
RUN npm ci

# Build the server (tsc) + widget bundle, then run unit tests.
COPY . .
RUN npm run build && npm test

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS final
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3007

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Compiled server + bundled widget. Owned by root, readable by `node`: the
# runtime never needs to write to its own code.
COPY --from=builder /app/dist ./dist

# Drop privileges — `node` is an unprivileged user baked into the base image.
USER node

EXPOSE 3007
CMD ["node", "dist/src/index.js"]
