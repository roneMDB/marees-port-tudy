#!/usr/bin/env bash
# Côté PC : rapatrie la base de PRODUCTION du NAS Synology (DS218+) dans le dossier de données
# local (`server/data/marees.db`), pour travailler sur les vraies données.
#
# L'instantané est pris **à chaud** (conteneur en marche) via `sqlite3 … "VACUUM INTO …"` : en mode
# WAL, copier `marees.db` seul ramènerait une base quasi vide (l'essentiel des données est dans
# `marees.db-wal` jusqu'au checkpoint). VACUUM INTO produit un fichier unique, cohérent et compacté.
#
# La base locale existante n'est jamais perdue : elle est renommée `marees.db.bak-<horodatage>`.
#
# Usage : npm run db:pull   (ou ./deploy/pull-db-from-nas.sh)
# Réglages surchargables : NAS_HOST=… NAS_PORT=… NAS_DIR=… LOCAL_DB=… ./deploy/pull-db-from-nas.sh
#
# ⚠️ Arrêter `npm run dev` avant : une connexion better-sqlite3 ouverte continuerait de lire le
#    fichier remplacé.
set -euo pipefail

cd "$(dirname "$0")/.."

# Cible NAS (défauts = configuration DS218+ actuelle).
NAS_HOST="${NAS_HOST:-erwan@ds218plus}"
NAS_PORT="${NAS_PORT:-2010}"
NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
REMOTE_DB="${REMOTE_DB:-${NAS_DIR}/data/marees.db}"
LOCAL_DB="${LOCAL_DB:-server/data/marees.db}"

STAMP="$(date +%Y%m%d-%H%M%S)"
REMOTE_TMP="/tmp/marees-pull-${STAMP}.db"

# Le temporaire distant part dans tous les cas, y compris si le transfert échoue.
cleanup() {
  ssh -p "${NAS_PORT}" "${NAS_HOST}" "rm -f '${REMOTE_TMP}'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 1/4 Instantané cohérent sur le NAS (VACUUM INTO)"
# `bash -s -- args` : le script arrive par stdin, les chemins en paramètres → pas d'échappement
# fragile dans une commande ssh sur une seule ligne.
ssh -p "${NAS_PORT}" "${NAS_HOST}" bash -s -- "${REMOTE_DB}" "${REMOTE_TMP}" <<'REMOTE'
set -euo pipefail
db="$1"
tmp="$2"

if [ ! -f "$db" ]; then
  echo "✗ Base introuvable sur le NAS : $db" >&2
  exit 1
fi

rm -f "$tmp"
if ! sqlite3 "$db" "VACUUM INTO '$tmp'"; then
  echo "✗ Instantané impossible (droits sur ${db}-shm ?)." >&2
  echo "  Repli documenté (deploy/INSTALLATION-NAS.md §10) : instantané depuis l'intérieur du" >&2
  echo "  conteneur, qui embarque better-sqlite3 :" >&2
  echo "    sudo docker exec marees-port-tudy node -e \"require('better-sqlite3')('/data/marees.db').backup('/data/snapshot.db').then(()=>console.log('ok'))\"" >&2
  exit 1
fi

check="$(sqlite3 "$tmp" 'PRAGMA integrity_check;')"
if [ "$check" != "ok" ]; then
  echo "✗ Instantané corrompu (integrity_check : $check) — rien n'est rapatrié." >&2
  rm -f "$tmp"
  exit 1
fi

echo "  instantané cohérent : $(du -h "$tmp" | cut -f1)"
REMOTE

echo "==> 2/4 Transfert vers ${LOCAL_DB}"
mkdir -p "$(dirname "${LOCAL_DB}")"
scp -O -P "${NAS_PORT}" "${NAS_HOST}:${REMOTE_TMP}" "${LOCAL_DB}.new"

echo "==> 3/4 Installation locale"
if [ -f "${LOCAL_DB}" ]; then
  mv "${LOCAL_DB}" "${LOCAL_DB}.bak-${STAMP}"
  echo "  ancienne base conservée → ${LOCAL_DB}.bak-${STAMP}"
fi
# Journaux WAL de l'ANCIENNE base : les laisser à côté de la nouvelle corromprait la lecture.
rm -f "${LOCAL_DB}-wal" "${LOCAL_DB}-shm"
mv "${LOCAL_DB}.new" "${LOCAL_DB}"

echo "==> 4/4 Contenu rapatrié"
echo "  ${LOCAL_DB} ($(du -h "${LOCAL_DB}" | cut -f1))"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${LOCAL_DB}" \
    "select '  marées      : ' || count(*) from tides;
     select '  utilisateurs: ' || count(*) from users;
     select '  accès       : ' || count(*) from access_log;" 2>/dev/null ||
    echo "  (comptages indisponibles)"
fi

echo
echo "✓ Base de prod installée dans ${LOCAL_DB}"
echo "  Relancer l'app en local : npm run dev"
