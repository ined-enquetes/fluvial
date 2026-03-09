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
# Reinstalle tout (devDependencies inclus) pour avoir le compilateur TypeScript
RUN npm ci
COPY . .
# Prepare le fichier admins depuis l'exemple si absent
RUN [ -f data/admins.json ] || cp data/example.admins.json data/admins.json
RUN npm run build

# ─── Etape 3 : image finale minimale ─────────────────────────────────────────
# Repart d'une image vierge — aucune couche des etapes precedentes n'est heritee
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production

# Force la mise à jour de zlib (CVE-2026-22184) et des paquets Alpine en attente
# À retirer quand node:22.14.0-alpine embarquera zlib >= 1.3.2-r0
RUN apk update && apk upgrade --no-cache

# Utilisateur système dedie, sans shell ni mot de passe (uid 1001)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copie uniquement les artefacts compiles — pas de sources TS, pas de devDeps
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Cree le dossier responses avec les bonnes permissions
# (Git ne versionne pas les dossiers vides — il faut le creer explicitement)
RUN mkdir -p /app/data/responses && chown -R nextjs:nodejs /app/data

# Bascule sur l'utilisateur non-root avant le demarrage
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js est le point d'entree genere par Next.js en mode standalone
# Autonome : ne depend ni de `npm` ni de `next`
CMD ["node", "server.js"]