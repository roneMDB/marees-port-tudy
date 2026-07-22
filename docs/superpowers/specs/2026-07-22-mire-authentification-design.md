# Mire d'authentification — cookie de session signé

**Date** : 2026-07-22
**Statut** : conçu, en attente de plan d'implémentation

## Objectif

Remplacer le popup natif de l'authentification HTTP Basic par une **jolie mire de
connexion personnalisée** (saisie de l'identifiant `APP_USER` et du mot de passe
`APP_PASSWORD`), avec une **session qui dure longtemps** pour ne pas avoir à retaper
souvent, **sans dégrader la sécurité** de l'application.

## Contraintes et décisions

- **Mécanisme** : cookie de session **signé** (HMAC), `HttpOnly`, plutôt que credentials
  Basic stockés en clair côté client. Motif : le mot de passe n'est jamais exposé au
  JavaScript (résistant au XSS, CSP actuellement désactivée), révocable, `SameSite=Strict`
  contre le CSRF.
- **Persistance** : case « Se souvenir de moi » → cookie longue durée (**60 jours**) survivant
  aux redémarrages du navigateur ; sinon cookie de session (effacé à la fermeture).
- **Aucune nouvelle dépendance npm** : `crypto` natif (comme `middleware/auth.ts` actuel) +
  parsing léger de l'en-tête `Cookie`.
- **Rétro-compatibilité** : quand `APP_PASSWORD` est vide (développement / tests),
  l'authentification reste désactivée et tout passe — comportement et tests existants
  **inchangés**. L'en-tête Basic reste accepté en alternative au cookie (curl, sondes).
- **Restrictions LAN existantes** (écriture des réglages, `/api/stats`) : **inchangées**.

## Bilan sécurité

Équivalent ou supérieur à l'auth Basic actuelle :

- Toutes les routes `/api` (hors endpoints publics ci-dessous) exigent un cookie de session
  valide **ou** un en-tête Basic valide. Sans identifiants → 401, aucune donnée servie.
- La **coquille statique du SPA devient publique** mais ne contient **aucun secret** (squelette
  vide + mire). Toute la donnée vient de l'API, qui reste verrouillée. Le niveau de protection
  des **données** est identique à aujourd'hui.
- Cookie `HttpOnly` → non exfiltrable par du JS injecté ; `SameSite=Strict` → anti-CSRF ;
  `Secure` dès que `req.secure` (HTTPS via reverse proxy, `trust proxy` + X-Forwarded-Proto).
- Jeton signé **HMAC-SHA256**, vérification à **temps constant**, **expiration** contrôlée
  serveur. Secret dérivé de `APP_PASSWORD` (sha256) → stable entre redémarrages **et** changer
  le mot de passe **révoque toutes les sessions**. Override optionnel via `SESSION_SECRET`.
- **Rate-limiter strict dédié** sur `POST /api/login` (ex. 10 tentatives / 5 min) en plus du
  global, contre le brute-force sur ce nouvel endpoint public. Helmet / non-root / trust proxy
  conservés.

## Architecture

### Serveur (`server/`)

**`src/lib/session.ts`** (pur, testé) — signature/vérification du jeton :
- `sessionSecret()` → `SESSION_SECRET` si défini, sinon `sha256(APP_PASSWORD)`.
- `signSession(ttlMs, now)` → `"<expiryMs>.<hmacBase64url>"`, `hmac = HMAC-SHA256(expiryMs, secret)`.
- `verifySession(token, now)` → `boolean` : signature valide (comparaison à temps constant)
  **et** `expiry > now`. Robuste aux jetons malformés (retourne `false`, ne lève pas).
- Petits helpers de cookie : `parseCookies(header)` → `Record<string,string>` ;
  nom du cookie `marees_session`.

**`src/routes/auth.ts`** — routeur monté sous `/api`, **routes publiques** :
- `POST /api/login` `{ user, password, remember }` :
  - Vérifie `user`/`password` via `timingSafeEqual` (réutilise/partage la logique de `auth.ts`).
  - Succès → `Set-Cookie: marees_session=<token>; HttpOnly; SameSite=Strict; Path=/`
    (`Secure` si `req.secure`), `Max-Age` = 60 j si `remember` sinon absent (cookie de session).
    Réponse `200 { ok: true }`.
  - Échec → `401 { error: 'Identifiants invalides.' }`.
  - Si auth désactivée (`APP_PASSWORD` vide) → `200 { ok: true }` sans cookie (no-op).
