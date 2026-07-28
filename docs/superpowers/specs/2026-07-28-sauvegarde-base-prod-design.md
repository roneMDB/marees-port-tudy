# Copier et sauvegarder la base de prod — issue #11

**Date** : 2026-07-28
**Contexte** : la base SQLite unique de l'issue #8 tourne en prod sur le NAS DS218+
(`/volume1/docker/marees/data/marees.db`, volume Docker).

## Besoin

Issue #11 : (a) une commande `npm run` qui **rapatrie la base de prod** dans
`server/data/marees.db` pour travailler sur les vraies données ; (b) « peut-être » une **tâche de
sauvegarde**. Retenu avec l'utilisateur : **les deux**, la sauvegarde tournant **sur le NAS** (elle
doit fonctionner PC éteint, et *Hyper Backup* peut alors embarquer le dossier de sauvegardes).

Deux faits vérifiés sur le NAS dictent le design :

1. **Copier `marees.db` seul ramènerait une base quasi vide.** Constaté le 28/07/2026 :
   `marees.db` = 4 Ko, `marees.db-wal` = **1,2 Mo**. En mode WAL (`PRAGMA journal_mode=WAL`,
   `server/src/db/index.ts`), l'essentiel des données vit dans le journal jusqu'au *checkpoint*.
   Il faut un **instantané cohérent**, pas une copie de fichier — ce que la consigne actuelle de
   `deploy/INSTALLATION-NAS.md` §10 (« copier le dossier `data/` … idéalement conteneur arrêté »)
   laisse faire par mégarde.
2. **`sqlite3` 3.34.1 est présent sur le NAS** (`/usr/bin/sqlite3`) et utilisable **sans `sudo`**
   par l'utilisateur `erwan` (fichiers du volume en `0777` + ACL DSM). `VACUUM INTO` existe depuis
   SQLite 3.27 → instantané **cohérent et compacté, à chaud**, conteneur en marche, sans
   interruption de service.

## Choix de conception

**Bash + `ssh`/`scp`**, sur le patron exact des scripts existants (`deploy/push-to-nas.sh`,
`deploy/update-on-nas.sh`) : `set -euo pipefail`, en-tête de commentaire en français, étapes
numérotées `==> n/N`, réglages surchargables par variables d'environnement
(`NAS_HOST=erwan@ds218plus`, `NAS_PORT=2010`, `NAS_DIR=/volume1/docker/marees`), `scp -O -P`
(contournement du piège SFTP Synology).

Pas de script Node/ts-node : l'opération est **distante** et n'a besoin d'aucun code de l'app.
`VACUUM INTO` plutôt que la copie des trois fichiers `marees.db{,-wal,-shm}` : un seul fichier à
transférer, cohérent par construction, et compacté.

## Composant 1 — `deploy/pull-db-from-nas.sh` (côté PC)

Variables : `NAS_HOST`, `NAS_PORT`, `NAS_DIR`, `REMOTE_DB=$NAS_DIR/data/marees.db`,
`LOCAL_DB=server/data/marees.db`, `STAMP=$(date +%Y%m%d-%H%M%S)`. Exposé par
`npm run db:pull` (script du `package.json` racine).

1. **Instantané sur le NAS**, en un seul `ssh` :
   `sqlite3 "$REMOTE_DB" "VACUUM INTO '/tmp/marees-pull-$STAMP.db'"`, puis
   `PRAGMA integrity_check` sur l'instantané → **abandon si le résultat n'est pas `ok`** : on ne
   rapatrie pas une base douteuse. `VACUUM INTO` exige une destination inexistante, d'où le nom
   horodaté et un `rm -f` préalable.
2. **Transfert** : `mkdir -p` du dossier local, puis
   `scp -O -P "$NAS_PORT" "$NAS_HOST:/tmp/marees-pull-$STAMP.db" "$LOCAL_DB.new"`. **Pas de gzip** :
   ~1,5 Mo sur le LAN, la simplicité vaut mieux que les quelques dixièmes de seconde gagnés.
3. **Nettoyage du temporaire distant** (`ssh … rm -f`), via un `trap … EXIT` pour qu'il parte aussi
   quand le transfert échoue.
4. **Installation locale** — décidé avec l'utilisateur : **sauvegarde automatique puis écrasement**,
   aucun flag à retenir, rien de perdu.
   - si `$LOCAL_DB` existe → `mv "$LOCAL_DB" "$LOCAL_DB.bak-$STAMP"`, annoncé dans la sortie ;
   - `rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"` : ces journaux appartiennent à l'**ancienne** base ;
     les laisser à côté de la base rapatriée corromprait la lecture ;
   - `mv "$LOCAL_DB.new" "$LOCAL_DB"`.
5. **Résumé** : taille du fichier, puis comptages `tides` / `users` / `access_log` via le `sqlite3`
   local s'il est présent (il l'est sur ce poste), sinon étape sautée silencieusement. Rappel
   final : **arrêter `npm run dev` avant le pull** — une connexion `better-sqlite3` ouverte
   continuerait de lire le fichier remplacé.

