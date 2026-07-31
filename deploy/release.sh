#!/usr/bin/env bash
# Côté PC : déploiement complet d'une version sur le NAS Synology (DS218+).
# Appelé automatiquement par le hook .githooks/pre-push au push d'un tag `vX.Y.Z`,
# ou à la main pour reprendre un déploiement interrompu.
#
# Enchaîne : pré-vol (docker + NAS joignables) → lint/type-check/tests → sauvegarde de la base
# sur le NAS → build + transfert de l'image (push-to-nas.sh) → bascule du conteneur (sudo, mot de
# passe demandé) → contrôle de santé + version servie.
#
# Usage : ./deploy/release.sh [vX.Y.Z]
#         (sans argument : version lue dans package.json)
#
# Réglages surchargables :
#   DRY_RUN=1       affiche les commandes sans les exécuter (les vérifications tournent quand même)
#   RUN_E2E=1       ajoute les tests Playwright (longs, navigateurs requis)
#   SKIP_TESTS=1    saute lint/type-check/tests (reprise d'un déploiement déjà validé)
#   SKIP_BACKUP=1   saute la sauvegarde de la base sur le NAS
#   NAS_HOST=… NAS_PORT=… NAS_DIR=…
set -euo pipefail

cd "$(dirname "$0")/.."

# Cible NAS (mêmes défauts que push-to-nas.sh).
NAS_HOST="${NAS_HOST:-erwan@ds218plus}"
NAS_PORT="${NAS_PORT:-2010}"
NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
IMAGE_ARCHIVE="${IMAGE_ARCHIVE:-marees-image.tar.gz}"

DRY_RUN="${DRY_RUN:-0}"
RUN_E2E="${RUN_E2E:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

# Version : argument (avec ou sans « v ») sinon package.json. Les deux doivent concorder — le hook
# le vérifie déjà, on le revérifie ici pour l'usage manuel.
PKG_VERSION="$(node -p "require('./package.json').version")"
VERSION="${1:-$PKG_VERSION}"
VERSION="${VERSION#v}"

if [ "${VERSION}" != "${PKG_VERSION}" ]; then
  echo "✗ Version demandée (${VERSION}) ≠ package.json (${PKG_VERSION})." >&2
  echo "  Aligner d'abord : npm version ${VERSION} --no-git-tag-version --workspaces --include-workspace-root" >&2
  exit 1
fi

# Étape atteinte, pour que le trap dise où ça s'est arrêté (Ctrl-C pendant le build, par exemple).
ETAPE="démarrage"
on_error() {
  local code=$?
  echo >&2
  echo "✗ Déploiement de v${VERSION} interrompu à l'étape : ${ETAPE} (code ${code})." >&2
  echo "  Reprise : ./deploy/release.sh v${VERSION}" >&2
  echo "  L'image a pu être transférée sans que le conteneur soit basculé ; l'app tourne alors" >&2
  echo "  encore sur l'ancienne version. Bascule manuelle :" >&2
  echo "    ssh ${NAS_HOST} -p ${NAS_PORT}" >&2
  echo "    cd ${NAS_DIR} && sudo bash update-on-nas.sh" >&2
}
trap on_error ERR INT TERM

