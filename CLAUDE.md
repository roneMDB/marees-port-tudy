# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Application **client/serveur** des marées de Port-Tudy (île de Groix). Un **serveur Express**
(TypeScript) expose les extrêmes de marée (pleine/basse mer) en **REST**, enrichis des heures
dérivées « Navihan ». Un **client Vue 3** (Vite + Bootstrap 5.3 + Chart.js) affiche un
**dashboard** : tableau détaillé, filtres et graphiques.

Monorepo **npm workspaces** : `server/` + `client/`. (La version CLI historique a été retirée.)

**Multi-sites** : plusieurs ports sont exposés (`server/src/config/sites.ts` : Port-Tudy, Étel).
Un **sélecteur de port** (navbar) bascule l'affichage. **Les heures Navihan restent toujours
dérivées de Port-Tudy** (port de référence), quel que soit le port sélectionné. Quand un autre
port est choisi, **les lignes du tableau sont les marées de ce port** (ses propres heure / hauteur /
coefficient) et la colonne **Navihan** est reliée à la marée de Port-Tudy de **même type la plus
proche dans le temps** (appariement par proximité, gère le décalage horaire / passage de minuit ;
« — » si aucune à moins de 3 h).

## Commandes

- `npm install` — installe les deux workspaces.
- `npm run dev` — lance serveur (`:3000`) + client Vite (`:5173`) en parallèle (`concurrently`).
- `npm run build` — build serveur (`tsc` + copie `resources/` vers `dist/`) puis client (`vite build`).
- `npm start` — `node server/dist/index.js` : sert l'API **et** le client buildé sur `:3000`.
- `docker compose up --build` — build l'image (multi-stage) et lance sur `:3000` avec le volume
  `./data:/data` (config + horaires persistés, auto-seed si vide). `DATA_DIR=/data` dans l'image.
- `npm test` — tests des deux workspaces (server puis client).
- **Déploiement au push d'un tag** (issue #12) — `git push --follow-tags` d'un tag `vX.Y.Z` déclenche
  le déploiement via le hook **`.githooks/pre-push`** (activé par `npm run hooks:install` →
  `core.hooksPath`, posé aussi par le script `prepare` — **gardé**, sinon le `RUN npm ci` du
  Dockerfile casse). Le hook ne **décide** que ; tout le déploiement est dans **`deploy/release.sh`**
  (`npm run deploy`, lançable seul pour reprendre). Séquence : `npm version X --no-git-tag-version
  --workspaces --include-workspace-root` → `npm run changelog` (git-cliff, `cliff.toml`) → commit →
  `git tag -a` → push — **scriptée** dans **`deploy/new-version.sh`** (`npm run release --
  <patch|minor|major|X.Y.Z>`). ⚠️ **`new-version.sh` crée la version, `release.sh` la déploie** : deux
  scripts, deux rôles, noms proches. Le script fait le pré-vol (branche `main`, arbre propre, en
  fast-forward, tag libre) **avant** d'écrire, affiche les notes de version, demande confirmation puis
  pousse avec **`DEPLOY_YES=1`** (le hook redemanderait sinon) et des **refs explicites** plutôt que
  `--follow-tags` (un vieux tag local ne part pas avec, sinon le hook refuse « 2 tags de release »).
  Tout échec **avant** le push est défait (`git reset --hard` sur le point de départ, légitime car le
  pré-vol a exigé un arbre propre) ; **après**, commit et tag sont conservés et les reprises
  affichées. L'argument est validé sur du SemVer **sans zéro superflu** (`[0-9]+` accepterait
  « 01.1.0 », la faute exacte de la v1.1.0). **La source de vérité de la version est le
  `package.json`** : le hook refuse
  si le tag en diverge, si le tag n'est pas annoté ou ne pointe pas sur `HEAD`, si l'arbre est sale
  (l'image est buildée depuis l'**arbre de travail** et `.dockerignore` exclut `.git`), si la branche
  n'est pas en fast-forward, ou si plusieurs tags de release sont poussés. **Un déploiement échoué
  annule le push** (tag local → reprise par push rejoué) ; **sans tty**, le push passe mais rien
  n'est déployé. Soupapes : `SKIP_DEPLOY=1` (préférable à `--no-verify`, qui saute aussi les
  contrôles), `DRY_RUN=1`, `DEPLOY_YES=1`, `RUN_E2E=1`, `SKIP_TESTS=1`/`SKIP_BACKUP=1`.
  Pièges bash à ne pas réintroduire : stdin est **consommé par la liste des refs** → confirmation sur
  `/dev/tty` et présence du tty testée par **ouverture réelle en sous-shell** (`[ -r /dev/tty ]`
  réussit même sans terminal de contrôle) ; `ssh` sans `-n` **avale les refs restantes**, sauf
  l'étape `sudo` qui exige l'inverse (`ssh -t` + stdin sur `/dev/tty`, sinon le prompt échoue).
  La **version** est servie par `GET /api/health` (`server/src/lib/version.ts`, lit le `package.json`
  racine **déjà copié dans l'image**) et affichée en **pied de page** du client (injectée au build par
  Vite `define`, donc lisible hors-ligne). `deploy/update-on-nas.sh` attend `healthy` puis **compare
  la version servie** à celle attendue (contrôle exécuté **sur le NAS**, l'app n'écoutant que sur
  `127.0.0.1`). `deploy/save-image.sh` tague l'image à la version en plus de `:latest` → **rollback
  sans re-transfert** (procédure : `deploy/INSTALLATION-NAS.md` §9).
- `npm run db:pull` — **rapatrie la base de prod** du NAS dans `server/data/marees.db`
  (`deploy/pull-db-from-nas.sh`). Instantané **à chaud** par `sqlite3 … "VACUUM INTO …"` +
  `PRAGMA integrity_check` **côté NAS**, puis `scp -O` : en mode WAL, copier `marees.db` seul
  ramènerait une base quasi vide. L'ancienne base locale devient `marees.db.bak-<horodatage>` et
  ses `-wal`/`-shm` périmés sont supprimés. Arrêter `npm run dev` avant. Réglages surchargables :
  `NAS_HOST`/`NAS_PORT`/`NAS_DIR`/`LOCAL_DB`.
