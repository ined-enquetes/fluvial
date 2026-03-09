# Dockerfile — FLUVIAL (multi-stage build)
ARG NODE_VERSION=22-alpine

# ─── Etape 1 : installation des dependances ──────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Etape 2 : build de l'application ────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Prepare le fichier admins depuis l'exemple si absent
RUN [ -f data/admins.json ] || cp data/example.admins.json data/admins.json
RUN npm run build

# ─── Etape 3 : image finale minimale ─────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production

# Cree un utilisateur non-root dedie (uid 1001)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie uniquement ce qui est nEcessaire à l'exEcution
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/data ./data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]