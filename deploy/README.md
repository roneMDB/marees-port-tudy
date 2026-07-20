# Déploiement (`deploy/`)

Fichiers de déploiement de **Marées Navihan** sur NAS Synology (DS218+), par transfert de
fichier (build sur le PC, exécution sur le NAS). Sur DS218+ (DSM 7.1, paquet **Docker**), le
lancement se fait **en SSH** (`docker-compose`) ; Container Manager / Projet n'existe qu'en
DSM 7.2+.

| Fichier | Rôle |
| --- | --- |
| [`INSTALLATION-NAS.md`](INSTALLATION-NAS.md) | **Guide d'installation complet** (prérequis, chargement de l'image, Container Manager, reverse proxy, mises à jour, sauvegarde, dépannage). |
| [`push-to-nas.sh`](push-to-nas.sh) | **Côté PC** : build + export de l'image, puis transfert (`scp`) de l'image, du compose et du script de mise à jour vers le NAS. Ne redémarre pas le conteneur. |
| [`update-on-nas.sh`](update-on-nas.sh) | **Côté NAS** : recharge l'image transférée et recrée le conteneur (`docker load` + `docker-compose up -d` + prune). Données `data/` conservées. |
| [`save-image.sh`](save-image.sh) | Build + export de l'image → `marees-image.tar.gz` (appelé par `push-to-nas.sh`, ou utilisable seul pour un transfert manuel). |
| [`docker-compose.nas.yml`](docker-compose.nas.yml) | Compose pour le NAS (image chargée, volume `/volume1/docker/marees/data`). À copier en `docker-compose.yml` sur le NAS. |

## Démarrage rapide (scripté, recommandé)

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

Pour la première installation (prérequis, dossiers, reverse proxy, dépannage) ou la méthode
**manuelle**, suivre **[INSTALLATION-NAS.md](INSTALLATION-NAS.md)**.

> Pour le développement local et le Docker « standard » (non-NAS), voir le
> [README racine](../README.md).
