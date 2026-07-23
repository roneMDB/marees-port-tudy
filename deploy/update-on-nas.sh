#!/usr/bin/env bash
# À exécuter SUR le NAS Synology (DS218+ / DSM 7.1), depuis /volume1/docker/marees.
# Recharge l'image transférée puis recrée le conteneur sur cette nouvelle image.
# Les données de data/ (base SQLite marees.db) sont conservées (volume).
# 1re bascule depuis les fichiers plats → SQLite : migration auto au 1er démarrage,
# cf. deploy/MIGRATION-SQLITE.md.
#
# Usage : sudo bash update-on-nas.sh
set -euo pipefail

NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
IMAGE_ARCHIVE="${IMAGE_ARCHIVE:-marees-image.tar.gz}"

# Fonctionne avec ou sans sudo : préfixe les commandes docker si on n'est pas root.
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

cd "${NAS_DIR}"

if [ ! -f "${IMAGE_ARCHIVE}" ]; then
  echo "✗ ${IMAGE_ARCHIVE} introuvable dans ${NAS_DIR}." >&2
  echo "  Transférer l'image d'abord depuis le PC (./deploy/push-to-nas.sh)." >&2
  exit 1
fi

echo "==> 1/3 Chargement de l'image"
$SUDO docker load < "${IMAGE_ARCHIVE}"

echo "==> 2/3 (Re)création du conteneur sur la nouvelle image"
# ⚠️ DSM 7.1 = Compose v1 : 'docker-compose' (avec un tiret), PAS 'docker compose'.
$SUDO docker-compose up -d

echo "==> 3/3 Nettoyage des images orphelines"
$SUDO docker image prune -f

echo
echo "État du conteneur :"
$SUDO docker-compose ps
echo
echo "✓ Mise à jour terminée."
echo "  Logs : $SUDO docker-compose logs --tail=30"
echo "  App  : http://ds218plus.home:3000"
