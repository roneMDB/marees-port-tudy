#!/usr/bin/env bash
# À exécuter SUR le NAS Synology (DS218+ / DSM 7.1), depuis /volume1/docker/marees.
# Recharge l'image transférée puis recrée le conteneur sur cette nouvelle image.
# Les données de data/ (base SQLite marees.db) sont conservées (volume).
# 1re bascule depuis les fichiers plats → SQLite : migration auto au 1er démarrage,
# cf. deploy/MIGRATION-SQLITE.md.
#
# Usage : sudo bash update-on-nas.sh [version-attendue]
#   La version attendue (ex. 0.1.0) est comparée à celle que sert l'application après redémarrage :
#   c'est la seule preuve que la nouvelle image tourne réellement. Passée automatiquement par
#   deploy/release.sh. Sans elle, seule la sonde de vie est contrôlée.
set -euo pipefail

NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
IMAGE_ARCHIVE="${IMAGE_ARCHIVE:-marees-image.tar.gz}"
CONTAINER="${CONTAINER:-marees-port-tudy}"
EXPECTED_VERSION="${1:-${EXPECTED_VERSION:-}}"
# Attente maximale du passage à `healthy` : la sonde du Dockerfile a --start-period=10s puis
# --interval=30s --retries=3, donc laisser largement le temps d'un premier cycle.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

# Fonctionne avec ou sans sudo : préfixe les commandes docker si on n'est pas root.
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

cd "${NAS_DIR}"

if [ ! -f "${IMAGE_ARCHIVE}" ]; then
  echo "✗ ${IMAGE_ARCHIVE} introuvable dans ${NAS_DIR}." >&2
  echo "  Transférer l'image d'abord depuis le PC (./deploy/push-to-nas.sh)." >&2
  exit 1
fi

echo "==> 1/5 Chargement de l'image"
$SUDO docker load < "${IMAGE_ARCHIVE}"

echo "==> 2/5 (Re)création du conteneur sur la nouvelle image"
# ⚠️ DSM 7.1 = Compose v1 : 'docker-compose' (avec un tiret), PAS 'docker compose'.
$SUDO docker-compose up -d

echo "==> 3/5 Contrôle de santé (sonde du conteneur)"
# `docker-compose up -d` rend la main dès que le conteneur est créé, bien AVANT que l'application
# réponde : sans cette attente, un déploiement se déclarerait réussi sur une app encore muette.
sante=""
attente=0
while [ "${attente}" -lt "${HEALTH_TIMEOUT}" ]; do
  sante="$($SUDO docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}absente{{end}}' \
    "${CONTAINER}" 2>/dev/null || echo introuvable)"
  case "${sante}" in
    healthy | absente) break ;;
    unhealthy)
      echo "✗ Le conteneur est 'unhealthy' après ${attente}s." >&2
      echo "  Logs : $SUDO docker-compose logs --tail=50" >&2
      exit 1
      ;;
    introuvable)
      # `docker-compose up -d` vient de réussir : le conteneur doit exister. Inutile d'attendre.
      echo "✗ Conteneur « ${CONTAINER} » introuvable après la (re)création." >&2
      echo "  Vérifier container_name dans docker-compose.yml, ou : $SUDO docker-compose ps" >&2
      exit 1
      ;;
  esac
  sleep 3
  attente=$((attente + 3))
done

if [ "${sante}" = absente ]; then
  echo "  ⚠ image sans sonde de vie (HEALTHCHECK) — contrôle sauté."
elif [ "${sante}" != healthy ]; then
  echo "✗ Toujours pas 'healthy' après ${HEALTH_TIMEOUT}s (état : ${sante})." >&2
  echo "  Logs : $SUDO docker-compose logs --tail=50" >&2
  exit 1
else
  echo "  ✓ conteneur 'healthy' (après ${attente}s)"
fi

echo "==> 4/5 Version servie"
# Interrogé DEPUIS le conteneur : l'app n'écoute que sur la boucle locale (cf. docker-compose.nas.yml),
# et `wget` est fourni par busybox sur l'image Alpine.
servie="$($SUDO docker exec "${CONTAINER}" wget -qO- http://localhost:3000/api/health 2>/dev/null |
  sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' || true)"

if [ -z "${servie}" ]; then
  echo "  ⚠ version non rapportée par /api/health (image antérieure à l'issue #12 ?)."
else
  echo "  → version servie : ${servie}"
fi

if [ -n "${EXPECTED_VERSION}" ]; then
  if [ "${servie}" != "${EXPECTED_VERSION}" ]; then
    echo "✗ Version servie « ${servie:-inconnue} » ≠ attendue « ${EXPECTED_VERSION} »." >&2
    echo "  L'ancienne image tourne peut-être encore : vérifier l'archive transférée." >&2
    exit 1
  fi
  echo "  ✓ conforme à la version attendue"
fi

echo "==> 5/5 Nettoyage des images orphelines"
$SUDO docker image prune -f

echo
echo "État du conteneur :"
$SUDO docker-compose ps
echo
echo "✓ Mise à jour terminée${EXPECTED_VERSION:+ (v${EXPECTED_VERSION})}."
echo "  Logs : $SUDO docker-compose logs --tail=30"
echo "  App  : via l'URL HTTPS du proxy DSM (le port 3000 n'écoute que sur la boucle locale)"
