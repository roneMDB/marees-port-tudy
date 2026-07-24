# Migration vers la gestion d'utilisateurs (issue #9)

À partir de cette version, **les comptes sont gérés en base** (table `users` de `marees.db`) et non
plus via les variables d'environnement. L'administrateur crée / modifie / supprime les utilisateurs
depuis le panneau **« Utilisateurs »** de l'app. Ce document décrit la migration d'un déploiement
existant (NAS).

## Impact en un coup d'œil

| Élément | Effet |
| --- | --- |
| Base `marees.db` | **Migration auto v1→v2** au démarrage (ajoute les tables `users` et `app_secret`). **Non destructif** — marées / réglages / stats conservés. |
| Sessions en cours | **Invalidées** (le secret de session change). Tout le monde doit **se reconnecter**. |
| Login « lecteur » via `APP_USER` / `APP_PASSWORD` | **Ne fonctionne plus** — à recréer comme compte dans le panneau **Utilisateurs**. |
| En-tête `Authorization: Basic` sur `/api` | **Retiré** (si un script/sonde l'utilisait ; `/api/health` reste public, inchangé). |

## Ce qui se passe automatiquement (au 1er démarrage)

- **Migration du schéma** (via `PRAGMA user_version`) : création de `users` + `app_secret`, sans
  toucher aux données existantes.
- **Amorçage de l'admin initial** (seulement si la table `users` est vide **et** l'auth est active) :
  - `ADMIN_PASSWORD` défini → admin créé depuis `ADMIN_USER` / `ADMIN_PASSWORD` (pas de changement forcé).
  - sinon → compte **`admin` / `admin`** avec **changement de mot de passe forcé** à la 1ʳᵉ connexion.
- **Secret de session** aléatoire généré et persisté (`app_secret`), sauf si `SESSION_SECRET` est fixé.

L'opération est **idempotente** : aux démarrages suivants, aucun compte n'est recréé.

## ⚠️ Le fichier `.env` — à nettoyer

**Avant** (ancien modèle) :

```bash
APP_USER=marees
APP_PASSWORD=mot-de-passe-consultation   # ❌ n'authentifie plus rien
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-admin
COOKIE_SECURE=true
```

**Après** (recommandé) :

```bash
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-admin        # amorce le 1er admin + garde l'auth ACTIVE
SESSION_SECRET=<chaîne-aléatoire-longue> # (recommandé) sessions stables, indépendantes du mot de passe
COOKIE_SECURE=true
```

- **À supprimer** : les lignes `APP_USER` et `APP_PASSWORD` (obsolètes pour l'authentification).
- **À ne PAS supprimer sans réfléchir** : il faut garder **au moins un mot de passe** (`ADMIN_PASSWORD`
  **ou** `APP_PASSWORD`), sinon **l'authentification se désactive** (accès libre !). Garde donc
  `ADMIN_PASSWORD`.

Aucun autre fichier n'est à nettoyer pour cette migration — la base gagne ses tables toute seule.

### À propos de `SESSION_SECRET` et de `openssl rand -hex 32`

`SESSION_SECRET` est la **clé qui signe le cookie de session**. À la connexion, le serveur pose un
cookie de la forme `userId.expiration.signature`, où la signature est un **HMAC** calculé avec ce
secret ; à chaque requête, il recalcule la signature pour vérifier que le cookie est authentique.

- **Pourquoi un secret fort** : quiconque connaîtrait ce secret pourrait forger un cookie valide pour
  **n'importe quel `userId`** → se faire passer pour l'admin **sans mot de passe**. Il faut donc une
  valeur longue et imprévisible.
- **Ce que fait la commande** : `openssl rand -hex 32` génère **32 octets aléatoires cryptographiques**
  affichés en hexadécimal (64 caractères = 256 bits d'entropie), impossibles à deviner. C'est
  simplement une façon pratique de produire une bonne chaîne aléatoire ; toute longue chaîne aléatoire
  convient.
- **Obligatoire ?** Non. S'il est absent, l'appli **en génère un automatiquement** et le stocke en base
  (`app_secret`). Le fixer dans `.env` apporte :
  - **Stabilité** : le secret auto est lié à la base ; si tu recrées le volume / repars d'une base
    vierge, il change → toutes les sessions sont invalidées. Un `SESSION_SECRET` fixe survit à ça.
  - **Rotation** : le changer volontairement **déconnecte tout le monde** d'un coup (ex. après une
    fuite suspectée).

Pour le générer :

```bash
openssl rand -hex 32
```

## Procédure (NAS Synology)

1. **Sauvegarder le volume** (impératif avant tout upgrade) :
   ```bash
   ssh erwan@ds218plus -p 2010
   sudo cp -a /volume1/docker/marees/data /volume1/docker/marees/data.bak-$(date +%F)
   ```
2. **Éditer `.env`** (cf. section ci-dessus) : retirer `APP_USER` / `APP_PASSWORD`, garder
   `ADMIN_PASSWORD`, ajouter `SESSION_SECRET` :
   ```bash
   cd /volume1/docker/marees
   openssl rand -hex 32          # copier la valeur dans SESSION_SECRET
   nano .env
   ```
3. **Déployer la nouvelle image** (depuis le PC puis le NAS) :
   ```bash
   ./deploy/push-to-nas.sh                 # PC : build + transfert
   ssh erwan@ds218plus -p 2010
   cd /volume1/docker/marees && sudo bash update-on-nas.sh   # NAS : recharge + recrée
   ```
4. **Se connecter en admin** ; si le compte `admin` / `admin` a été amorcé → **changer le mot de passe**
   (imposé par l'écran dédié).
5. **Recréer les comptes lecteurs** dans le panneau **« Utilisateurs »** (bouton navbar admin) — ceux
   qui utilisaient l'ancien `APP_PASSWORD` — puis **redistribuer** les nouveaux identifiants.

## Rollback

Revenir à l'image précédente reste possible : les tables `users` / `app_secret` sont **ignorées** par
l'ancien code, et le login par `.env` refonctionne **si tu as conservé** `APP_*` / `ADMIN_*`. Si tu as
déjà supprimé `APP_PASSWORD`, seul le login « lecteur » historique manquera au rollback (l'admin, lui,
refonctionne). Au besoin, restaure aussi la sauvegarde du volume (`data.bak-…`).

## Permissions (rappel)

Le conteneur tourne en `USER node` (uid **1000**). Sur un bind-mount NAS, le dossier `data/` doit
rester accessible en **écriture par l'uid 1000** (inchangé).
