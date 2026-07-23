# Migration vers SQLite (issue #8)

À partir de cette version, **toutes les données runtime** sont stockées dans **une base SQLite
unique `marees.db`** (dans le volume `DATA_DIR`, `/data` dans le conteneur), au lieu des anciens
fichiers plats. Ce document décrit la migration d'un déploiement existant (NAS) et l'exploitation.

## Ce qui change

| Avant (fichiers dans `data/`) | Après |
| --- | --- |
| `settings.json` | Table `settings` de `marees.db` |
| `horaires_marees_port-tudy.json`, `horaires_marees_etel.json` | Table `tides` de `marees.db` |
| `access-log.jsonl` (+ `.1`) | Table `access_log` de `marees.db` |

La base est créée dans `DATA_DIR/marees.db` (+ fichiers `marees.db-wal` / `marees.db-shm` du mode WAL).

## La migration est automatique (au 1er démarrage)

Au premier démarrage de la nouvelle image, `initStorage()` amorce la base **si elle est vide** :

- **Horaires** : pour chaque site sans données, import du fichier legacy
  `DATA_DIR/horaires_marees_<site>.json` **s'il existe** (cas d'un volume existant), sinon de la
  graine embarquée dans l'image.
- **Réglages** : si la ligne de config est absente, import de `DATA_DIR/settings.json` **s'il
  existe**, sinon écriture des valeurs par défaut.

→ Sur un volume NAS existant, **les horaires et les réglages sont migrés sans action manuelle**.
L'opération est **idempotente** : aux démarrages suivants, rien n'est réimporté (la base n'est
plus vide).

### ⚠️ Le journal d'accès n'est pas migré

`access-log.jsonl` **n'a pas d'importeur** : les **statistiques d'accès repartent de zéro**.
Données anonymisées, non critiques. L'ancien fichier reste dans le volume, inutilisé.

## Procédure (NAS Synology)

1. **Sauvegarder le volume** (impératif avant tout upgrade) :
   ```bash
   ssh erwan@ds218plus -p 2010
   sudo cp -a /volume1/docker/marees/data /volume1/docker/marees/data.bak-$(date +%F)
   ```
2. **Déployer la nouvelle image** (depuis le PC puis le NAS) :
   ```bash
   ./deploy/push-to-nas.sh                 # PC : build + transfert
   ssh erwan@ds218plus -p 2010
   cd /volume1/docker/marees && sudo bash update-on-nas.sh   # NAS : recharge + recrée
   ```
3. **Vérifier les logs du 1er démarrage** (migration) :
   ```bash
   sudo docker-compose logs --tail=50 | grep -iE "importés en base|settings.json"
   ```
   Attendu : `Horaires « … » importés en base depuis …/horaires_marees_*.json` et
   `Réglages importés depuis settings.json (legacy)`.
4. **Vérifier l'app** : réglages conservés, marées présentes, statistiques accessibles (vides).
   La base doit exister :
   ```bash
   ls -l /volume1/docker/marees/data/marees.db*
   ```
5. **(Optionnel) Nettoyer le volume** une fois la migration confirmée :
   ```bash
   cd /volume1/docker/marees/data
   sudo rm -f settings.json horaires_marees_*.json access-log.jsonl access-log.jsonl.1
   # NE PAS supprimer marees.db (ni -wal / -shm)
   ```

## Exploitation après migration

- **Modifier les horaires** : la base est désormais la **source de vérité**. Éditer les anciens
  fichiers JSON n'a plus d'effet. Utiliser le panneau **« Import des horaires »** (rôle admin,
  bouton navbar) — coller/téléverser un JSON au format graine, mode *fusionner* (par jour) ou
  *remplacer* (tout le site). Pris en compte immédiatement, sans redémarrage.
- **Repartir des graines** (réinitialiser un site) : arrêter le conteneur, supprimer
  `marees.db*` du volume, redémarrer → ré-amorçage depuis les graines embarquées dans l'image.
- **Sauvegarde/restauration** : sauvegarder `marees.db` (idéalement conteneur arrêté, ou copier
  les 3 fichiers `marees.db`, `-wal`, `-shm`). Restaurer = remettre ces fichiers dans le volume.

## Rollback

Revenir à l'image précédente **et** restaurer la sauvegarde du volume (`data.bak-…`). La base
`marees.db` est ignorée par l'ancienne version (qui relit les fichiers JSON).

## Permissions (rappel)

Le conteneur tourne en `USER node` (uid **1000**). Sur un bind-mount NAS, le dossier `data/` doit
rester accessible en **écriture par l'uid 1000** (inchangé par rapport aux fichiers JSON).
