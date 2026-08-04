#!/usr/bin/env bash
# Côté PC : pose une nouvelle version et la publie. Le push du tag déclenche le déploiement sur le
# NAS via le hook .githooks/pre-push (qui appelle deploy/release.sh).
#
# ⚠️ Ne pas confondre avec deploy/release.sh, qui DÉPLOIE une version déjà taguée (`npm run deploy`,
#    pour reprendre un déploiement interrompu). Ici on CRÉE la version.
#
# Enchaîne : pré-vol → bump des 3 manifests → changelog → confirmation → commit + tag + push.
#
# Pourquoi un script : la séquence manuelle tient en six commandes dont un `npm version` à trois
# drapeaux. En oublier un ne casse rien tout de suite — ça laisse les workspaces en arrière, ou pose
# un tag automatique sur le mauvais commit, et le hook ne le découvre qu'au push, sur un état déjà
# construit qu'il faut alors savoir défaire (vécu en v1.1.0). Ici tout échec avant le push est défait
# automatiquement.
#
# Usage : npm run release -- <patch|minor|major|X.Y.Z>
#         ./deploy/new-version.sh minor
#
# Réglages surchargables :
#   DRY_RUN=1        va jusqu'au changelog (pour voir la version et les notes réelles), ne commite
#                    ni ne tague ni ne pousse, et défait tout en sortant
#   DEPLOY_REMOTE=…  remote de publication (défaut : origin)
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN="${DRY_RUN:-0}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCHE_RELEASE="main"
MANIFESTS=(package.json package-lock.json server/package.json client/package.json)

usage() {
  cat >&2 <<'MSG'
Usage : npm run release -- <patch|minor|major|X.Y.Z>

  patch   1.1.0 → 1.1.1     corrections seules
  minor   1.1.0 → 1.2.0     nouvelles fonctionnalités
  major   1.1.0 → 2.0.0     rupture de compatibilité
  X.Y.Z   version explicite (reprise, saut de version)

  DRY_RUN=1 npm run release -- minor    déroule sans rien publier
MSG
}

# --- Argument : validé AVANT tout, c'est ce contrôle qui rend un « v01.1.0 » impossible. ---------
CIBLE="${1:-}"
if [ -z "${CIBLE}" ]; then
  echo "✗ Argument manquant." >&2
  usage
  exit 1
fi
# Chaque composant est `0` ou commence par 1-9 : `[0-9]+` laisserait passer « 01.1.0 », qui est
# précisément la faute de frappe qui a fait échouer la v1.1.0 (tag « v01.1.0 »).
NUM='(0|[1-9][0-9]*)'
if ! [[ "${CIBLE}" =~ ^(patch|minor|major|${NUM}\.${NUM}\.${NUM})$ ]]; then
  echo "✗ Argument invalide : « ${CIBLE} »." >&2
  echo "  Attendu : patch, minor, major, ou une version X.Y.Z sans « v » ni zéro superflu." >&2
  usage
  exit 1
fi

# --- Rollback. ----------------------------------------------------------------------------------
# PHASE dit quoi défaire : rien avant le pré-vol, tout pendant la construction locale, plus rien
# une fois le push tenté (le hook annule déjà le push, la reprise est un push rejoué).
PHASE="prevol"
ETAPE="démarrage"
DEPART=""
TAG_POSE=0
VERSION=""

# `git reset --hard` couvre d'un coup le bump, le changelog et le commit — c'est légitime ici parce
# que le pré-vol a exigé un arbre propre : il n'y a aucun travail en cours à écraser.
rollback() {
  [ "${TAG_POSE}" = 1 ] && git tag -d "v${VERSION}" >/dev/null 2>&1 || true
  [ -n "${DEPART}" ] && git reset --hard "${DEPART}" >/dev/null 2>&1 || true
}

on_error() {
  local code=$?
  echo >&2
  case "${PHASE}" in
    prevol)
      echo "✗ Interrompu à l'étape : ${ETAPE} (code ${code}). Rien n'a été modifié." >&2
      ;;
    local)
      rollback
      echo "✗ Interrompu à l'étape : ${ETAPE} (code ${code}) → état restauré (aucun commit, aucun tag)." >&2
      ;;
    push)
      cat >&2 <<MSG
