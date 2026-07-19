# Déploiement (`deploy/`)

Fichiers de déploiement de **Marées Navihan** sur NAS Synology (DS218+), par transfert de
fichier (build sur le PC, exécution sur le NAS). Sur DS218+ (DSM 7.1, paquet **Docker**), le
lancement se fait **en SSH** (`docker-compose`) ; Container Manager / Projet n'existe qu'en
DSM 7.2+.

| Fichier | Rôle |
| --- | --- |
| [`INSTALLATION-NAS.md`](INSTALLATION-NAS.md) | **Guide d'installation complet** (prérequis, chargement de l'image, Container Manager, reverse proxy, mises à jour, sauvegarde, dépannage). |
| [`save-image.sh`](save-image.sh) | Build + export de l'image → `marees-image.tar.gz` (à transférer sur le NAS). |
| [`docker-compose.nas.yml`](docker-compose.nas.yml) | Compose pour le NAS (image chargée, volume `/volume1/docker/marees/data`). À copier en `docker-compose.yml` sur le NAS. |

Démarrage rapide :

```bash
./deploy/save-image.sh    # → marees-image.tar.gz
```

Puis suivre **[INSTALLATION-NAS.md](INSTALLATION-NAS.md)**.

> Pour le développement local et le Docker « standard » (non-NAS), voir le
> [README racine](../README.md).