- `npm -w server run check-tides` — **rapport de cohérence** des horaires. Diagnostic **seul, ne
  modifie rien** ; sort en 1 si une anomalie ou une source illisible est rencontrée (utilisable en
  CI). Options : `--site <id>` (un port, répétable ; id inconnu = erreur), **`--db`** (audite la
  **base de production** `DATA_DIR/marees.db` au lieu des graines — c'est elle qui est réellement
  servie et elle peut avoir divergé par un import runtime), `<fichier.json>` (contrôler un jeu de
  données **avant** de l'importer), `--markdown` (rapport partageable). Exemples :
  `… -- --site etel`, `… -- --db`, `… -- --db --site port-tudy`,
  `npm --silent -w server run check-tides -- --markdown > rapport-marees.md` (`--silent` évite que
  npm préfixe sa ligne `> ts-node …` dans le fichier).
- Par workspace : `npm -w server run <script>`, `npm -w client run <script>`.
- Un seul test : `npx vitest run -t "<nom>"` depuis `server/` ou `client/`. Watch : `npx vitest`.
- `npm run type-check` — **vérification de types des deux workspaces**. À lancer avec `npm test` :
  **Vitest passe par esbuild et ne vérifie aucun type**, et le build Vite non plus — une erreur de
  typage peut donc laisser tous les tests au vert (constaté sur l'issue #13 : 210 tests serveur verts
  alors que le serveur ne compilait pas). Par workspace : `npm -w client run type-check`
  (`vue-tsc --noEmit`), `npm -w server run type-check` (`tsc -p tsconfig.check.json`). Cette config
  **existe pour inclure les fichiers de test**, que `server/tsconfig.json` exclut à raison (le build
  ne doit pas les émettre dans `dist/`) : sans elle, 31 fichiers de test serveur ne seraient vérifiés
  par personne.

## Architecture

### Serveur (`server/`)

Flux : `src/index.ts` (pino + `initStorage` (base SQLite, cf. Persistance) + `createApp`) → `src/app.ts`
(Express : `trust proxy`, **helmet** (**CSP active**, taillée pour la SPA buildée : `script-src 'self'`
sans `unsafe-inline`/`unsafe-eval`, `style-src` + `'unsafe-inline'` pour Bootstrap/Chart.js/Vue,
`img-src` + `data:`, `object-src`/`frame-ancestors` `'none'` ; vérifiée par `security.test.ts`),
**rate-limit** global + météo + login, routeur
public `auth` (login/logout/status), **garde d'authentification optionnel** (`middleware/auth.ts`,
monté sur `/api`), `express.json`, routers `/api`, statique `client/dist` en prod, error handler
qui renvoie **400** sur erreur client — ex. JSON invalide — sinon 500). Servi en même origine →
**pas de CORS**.

