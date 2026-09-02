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
| [`push-to-nas.sh`](push-to-nas.sh) | sur le **PC** | build + export de l'image (`save-image.sh`), puis `scp` de l'image, du `docker-compose.yml` et des scripts NAS (`update-on-nas.sh`, `backup-db-on-nas.sh`) vers le NAS. **Ne redémarre pas** le conteneur. |
| [`update-on-nas.sh`](update-on-nas.sh) | sur le **NAS** | `docker load` de l'image + `docker-compose up -d` (recrée le conteneur) + `docker image prune`. Données `data/` **conservées**. |
| [`backup-db-on-nas.sh`](backup-db-on-nas.sh) | sur le **NAS** | sauvegarde datée de la base (`backups/marees-*.db.gz`, rotation) — à planifier, cf. **[§10](#10-sauvegarde--restauration-des-données)**. |

```bash
# 1. Côté PC (dans le dossier du projet)
./deploy/push-to-nas.sh

# 2. Côté NAS (connexion SSH puis lancement)
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees && sudo bash update-on-nas.sh
```

Le même couple de commandes sert à l'**installation initiale** et aux **mises à jour** : seule
la première fois nécessite la préparation des dossiers (§2). Les scripts NAS sont transférés à
chaque `push`, donc toujours à jour sur le NAS.

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
/volume1/docker/marees/data/     ← base SQLite marees.db (config + horaires + accès, auto-amorcée)
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
ls -la data/                     # marees.db (+ -wal / -shm) auto-créée
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

Au premier démarrage, `data/` se remplit tout seul : la base **`marees.db`** est créée et amorcée
(configuration par défaut + horaires embarqués dans l'image). Sur un volume issu d'une version
antérieure, les anciens fichiers `settings.json` / `horaires_marees_*.json` sont migrés
automatiquement (cf. [MIGRATION-SQLITE.md](MIGRATION-SQLITE.md)).

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

### 8.2 Comptes & rôles (mire de connexion)

L'app protège **toute** l'interface dès qu'un mot de passe est défini : une **mire de connexion**
(page dédiée) demande identifiant + mot de passe, puis pose un **cookie de session signé**
(`HttpOnly`, `SameSite=Strict`, `Secure`) portant l'**identifiant utilisateur** — « se souvenir de
moi » le garde 30 j. Le rôle est **relu en base à chaque requête** (supprimer/rétrograder un compte
révoque ses sessions immédiatement).

**Les comptes sont gérés depuis l'app** (issue #9) : un **admin** ouvre le panneau **« Utilisateurs »**
(icône dans la navbar) pour **créer / modifier le rôle / réinitialiser le mot de passe / supprimer**
des comptes. Deux rôles : **`admin`** (gestion des utilisateurs + édition des réglages + statistiques)
et **`lecteur`** (consultation ; rôle **par défaut** des nouveaux comptes). Les mots de passe sont
**hachés (argon2id)** en base — jamais stockés en clair. Le garde-fou empêche de supprimer/rétrograder
le **dernier administrateur**.

Les variables d'environnement ne servent plus qu'à **amorcer le premier administrateur** au tout
premier démarrage (base vide) et à **activer** l'authentification. Le compose du NAS lit ces variables
depuis un fichier **`.env`** placé à côté de lui — ce fichier **n'est pas transféré** par
`push-to-nas.sh`, il survit donc aux mises à jour et garde les secrets hors Git. En SSH sur le NAS :

```bash
cd /volume1/docker/marees
cat > .env <<'EOF'
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-admin-initial  # amorce le 1er admin (base vide) ; ensuite l'auth se fait en base
SESSION_SECRET=chaine-aleatoire-longue     # (recommandé) secret de signature stable des cookies
COOKIE_SECURE=true                         # force le flag Secure du cookie (accès HTTPS via proxy)
EOF
chmod 600 .env
sudo docker-compose up -d                  # recrée le conteneur avec les nouvelles variables
```

- **Activation** : l'auth est active dès qu'`APP_PASSWORD` **ou** `ADMIN_PASSWORD` est défini. Les
  deux vides → **accès libre** (ne pas exposer dans ce cas).
- **Amorçage** : à base vide, un admin est créé depuis `ADMIN_USER`/`ADMIN_PASSWORD`. Si `ADMIN_PASSWORD`
  n'est pas fourni, un compte **`admin`/`admin`** est créé avec **changement de mot de passe forcé** à
  la première connexion. Une fois des comptes en base, `APP_*`/`ADMIN_*` **n'authentifient plus** —
  gérez les comptes via le panneau « Utilisateurs ».
- **`SESSION_SECRET`** : si absent, un secret aléatoire est généré et **persisté** en base
  (`app_secret`). Le définir explicitement permet de garder des sessions valides même après recréation
  du volume, et de tourner le secret à la demande.

La mire s'affiche une fois, puis la session est mémorisée. `GET /api/health` reste public (sonde).

> `COOKIE_SECURE=true` garantit le flag `Secure` du cookie même si le reverse proxy ne transmet
> pas `X-Forwarded-Proto`. À laisser à `true` puisque l'accès externe est en HTTPS.

**Édition des réglages, statistiques & gestion des utilisateurs :** réservées au **rôle admin**, quel
que soit le réseau (contrôle sur le rôle courant en base, plus sur l'IP). Les réglages sont des
préférences d'affichage (Navihan, liens météo, période) — enjeu faible.

Durcissement déjà **intégré à l'image** : en-têtes de sécurité (helmet), limitation de débit
(anti-abus, dont la météo), conteneur **non-root** (`node`, uid 1000). Le dossier `data/` doit donc
être **accessible en écriture par l'uid 1000** : en SSH, `sudo chown -R 1000:1000
/volume1/docker/marees/data` (une fois).

### 8.3 (Bonus) Restreindre davantage

- **Pare-feu DSM** (Panneau → Sécurité → Pare-feu) : une règle *Autoriser* limitée à la localisation
  **France** (base GeoIP intégrée) réduit fortement le bruit d'Internet.
  - ⚠️ **Cette règle vaut pour TOUT le NAS**, pas pour cette application seule : elle s'applique à
    tous les services exposés, y compris ceux qui seraient ajoutés plus tard. Sur un NAS qui n'héberge
    pas que ce site, la décision se prend pour l'ensemble.
  - ⚠️ **Créer la règle du réseau local AVANT** de basculer l'action par défaut sur « Refuser » :
    dans l'ordre inverse, on se coupe de DSM, de SSH et de File Station depuis ses propres machines,
    et le rattrapage passe par le bouton de réinitialisation matériel.
  - ⚠️ **Une règle *Autoriser* seule ne filtre rien** tant que l'action par défaut reste
    « Autoriser » : le pare-feu paraît configuré et tout Internet passe encore. Vérifier la ligne
    d'action par défaut, pas seulement la liste des règles.
  - ⚠️ **Le site devient inaccessible depuis l'étranger** — y compris depuis un téléphone dont le
    réseau mobile sort par une IP étrangère, ce qui donne un blocage sans explication apparente.
- **Auto-Block** (Panneau → Sécurité → Compte) : bannit les IP après trop d'échecs de connexion
  **DSM** (protège le NAS ; l'app est protégée par sa propre limitation de débit).
- **Secret hérité** : une ancienne clé `API_MAREE_KEY` (fournisseur `api-maree.fr`, **plus utilisée
  par le code** depuis le passage aux horaires locaux) figure en clair dans le commit initial de
  l'historique Git. **Le dépôt étant public, cette clé est exposée : révoquez-la côté api-maree.fr.**
  Réécrire l'historique ne suffirait pas (la clé a déjà pu être moissonnée) ; seule la révocation
  chez le fournisseur ferme l'accès. La révocation ne casse rien côté app.

### 8.4 Statistiques d'accès (rôle admin)

L'app enregistre chaque ouverture de page dans la base (`marees.db`, table `access_log`) —
**anonymisée** (IP tronquée, pays via une base géoIP hors-ligne, navigateur/appareil). En plus, chaque
**connexion** est journalisée avec le **login** de l'utilisateur, ce qui alimente une répartition
**« Connexions par utilisateur »**. Un bouton **« Statistiques »** (icône graphique dans la navbar)
ouvre un tableau de bord (visites/jour, LAN vs externe, pays, utilisateurs…). Il n'apparaît et ne
répond **que pour le rôle `admin`** ; sinon l'endpoint renvoie 403.
Le journal tourne automatiquement (~1 Mo, une génération conservée) — rien à gérer.

---

## 9. Mettre à jour l'application

### Méthode recommandée : déploiement au push d'un tag (issue #12)

Le push d'un tag `vX.Y.Z` déclenche le déploiement complet (vérifications, sauvegarde de la base,
transfert, bascule, contrôle de santé **et** de la version servie). Une seule saisie : la
confirmation, puis le mot de passe `sudo` du NAS.

```bash
npm run hooks:install     # une fois par clone (core.hooksPath n'est pas versionné)

npm run release -- minor  # patch | minor | major | X.Y.Z
```

`npm run release` (`deploy/new-version.sh`) enchaîne le pré-vol, le bump des **3 manifests**, le
changelog, l'affichage des notes de version, la confirmation, puis commit + tag annoté + push. Une
étape ratée avant le push est défaite automatiquement ; `DRY_RUN=1` déroule sans rien publier. La
séquence équivalente à la main :

```bash
npm version 0.1.0 --no-git-tag-version --workspaces --include-workspace-root
npm run changelog
git commit -am "chore(release): v0.1.0"
git tag -a v0.1.0 -m "v0.1.0"
git push --atomic --follow-tags origin main
```

Détail des garde-fous, des soupapes (`SKIP_DEPLOY=1`, `DRY_RUN=1`…) et de la reprise après échec :
**[README du dossier deploy](README.md)**.

### Rollback vers la version précédente

L'image est taguée à la version en plus de `:latest`, donc la précédente est encore sur le NAS :
inutile de re-transférer ~115 Mo.

```bash
ssh erwan@ds218plus -p 2010
cd /volume1/docker/marees
sudo docker images marees-port-tudy                          # versions disponibles
sudo docker tag marees-port-tudy:0.0.9 marees-port-tudy:latest
sudo docker-compose up -d
```

> Les sauvegardes de la base sont datées dans `backups/` (§10) et une sauvegarde est prise
> **avant chaque bascule** : un rollback d'image peut donc s'accompagner d'une restauration de base
> si une migration de schéma est passée entre-temps.

### Méthode rapide sans tag (scripts)

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

Depuis l'issue #8, tout l'état persistant tient dans **une base SQLite** :
**`/volume1/docker/marees/data/marees.db`** (config, horaires, journal d'accès), accompagnée de
ses fichiers WAL `marees.db-wal` / `marees.db-shm`.

> **Première bascule depuis les fichiers plats** (`settings.json`, `horaires_marees_*.json`) :
> la migration est **automatique au 1er démarrage** de la nouvelle image. Procédure détaillée,
> vérification et rollback : **[MIGRATION-SQLITE.md](MIGRATION-SQLITE.md)**.

> ⚠️ **Ne copiez pas `marees.db` tout seul.** La base est en mode **WAL** : l'essentiel des
> données vit dans `marees.db-wal` jusqu'au *checkpoint*. Constaté en prod le 28/07/2026 :
> `marees.db` = **4 Ko** pour `marees.db-wal` = **1,2 Mo** — la copie du seul `.db` aurait ramené
> une base quasi vide. Utilisez le script ci-dessous, qui prend un **instantané cohérent**
> (`sqlite3 … "VACUUM INTO …"`), **à chaud**, sans arrêter le conteneur.

### 10.1 Sauvegarde (script + planification DSM)

`deploy/backup-db-on-nas.sh` est transféré sur le NAS par `push-to-nas.sh` (§0). À la main :

```bash
cd /volume1/docker/marees
bash backup-db-on-nas.sh        # → backups/marees-AAAAMMJJ-HHMMSS.db.gz
KEEP=30 bash backup-db-on-nas.sh   # garde 30 sauvegardes au lieu de 14
```

Il vérifie l'instantané (`PRAGMA integrity_check`) **avant** d'écrire et **avant** la rotation :
une sauvegarde ratée ne fait jamais tomber une bonne sauvegarde. Ni `sudo` ni `docker` requis.

**Planification quotidienne** — *Panneau de configuration → Planificateur de tâches → Créer →
Tâche planifiée* :

| Champ | Valeur |
| --- | --- |
| Utilisateur | `erwan` (pas besoin de `root`) |
| Commande | `bash /volume1/docker/marees/backup-db-on-nas.sh` |
| Planification | Quotidien (ex. 04:00) |

Pointer ensuite *Hyper Backup* sur **`/volume1/docker/marees/backups`** pour une copie hors NAS.

### 10.2 Restauration

```bash
cd /volume1/docker/marees
sudo docker-compose stop
gunzip -c backups/marees-20260728-184227.db.gz > data/marees.db
rm -f data/marees.db-wal data/marees.db-shm   # journaux de l'ANCIENNE base
sudo docker-compose start
```

### 10.3 Copier la base de prod sur le poste de dev

Depuis le PC, dans le dépôt :

```bash
npm run db:pull      # → server/data/marees.db (l'ancienne devient marees.db.bak-<horodatage>)
```

Même mécanique (instantané `VACUUM INTO` + `integrity_check` sur le NAS, puis `scp -O`).
Arrêter `npm run dev` avant. Si l'instantané échoue faute de droits sur `marees.db-shm`, replier
sur un instantané pris **dans le conteneur** (il embarque `better-sqlite3`) :

```bash
sudo docker exec marees-port-tudy node -e "require('better-sqlite3')('/data/marees.db').backup('/data/snapshot.db').then(()=>console.log('ok'))"
```

### 10.4 Mettre à jour les horaires

Via le panneau **« Import des horaires »** de l'app (rôle admin) —
coller/téléverser un JSON, pris en compte immédiatement (plus besoin de redémarrer). Pour repartir
des graines embarquées, arrêter le conteneur, supprimer `marees.db*` du volume, puis redémarrer.

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
