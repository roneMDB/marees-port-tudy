#!/usr/bin/env bash
# Build l'image et l'exporte en archive gzip à transférer sur le NAS.
#
# Usage : ./deploy/save-image.sh [fichier-sortie.tar.gz]
#
# Réglages surchargables :
#   APP_VERSION=X.Y.Z   tague aussi l'image `marees-port-tudy:X.Y.Z` (en plus de `:latest`) et pose
#                       le label OCI de version. Sans cette variable, comportement historique
#                       (`:latest` seul). Passé automatiquement par deploy/release.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="marees-port-tudy:latest"
OUT="${1:-marees-image.tar.gz}"
APP_VERSION="${APP_VERSION:-}"

# Tags à construire puis à exporter. Avec une version, l'archive porte les DEUX tags : le NAS garde
# ainsi l'image précédente identifiable, donc un rollback ne demande pas de re-transférer ~115 Mo.
TAGS=(-t "${IMAGE}")
SAVE_TAGS=("${IMAGE}")
LABELS=()
if [ -n "${APP_VERSION}" ]; then
  TAGS+=(-t "marees-port-tudy:${APP_VERSION}")
  SAVE_TAGS+=("marees-port-tudy:${APP_VERSION}")
  LABELS+=(--label "org.opencontainers.image.version=${APP_VERSION}")
  echo "→ Build de l'image ${IMAGE} + marees-port-tudy:${APP_VERSION}…"
else
  echo "→ Build de l'image ${IMAGE}…"
fi

docker build "${TAGS[@]}" ${LABELS[@]+"${LABELS[@]}"} .

echo "→ Export vers ${OUT}…"
docker save "${SAVE_TAGS[@]}" | gzip > "${OUT}"

echo "✓ ${OUT} ($(du -h "${OUT}" | cut -f1))"
echo "  Transférer ${OUT} + deploy/docker-compose.nas.yml sur le NAS, puis suivre deploy/README.md."
