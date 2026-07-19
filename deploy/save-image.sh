#!/usr/bin/env bash
# Build l'image et l'exporte en archive gzip à transférer sur le NAS.
# Usage : ./deploy/save-image.sh [fichier-sortie.tar.gz]
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="marees-port-tudy:latest"
OUT="${1:-marees-image.tar.gz}"

echo "→ Build de l'image ${IMAGE}…"
docker build -t "${IMAGE}" .

echo "→ Export vers ${OUT}…"
docker save "${IMAGE}" | gzip > "${OUT}"

echo "✓ ${OUT} ($(du -h "${OUT}" | cut -f1))"
echo "  Transférer ${OUT} + deploy/docker-compose.nas.yml sur le NAS, puis suivre deploy/README.md."