✗ Publication de v${VERSION} interrompue à l'étape : ${ETAPE} (code ${code}).
  Le commit et le tag v${VERSION} sont CONSERVÉS : le hook annule le push, pas le travail local.
  Reprises possibles :
    git push --atomic ${DEPLOY_REMOTE} ${BRANCHE_RELEASE} refs/tags/v${VERSION}   # rejouer
    ./deploy/release.sh v${VERSION}                                              # déployer seul
    SKIP_DEPLOY=1 git push ${DEPLOY_REMOTE} ${BRANCHE_RELEASE} v${VERSION}       # publier sans déployer
  Tout défaire : git tag -d v${VERSION} && git reset --hard ${DEPART}
MSG
      ;;
  esac
}
trap on_error ERR INT TERM

run() {
  if [ "${DRY_RUN}" = 1 ]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

ANCIENNE="$(node -p "require('./package.json').version")"
echo "==> Nouvelle version (${CIBLE}) depuis ${ANCIENNE}"
[ "${DRY_RUN}" = 1 ] && echo "    (DRY_RUN : ni commit, ni tag, ni push — tout est défait en sortant)"

# --- 1/5 Pré-vol : échouer AVANT d'écrire quoi que ce soit. -------------------------------------
ETAPE="pré-vol"
echo "==> 1/5 Pré-vol"

branche="$(git symbolic-ref --quiet --short HEAD || echo '')"
if [ "${branche}" != "${BRANCHE_RELEASE}" ]; then
  echo "✗ Branche courante « ${branche:-détachée} » : une release se pose sur ${BRANCHE_RELEASE}." >&2
  exit 1
fi

# L'image est construite depuis l'ARBRE DE TRAVAIL (.dockerignore exclut .git) : un fichier modifié
# partirait en production sans être tagué. Le hook refuse aussi, mais trop tard.
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "✗ Arbre de travail modifié : committer ou remiser avant de publier." >&2
  git status --short >&2
  exit 1
fi

# Le remote est autoritaire : si main a avancé là-bas, le push serait rejeté après le déploiement.
if amont="$(git ls-remote --exit-code "${DEPLOY_REMOTE}" "refs/heads/${BRANCHE_RELEASE}" 2>/dev/null | cut -f1)"; then
  if [ -n "${amont}" ] && ! git merge-base --is-ancestor "${amont}" HEAD; then
    echo "✗ ${DEPLOY_REMOTE}/${BRANCHE_RELEASE} a avancé : git pull --rebase avant de publier." >&2
    exit 1
  fi
fi

if [ "$(git config core.hooksPath || echo '')" != ".githooks" ]; then
  echo "⚠ core.hooksPath ≠ .githooks : le push publiera le tag SANS déployer." >&2
  echo "  Activer : npm run hooks:install" >&2
fi

# Un tag de release local non publié ferait échouer le hook (« 2 tags de release dans le même
# push ») si le push les emportait. On ne pousse que le tag du jour, mais autant le signaler.
orphelins="$(git tag --list 'v[0-9]*' --no-merged "${DEPLOY_REMOTE}/${BRANCHE_RELEASE}" 2>/dev/null || true)"
if [ -n "${orphelins}" ]; then
  echo "⚠ Tags de release locaux hors de ${DEPLOY_REMOTE}/${BRANCHE_RELEASE} :" >&2
  printf '    %s\n' ${orphelins} >&2
  echo "  Les supprimer s'ils sont des résidus : git tag -d <tag>" >&2
fi

DEPART="$(git rev-parse HEAD)"
echo "    ✓ sur ${BRANCHE_RELEASE}, arbre propre, à jour avec ${DEPLOY_REMOTE}"

# --- 2/5 Bump des trois manifests. -------------------------------------------------------------
# Les trois drapeaux sont ici une fois pour toutes : sans --workspaces, server/ et client/ restent
# en arrière et le hook refuse le tag (le client lit SA version au build, c'est elle qu'affiche le
# pied de page). --allow-same-version permet de rattraper un bump déjà fait à la main.
PHASE="local"
ETAPE="bump des manifests"
echo "==> 2/5 Bump (${CIBLE})"
npm version "${CIBLE}" --no-git-tag-version --workspaces --include-workspace-root \
  --allow-same-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

for manifest in "${MANIFESTS[@]}"; do
  [ "${manifest}" = package-lock.json ] && continue
  v="$(node -p "require('./${manifest}').version")"
  if [ "${v}" != "${VERSION}" ]; then
    echo "✗ ${manifest} porte ${v} au lieu de ${VERSION} (bump incomplet)." >&2
    exit 1
  fi
done
echo "    ✓ ${ANCIENNE} → ${VERSION} (racine, server, client)"

ETAPE="contrôle du tag ${TAG}"
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "✗ Le tag ${TAG} existe déjà en local." >&2
  echo "  Choisir une autre version, ou le retirer : git tag -d ${TAG}" >&2
  exit 1
fi
if [ -n "$(git ls-remote --tags "${DEPLOY_REMOTE}" "refs/tags/${TAG}" 2>/dev/null)" ]; then
  echo "✗ Le tag ${TAG} est déjà publié sur ${DEPLOY_REMOTE} : cette version est sortie." >&2
  exit 1
fi

# --- 3/5 Changelog : APRÈS le bump, git-cliff déduit le tag de la version du package.json. ------
ETAPE="génération du changelog"
echo "==> 3/5 Changelog (git-cliff)"
npm --silent run changelog
if ! grep -q "\[${VERSION}\]" CHANGELOG.md; then
  echo "✗ CHANGELOG.md ne contient pas de section [${VERSION}] : rien à publier ?" >&2
  exit 1
fi
echo "    ✓ CHANGELOG.md régénéré"

# --- 4/5 Confirmation, notes de version sous les yeux. -----------------------------------------
ETAPE="confirmation"
echo "==> 4/5 Notes de la version ${VERSION}"
echo
# Section de la nouvelle version : de son titre jusqu'au titre suivant.
awk -v titre="## [${VERSION}]" '
  index($0, titre) == 1 { dans = 1; next }
  dans && /^## \[/      { exit }
  dans                  { print "   " $0 }
' CHANGELOG.md
echo

# Présence du tty testée par ouverture réelle dans un SOUS-SHELL : `[ -r /dev/tty ]` réussit même
# sans terminal de contrôle, et `exec 3</dev/tty` ferait sortir le shell (builtin spécial).
if ! ( : < /dev/tty ) 2>/dev/null; then
  rollback
  echo "✗ Pas de terminal : une release ne se confirme pas toute seule. Rien n'a été publié." >&2
  exit 1
fi

printf '➜ Publier v%s (push du tag → déploiement NAS) ? [o/N] ' "${VERSION}" > /dev/tty
reponse=""
IFS= read -r reponse < /dev/tty || reponse=""
case "${reponse}" in
  o | O | oui | y | Y) ;;
  *)
    rollback
    echo "✗ Annulé. Rien n'a été publié, l'état local est restauré." >&2
    exit 0
    ;;