**Authentification & rôles / exposition externe** (variables d'env, cf. `deploy/INSTALLATION-NAS.md`
§8) : la connexion se fait via une **mire** (`client` `LoginScreen.vue`) qui pose un **cookie de
session signé HMAC** portant l'**identifiant utilisateur** (`lib/session.ts` ; le rôle n'est **pas**
dans le jeton, il est **relu en base à chaque requête** → révocation immédiate d'une session dont le
compte est supprimé/rétrogradé). **Les utilisateurs sont persistés en base** (table `users`, issue #9,
CRUD via `/api/users`, mots de passe hachés **argon2id** — `lib/password.ts`, `@node-rs/argon2`). Deux
rôles : **`viewer`** (« Lecteur », défaut des nouveaux comptes) = consultation ; **`admin`** =
**gestion des utilisateurs + édition des réglages + statistiques**. Auth active dès qu'`APP_PASSWORD`
**ou** `ADMIN_PASSWORD` est défini (les deux vides → désactivée, dev/tests intacts → rôle `admin`
ouvert). **Amorçage** : au 1er démarrage avec auth active, `bootstrap` crée l'admin initial depuis
`ADMIN_USER`/`ADMIN_PASSWORD` (défaut `admin`/`admin` **avec changement de mot de passe forcé**) ; les
variables d'env **n'authentifient plus** ensuite (source = base). Un **secret de session** aléatoire
est généré et persisté (`app_secret`), sauf override `SESSION_SECRET`. Le garde (monté sur `/api`,
hors `/health`, `/login`, `/logout`, `/auth/status`) accepte le **cookie de session** (l'en-tête Basic
n'est plus supporté), pas de `WWW-Authenticate`. **`PUT /api/settings`, `GET /api/stats` et les écritures
`/api/users` exigent le rôle `admin`** (`requestRole(req)`) ; le changement de son **propre** mot de
passe (`PUT /api/users/me/password`) est ouvert à tout utilisateur authentifié. **Changement de mot
de passe forcé appliqué côté serveur** : tant que `mustChangePassword` est vrai (ex. `admin`/`admin`
amorcé), le garde renvoie **403 `PASSWORD_CHANGE_REQUIRED`** sur tout `/api` sauf `PUT /users/me/password`
(l'écran client `ForcePasswordChange.vue` n'est donc pas la seule barrière). `resolveUser` effectue une
vérification argon2 **factice** sur login inconnu (temps constant → anti-énumération). `COOKIE_SECURE=true`
force le flag `Secure` du cookie. Conteneur non-root (`USER node`) + `HEALTHCHECK` sur `/api/health`.
Tests : `src/security.test.ts`, `src/routes/auth.test.ts`, `src/middleware/auth.test.ts`,
`src/routes/users.test.ts`, `src/routes/passwordChangeRequired.test.ts`, `src/service/UsersStore.test.ts`,
`src/db/usersRepository.test.ts`, `src/lib/{session,password}.test.ts`.

Routes tides (`src/routes/tides.ts`) :
- `GET /api/health` → `{ status: 'ok', version }` (sonde + **preuve de déploiement**, issue #12 ;
  `version` vient de `lib/version.ts`). `security.test.ts` fige le fait qu'elle n'expose **que** ces
  deux champs.
- `GET /api/sites` → liste des ports `{ id, label }` (depuis `config/sites.ts`).
- `GET /api/tides/meta?site` → `Maree.getMeta()` (bornes min/max + offsets Navihan).
- `GET /api/tides?site&from&to` → `Maree.getTidesRange(from, to)` (**plage inclusive**, défaut =
  toute la plage disponible). Valide le format `YYYY-MM-DD` et `from <= to`, sinon **400**.
- Le paramètre `?site=` (défaut `DEFAULT_SITE_ID` = `port-tudy`) sélectionne le fichier
  d'horaires ; **site inconnu → 400**. Une instance `Maree` est mémoïsée par site.
- `POST /api/tides/import?site&mode=merge|replace` (**rôle `admin`**, 403 sinon) → import en lot des
  horaires (#8 Phase 2). Corps = JSON format graine ; `sanitizeImport` (`lib/tidesImport.ts`) valide,
  `mode=merge` (défaut) remplace les jours fournis (`mergeSiteData`), `replace` tout le site. Reflété
  immédiatement par `GET /tides` (lecture DB à chaque requête). `express.json` relevé à 2 Mo.

Routes settings (`src/routes/settings.ts`) :
- `GET /api/settings` → `readSettings()` (défauts si non initialisé).
- `PUT /api/settings` → fusionne le corps sur la config courante, `sanitizeSettings` (valide/borne),
  persiste (`writeSettings`, écriture atomique), renvoie l'objet normalisé.

Route météo (`src/routes/weather.ts` + `src/service/weather.ts`) :
- `GET /api/weather?lat&lon&days` → `fetchWeather()` (Open-Meteo, **sans clé**) : normalise
  conditions actuelles + prévisions quotidiennes (dont `windDirection` dominante, `null` si absente,
  et **`uvIndexMax`**) + marine (vagues et **`seaTemperature`** / `seaTemperatureMax`, `null` si
  indisponible près des côtes). Le 5ᵉ paramètre **`extraSeaPoints`** ajoute des lieux dont on ne veut
  que la température de l'eau → `marine.extra: { label, seaTemperature }[]` ; la route y passe
  **Étel** (`EXTRA_SEA_POINTS`). **Une seule requête marine** : Open-Meteo sert plusieurs points par
  coordonnées séparées de virgules, et renvoie alors un **tableau** (le point principal en tête) —
  d'où la normalisation `Array.isArray(raw) ? raw : [raw]`. Défaut = zone Port-Tudy (Groix). `400`
  sur coordonnées invalides. `fetchWeather` prend un `fetchImpl` injectable (tests sans réseau).
  Codes WMO traduits (`weatherText`). La carte météo affiche aussi des **liens configurables**
  (`settings.weatherLinks`, cf. Config) avec placeholders `{lat}`/`{lon}` (`lib/weather.resolveLinkUrl`).
  **UV et température de l'eau alimentent la tuile « Mer » de l'éphéméride** (issue #13), pas la
  carte météo.

Routes auth (`src/routes/auth.ts`, publiques) :
- `POST /api/login` `{ user, password, remember }` → `resolveUser` (recherche en base + vérification
  argon2id) ; pose le cookie de session signé portant l'`userId` ; renvoie
  `{ ok, role, mustChangePassword }` ; 401 si invalide.
- `POST /api/logout` → efface le cookie.
- `GET /api/auth/status` → `{ authRequired, authenticated, role, user }` (`user` = `{ id, login,
  mustChangePassword } | null`). Le client (`useAuth`) en déduit `isAdmin` (boutons/panneaux
  **Réglages**, **Stats**, **Utilisateurs** réservés à `admin`) et `mustChangePassword` (écran de
  changement forcé `ForcePasswordChange.vue`).

Routes users (`src/routes/users.ts`, issue #9) :
- `GET/POST /api/users`, `PUT/DELETE /api/users/:id` → **rôle `admin`** (403 sinon). Service
  `service/UsersStore.ts` (validation, hachage, gardes) + repository `db/usersRepository.ts`. Création
  = rôle `viewer` par défaut ; garde-fou : impossible de rétrograder/supprimer le **dernier admin**
  (409) ; login dupliqué → 409 ; validation → 400.
- `PUT /api/users/me/password` `{ currentPassword, newPassword }` → **tout utilisateur authentifié**
  (403 si l'actuel est faux) ; efface l'indicateur `must_change_password`.

Routes remise à flot constatée (`src/routes/aflotObservations.ts`, issue #4) :
- `GET /api/aflot-observations` → liste `{ date, time, observed }` (lecture, ouverte comme `/tides`).
- `PUT /api/aflot-observations` `{ date, time, observed }` → upsert (**rôle `admin`**, 403 sinon ;
  400 si `date`/`time`/`observed` invalides). `date`/`time` = basse mer **Port-Tudy** ; `observed` = HH:MM.
- `DELETE /api/aflot-observations` `{ date, time }` → supprime (**admin**, 204). Repository
  `db/aflotObservationsRepository.ts`.

Routes lexique du « mot du jour » (`src/routes/lexicon.ts`, issue #4 suite) :
- `GET /api/lexicon` → lexique ordonné `{ id, term, definition, type }` (lecture ouverte).
- `POST /api/lexicon` `{ term, definition, type }` → ajoute (**admin**, 201 ; id slug généré ; 400 invalide).
- `PUT /api/lexicon/:id` / `DELETE /api/lexicon/:id` → met à jour / supprime (**admin**, 404 si absent).
- `POST /api/lexicon/reset` → rétablit les termes par défaut depuis `service/lexiconSeed.ts` (**admin**).

Routes accès/stats (`src/routes/stats.ts` + `src/middleware/accessLog.ts`, refondues issue #16) :
- `GET /api/stats?days=7|30|90|all` → agrégats d'accès (`lib/stats.ts` `aggregateAccess`), **réservé
  au rôle `admin`** (403 sinon ; `days` invalide → 400). `resolveSince` convertit `days` en borne
  passée à `readAccessEntries(db, sinceIso)` : **il n'y a pas de purge**, c'est la **lecture** qui est
  bornée (décision assumée).
- `POST /api/visit` → **balise d'ouverture de l'app** (tout utilisateur authentifié, 204),
  rate-limitée à 60 / 5 min. **Elle existe parce que le comptage par document HTML est faussé** : la
  PWA précache la coquille (`navigateFallback`), donc passé le premier chargement d'un appareil, le
  service worker sert les navigations **sans toucher au serveur** et le compteur cessait de bouger.
  Ne pas « simplifier » en revenant au comptage des documents.
- Chaque ligne d'`access_log` porte un **`kind`** : `visit` (balise, **le chiffre de tête**), `page`
  (chargement de coquille, sonde externe — ce que journalise encore le middleware `accessLog`) ou
  `login`. Les lignes antérieures à la v6 (`kind` NULL) sont relues comme `page`.
- **`recordAccess(req, db, { kind, login? })` résout le `login` depuis le cookie de session** quand
  l'appelant n'en fournit pas : sans cela, une ouverture authentifiée s'enregistrait en anonyme et la
  question « qui accède ? » restait sans réponse. Garde sur `authEnabled()` — hors auth, `requestUser`
  renvoie un admin **synthétique** (`dev`) qui n'est l'identité de personne. Reste anonymisé par
  ailleurs : IP **tronquée** (`net.truncateIp`), pays via **`geoip-lite`** (hors-ligne), User-Agent.
- `aggregateAccess` reste **pure** et expose `visits`/`pageLoads`/`logins`, `uniqueVisitors`,
  `perDay`, **`perHour[24]`**, **`perWeekday[7]`** (lundi = 0) et `users` = visites **par utilisateur
  avec `lastTs`**. Les répartitions ne portent que sur les **visites**.
- ⚠️ **`ts` est un instant UTC** : jour, heure et jour de semaine passent tous par **`localParts`**
  (`Intl.DateTimeFormat`, `Europe/Paris`). Le `ts.slice(0, 10)` d'origine plaçait une visite de
  01 h 30 locale **la veille**, et un histogramme horaire en UTC serait décalé de 1 à 2 h selon la
  saison. Les tests figent le comportement **en été et en hiver**.

Service `src/service/Maree.ts` (données uniquement, aucun rendu) :
- `getTidesRange(from?, to?)` — filtre `[from, to]` **inclusif** ; sans bornes → tout le fichier.
- `getTides(nbDays)` — fenêtre `[aujourd'hui, +nbDays[` (**`to` exclusif**) ; historique, conservé.
- `getMeta()` — min/max des dates + offsets Navihan formatés.
- `toExtreme()` mappe chaque entrée → `{ time, height, type, coefficient, navihan }` en ajoutant
  les heures Navihan par décalage fixe : basse mer +1h15, à flot +2h40. `formatNavihanTime()`
  gère le wrap autour de minuit. `mapDay()` filtre/mappe/trie les entrées d'un jour.
- Types exportés (contrat REST) : `Extreme`, `TideOutput`, `TidesMeta`.

**Persistance : base SQLite** (`better-sqlite3`, issue #8 Phase 1). Tout est stocké dans **une base
unique `DATA_DIR/marees.db`** (`src/config/dataDir.ts` : `DATA_DIR`, env, défaut `<cwd>/data`),
isolée pour un volume Docker. La couche DB est dans `src/db/` : `index.ts` (`openDb(file)` =
ouverture + `PRAGMA journal_mode=WAL` + migrations via `PRAGMA user_version` ; `getDb()` singleton
sur `DATA_DIR/marees.db` ; `openDb` crée le dossier parent ; `openDb(':memory:')` pour les tests),
`tidesRepository.ts` (`getSiteData`/`replaceSiteData`/`countTides`), `usersRepository.ts`
(CRUD `users` + `getOrCreateSessionSecret`), `aflotObservationsRepository.ts`
(`getObservations`/`upsertObservation`/`deleteObservation`), `lexiconRepository.ts`
(`getLexicon`/`addEntry`/`updateEntry`/`deleteEntry`/`resetLexicon`/`seedLexiconIfEmpty`),
`bootstrap.ts` (`initStorage(logger?, db?)`,
**async** : le seed admin hache un mot de passe ; amorce aussi le lexique via `seedLexiconIfEmpty`).
Schéma **v6** : tables `tides` (par site),
`settings` (document JSON, ligne unique `id=1`), `access_log` (dont colonne **`login`** nullable
(v3) et **`kind`** nullable (v6, issue #16 : `visit`/`page`/`login`, NULL relu comme `page`)),
**`users`** (login unique
`COLLATE NOCASE`, `password_hash` argon2id, `role`, `must_change_password`, timestamps),
**`app_secret`** (secret de session persisté, ligne unique), **`aflot_observations`** (v4, issue #4 :
heures de remise à flot **constatées** — clé primaire `(date, time)` de la basse mer Port-Tudy,
colonne `observed`) et **`lexicon`** (v5 : lexique éditable du « mot du jour » — `id`, `term`,
`definition`, `type` marée/pêche, `sort_order` ; amorcé depuis `service/lexiconSeed.ts`). Migration
additive par palier `if (version < N)`. ⚠️ `ALTER TABLE … ADD COLUMN` **n'est pas idempotent** en
SQLite : les paliers v3 et v6 testent d'abord `PRAGMA table_info` (robustesse à un rollback ayant
remis `user_version` en arrière puis re-migré).

**Amorçage/migration** : `initStorage()` (appelé au boot par `src/index.ts`, remplace les anciens
`ensureDataDir`/`ensureSettingsFile`) crée `DATA_DIR`, ouvre la base et l'amorce **si vide** — par
site sans données : import depuis le fichier **legacy** `DATA_DIR/<site>.json` s'il existe
(déploiements antérieurs), sinon depuis la **graine** embarquée (`dist/resources/`,
`src/resources/`) via `readTides` ; réglages : import de `settings.json` legacy s'il existe, sinon
défauts ; **utilisateurs** (si auth active) : génère le secret de session et amorce l'admin initial
(`ensureAdminUser`) si la table `users` est vide. Idempotent.

**Config** (`src/service/SettingsStore.ts`) : type `Settings` (`startMode`/`startDate`/`rangeDays`,
`navihan` en minutes (basse/pleine mer ; `aFlot` déprécié), `aFlotThreshold` = **seuil de remise à
flot** en m (défaut 2,8, 0–10, modèle issue #4), `aFlotDays`, `coefDays` = durée du graphe coef
(défaut 20, 1–90), `weatherLinks` = liens météo éditables `{ label, url }`, défauts
`DEFAULT_WEATHER_LINKS`), `DEFAULT_SETTINGS`, `sanitizeSettings` (validation/bornage — `clampFloat`
pour le seuil, sans arrondi ; les
`weatherLinks` invalides — libellé vide ou URL non http(s) — sont écartés, liste plafonnée à 12 ;
tableau absent → défauts, tableau vide explicite conservé), `readSettings`/`writeSettings`/
`ensureSettings` (lignes `settings` de la base ; paramètre `db` injectable pour la testabilité).

Source des horaires : `Maree` lit via une source injectable `load` — les routes passent
`() => getSiteData(getDb(), siteId)` (lecture DB à chaque appel → une édition runtime, Phase 2,
sera prise en compte sans redémarrage) ; sans option (tests `Maree`), retombe sur `readTides`.
`src/lib/readTides.ts` (**pas de scraping, pas d'API distante**) sert désormais de **parseur des
graines** (import initial) : il **normalise** deux formes (clés date directes et sections groupées
par mois) vers `{ date: entries }`.

### Client (`client/`)

Vite + Vue 3 (`<script setup>` + TypeScript) + Bootstrap 5.3 natif (+ bootstrap-icons) + Chart.js
(`vue-chartjs`). `src/main.ts` importe le CSS/JS Bootstrap et enregistre Chart.js.

- `src/types.ts` — miroir du contrat REST (`Extreme`, `TideOutput`, `TidesMeta`, `FlatTide`,
  `TideFilters`) ; découplage via le JSON, **pas de package partagé**.
- `src/api/tides.ts` — `getTides(from,to,site)`, `getMeta`, `getSites` (`fetch`, chemins `/api/...`)
  et le helper partagé `fetchJson`. Les statistiques ont leur propre module `src/api/stats.ts`
  (`getStats(days)`, `pingVisit()`).
- `src/lib/tides.ts` — `flatten()` (aplatit `days` en `FlatTide[]` triés), `filterTides()`
  (plage de dates inclusive, type, coef min) et `matchNavihanReference(site, reference)` (annote
  chaque marée du port sélectionné d'un `refTime` = heure Port-Tudy de même type la plus proche,
  tolérance 3 h, sinon `null`), `groupByDay(tides)` (regroupe par jour → `DayTides` : pleines/
  basses mers triées + coef du jour), `tidalRange(day)` (**marnage** du jour = plus haute pleine mer
  − plus basse basse mer, `null` s'il manque un type ; utilisé par la carte « Marnage du jour » de
  `StatCards`) et `periodWindow(from, rangeDays, offset, min, max)` (fenêtre
  du tableau décalée de `offset` périodes, bornée) — **fonctions pures, testées**.
- `src/lib/format.ts` — `formatDate`, `formatHeight`, `todayKey`, `addDays`, `coefBand`,
  `relativeDayLabel` (« aujourd'hui »/« demain »/date — lève l'ambiguïté d'une heure seule).
- `src/lib/ephemeride.ts` + `src/lib/saints.ts` — **éphéméride du jour** (issue #13), **calculée
  localement** donc disponible hors-ligne : `sunTimes` (lever/coucher/midi solaire, série NOAA,
  paramétrable par la hauteur du soleil visée → crépuscules), `formatTimeInZone` (`HH:MM` dans un
  fuseau explicite — `sunTimes` renvoie des instants UTC, sinon les tests dépendraient du fuseau de
  la machine), `formatDuration`, `daylightDelta` (écart de durée du jour avec la veille), `moonPhase`,
  `nextSyzygy`, `dayOfYear` (quantième), `isoWeek` ; `saintOfDay` (366 libellés figés, `SAINTS_BY_MONTH`).
  **Précision** : soleil à moins de 2 min d'Open-Meteo sur quatre saisons, syzygies à moins de 5 min
  des instants publiés des éclipses de 2026 (ancres de test). Deux pièges à ne pas réintroduire :
  le terme `+0.0009` de l'énoncé courant de l'algorithme solaire **ne s'applique pas ici** (il
  compense un arrondi de `n` que ce calcul ne fait pas → 1,3 min de retard) ; et la phase de lune
  doit être rapportée à la **lunaison réelle**, pas au mois synodique moyen, sinon le jour de la
  pleine lune se lit « gibbeuse décroissante ». `EPHEMERIDE_LOCATION` (Belz) est un **miroir** de
  `DEFAULT_LAT`/`DEFAULT_LON` du serveur, comme `DEFAULT_WEATHER_LINKS`.
- `src/lib/weather.ts` — `wmoIcon`, `degToCompass`, `resolveLinkUrl` et **`beaufort(kmh)`**
  (`{ force, label }`, seuils en km/h puisque Open-Meteo renvoie des km/h).
- `src/composables/useSettings.ts` — **config serveur** (singleton) : `settings` réactif (défauts
  puis hydraté via `GET /api/settings`), `load()`, et **sauvegarde auto débouncée** (~500 ms → `PUT`).
  Un flag `hydrating` empêche l'hydratation initiale de déclencher un save. `src/api/settings.ts`
  (`getSettings`/`saveSettings`) réutilise `fetchJson` (exporté de `api/tides.ts`).
- `src/composables/useSite.ts` — **port sélectionné** (singleton, persisté en `localStorage`
  `marees-site`, comme le thème) : `sites` (hydraté via `getSites()`), `siteId`, `current`,
  `isReference` (= `port-tudy`, référence Navihan), `setSite`, `load`. Sélecteur dans `App.vue`.
- `src/composables/useTides.ts` — charge config + sites + meta + marées au montage, expose `loading/
  error/meta/settings/filters/dateWindow/coefTides/tableTides/allTides` (+ nav période). `allTides` =
  **référence Port-Tudy** (marégramme, carte à flot). Les **lignes** (via `windowedTides`) sont les
  marées du **port sélectionné** : pour la référence, `refTime = time` ; sinon
  `matchNavihanReference(siteTides, allTides)` ; le Navihan est (re)calculé par
  `computeNavihan(refTime, …)`, « — » si `refTime` null. `watch(siteId)` recharge à la bascule.
  `filters` = **filtres éphémères** (`type`, `minCoef`). La fenêtre configurée dérive de
  `resolveWindow(settings, minDate, maxDate)` (début = `today`/`startDate`, fin = début+`rangeDays`).
  Filtrage **côté client**. Le **tableau** utilise `tableTides`/`tablePeriod` (`periodWindow` +
  `periodOffset` transitoire) : `prevPeriod`/`nextPeriod`/`resetPeriod` + `canPrevPeriod`/
  `canNextPeriod` décalent la période d'un bloc `rangeDays` (Précédent = jours avant la date de
  début) sans toucher au réglage ; offset remis à zéro si `startMode`/`startDate`/`rangeDays`
  changent. Le **graphe des coefficients** utilise `coefTides` = fenêtre de `coefDaysView` jours
  depuis le début configuré ; `coefDaysView` est **éphémère** (init sur `settings.coefDays`, suit le
  réglage, modifiable en session via `setCoefDaysView` sans persister).
- `src/composables/useNavihan.ts` + `src/lib/navihan.ts` — décalages Navihan **éditables** (basse
  mer / pleine mer indépendants, en minutes) ; `useNavihan` est désormais **adossé à
  `useSettings` (`settings.navihan`)** — persisté **côté serveur** (plus de localStorage).
  `useTides` (via `windowedTides`) **recalcule** `navihan` via `computeNavihan(t, settings.navihan)`,
  donc tableau/cartes/graphiques se mettent à jour en direct. La remise à flot d'une basse mer se
  décline en **trois valeurs** (issue #4) : **« Remise à flot »** = décalage **fixe** historique
  (`navihan['A flot']`, `settings.navihan.aFlot`, défaut 2h40) ; **« Estimation »** (`aflotEstimate`) =
  **modèle de seuil de hauteur** — instant où la courbe montante (interpolation cosinus) atteint
  `settings.aFlotThreshold` (m, défaut **2,8**, `DEFAULT_AFLOT_THRESHOLD`), donc délai qui **varie avec
  le coefficient** (cf. `docs/superpowers/specs/2026-07-24-navihan-coefficient-design.md`) ;
  **« Constaté »** (`aflotObserved`) = heure **réellement saisie** (persistée serveur, cf. table
  `aflot_observations`). **Périmètre de l'estimation** : elle n'apparaît **que** dans le tableau du
  dashboard (pastille ↗ « Estimation »). Partout ailleurs — cartes « Prochaine(s) remise(s) à
  flot », marqueurs du **marégramme**, rappel de la colonne **Constaté** — c'est l'heure
  **« Remise à flot »** (décalage **fixe** `aFlot`) qui est utilisée. Fonctions pures testées :
  `inverseCosineRising`/`navihanAflotFixed` (`lib/maregram.ts`),
  `aflotTimeByThreshold` (estimation, tableau) / `aflotEvents`/`nextAflot`/`aflotAgenda`
  (décalage fixe, cartes) / `shiftTime` (→ `HH:MM`) et `shiftMoment` (→ `{ date, time }`, à
  utiliser dès qu'une heure Navihan est **datée**, car les décalages franchissent minuit)
  (`lib/navihan.ts`) — toujours
  sur les hauteurs / basses mers **Port-Tudy** (`allTides`, `refDate`/`refTime`), même pour un port
  secondaire. `src/composables/useAflotObservations.ts` (singleton : map `date+heure Port-Tudy →
  constaté`, `load`/`get`/`save`/`remove` via `api/aflotObservations.ts`) alimente `aflotObserved` et
  la saisie du tableau. `lib/navihan.test.ts`.
- `components/SettingsPanel.vue` — **un seul panneau repliable « Réglages & filtres »** (props
  `filters` + `meta`, émet `reset`) regroupant 4 sections : **Période** (config : `startMode`
  `today`/`date` + `startDate` + `rangeDays` + `coefDays`), **Décalages Navihan** (config : basse/pleine
  mer en minutes + **seuil de remise à flot** `aFlotThreshold` en m + `aFlotDays`, bouton défauts),
  **Liens météo** (config : liste éditable `settings.weatherLinks` — libellé + URL,
  ajout/suppression, bouton défauts), **Filtres d'affichage** (éphémères : `Type`, `Coef min`, reset).
  Remplace les anciens `TideFilters.vue` / `NavihanSettings.vue`. **Bouton + panneau masqués si le
  rôle n'est pas `admin`** (`useAuth().isAdmin`) : on ne montre pas des réglages non modifiables.
  `StatCards.vue` — carte « Prochaine remise à flot » : heure **Remise à flot** suivie du **jour de
  l'à-flot lui-même** (`relativeDayLabel(nextAflot().date, …)` → « aujourd'hui »/« demain ») — pas
  celui de la basse mer, qui diffère quand le décalage franchit minuit (une remise à flot à 00:49 se
  lisait sinon comme déjà passée) ; en légende, la **basse mer Navihan** dont elle découle
  (Port-Tudy + `basseMer` via `shiftMoment`, **pas** l'heure Port-Tudy brute), datée elle aussi de
  son propre jour. **Toutes les heures de cette carte sont donc des heures Navihan datées.**
  Carte « Prochaines remises à flot » = **agenda** des `settings.aFlotDays` prochains jours
  (`aflotAgenda`, un jour par ligne). **Règle générale du projet : une heure Navihan est rangée au
  jour où elle a réellement lieu.** ~14 % des basses mers ont leur à-flot après minuit ; il est
  donc listé au **lendemain**, jamais sur le jour de la basse mer d'origine. Sur des données
  saines, un jour porte au plus 2 remises à flot. Les heures **déjà passées restent listées,
  estompées** (`.aflot-past`) : la carte est un agenda stable, elle ne se vide pas au fil de la
  journée. Comme cette carte est la plus haute de la rangée, elle **imposerait** sa
  hauteur : au-delà de **3 jours** (budget calé sur les 3 autres cartes) le surplus est **replié**
  derrière « + N autres jours » / « Voir moins » — repli **éphémère** (`ref` local, la liste est
  tronquée en JS ; bouton `btn btn-link` + chevron, aucun JS Bootstrap, cf.
  `ResourcesCard`/`MotDuJourCard`), refermé automatiquement si `aFlotDays` retombe sous le budget.
  `StatCards.test.ts`. Le **marnage du jour** de cette carte vient de `tidalRange` (`lib/tides.ts`).
- **Éphéméride du jour** (`components/EphemerideCard.vue`, `lib/ephemeride.ts`, `lib/saints.ts`,
  `composables/useEphemeride.ts`, issue #13) — carte **pleine largeur** placée après `StatCards`,
  quatre tuiles : **Soleil** (lever → coucher, durée du jour et son écart avec la veille, midi
  solaire), **Lune** (phase + illumination, prochaine syzygie ; mention « vives-eaux à suivre »
  **seulement** à ≤ 2 jours de la syzygie, celles-ci la suivant de ~36 h), **Calendrier** (date,
  quantième, semaine ISO, saint du jour), **Mer** (température de l'eau + indice UV). **Les lieux sont
  nommés** : le soleil est calculé « à Belz » (les marées de la page sont celles de Port-Tudy — l'écart
  serait d'environ 1 min), et l'eau est étiquetée « Belz (haute ria) » car la grille marine
  d'Open-Meteo accroche la requête à ~4,6 km au nord-est, en eau peu profonde donc plus chaude ;
  **Étel** est donnée en dessous, en plus petit (`.ephemeride-aside`), pour ne pas faire passer l'une
  pour l'autre. Un lieu secondaire sans température est **écarté** plutôt qu'affiché « null ». Repli
  **éphémère** (`ref` local, cf. `ResourcesCard`), masquage **persisté** via `useEphemeride`
  (`localStorage` `marees-ephemeride`, calque de `useMotDuJour`). **Trois tuiles sur quatre sont
  calculées localement** : Soleil, Lune et Calendrier n'ont **aucune dépendance réseau** (si la
  requête météo échoue, seules l'eau et l'UV passent à « — » — couvert par un test). Hors-ligne avec
  le cache PWA chaud, la carte est même complète, l'eau et l'UV venant du `NetworkFirst` sur `/api`.
  **En revanche, sur cache froid, rien ne s'affiche** : la carte vit dans le `v-else` de
  `Dashboard.vue`, après les états loading/error, donc un échec de `/api/tides` masque tout le
  dashboard. Le cache runtime n'est alimenté qu'à partir de la **2ᵉ** visite, le service worker ne
  contrôlant pas encore la page lors de la 1ʳᵉ (comportement PWA préexistant, non propre à l'éphéméride).
  Le **marnage n'y figure pas** : `StatCards` a déjà sa carte « Marnage du jour ». La date n'est
  affichée **qu'une fois** (tuile Calendrier, pas dans l'en-tête) et sa majuscule est posée en JS —
  `text-capitalize` en mettrait une à chaque mot (« Jeudi 30 Juillet », or les mois s'écrivent en
  minuscules). `EphemerideCard.test.ts`.
- `components/StatsPanel.vue` — **panneau « Statistiques d'accès »** (offcanvas, remanié issue #16) :
  **sélecteur de période** (7 / 30 / 90 j / tout, **30 par défaut**), KPIs (visites · visiteurs
  uniques · local · externe), graphe visites/jour, **histogramme par heure**, **par jour de semaine**,
  **visites par utilisateur avec dernière visite**, puis pays/navigateurs/appareils. Chargements de
  coquille et connexions sont relégués en ligne secondaire : ce sont des diagnostics, pas le chiffre
  de tête. Charge `getStats(days)` (`api/stats.ts`) à l'ouverture et à chaque changement de période.
  Le bouton (navbar, `App.vue`) et le panneau ne sont montés que si `useAuth().isAdmin` ; le verrou
  réel est côté serveur (`/api/stats` → 403 hors rôle admin). `StatsPanel.test.ts`. `SettingsPanel`
  affiche un avertissement (`useSettings.saveError`) quand un enregistrement est refusé.
- `composables/useVisitPing.ts` + `api/stats.ts` — **balise de visite** (issue #16). `start()` émet
  `POST /api/visit` à l'ouverture, puis à chaque retour au premier plan (`visibilitychange`) espacé de
  plus de **30 min** — c'est la définition opérationnelle d'une « visite », l'app restant volontiers
  ouverte des heures. Émission **best-effort et silencieuse** (`pingVisit` avale ses erreurs et
  n'utilise **pas** `fetchJson`, dont le 401 renverrait à la mire pour une simple balise). Branchée
  dans `App.vue` sur `canCountVisit` (`showApp && !needsPasswordChange`) — condition **observée** et
  non appel unique, sinon la visite serait perdue pour qui doit d'abord changer son mot de passe
  (le garde renvoie alors 403 sur tout `/api`). `useVisitPing.test.ts`.
- `components/TidesImportPanel.vue` — **panneau « Import des horaires »** (offcanvas, **admin-only**,
  #8 Phase 2) : import en lot pour le port sélectionné (zone JSON + fichier, mode fusionner/remplacer)
  via `api/tidesAdmin.importTides` → `POST /api/tides/import`. Succès → `useDataRefresh().bump()`
  (singleton `token` observé par `useTides` → rechargement du dashboard). Bouton navbar admin-only.
- `components/UsersPanel.vue` — **panneau « Utilisateurs »** (offcanvas, **admin-only**, issue #9) :
  liste des comptes (login, rôle, actions), ajout (login + mot de passe + rôle défaut « Lecteur »),
  changement de rôle inline, réinitialisation de mot de passe, suppression (confirmation). Via
  `api/users.ts` (`listUsers`/`createUser`/`updateUser`/`deleteUser`/`changeMyPassword`, sur
  `fetchJson`). Bouton navbar admin-only (menu ⋮ mobile + desktop). Le login courant s'affiche dans
  la navbar (`useAuth().user`).
- **Mot du jour** (`components/MotDuJourCard.vue`, `lib/lexique.ts`, `composables/useLexicon.ts`,
  issue #4 suite) — carte du Dashboard affichant un terme + définition.
  `noteOfTheDay(ctx, lexicon, offset)`
  (pure, testée) **privilégie un terme de marée quand la marée du jour est marquante** (bande de coef
  grande-maree/vive-eau/morte-eau, ou tendance revif/déchet) ; sinon rotation déterministe **surtout
  pêche**, 1 jour sur 3 un terme marée. Chaque entrée est typée **`maree`/`peche`** (badge + icône).
  Le bouton **« Nouveau mot »** de l'en-tête tire un terme **au hasard** : il dépile un **sac de
  décalages mélangé** (`shuffledShifts`, Fisher-Yates, générateur injectable donc testé), remélangé
  une fois vide. Sac plutôt qu'aléa pur à chaque clic : sur 45 entrées, le hasard seul ramènerait un
  mot déjà vu bien avant d'avoir fait le tour ; ici aucun ne revient avant que tous soient passés.
  État **éphémère** (non persisté), remis à zéro si le lexique change de taille (il arrive du serveur
  après le montage). Un lien « Revenir au mot du jour » s'affiche dès que le décalage n'est plus nul.
  Le lexique est **persisté en base** (table `lexicon`, servie par `useLexicon` → `api/lexicon.ts`,
  fallback embarqué `LEXIQUE` hors-ligne). `components/LexiconPanel.vue` — **panneau « Lexique du mot
  du jour »** (offcanvas, **admin-only**) : ajout / édition inline / suppression + « Rétablir les
  défauts » ; bouton navbar admin-only.
- `components/ForcePasswordChange.vue` — écran **bloquant** de changement de mot de passe, affiché par
  `App.vue` quand `useAuth().mustChangePassword` (ex. compte `admin`/`admin` amorcé) : appelle
  `changeMyPassword` puis réhydrate le statut. `useAuth` expose désormais `user` et `mustChangePassword`.
- `Dashboard.vue` affiche un encart explicatif : heures **Port-Tudy** = référence, le but est
  d'en déduire les heures **Navihan** (basse mer, pleine mer, « remise à flot »).
- `src/composables/useWeather.ts` — **météo partagée** (singleton) : `weather`/`loading`/`error`,
  `load()` **idempotent** (les appels suivants attendent la même promesse) et `reload()` forcé
  (bouton de rafraîchissement). Point d'entrée **unique** de la météo : `WeatherCard` **et** la tuile
  « Mer » de `EphemerideCard` en ont besoin, et chacune la chargeant pour son compte appellerait
  `/api/weather` deux fois. `resetWeatherForTests()` remet le singleton à zéro entre les tests.
  `WeatherCard.vue` exprime le vent **dans les deux unités sur une même ligne** — km/h **et** force
  Beaufort (`lib/weather.beaufort`) — vitesse comme rafales : ce sont deux expressions du même vent,
  les séparer casserait le lien. Le **libellé** (« petite brise ») n'accompagne la force que dans les
  conditions actuelles ; les tuiles de prévision se limitent aux deux chiffres, et passent à **2 par
  ligne sous `sm`** (à 4 colonnes sur un téléphone, « 24 km/h O · 4 Bft » se disloque). Le libellé est
  précédé d'une **virgule** et non d'un espace : Vue élague les blancs en début de nœud texte, ce qui
  collait « 3 Bftpetite brise ». `WeatherCard.test.ts`.
- `src/composables/useTheme.ts` — thème clair/sombre (singleton). Applique `data-bs-theme`
  (mode couleur natif Bootstrap 5.3) sur `<html>`, persiste dans `localStorage`, défaut =
  préférence système. Bascule via le bouton de la navbar ; les graphiques Chart.js lisent
  `isDark` pour adapter ticks/grilles.
- `src/views/Dashboard.vue` — assemble `SettingsPanel` + `StatCards` + `HeightChart`/`CoefChart`
  + `TideDayTable` ; états loading (spinner) / error (alert).
- `HeightChart.vue` — **marégramme Navihan du jour** (jour **navigable** : boutons précédent/suivant
  + « Auj. » + sélecteur de date dans l'en-tête, borné aux dates dispo ; repère « maintenant »
  seulement aujourd'hui) : courbe de hauteur reconstruite
  par interpolation cosinus entre extrêmes via `lib/maregram.ts` (`buildMaregram`, testée), axe x
  linéaire en minutes ; coef du jour au titre. Marqueurs « Remise à flot » = `navihanAflotFixed`
  (décalage **fixe** `aFlot`, **pas** l'estimation par seuil). `CoefChart.vue` — barres des coefficients sur
  `coefDaysView` jours (défaut = réglage `coefDays` = 20) ; **champ durée dans le titre = éphémère**
  (session, non persisté, via `update:days` → `setCoefDaysView` ; revient au réglage au rechargement).
  Labels x sur deux lignes (date + heure). Données du Dashboard (`HeightChart` = `allTides` ;
  `CoefChart` = `coefTides`).
- Tableau `TideDayTable.vue` — **une ligne par jour** (`lib/tides.groupByDay`, pure/testée).
  Colonnes = **Jour · Coef · Pleines mers · Basses mers · Navihan · Constaté**. Chaque cellule
  Pleines/Basses mers liste les marées du **port sélectionné** en `HH:MM · 🌊 h,hh m` (heure +
  hauteur d'eau inline, icône `bi-water` + légende) ; le **Coef** du jour = max des coef des pleines
  mers (Port-Tudy). La colonne **Navihan** (dérivée Port-Tudy) affiche des **pastilles triées par
  heure**, une par **type affichable** (`useNavihanDisplay`, 5 types masquables via la légende
  cliquable, persistés localStorage) : basse mer (↓), **Remise à flot** fixe (✓ vert),
  **Estimation** seuil (↗ cyan), **Constaté** (violet) et pleine mer (↑). **Chaque pastille est
  rendue sur la ligne du jour où elle a réellement lieu** (`shiftMoment` sur `refDate`/`refTime`,
  repli sur la marée elle-même pour le port de référence) : une heure dérivée d'une basse mer
  tardive part donc au **lendemain**, au lieu de remonter en tête de la ligne d'origine où elle se
  lisait comme une heure du petit matin de ce jour-là. Conséquence : `tableTides` embarque **un jour
  d'amorce** en amont (`addDays(from, -1)` dans `useTides`) pour que la première ligne hérite des
  heures de la veille ; la prop **`from`** dit à `TideDayTable` de ne pas rendre ce jour comme une
  ligne. La colonne **Constaté**
  (masquable via le type `flotObs`) porte la **saisie** de l'heure réelle, **rangée elle aussi au
  jour de la remise à flot** (l'observation suit l'à-flot qu'elle mesure ; la clé en base reste la
  basse mer Port-Tudy), précédée du
  **rappel de l'heure « Remise à flot »** (décalage fixe, pas l'estimation) qui sert aussi de clé de
  tri des lignes : `<input type="time">` **si `useAuth().isAdmin`**
  (→ `useAflotObservations.save`/`remove`), sinon pastille/lecture. Responsive : pile de cartes sur mobile (`.tide-day-table`
  + `data-label`, cf. `assets/app.css`). Repère « aujourd'hui »,
  `table-responsive` (défilement horizontal mobile). Purement présentationnel : il rend la période
  qu'on lui passe (`tableTides`) ; la **navigation Précédent/Suivant/Début** (par période, cf.
  `useTides`) est dans l'en-tête de carte du `Dashboard`. Remplace l'ancien `TideTable`
  (une-ligne-par-marée, retiré).

Le proxy Vite (`vite.config.ts`) redirige `/api` vers `:3000` en dev.

**PWA / hors-ligne** : `vite.config.ts` configure `vite-plugin-pwa` (`registerType: autoUpdate`) —
précache de la coquille (`navigateFallback: index.html`) + runtime-cache `NetworkFirst` sur `/api`.
Génère `sw.js`, `manifest.webmanifest`, `registerSW.js` dans `client/dist` (servis par Express).
Actif uniquement en build de prod, pas en dev. Icône : `client/public/favicon.svg`.

### Déploiement (`deploy/`)

`deploy/release.sh` (**déploiement d'une version** de bout en bout, appelé par `.githooks/pre-push`,
cf. §Commandes), `deploy/save-image.sh` (build + `docker save | gzip` → `marees-image.tar.gz` ;
`APP_VERSION` ajoute le tag d'image versionné + le label OCI),
`deploy/docker-compose.nas.yml` (image chargée, volume `/volume1/docker/marees/data`),
`deploy/README.md` (procédure NAS Synology DS218+ par transfert de fichier). Le `docker-compose.yml`
racine reste pour le local.

**Sauvegarde de la base de prod** (issue #11) : `deploy/backup-db-on-nas.sh` s'exécute **sur le
NAS** (transféré par `push-to-nas.sh` comme `update-on-nas.sh`) et écrit
`backups/marees-AAAAMMJJ-HHMMSS.db.gz` avec rotation (`KEEP=14`) ; instantané **à chaud**
(`VACUUM INTO` + `integrity_check` **avant** l'écriture et **avant** la rotation → une sauvegarde
ratée ne fait pas tomber une bonne sauvegarde), ni `sudo` ni `docker` requis, donc planifiable
comme **tâche utilisateur** du Planificateur de tâches DSM (procédure + restauration :
`deploy/INSTALLATION-NAS.md` §10). Le pendant côté PC est `npm run db:pull`.

## Fichiers clés

- `server/src/service/Maree.ts` — service données (Navihan, `getTidesRange`, `getMeta`).
- `server/src/routes/tides.ts`, `server/src/app.ts`, `server/src/index.ts` — API REST.
- `server/src/db/` (`index.ts`, `tidesRepository.ts`, `bootstrap.ts`) — persistance SQLite.
- `server/src/lib/readTides.ts`, `server/src/resources/horaires_marees_port-tudy.json` — graines (import initial).
- `client/src/composables/useTides.ts`, `client/src/lib/tides.ts` — état + filtrage.
- `client/src/views/Dashboard.vue` + `client/src/components/*.vue` — dashboard.
- Tests : `server/src/**/*.test.ts` (Vitest + supertest), `client/src/**/*.test.ts`
  (Vitest + @vue/test-utils, environnement `jsdom`).

## Conventions

- Serveur : CommonJS (`module: commonjs`), TypeScript `strict`. Client : ESM, `strict`.
- Ne pas éditer les `dist/` (générés, gitignorés). Modifier les sources.
- `DATA_DIR` (défaut `server/data` en dev) est **gitignoré** ; il contient la base runtime
  `marees.db`. Pour changer les marées durablement **par défaut** (fresh boot), éditer la **graine**
  `server/src/resources/horaires_marees_port-tudy.json` (embarquée dans l'image) puis supprimer
  `marees.db` (ré-amorçage), ou re-seeder. L'édition runtime des horaires via l'app arrive en
  **Phase 2** de l'issue #8.
- Les tests du service figent l'horloge (`vi.useFakeTimers`) pour `getTides` (part de
  `new Date()`) ; `getTidesRange` à bornes explicites en est indépendant.
- Couverture actuelle des données : Port-Tudy 2026-06-01 → 2026-10-31, Étel 2026-07-01 → 2026-10-31.
  Pour mettre à jour un site, éditer sa graine `server/src/resources/horaires_marees_<site>.json`
  (embarquée dans l'image) puis supprimer `marees.db` du `DATA_DIR`/volume (ré-amorçage au prochain
  démarrage).
- **Qualité de la graine Port-Tudy** : 4 basses mers parasites ont été retirées (29/07 23:52,
  13/08 sans heure, 28/08 10:10, 11/10 23:27) — elles violaient l'alternance haute/basse et
  produisaient des jours à 3 remises à flot. **11 journées ont ensuite été reprises depuis
  l'annuaire officiel** (heures et hauteurs fausses ou manquantes, non reconstituables par
  déduction) : 29/07, 13/08, 15/08, 20/08, 21/08, 22/08, 27/08, 28/08, 31/08, 11/10, 12/10. Contrôle
  de non-régression : `npm -w server run check-tides`.
- **Deux doublons restants sont des coïncidences vérifiées**, à ne pas re-investiguer : Port-Tudy
  `basse 15:25 · 2,01 m` le 06/06 **et** le 17/09 ; Étel `haute 13:36 · 4,10 m` le 08/08 **et** le
  06/09. Les quatre dates ont été confirmées bonnes (annuaire, et test du milieu des extrêmes
  encadrants). Le contrôle `doublon` les signale par construction : c'est le coût de précision
  assumé d'un test qui, lui, a trouvé 5 vraies journées recopiées.
- Le motif de défaillance dominant de cette source est le **décalage d'un jour** : une journée porte
  la valeur de sa voisine. Le test le plus discriminant est le **milieu des extrêmes encadrants**
  (une basse mer tombe à mi-chemin entre ses deux pleines mers) — mais avec une tolérance réelle de
  ±36 min, il **ne suffit pas** à trancher seul : le 27/08 (faux) et le 17/09 (bon) présentaient
  tous deux un écart de +36 min. Seul l'annuaire tranche.
