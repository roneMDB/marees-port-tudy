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

EXPOSE 3000
# Volume des données runtime : settings.json + horaires (auto-seed au 1er démarrage).
VOLUME ["/data"]

CMD ["node", "server/dist/index.js"]
