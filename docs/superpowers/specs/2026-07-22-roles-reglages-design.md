# Rôles viewer / admin pour l'édition des réglages

**Date** : 2026-07-22
**Statut** : conçu, en attente de plan d'implémentation
**Contexte** : suite de la mire d'authentification ([[2026-07-22-mire-authentification-design]]).

## Problème

Aujourd'hui l'édition des réglages (`PUT /api/settings`) et les statistiques (`/api/stats`) sont
réservées au **réseau local** (`isPrivateIp(req.ip)`). Ce verrou :
- date d'**avant** l'authentification (l'app était en lecture libre) — désormais tout est derrière
  un mot de passe, donc la restriction géographique est redondante côté sécurité ;
- est **fragile** : dès qu'on passe par le reverse proxy (accès via le domaine public, même depuis
  le LAN via NAT hairpin), l'app voit une IP non privée → plus de réglages ;
- ne répond pas au besoin : **pouvoir éditer les réglages depuis l'extérieur**.

## Décision

Remplacer le verrou LAN par un modèle à **deux rôles**, dérivés du **mot de passe utilisé à la
connexion** (pas de comptes individuels — multi-utilisateurs explicitement **hors périmètre**, cf.
fin de doc) :

- **`viewer`** (`APP_USER` / `APP_PASSWORD`) : consultation du dashboard, depuis n'importe où.
- **`admin`** (`ADMIN_USER` défaut `admin` / `ADMIN_PASSWORD`) : consultation **+ édition des
  réglages + statistiques d'accès**, depuis n'importe où.

Le rôle est inscrit dans le **jeton de session signé** (infalsifiable) ; le serveur exige `admin`
pour les actions sensibles. Le verrou global **`READ_ONLY` est supprimé** : le rôle `viewer` joue
déjà le rôle de « lecture seule » (c'est le mode par défaut de tout le cercle). **Aucune nouvelle
dépendance** (`crypto` natif).

## Architecture

### Serveur

**`src/lib/session.ts`** — le jeton porte le rôle :
- `Role = 'viewer' | 'admin'`.
- `signSession(role, ttlMs, now)` → `"<role>.<expiryMs>.<hmacBase64url>"`, HMAC sur `"<role>.<expiryMs>"`.
- `verifySession(token, now)` → `Role | null` : signature valide (temps constant) **et** non expiré
  **et** rôle ∈ {viewer, admin} ; sinon `null`. Robuste aux entrées malformées.
- Les anciens jetons (format `"<expiry>.<sig>"`, 2 parties) deviennent invalides → l'utilisateur se
  reconnecte (acceptable).
- `SESSION_COOKIE`, `parseCookies` inchangés.

**`src/middleware/auth.ts`** :
- `authEnabled()` = `APP_PASSWORD` **ou** `ADMIN_PASSWORD` non vide.
- `resolveRole(user, password): Role | null` — teste d'abord les identifiants **admin** (si
  `ADMIN_PASSWORD` défini), puis **viewer** (si `APP_PASSWORD` défini), via `safeEqual` (temps
  constant, sans court-circuit entre les deux champs). `null` si aucun.
- `requestRole(req): Role | null` — **`'admin'` si `!authEnabled()`** (dev/tests : tout ouvert) ;
  sinon rôle du **cookie** (`verifySession`) ou, à défaut, de l'**en-tête Basic** (`resolveRole`) ;
  `null` si rien.
- `basicAuth()` (garde monté sur `/api`) : `if (PUBLIC_API.has(req.path)) next()` ; sinon
  `requestRole(req) !== null ? next() : 401`. (Le montage sur `/api` et la liste `PUBLIC_API`
  relative restent ceux du correctif FIX-001.)

**`src/routes/auth.ts`** :
- `POST /login` : `role = resolveRole(user, password)` ; `null` → 401 ; sinon `signSession(role, …)`
  et pose le cookie (flags inchangés : `HttpOnly`, `SameSite=Strict`, `Secure`/`COOKIE_SECURE`,
  `Max-Age` 30 j si `remember`). Réponse `{ ok: true, role }`.
- `GET /auth/status` → `{ authRequired, authenticated, role }` :
  - `authRequired = authEnabled()` ; si `!authRequired` → `{ authRequired:false, authenticated:true,
    role:'admin' }` (dev ouvert) ;
  - sinon `role` = rôle du cookie (`verifySession`) ou `null` ; `authenticated = role !== null`.
- `POST /logout` inchangé.

**`src/routes/settings.ts`** — `PUT /settings` :
- `if (requestRole(req) !== 'admin') 403` (**remplace** le `isPrivateIp`) ;
- sinon fusion/validation/persistance (inchangé). **Le contrôle `READ_ONLY` est retiré.**

**`src/routes/stats.ts`** :
- `GET /stats` : `if (requestRole(req) !== 'admin') 403` (**remplace** `isPrivateIp`).
- **`GET /context` supprimé** (le rôle de `/auth/status` le remplace). `createStatsRouter` n'expose
  plus que `/stats`.

