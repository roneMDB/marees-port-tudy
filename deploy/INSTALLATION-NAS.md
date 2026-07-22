# Installation sur NAS Synology DS218+

Guide pas-à-pas pour déployer **Marées Navihan** sur un Synology **DS218+** via **Container
Manager** (Docker), par **transfert de fichier** (pas de registre).

Principe : on **construit l'image sur le PC**, on l'exporte en archive, on la **copie sur le
NAS**, puis on la lance avec Docker Compose. La configuration et les horaires vivent dans un
**dossier du NAS** (volume) et survivent aux mises à jour.

> 🚀 **Raccourci scripté (recommandé)** : une fois les prérequis (§1) et les dossiers du NAS
> (§2) en place, tout le cycle build → transfert → lancement tient en deux scripts. Voir
> **[§0 Méthode rapide](#0-méthode-rapide-scriptée-recommandée)** ci-dessous. Les sections
> §3 à §6 décrivent la méthode **manuelle** équivalente (utile pour comprendre ou dépanner).

---

## 0. Méthode rapide (scriptée, recommandée)

Deux scripts automatisent tout le déploiement une fois les **prérequis (§1)** installés et le
**dossier `/volume1/docker/marees/` créé sur le NAS (§2)** :

| Script | S'exécute… | Fait quoi |
| --- | --- | --- |
| [`push-to-nas.sh`](push-to-nas.sh) | sur le **PC** | build + export de l'image (`save-image.sh`), puis `scp` de l'image, du `docker-compose.yml` et de `update-on-nas.sh` vers le NAS. **Ne redémarre pas** le conteneur. |
| [`update-on-nas.sh`](update-on-nas.sh) | sur le **NAS** | `docker load` de l'image + `docker-compose up -d` (recrée le conteneur) + `docker image prune`. Données `data/` **conservées**. |

```bash
# 1. Côté PC (dans le dossier du projet)
./deploy/push-to-nas.sh

# 2. Côté NAS (connexion SSH puis lancement)
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees && sudo bash update-on-nas.sh
```

Le même couple de commandes sert à l'**installation initiale** et aux **mises à jour** : seule
la première fois nécessite la préparation des dossiers (§2). Le script `update-on-nas.sh` est
transféré à chaque `push`, donc toujours à jour sur le NAS.

**Réglages surchargables** (défauts = configuration DS218+ actuelle) :

```bash
NAS_HOST=erwan@ds218plus NAS_PORT=2010 NAS_DIR=/volume1/docker/marees ./deploy/push-to-nas.sh
```

> ℹ️ Les scripts encapsulent les mêmes pièges décrits plus bas : flag `scp -O` pour Synology,
> `docker-compose` **avec un tiret** (Compose v1 en DSM 7.1). Si un script échoue, la section
> manuelle correspondante (§3–6) et le **dépannage (§12)** donnent le détail.

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

> **Binding `127.0.0.1` (recommandé, cf. `docker-compose.nas.yml`).** Par défaut le conteneur
> n'écoute que sur la **boucle locale du NAS** (`127.0.0.1:3000`) : l'app **n'est donc pas
> joignable en direct** depuis un autre poste du LAN. C'est voulu — seul le reverse proxy DSM
> (§8) y accède, ce qui évite tout contournement du verrou LAN / du rate-limit par une IP usurpée.

**Vérifier que l'app tourne**, en SSH sur le NAS (avant même le proxy) :

```bash
curl -sf http://localhost:3000/api/health && echo OK
```

**Y accéder depuis un navigateur** : une fois le reverse proxy configuré (§8), via l'URL **HTTPS**
`https://tonnas.synology.me`. (Si tu préfères d'abord tester depuis le LAN, remplace temporairement
le mapping par `"3000:3000"`, puis reviens à `"127.0.0.1:3000:3000"` une fois le proxy en place.)

Au premier démarrage, `data/` se remplit tout seul : `settings.json` (configuration par défaut)
et `horaires_marees_port-tudy.json` (horaires embarqués dans l'image).

---

## 8. Exposer l'application sur Internet (sécurisé)

> **Important — l'app n'a pas d'authentification par défaut.** N'exposez **jamais** le port `3000`
> directement sur Internet (aucune redirection de port `3000` sur la box). L'accès externe passe
> **uniquement** par le Reverse Proxy DSM en **HTTPS**, avec un **mot de passe** activé (ci-dessous).
> Tout est intégré à DSM : **aucun paquet à installer, 0 €** (DDNS Synology + Let's Encrypt gratuits).

### 8.1 HTTPS via le Reverse Proxy DSM

1. **DDNS gratuit** : Panneau de configuration → **Accès externe → DDNS → Ajouter** →
   fournisseur *Synology*, nom d'hôte `tonnas.synology.me`.
2. **Certificat Let's Encrypt** : Panneau → **Sécurité → Certificat → Ajouter** → *Let's Encrypt*,
   domaine = `tonnas.synology.me` (renouvellement automatique).
3. **Proxy inversé** : Panneau → **Portail de connexion → Avancé → Proxy inversé → Créer**.
   - **Source** : `https`, hôte `tonnas.synology.me`, port `443`.
   - **Destination** : `http`, `localhost`, port `3000`.
   - Onglet *Personnaliser les en-têtes* : activer **HSTS** ; WebSocket inutile.
4. **Box/routeur** : rediriger **uniquement** le port **443** (et **80** temporairement pour
   l'émission/renouvellement du certificat Let's Encrypt) vers le NAS. **Pas** le `3000`.

### 8.2 Mots de passe & rôles (mire de connexion)

L'app protège **toute** l'interface dès qu'un mot de passe est défini : une **mire de connexion**
(page dédiée) demande identifiant + mot de passe, puis pose un **cookie de session signé**
(`HttpOnly`, `SameSite=Strict`, `Secure`) portant le **rôle** — « se souvenir de moi » le garde 30 j.

Deux rôles, selon le mot de passe utilisé à la connexion :
- **`viewer`** (`APP_USER` / `APP_PASSWORD`) : **consultation** du dashboard, depuis n'importe où.
- **`admin`** (`ADMIN_USER` / `ADMIN_PASSWORD`) : consultation **+ édition des réglages +
  statistiques d'accès**, depuis n'importe où.

Le compose du NAS lit ces variables depuis un fichier **`.env`** placé à côté de lui — ce fichier
**n'est pas transféré** par `push-to-nas.sh`, il survit donc aux mises à jour et garde les mots de
passe hors Git. En SSH sur le NAS :

```bash
cd /volume1/docker/marees
cat > .env <<'EOF'
APP_USER=marees
APP_PASSWORD=mot-de-passe-consultation   # rôle viewer — à partager au cercle restreint
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-admin         # rôle admin — gardé pour toi (édition réglages + stats)
COOKIE_SECURE=true                        # force le flag Secure du cookie (accès HTTPS via proxy)
EOF
chmod 600 .env
sudo docker-compose up -d                 # recrée le conteneur avec les nouvelles variables
```

La mire s'affiche une fois, puis la session est mémorisée. `GET /api/health` reste public (sonde).
**Sans mot de passe (`APP_PASSWORD` et `ADMIN_PASSWORD` vides), l'accès est libre** — ne pas exposer
dans ce cas.

> `COOKIE_SECURE=true` garantit le flag `Secure` du cookie même si le reverse proxy ne transmet
> pas `X-Forwarded-Proto`. À laisser à `true` puisque l'accès externe est en HTTPS.

**Édition des réglages & statistiques :** réservées au **rôle admin**, quel que soit le réseau
(le contrôle se fait sur le rôle porté par le cookie, plus sur l'IP). Sans `ADMIN_PASSWORD`, personne
n'édite : tout le monde est `viewer`. Les réglages sont des préférences d'affichage (Navihan, liens
météo, période) — enjeu faible.

Durcissement déjà **intégré à l'image** : en-têtes de sécurité (helmet), limitation de débit
(anti-abus, dont la météo), conteneur **non-root** (`node`, uid 1000). Le dossier `data/` doit donc
être **accessible en écriture par l'uid 1000** : en SSH, `sudo chown -R 1000:1000
/volume1/docker/marees/data` (une fois).

### 8.3 (Bonus) Restreindre davantage

- **Pare-feu DSM** (Panneau → Sécurité → Pare-feu) : une règle *Autoriser* limitée à la localisation
  **France** (base GeoIP intégrée) réduit fortement le bruit d'Internet.
- **Auto-Block** (Panneau → Sécurité → Compte) : bannit les IP après trop d'échecs de connexion
  **DSM** (protège le NAS ; l'app est protégée par sa propre limitation de débit).
- **Secret hérité** : une ancienne clé `API_MAREE_KEY` (inutilisée par le code) figure dans
  l'historique Git du dépôt — si le dépôt est public, **révoquez/rotez cette clé**.

### 8.4 Statistiques d'accès (rôle admin)

L'app enregistre chaque ouverture dans `data/access-log.jsonl` — **anonymisé** (IP tronquée, pays
via une base géoIP hors-ligne, navigateur/appareil). Un bouton **« Statistiques »** (icône graphique
dans la navbar) ouvre un tableau de bord (visites/jour, LAN vs externe, pays…). Il n'apparaît et ne
répond **que pour le rôle `admin`** (connexion avec `ADMIN_PASSWORD`) ; sinon l'endpoint renvoie 403.
Le journal tourne automatiquement (~1 Mo, une génération conservée) — rien à gérer.

---

## 9. Mettre à jour l'application

### Méthode rapide (scripts, recommandée)

Identique à l'installation — voir **[§0](#0-méthode-rapide-scriptée-recommandée)** :

```bash
./deploy/push-to-nas.sh                                   # PC : build + transfert
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees && sudo bash update-on-nas.sh   # NAS : recharge + recrée
```

### Méthode manuelle

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
| Port 3000 déjà utilisé | Modifier le mapping dans `docker-compose.yml` (ex. `"127.0.0.1:8080:3000"`) puis relancer ; pointer la **destination du reverse proxy** sur `localhost:8080`. |
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
| Variables | `DATA_DIR=/data`, `PORT=3000`, `APP_*`, `ADMIN_*`, `COOKIE_SECURE` |
| Port | `127.0.0.1:3000` (hôte, boucle locale) → `3000` (conteneur) |
| URL | `https://tonnas.synology.me` (via reverse proxy ; pas d'accès direct `:3000`) |
