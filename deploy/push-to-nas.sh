#!/usr/bin/env bash
# Côté PC : build l'image, l'exporte et la transfère sur le NAS Synology (DS218+).
# Ne redémarre PAS le conteneur : lancer ensuite la mise à jour côté NAS via
# deploy/update-on-nas.sh (transféré ici aussi).
#
# Usage : ./deploy/push-to-nas.sh
# Réglages surchargables : NAS_HOST=… NAS_PORT=… NAS_DIR=… ./deploy/push-to-nas.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Cible NAS (défauts = configuration DS218+ actuelle).
NAS_HOST="${NAS_HOST:-erwan@ds218plus}"
NAS_PORT="${NAS_PORT:-2010}"
NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
IMAGE_ARCHIVE="${IMAGE_ARCHIVE:-marees-image.tar.gz}"

echo "==> 1/4 Build + export de l'image"
./deploy/save-image.sh "${IMAGE_ARCHIVE}"

echo "==> 2/4 Transfert de l'image → ${NAS_HOST}:${NAS_DIR}/"
scp -O -P "${NAS_PORT}" "${IMAGE_ARCHIVE}" "${NAS_HOST}:${NAS_DIR}/"

echo "==> 3/4 Transfert du compose (renommé docker-compose.yml à l'arrivée)"
scp -O -P "${NAS_PORT}" deploy/docker-compose.nas.yml "${NAS_HOST}:${NAS_DIR}/docker-compose.yml"

echo "==> 4/4 Transfert du script de mise à jour NAS"
scp -O -P "${NAS_PORT}" deploy/update-on-nas.sh "${NAS_HOST}:${NAS_DIR}/update-on-nas.sh"

echo
echo "✓ Fichiers transférés dans ${NAS_DIR}/"
echo "  Lancer la mise à jour côté NAS :"
echo "    ssh ${NAS_HOST} -p ${NAS_PORT}"
echo "    cd ${NAS_DIR} && sudo bash update-on-nas.sh"