**Repli en cas d'échec de l'instantané.** Le seul scénario réaliste est une perte des droits
d'écriture sur `marees.db-shm` (un futur conteneur recréant les fichiers avec un umask strict ;
en WAL, une simple *lecture* a besoin d'écrire le `-shm`). Le message d'erreur renvoie alors vers
la solution documentée : instantané depuis **l'intérieur du conteneur**,
`sudo docker exec marees-port-tudy node -e "…db.backup('/data/snapshot.db')…"` — l'image embarque
`better-sqlite3`, pas le binaire `sqlite3`.

## Composant 2 — `deploy/backup-db-on-nas.sh` (côté NAS)

Variables : `NAS_DIR`, `DB=$NAS_DIR/data/marees.db`, `BACKUP_DIR=$NAS_DIR/backups`, `KEEP=14`.

`mkdir -p "$BACKUP_DIR"` → `VACUUM INTO` vers un temporaire → `PRAGMA integrity_check`
(**abandon si ≠ `ok`, sans toucher aux sauvegardes existantes** : une sauvegarde ratée ne doit
jamais faire tomber une bonne sauvegarde par rotation) → `gzip -c` vers
`marees-AAAAMMJJ-HHMMSS.db.gz` → suppression du temporaire → **rotation** :
`ls -1t "$BACKUP_DIR"/marees-*.db.gz | tail -n +$((KEEP+1)) | xargs -r rm -f`.
Sortie finale : chemin, taille, nombre de sauvegardes conservées.

Ne nécessite **pas** `sudo` : ni `docker` ni accès privilégié, juste `sqlite3` et le volume en 0777.
C'est ce qui permet de le planifier comme **tâche utilisateur** du Planificateur de tâches DSM.

## Composant 3 — transfert du script sur le NAS

`deploy/push-to-nas.sh` transfère aujourd'hui `update-on-nas.sh` (étape 4/4) ; il transfère
désormais **les deux scripts NAS**, même mécanique `scp -O`, libellé d'étape adapté. Le script de
sauvegarde arrive ainsi par le chemin de déploiement déjà en place, sans procédure nouvelle à
retenir.

## Documentation

- **`deploy/README.md`** — deux lignes dans le tableau des fichiers.
- **`deploy/INSTALLATION-NAS.md` §10 « Sauvegarde & restauration »** — remplace la consigne actuelle
  (le piège du WAL) par : (1) procédure scriptée `bash backup-db-on-nas.sh`, **à chaud** ;
  (2) **planification DSM** : Panneau de configuration → Planificateur de tâches → Créer → Tâche
  planifiée, utilisateur `erwan`, commande `bash /volume1/docker/marees/backup-db-on-nas.sh`,
  quotidien ; (3) **restauration** : arrêter le conteneur,
  `gunzip -c backups/marees-….db.gz > data/marees.db`, supprimer `data/marees.db-wal` / `-shm`,
  redémarrer ; (4) **copie vers le poste de dev** : `npm run db:pull` ; (5) *Hyper Backup* sur
  `/volume1/docker/marees/backups`.
- **`CLAUDE.md`** — une ligne dans *Commandes* (`npm run db:pull`) et une mention du script de
  sauvegarde dans *Déploiement (`deploy/`)*.

Rien à ajouter au `.gitignore` : `server/data/` est déjà ignoré (donc les `.bak-*` aussi), et les
sauvegardes ne vivent que sur le NAS.

## Hors périmètre

**Aucun script « push local → prod »** : écraser la base de production depuis le poste de dev est
irréversible, et l'app dispose déjà d'un chemin d'écriture sûr et tracé (panneau **Import des
horaires**, `POST /api/tides/import`, rôle admin).

## Vérification

Pas de framework de test bash dans le repo → vérification par **exécution réelle**.

1. `bash -n deploy/pull-db-from-nas.sh deploy/backup-db-on-nas.sh` et `npm run lint`.
2. **Sauvegarde NAS** : transférer le script puis
   `ssh erwan@ds218plus -p 2010 'cd /volume1/docker/marees && bash backup-db-on-nas.sh'` → un
   `backups/marees-*.db.gz` de taille non nulle, **app toujours joignable pendant l'opération**.
   Relancer avec `KEEP=1` pour vérifier la rotation.
3. **Pull** : `npm run db:pull` → `server/data/marees.db.bak-<stamp>` créé, `marees.db` remplacé,
   plus de `-wal`/`-shm` périmés, comptages affichés non nuls.
4. **Base rapatriée exploitable** : `npm run dev`, puis `GET /api/health` et
   `GET /api/tides/meta?site=port-tudy` → bornes de dates de la prod. Contrôle croisé des données :
   `npm -w server run check-tides -- --db`.
5. `npm test` (serveur + client) : confirme qu'aucun test ne dépendait du contenu de la base locale
   de dev.