- `POST /api/logout` → efface le cookie (`Max-Age=0`), `200 { ok: true }`.
- `GET /api/auth/status` → `{ authRequired: boolean, authenticated: boolean }`.
  `authRequired` = `APP_PASSWORD` non vide ; `authenticated` = cookie valide (ou Basic valide).
  Résout le poule-œuf : le client sait s'il doit afficher la mire avant tout appel protégé.

**`src/middleware/auth.ts`** (modifié) — le garde accepte **cookie de session valide OU
en-tête Basic valide** ; **ne renvoie plus** `WWW-Authenticate` (plus de popup natif) ;
401 JSON sinon. Reste un no-op quand `APP_PASSWORD` est vide.

**`src/app.ts`** (réordonnancement) :
- Rate-limiter strict monté sur `POST /api/login` (avant le garde).
- Le routeur `auth` est monté **avant** le garde (ses routes sont publiques).
- Le garde protège **`/api`** avec exceptions : `/api/health`, `/api/login`, `/api/logout`,
  `/api/auth/status`. **La coquille statique (`client/dist`) devient publique.**
- Ordre : helmet → rate-limits (global + météo + login) → `express.json` → routeur `auth`
  (public) → garde `/api` → `accessLog` → routeurs protégés → statique public → SPA fallback →
  error handler. (Vérifier que `express.json` précède le routeur `auth` pour lire le corps.)

### Client (`client/`)

**`src/composables/useAuth.ts`** (singleton) :
- État : `authRequired` (ref), `authenticated` (ref), `checking`/`submitting`, `error`.
- `checkStatus()` → `GET /api/auth/status`, hydrate `authRequired`/`authenticated`.
- `login(user, password, remember)` → `POST /api/login` ; succès → `authenticated = true`.
- `logout()` → `POST /api/logout` → `authenticated = false`.
- Écoute l'événement fenêtre `api-unauthorized` → `authenticated = false` (session expirée).

**`src/components/LoginScreen.vue`** — la mire :
- Carte centrée (`min-vh-100`, flex center) sur fond en dégradé « marée » (teintes bleu/teal,
  variantes thème clair/sombre via `data-bs-theme`, cohérent avec `assets/app.css`).
- Marque : icône `bi-water` + « Marées Navihan ».
- Champs : **Identifiant**, **Mot de passe** (bouton œil `bi-eye`/`bi-eye-slash` pour afficher),
  case **« Se souvenir de moi »** (cochée par défaut).
- Bouton de connexion avec état de chargement (spinner + désactivé) ; alerte d'erreur
  (`alert-danger`) sur échec ; validation HTML minimale (champs requis).
- Émet `success` (ou appelle `useAuth.login` directement puis laisse `App.vue` réagir).

**`src/App.vue`** (modifié) :
- Au montage : `useAuth.checkStatus()`.
- Rendu conditionnel : si `authRequired && !authenticated` → **n'affiche que** `<LoginScreen>`
  (pas de navbar/dashboard). Sinon l'app normale.
- Bouton **Déconnexion** dans la navbar (icône `bi-box-arrow-right`), affiché seulement si
  `authRequired` ; appelle `useAuth.logout()`.

**`src/api/tides.ts`** (modifié) — dans `fetchJson`, sur `res.status === 401`, émettre
`window.dispatchEvent(new CustomEvent('api-unauthorized'))` avant de lever l'erreur.
Les cookies same-origin partent automatiquement (`credentials: 'same-origin'`, défaut).

## Flux de données

1. Chargement de l'app → SPA servi publiquement → `App.vue` monte → `useAuth.checkStatus()`.
2. `authRequired && !authenticated` → mire. L'utilisateur saisit user/mdp (+ remember) →
   `POST /api/login` → cookie posé → `authenticated = true` → l'app s'affiche.
3. Appels API suivants → cookie envoyé automatiquement → garde OK.
4. Session expirée / cookie absent → une route protégée renvoie 401 → `api-unauthorized` →
   retour à la mire.
5. Déconnexion → `POST /api/logout` → cookie effacé → mire.

## Gestion des erreurs