# Exécute, ou affiche seulement en DRY_RUN. Les commandes passées ici sont celles qui ont un effet.
run() {
  if [ "${DRY_RUN}" = 1 ]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

echo "==> Déploiement de v${VERSION} vers ${NAS_HOST}:${NAS_DIR}"
[ "${DRY_RUN}" = 1 ] && echo "    (DRY_RUN : aucune commande d'effet ne sera exécutée)"

# --- 1/5 Pré-vol : 2 secondes ici évitent de découvrir un NAS éteint après 3 minutes de tests. ---
ETAPE="pré-vol (docker + NAS joignables)"
echo "==> 1/5 Pré-vol"
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker ne répond pas (démon arrêté ?)." >&2
  exit 1
fi
echo "  ✓ docker répond"
# `ssh -n` : indispensable, sinon ssh consomme le stdin de l'appelant (le hook y a ses refs).
if ! ssh -n -o BatchMode=yes -o ConnectTimeout=5 -p "${NAS_PORT}" "${NAS_HOST}" true 2>/dev/null; then
  echo "✗ NAS injoignable en SSH sans mot de passe (${NAS_HOST}:${NAS_PORT})." >&2
  echo "  Vérifier que le NAS est allumé et qu'une clé SSH est en place (BatchMode)." >&2
  exit 1
fi
echo "  ✓ ${NAS_HOST} joignable"

# --- 2/5 Vérifications : bloquantes, on ne déploie pas un état cassé. ---
ETAPE="vérifications (lint, type-check, tests)"
if [ "${SKIP_TESTS}" = 1 ]; then
  echo "==> 2/5 Vérifications — ignorées (SKIP_TESTS=1)"
else
  echo "==> 2/5 Vérifications"
  # `< /dev/null` : aucune de ces commandes ne doit lire le stdin de l'appelant.
  npm run lint < /dev/null
  npm run type-check < /dev/null
  npm test < /dev/null
  if [ "${RUN_E2E}" = 1 ]; then
    npm run test:e2e < /dev/null
  fi
  echo "  ✓ lint + type-check + tests"
fi

# --- 3/5 Sauvegarde de la base AVANT la bascule (les migrations de schéma tournent au démarrage). ---
ETAPE="sauvegarde de la base sur le NAS"
if [ "${SKIP_BACKUP}" = 1 ]; then
  echo "==> 3/5 Sauvegarde de la base — ignorée (SKIP_BACKUP=1)"
else
  echo "==> 3/5 Sauvegarde de la base sur le NAS"
  # backup-db-on-nas.sh ne demande ni sudo ni docker. Il est transféré par push-to-nas.sh, donc
  # présent depuis le déploiement précédent ; absent (1re fois), on n'échoue pas pour si peu.
  if run ssh -n -p "${NAS_PORT}" "${NAS_HOST}" \
    "cd ${NAS_DIR} && [ -f backup-db-on-nas.sh ] && bash backup-db-on-nas.sh"; then
    [ "${DRY_RUN}" = 1 ] || echo "  ✓ sauvegarde effectuée"
  else
    echo "  ⚠ sauvegarde impossible (script absent du NAS, ou base introuvable) — on continue." >&2
  fi
fi

# --- 4/5 Build + transfert (réutilise le script existant, qui tague aussi l'image à la version). ---
ETAPE="build et transfert de l'image"
echo "==> 4/5 Build + transfert de l'image"
run env APP_VERSION="${VERSION}" NAS_HOST="${NAS_HOST}" NAS_PORT="${NAS_PORT}" NAS_DIR="${NAS_DIR}" \
  IMAGE_ARCHIVE="${IMAGE_ARCHIVE}" ./deploy/push-to-nas.sh

# --- 5/5 Bascule du conteneur : interactive (mot de passe sudo). ---
ETAPE="bascule du conteneur sur le NAS"
echo "==> 5/5 Bascule du conteneur (mot de passe sudo demandé)"
if [ "${DRY_RUN}" = 1 ]; then
  printf '   [dry-run] ssh -t %s -p %s "cd %s && sudo bash update-on-nas.sh %s"\n' \
    "${NAS_HOST}" "${NAS_PORT}" "${NAS_DIR}" "${VERSION}"
else
  # `ssh -t` (pas `-n` !) + stdin sur /dev/tty : sudo a besoin d'un terminal pour lire le mot de
  # passe. Avec `-n`, stdin vient de /dev/null et le prompt échoue.
  # La version attendue passe en ARGUMENT et non par l'environnement : `sudo -E` peut être refusé
  # par la politique sudoers, un argument passe toujours.
  ssh -t -p "${NAS_PORT}" "${NAS_HOST}" \
    "cd ${NAS_DIR} && sudo bash update-on-nas.sh '${VERSION}'" < /dev/tty
fi

trap - ERR INT TERM
echo
if [ "${DRY_RUN}" = 1 ]; then
  echo "✓ Déroulé à blanc de v${VERSION} : rien n'a été déployé (DRY_RUN=1)."
else
  echo "✓ v${VERSION} déployée et vérifiée sur ${NAS_HOST}."
  echo "  L'app n'écoute que sur la boucle locale du NAS : y accéder via l'URL HTTPS du proxy DSM."
fi
