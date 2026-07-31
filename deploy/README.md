# Déploiement (`deploy/`)

Fichiers de déploiement de **Marées Navihan** sur NAS Synology (DS218+), par transfert de
fichier (build sur le PC, exécution sur le NAS). Sur DS218+ (DSM 7.1, paquet **Docker**), le
lancement se fait **en SSH** (`docker-compose`) ; Container Manager / Projet n'existe qu'en
DSM 7.2+.

| Fichier | Rôle |
| --- | --- |
| [`INSTALLATION-NAS.md`](INSTALLATION-NAS.md) | **Guide d'installation complet** (prérequis, chargement de l'image, Container Manager, reverse proxy, mises à jour, sauvegarde, dépannage). |
| [`MIGRATION-SQLITE.md`](MIGRATION-SQLITE.md) | **Migration vers SQLite** (#8) : passage des fichiers plats à `marees.db`. Migration auto au 1er démarrage, procédure NAS, exploitation, rollback. |
| [`release.sh`](release.sh) | **Côté PC** (`npm run deploy`) : **déploiement complet d'une version**. Pré-vol, `lint`/`type-check`/tests, sauvegarde de la base, transfert, bascule du conteneur, contrôle de santé et de version. Appelé automatiquement par le hook `pre-push` au push d'un tag `vX.Y.Z` (#12). |
| [`push-to-nas.sh`](push-to-nas.sh) | **Côté PC** : build + export de l'image, puis transfert (`scp`) de l'image, du compose et du script de mise à jour vers le NAS. Ne redémarre pas le conteneur. |
| [`update-on-nas.sh`](update-on-nas.sh) | **Côté NAS** : recharge l'image transférée et recrée le conteneur (`docker load` + `docker-compose up -d` + prune), puis **attend la sonde de vie** et **compare la version servie** à celle attendue. Volume `data/` conservé (base `marees.db`). |
| [`save-image.sh`](save-image.sh) | Build + export de l'image → `marees-image.tar.gz` (appelé par `push-to-nas.sh`, ou utilisable seul pour un transfert manuel). |
| [`backup-db-on-nas.sh`](backup-db-on-nas.sh) | **Côté NAS** : sauvegarde datée de la base (`backups/marees-AAAAMMJJ-HHMMSS.db.gz`, rotation `KEEP=14`). Instantané **à chaud** (`VACUUM INTO`) + `integrity_check`, sans `sudo` → planifiable par le Planificateur de tâches DSM (§10 du guide). |
| [`pull-db-from-nas.sh`](pull-db-from-nas.sh) | **Côté PC** (`npm run db:pull`) : rapatrie la base de **prod** dans `server/data/marees.db` (instantané à chaud + `scp`). L'ancienne base locale devient `marees.db.bak-<horodatage>`. |
| [`docker-compose.nas.yml`](docker-compose.nas.yml) | Compose pour le NAS (image chargée, volume `/volume1/docker/marees/data`). À copier en `docker-compose.yml` sur le NAS. |

## Déployer une version (recommandé, issue #12)

Le **push d'un tag `vX.Y.Z` déclenche le déploiement**. Une seule commande enchaîne tout, la seule
saisie étant la confirmation puis le mot de passe `sudo` du NAS :

```bash
# 1. Version (met à jour les 3 package.json d'un coup)
npm version 0.1.0 --no-git-tag-version --workspaces --include-workspace-root
# 2. Notes de release (git-cliff, déduit le tag du package.json)
npm run changelog
# 3. Commit puis tag ANNOTÉ (le CHANGELOG est ainsi dans le commit tagué)
git commit -am "chore(release): v0.1.0"
git tag -a v0.1.0 -m "v0.1.0"
# 4. Push → le hook pre-push vérifie, demande confirmation et déploie
git push --atomic --follow-tags origin main
```

Prérequis, **une fois par clone** (`core.hooksPath` vit dans `.git/config`, non versionné) :

```bash
npm run hooks:install     # posé aussi automatiquement par npm install (script `prepare`)
```

Le hook **refuse de déployer** si : le tag n'est pas annoté, ne pointe pas sur `HEAD`, l'arbre de
travail est modifié, la version du tag diffère des `package.json`, la branche n'est pas en
fast-forward, ou plusieurs tags de release sont poussés d'un coup. **Un déploiement échoué annule le
push** : le tag reste local et la reprise est un simple push rejoué (le déploiement est idempotent).
**Sans terminal** (script, CI, client graphique), le push passe mais rien n'est déployé.

Soupapes et réglages :

| Variable | Effet |
| --- | --- |
| `SKIP_DEPLOY=1 git push …` | pousse **sans** déployer, en gardant les contrôles de cohérence — **à préférer** à `--no-verify`, qui contourne aussi ces contrôles |
| `DRY_RUN=1` | déroule tout sans aucun effet de bord (les vérifications tournent quand même) |
| `DEPLOY_YES=1` | déploie sans confirmation (utile sans terminal) |
| `RUN_E2E=1` | ajoute les tests Playwright |
| `SKIP_TESTS=1` / `SKIP_BACKUP=1` | reprise d'un déploiement déjà validé |
| `NAS_HOST` / `NAS_PORT` / `NAS_DIR` | cible du déploiement |

Reprendre un déploiement interrompu, sans repasser par git : `npm run deploy -- v0.1.0`.

## Démarrage rapide sans tag (mise à jour manuelle)

Le dossier `/volume1/docker/marees/` doit exister sur le NAS (voir §2 du guide). Ensuite,
deux commandes suffisent :

```bash
# 1. Côté PC : build, export et transfert vers le NAS
./deploy/push-to-nas.sh

# 2. Côté NAS : recharger l'image et recréer le conteneur
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees && sudo bash update-on-nas.sh
```

Réglages surchargables côté PC : `NAS_HOST=… NAS_PORT=… NAS_DIR=… ./deploy/push-to-nas.sh`.

**Rollback** : `save-image.sh` tague l'image à la version en plus de `:latest`, donc l'image
précédente reste sur le NAS et un retour arrière ne demande pas de re-transférer ~115 Mo :

```bash
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees
sudo docker images marees-port-tudy                        # versions disponibles
sudo docker tag marees-port-tudy:0.1.0 marees-port-tudy:latest
sudo docker-compose up -d
```

Pour la première installation (prérequis, dossiers, reverse proxy, dépannage) ou la méthode
**manuelle**, suivre **[INSTALLATION-NAS.md](INSTALLATION-NAS.md)**.

> Pour le développement local et le Docker « standard » (non-NAS), voir le
> [README racine](../README.md).