- `POST /api/login` mauvais identifiants → 401 `{ error }` → mire affiche l'alerte.
- Corps invalide (JSON) → 400 (error handler existant).
- Route protégée sans/expiré cookie → 401 JSON (pas de `WWW-Authenticate`).
- Rate-limit login dépassé → 429 (message standard `express-rate-limit`) → mire affiche le message.
- `checkStatus()` en échec réseau → considérer `authRequired=false` (dégradation gracieuse :
  on ne bloque pas l'app si le statut est injoignable ; la protection réelle reste serveur).

## Tests

**Serveur** :
- `src/lib/session.test.ts` — `signSession`/`verifySession` : jeton valide accepté, expiré
  refusé, signature altérée refusée, jeton malformé refusé, secret dérivé du mot de passe.
- `src/routes/auth.test.ts` (supertest) — login OK pose un cookie ; login KO → 401 ;
  `remember` → `Max-Age` présent, sinon absent ; logout efface ; `auth/status` reflète
  `authRequired`/`authenticated` ; garde `/api` refuse sans cookie (401) et accepte avec cookie
  valide ; `/api/health`, `/api/login`, `/api/auth/status` publics.
- Tests existants (`security.test.ts`, `routes/settings.test.ts`, etc.) : **inchangés**
  (auth off sans `APP_PASSWORD`).

**Client** :
- `src/components/LoginScreen.test.ts` — rendu des champs, soumission appelle `login`,
  affichage de l'erreur, état de chargement.
- `src/composables/useAuth.test.ts` — `checkStatus`/`login`/`logout` via `fetch` mocké ;
  `api-unauthorized` repasse `authenticated` à `false`.

## Test en local (environnement de dev)

L'authentification est **désactivée tant que `APP_PASSWORD` est vide** (défaut en dev). Pour
tester la mire, on renseigne les identifiants au lancement (pas de `dotenv` dans le code ; les
variables sont propagées par `concurrently` au process serveur `ts-node`).

Deux **scripts npm dédiés** (racine) évitent de retaper les variables. Ils utilisent la syntaxe
POSIX `${VAR:-défaut}` : identifiants par défaut `marees` / `marees-dev`, **surchargables** en
exportant `APP_USER`/`APP_PASSWORD` avant l'appel.

```jsonc
// package.json (racine)
"dev:auth":   "APP_PASSWORD=${APP_PASSWORD:-marees-dev} APP_USER=${APP_USER:-marees} npm run dev",
"start:auth": "APP_PASSWORD=${APP_PASSWORD:-marees-dev} APP_USER=${APP_USER:-marees} npm run start"
```

**A. Dev complet (Vite `:5173` + serveur `:3000`, hot-reload)** :

```bash
npm run dev:auth               # défaut : marees / marees-dev
APP_PASSWORD=secret npm run dev:auth   # mot de passe personnalisé
```

Ouvrir `http://localhost:5173` → la mire s'affiche → connexion avec `marees` / `marees-dev`.
Le proxy Vite relaie `/api` (et le `Set-Cookie`) vers `:3000` ; en http local le cookie est
**non-`Secure`** (`req.secure` faux) donc bien posé. La case « Se souvenir de moi » pose un
cookie 60 j ; décochée, il disparaît à la fermeture de l'onglet.

**B. Prod-like (Express sert le SPA buildé, `:3000`)** — vérifie aussi la coquille publique + API
protégée dans les conditions réelles :

```bash
npm run build
npm run start:auth             # défaut : marees / marees-dev
```

Ouvrir `http://localhost:3000`. Vérifications manuelles utiles :
- `curl -i http://localhost:3000/api/tides` → **401** (API protégée).
- `curl -i http://localhost:3000/` → **200** HTML (coquille publique).
- `curl -i -X POST http://localhost:3000/api/login -H 'Content-Type: application/json' -d '{"user":"marees","password":"marees-dev","remember":true}'`
  → **200** + en-tête `Set-Cookie: marees_session=...`.
- Rejouer `GET /api/tides` avec ce cookie (`curl -b`) → **200**.
- Mauvais mot de passe → **401** ; > 10 essais / 5 min → **429**.

**Repli** : relancer sans `APP_PASSWORD` → auth désactivée, comportement dev habituel (la mire ne
s'affiche pas, `authRequired=false`).

## Hors périmètre (YAGNI)

- Multi-utilisateurs / rôles (l'app reste mono-identifiant `APP_USER`).
- JWT / stockage de sessions serveur (le jeton signé stateless suffit).
- « Mot de passe oublié » / auto-inscription (identifiants gérés par variables d'env).
