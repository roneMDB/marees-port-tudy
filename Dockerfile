# syntax=docker/dockerfile:1

# ---- build : installe tout, build serveur + client, puis élague les devDeps ----
FROM node:22-alpine AS build
WORKDIR /app

# Manifest d'abord (cache des dépendances).
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# Sources + build (server → dist + dist/resources ; client → dist).
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime : image légère, ne contient que le nécessaire à l'exécution ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

# node_modules élagué (prod) hoisté à la racine du workspace.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
# Serveur compilé (+ graine dist/resources) et client buildé (servi en statique).
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Répertoire des données runtime accessible à l'utilisateur non-root.
# NB : sur un bind-mount (NAS), ce sont les permissions du dossier hôte qui priment
# → le dossier `data/` doit être accessible en écriture par l'uid 1000 (cf. doc NAS).
RUN mkdir -p /data && chown -R node:node /data

EXPOSE 3000
# Volume des données runtime : settings.json + horaires (auto-seed au 1er démarrage).
VOLUME ["/data"]

# Sonde de vie (fetch natif Node 22, pas de binaire supplémentaire).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exécution en utilisateur non privilégié.
USER node

CMD ["node", "server/dist/index.js"]
