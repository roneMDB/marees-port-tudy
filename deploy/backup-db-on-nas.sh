#!/usr/bin/env bash
# À exécuter SUR le NAS Synology (DS218+ / DSM 7.1) : sauvegarde datée de la base de production.
#
# Instantané pris **à chaud**, conteneur en marche, via `sqlite3 … "VACUUM INTO …"` : en mode WAL,
# copier `marees.db` seul ramènerait une base quasi vide (l'essentiel est dans `marees.db-wal`).
# Ne nécessite NI `sudo` NI docker → planifiable comme tâche utilisateur du Planificateur de
# tâches DSM (cf. deploy/INSTALLATION-NAS.md §10).
#
# Usage : bash /volume1/docker/marees/backup-db-on-nas.sh
# Réglages surchargables : DB=… BACKUP_DIR=… KEEP=… bash backup-db-on-nas.sh
set -euo pipefail

NAS_DIR="${NAS_DIR:-/volume1/docker/marees}"
DB="${DB:-${NAS_DIR}/data/marees.db}"
BACKUP_DIR="${BACKUP_DIR:-${NAS_DIR}/backups}"
KEEP="${KEEP:-14}" # nombre de sauvegardes conservées

if [ ! -f "${DB}" ]; then
  echo "✗ Base introuvable : ${DB}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="${BACKUP_DIR}/.tmp-${STAMP}.db"
OUT="${BACKUP_DIR}/marees-${STAMP}.db.gz"

# Le temporaire part même en cas d'échec (instantané interrompu, disque plein…).
trap 'rm -f "${TMP}"' EXIT

echo "==> 1/3 Instantané cohérent de ${DB}"
rm -f "${TMP}"
sqlite3 "${DB}" "VACUUM INTO '${TMP}'"

check="$(sqlite3 "${TMP}" 'PRAGMA integrity_check;')"
if [ "${check}" != "ok" ]; then
  # On sort AVANT la rotation : une sauvegarde ratée ne doit jamais faire tomber une bonne
  # sauvegarde existante.
  echo "✗ Instantané corrompu (integrity_check : ${check}) — aucune sauvegarde écrite." >&2
  exit 1
fi

echo "==> 2/3 Compression → ${OUT}"
gzip -c "${TMP}" >"${OUT}"
rm -f "${TMP}"

echo "==> 3/3 Rotation (on garde les ${KEEP} plus récentes)"
removed=0
while IFS= read -r old; do
  rm -f "${old}"
  echo "  supprimée : $(basename "${old}")"
  removed=$((removed + 1))
done < <(ls -1t "${BACKUP_DIR}"/marees-*.db.gz 2>/dev/null | tail -n "+$((KEEP + 1))")
if [ "${removed}" -eq 0 ]; then
  echo "  rien à supprimer"
fi

kept="$(ls -1 "${BACKUP_DIR}"/marees-*.db.gz 2>/dev/null | wc -l | tr -d ' ')"
echo
echo "✓ ${OUT} ($(du -h "${OUT}" | cut -f1)) — ${kept} sauvegarde(s) dans ${BACKUP_DIR}"