**`src/lib/net.ts`** : `isPrivateIp` n'est plus utilisé pour le gating. S'il devient inutilisé
partout, le **retirer avec ses tests** (`truncateIp` reste, utilisé par `accessLog`).

### Client

**`src/composables/useAuth.ts`** : ajoute `role: Ref<Role|null>` et le computed `isAdmin`
(= `role==='admin'`), qui sert aussi de « peut éditer ». `checkStatus()` et `login()` hydratent
`role` (login ré-appelle `checkStatus()` après succès). L'événement `api-unauthorized` remet
`authenticated=false` **et** `role=null`.

**`src/api/auth.ts`** : `AuthStatus` gagne `role: Role|null` ; `postLogin` peut ignorer le corps
(le rôle est relu via status).

**`src/components/LoginScreen.vue`** : **inchangé** — une seule mire ; le serveur déduit le rôle du
mot de passe saisi.

**`src/App.vue`** : remplace `useContext` par `useAuth` → bouton + panneau **Réglages** et bouton +
panneau **Stats** si `isAdmin`. Le bouton **Déconnexion** reste si `authRequired`.

**Suppressions** : `src/composables/useContext.ts`, `getContext` dans `src/api/tides.ts`, et l'appel
`loadContext()` dans `App.vue` (remplacés par le rôle).

## Flux

1. Mire → `POST /login` avec le mot de passe viewer **ou** admin → cookie signé portant le rôle.
2. `GET /auth/status` → le client connaît `role`/`readOnly` → affiche Réglages/Stats selon le rôle.
3. `PUT /settings` / `GET /stats` : le serveur revérifie `requestRole===admin` (défense réelle,
   indépendante de l'UI).
4. Session expirée / 401 → `api-unauthorized` → retour mire.

## Gestion des erreurs

- Login mauvais mot de passe → 401 `{ error }`.
- `PUT /settings` / `/stats` en `viewer` → 403 (message explicite). Côté client, ces boutons ne sont
  pas montrés en viewer, mais le serveur reste la défense qui fait foi.

## Tests

**Serveur** :
- `lib/session.test.ts` : rôle porté et relu ; rôle inconnu/altéré rejeté ; expiration ; ancien
  format (2 parties) → `null`.
- `routes/auth.test.ts` : login admin → cookie rôle admin ; login viewer → viewer ; `/auth/status`
  renvoie le bon rôle ; `PUT /settings` 200 en admin / 403 en viewer ; `/stats` idem.
- `security.test.ts` / `routes/settings.test.ts` / `routes/stats.test.ts` : les tests « 403 hors
  LAN » (basés `isPrivateIp`/`X-Forwarded-For`) sont **remplacés** par des tests basés rôle ; les
  tests de `/context` sont retirés (endpoint supprimé). Suites sans mot de passe : `requestRole`
  vaut `admin` → l'écriture reste ouverte (tests existants « PUT 200 » inchangés).
- `lib/net.test.ts` : retiré si `isPrivateIp` est supprimé.

**Client** :
- `composables/useAuth.test.ts` : `role`/`readOnly`/`isAdmin`/`canEdit` hydratés par
  `checkStatus`/`login` ; `api-unauthorized` remet le rôle à `null`.
- Gating dans `App.vue` : bascule viewer↔admin (montre/masque Réglages & Stats).

## Migration / déploiement

- Pour éditer à distance : définir **`ADMIN_PASSWORD`** (+ `ADMIN_USER`) dans le `.env` du NAS.
  Sans lui, l'app reste en **viewer** (personne n'édite) — comportement volontaire.
- **`READ_ONLY` supprimé** : retirer la variable de `deploy/docker-compose.nas.yml` (et de la
  doc/`CLAUDE.md`). Toute mention à supprimer.
- La **réécriture DNS AdGuard** n'est **plus nécessaire** pour accéder aux réglages. Elle est
  **facultative** : la garder est sans risque (voire pratique — accès interne direct, latence
  moindre, fonctionne si le WAN est coupé) ; la retirer est sans conséquence fonctionnelle (l'accès
  au domaine public reste possible via le hairpin de la box).
- Docs à mettre à jour : `deploy/INSTALLATION-NAS.md` §8.2 (deux mots de passe / rôles, `.env`, plus
  de `READ_ONLY`), `docs/2026-07-22-revue-securite-auth.md` (le gating passe du réseau au rôle),
  `CLAUDE.md`.

## Hors périmètre (YAGNI — chantier futur si besoin réel)

- **Multi-utilisateurs** : comptes individuels, magasin d'utilisateurs, hachage (`scrypt`), UI
  d'administration (CRUD + rôle par utilisateur), révocation individuelle, traçabilité « qui a fait
  quoi ». À spécifier séparément **uniquement** si un besoin concret apparaît (révoquer une personne
  sans changer le mot de passe commun, ou audit). Le modèle à deux rôles est conçu pour évoluer vers
  ça (le jeton porte déjà un rôle ; il suffirait d'y ajouter un identifiant d'utilisateur).
- Rôles supplémentaires au-delà de viewer/admin.
