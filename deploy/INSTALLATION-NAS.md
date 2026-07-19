# Installation sur NAS Synology DS218+

Guide pas-à-pas pour déployer **Marées Navihan** sur un Synology **DS218+** via **Container
Manager** (Docker), par **transfert de fichier** (pas de registre).

Principe : on **construit l'image sur le PC**, on l'exporte en archive, on la **copie sur le
NAS**, puis on la lance avec Docker Compose. La configuration et les horaires vivent dans un
**dossier du NAS** (volume) et survivent aux mises à jour.

---

## 1. Prérequis

| Élément | Détail |
| --- | --- |
| Modèle | **DS218+** (CPU Intel x86_64 — compatible Docker) |
| DSM | Sur DS218+ : **DSM 7.1** → paquet **Docker** (pas de « Container Manager »). Le paquet **Container Manager** et sa fonction **Projet** (compose via l'interface) n'existent qu'à partir de **DSM 7.2**. |
| Paquet | **Docker** installé depuis le *Centre de paquets* |
| Côté PC | **Docker** installé (pour builder l'image) — p. ex. Docker Desktop / WSL |
| Réseau | Adresse IP locale du NAS (ex. `192.168.1.50` ou nom `ds218plus.home`), port `3000` libre |
| SSH | **Requis ici** : activer dans *Panneau de configuration → Terminal & SNMP*. Sur DSM 7.1 (paquet Docker), le lancement se fait **en ligne de commande** (pas de Projet GUI). |

> ℹ️ Le DS218**+** (Intel) supporte Docker. Le DS218 « tout court » (ARM) ne le supporte pas.
>
> ⚠️ **DS218+ : DSM 7.1 maximum** → pas de Container Manager. La méthode de lancement de
> référence sur ce NAS est donc le **SSH** (§6, Option A). Les instructions « Container Manager /
> Projet » ne s'appliquent qu'à un NAS en **DSM 7.2+**.

---

## 2. Préparer les dossiers sur le NAS

Dans **File Station**, sous le dossier partagé `docker` (le créer s'il n'existe pas) :

```
/volume1/docker/marees/
/volume1/docker/marees/data/     ← config (settings.json) + horaires (auto-remplis au 1er démarrage)
```

Le dossier `data` sera monté comme **volume** ; c'est lui qui persiste. Le laisser **vide** au
premier lancement : l'application l'initialise automatiquement.

---

## 3. Construire et exporter l'image (sur le PC)

Depuis le dossier du projet :

```bash
./deploy/save-image.sh
# → génère marees-image.tar.gz
```

(équivalent manuel : `docker build -t marees-port-tudy:latest . && docker save marees-port-tudy:latest | gzip > marees-image.tar.gz`)

---

## 4. Transférer les fichiers sur le NAS

Deux fichiers à déposer dans `/volume1/docker/marees/` :

1. `marees-image.tar.gz`
2. `deploy/docker-compose.nas.yml` → **renommer en `docker-compose.yml`** dans ce dossier

### Option A — File Station (interface DSM)

Glisser-déposer les deux fichiers dans `/volume1/docker/marees/`, puis renommer
`docker-compose.nas.yml` en `docker-compose.yml`.

### Option B — SSH / `scp` (ligne de commande)

SSH doit être activé (*Panneau de configuration → Terminal & SNMP → Activer le service SSH*).
Depuis le PC, dans le dossier du projet. Deux pièges fréquents :

- ⚠️ `scp` utilise `-P` **majuscule** pour le port (contrairement à `ssh` : `-p` minuscule) ;
- ⚠️ **`-O` (majuscule) est indispensable sur Synology** : les versions récentes de `scp`
  passent par le sous-système **SFTP**, que DSM n'active pas par défaut. Sans `-O`, le transfert
  échoue avec `subsystem request failed on channel 0`. Le flag `-O` force l'ancien protocole scp.

```bash
# L'image (renommer NAS/port selon ton installation : ici erwan@ds218plus, port 2010)
scp -O -P 2010 marees-image.tar.gz erwan@ds218plus:/volume1/docker/marees/

# Le compose, directement renommé à l'arrivée en docker-compose.yml
scp -O -P 2010 deploy/docker-compose.nas.yml erwan@ds218plus:/volume1/docker/marees/docker-compose.yml
```

> ℹ️ **Alternative au flag `-O`** : activer SFTP côté NAS (*Panneau de configuration → Services
> de fichiers → FTP → onglet SFTP → Activer le service SFTP*). `scp` (et les clients type
> FileZilla) fonctionnent alors sans `-O`.
>
> ℹ️ Si le dossier `/volume1/docker/marees/` n'existe pas encore, le créer d'abord (voir §2)
> ou en SSH : `ssh erwan@ds218plus -p 2010 'mkdir -p /volume1/docker/marees/data'`.
>
> Selon la config du NAS, l'écriture directe dans `/volume1/docker/` peut demander des droits :
> si `scp` échoue pour cause de permissions, déposer dans ton dossier personnel
> (`erwan@ds218plus:~/`) puis déplacer les fichiers via File Station ou `sudo mv` en SSH.

---

## 5. Charger l'image

**En SSH (DS218+ / DSM 7.1)** :

```bash
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees
sudo docker load < marees-image.tar.gz
```

**Ou via l'interface DSM (DSM 7.2+ uniquement)** : **Container Manager → Image → Ajouter →
Ajouter depuis un fichier**, sélectionner `/volume1/docker/marees/marees-image.tar.gz`. L'image
`marees-port-tudy:latest` apparaît dans la liste.

---

## 6. Lancer le conteneur

### Option A — SSH (méthode de référence sur DS218+ / DSM 7.1)

```bash
ssh erwan@ds218plus -p 2010     # se connecter au NAS
cd /volume1/docker/marees
sudo docker-compose up -d
```

> ⚠️ **`docker-compose` avec un tiret** sur DSM 7.1 : le paquet Docker fournit l'ancienne
> commande (Compose v1). La forme `docker compose` (avec un espace, v2) **n'existe pas** et
> renvoie `unknown shorthand flag: 'd' in -d`.

Vérifier :

```bash
sudo docker-compose ps           # marees-port-tudy doit être "Up"
sudo docker-compose logs --tail=30
ls -la data/                     # settings.json + horaires_marees_port-tudy.json (auto-créés)
```

### Option B — Container Manager (uniquement si NAS en DSM 7.2+)

Non disponible sur DS218+ (DSM 7.1 max). Sur un NAS plus récent :

1. **Container Manager → Projet → Créer**.
2. **Nom du projet** : `marees`.
3. **Chemin** : `/volume1/docker/marees` (le dossier qui contient `docker-compose.yml`).
4. Source : *Utiliser un docker-compose.yml existant* → il détecte le fichier.
5. **Suivant → Terminé** : le projet se construit/démarre.

---

## 7. Accéder à l'application

Ouvrir dans un navigateur :

```
http://<IP-DU-NAS>:3000
```

(par IP, ex. `http://192.168.1.50:3000`, ou par nom si résolu, ex. `http://ds218plus.home:3000`.)

Au premier démarrage, `data/` se remplit tout seul : `settings.json` (configuration par défaut)
et `horaires_marees_port-tudy.json` (horaires embarqués dans l'image).

---

## 8. (Optionnel) Nom de domaine + HTTPS via le Reverse Proxy DSM

Pour un accès propre en HTTPS (ex. `https://marees.mondomaine.synology.me`) :

1. **Panneau de configuration → Portail de connexion → Avancé → Proxy inversé → Créer**.
2. **Source** : `https`, nom d'hôte souhaité, port `443`.
3. **Destination** : `http`, `localhost`, port `3000`.
4. Associer un certificat (Let's Encrypt via DSM, ou QuickConnect/DDNS Synology).

---

## 9. Mettre à jour l'application

1. Sur le PC : `./deploy/save-image.sh` (nouvelle `marees-image.tar.gz`).
2. Transférer et **recharger l'image** (étapes 4–5).
3. En SSH, relancer avec la nouvelle image :
   ```bash
   cd /volume1/docker/marees
   sudo docker-compose up -d      # recrée le conteneur sur la nouvelle image
   sudo docker image prune        # (optionnel) nettoie les anciennes images
   ```
   (DSM 7.2+ : *Container Manager → Projet `marees` → Action → Reconstruire*.)

Les données du dossier `data/` sont **conservées** (volume).

---

## 10. Sauvegarde & restauration des données

Tout l'état persistant tient dans **`/volume1/docker/marees/data/`** :

- `settings.json` — la configuration (période, décalages Navihan, jours à flot) ;
- `horaires_marees_port-tudy.json` — les horaires.

**Sauvegarde** : copier ce dossier (ou l'inclure dans *Hyper Backup*).
**Restauration** : remettre les fichiers dans `data/` puis redémarrer le conteneur.

**Mettre à jour les horaires** : remplacer `horaires_marees_port-tudy.json` dans `data/` par un
fichier au même format, puis redémarrer le conteneur (`sudo docker-compose restart` en SSH).

---

## 11. Utilisation hors-ligne (PWA)

L'application est une **PWA** : après une première visite **en ligne**, la page et les
**dernières données consultées** restent accessibles **hors-ligne**, et l'app est *installable*
(bouton « Ajouter à l'écran d'accueil » sur mobile / « Installer » sur navigateur de bureau).

---

## 12. Dépannage

| Symptôme | Piste |
| --- | --- |
| Page inaccessible | Vérifier que le conteneur tourne : `sudo docker-compose ps`. Voir les **logs**. |
| `unknown shorthand flag: 'd' in -d` | Tu as tapé `docker compose` (espace, v2, absent en DSM 7.1). Utiliser `docker-compose` (tiret). |
| `subsystem request failed on channel 0` (au `scp`) | scp récent + Synology sans SFTP : ajouter le flag `-O` (voir §4). |
| Port 3000 déjà utilisé | Modifier le mapping dans `docker-compose.yml` (ex. `"8080:3000"`) puis relancer ; accéder via `:8080`. |
| « data » vide et rien ne se crée | Vérifier le chemin du volume (`/volume1/docker/marees/data:/data`) et les droits du dossier. |
| Config non conservée après mise à jour | S'assurer que le volume pointe bien sur le dossier NAS (pas un volume anonyme). |
| Logs en SSH | `sudo docker logs -f marees-port-tudy` ou `sudo docker-compose logs -f` |
| Redémarrer | `sudo docker-compose restart` (DSM 7.2+ : Container Manager → Projet `marees` → Redémarrer) |

---

## Récapitulatif

| Paramètre | Valeur |
| --- | --- |
| Image | `marees-port-tudy:latest` |
| Compose | `deploy/docker-compose.nas.yml` (→ `docker-compose.yml` sur le NAS) |
| Dossier projet | `/volume1/docker/marees/` |
| Volume données | `/volume1/docker/marees/data` → `/data` (dans le conteneur) |
| Variables | `DATA_DIR=/data`, `PORT=3000` |
| Port | `3000` (hôte) → `3000` (conteneur) |
| URL | `http://<IP-DU-NAS>:3000` |