esac

if [ "${DRY_RUN}" = 1 ]; then
  echo "==> 5/5 Publication"
  run git commit -m "chore(release): ${TAG}"
  run git tag -a "${TAG}" -m "${TAG}"
  run git push --atomic "${DEPLOY_REMOTE}" "${BRANCHE_RELEASE}" "refs/tags/${TAG}"
  rollback
  echo
  echo "✓ DRY_RUN terminé : ${ANCIENNE} → ${VERSION} simulée, état local restauré."
  exit 0
fi

# --- 5/5 Commit, tag, push. --------------------------------------------------------------------
ETAPE="commit de release"
echo "==> 5/5 Publication"
# `git add` explicite : la liste dit ce qu'une release est censée toucher, et un fichier oublié
# ailleurs ne part pas en douce dans le commit de version.
git add "${MANIFESTS[@]}" CHANGELOG.md
git commit -q -m "chore(release): ${TAG}"

ETAPE="pose du tag ${TAG}"
git tag -a "${TAG}" -m "${TAG}"
TAG_POSE=1
echo "    ✓ commit + tag ${TAG} sur HEAD"

# Le push déclenche le hook, donc le déploiement. Deux précautions :
#  - refs explicites plutôt que --follow-tags : un vieux tag local traînant ne part pas avec, sinon
#    le hook refuse (« 2 tags de release dans le même push ») après tout ce travail ;
#  - DEPLOY_YES=1 : la confirmation vient d'être donnée ci-dessus, avec les notes de version sous
#    les yeux. Sans ça le hook la redemanderait, moins bien informée.
PHASE="push"
ETAPE="push + déploiement"
echo "    → push vers ${DEPLOY_REMOTE} (le déploiement NAS demande le mot de passe sudo)"
DEPLOY_YES=1 git push --atomic "${DEPLOY_REMOTE}" "${BRANCHE_RELEASE}" "refs/tags/${TAG}"

trap - ERR INT TERM
echo
echo "✓ v${VERSION} publiée et déployée."
echo "  Version servie : curl -s http://ds218plus.home:3000/api/health"
