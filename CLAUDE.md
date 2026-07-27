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
- `npm -w server run check-tides` — **rapport de cohérence** des horaires (graines de tous les
  sites), ou d'un fichier précis : `npm -w server run check-tides -- fichier.json`. Diagnostic
  **seul, ne modifie rien** ; sort en 1 si des anomalies sont trouvées (utilisable en CI).
  Option `--markdown` pour un rapport partageable :
  `npm --silent -w server run check-tides -- --markdown > rapport-marees.md` (`--silent` évite que
  npm préfixe sa ligne `> ts-node …` dans le fichier).
- Par workspace : `npm -w server run <script>`, `npm -w client run <script>`.
- Un seul test : `npx vitest run -t "<nom>"` depuis `server/` ou `client/`. Watch : `npx vitest`.
- `npm -w client run type-check` — `vue-tsc --noEmit` (le build Vite ne type-check pas).

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
- `GET /api/health` → `{ status: 'ok' }`.
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
  conditions actuelles + prévisions quotidiennes (dont `windDirection` dominante, `null` si absente)
  + marine (vagues, `null` si indisponible près des côtes). Défaut = zone Port-Tudy (Groix). `400`
  sur coordonnées invalides. `fetchWeather` prend un `fetchImpl` injectable (tests sans réseau).
  Codes WMO traduits (`weatherText`). La carte météo affiche aussi des **liens configurables**
  (`settings.weatherLinks`, cf. Config) avec placeholders `{lat}`/`{lon}` (`lib/weather.resolveLinkUrl`).

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

Routes accès/stats (`src/routes/stats.ts` + `src/middleware/accessLog.ts`) :
- `GET /api/stats` → agrégats d'accès (`lib/stats.ts` `aggregateAccess`), **réservé au rôle `admin`**
  (403 sinon). Le middleware `accessLog` journalise chaque **ouverture de page** (requête de document
  HTML, hors `/api`/assets) dans la table **`access_log`** de la base — anonymisé : IP **tronquée**
  (`net.truncateIp`), pays via **`geoip-lite`** (hors-ligne), User-Agent, `login` **null**. En plus,
  la route `POST /login` enregistre une entrée par **connexion réussie** avec le `login` de
  l'utilisateur (`recordAccess(req, db, login)`) → `aggregateAccess` expose `users` (connexions **par
  utilisateur**). `readAccessEntries(db)` lit la table ; `aggregateAccess` reste une fonction pure.

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
Schéma **v5** : tables `tides` (par site),
`settings` (document JSON, ligne unique `id=1`), `access_log` (dont colonne **`login`** nullable,
v3), **`users`** (login unique
`COLLATE NOCASE`, `password_hash` argon2id, `role`, `must_change_password`, timestamps),
**`app_secret`** (secret de session persisté, ligne unique), **`aflot_observations`** (v4, issue #4 :
heures de remise à flot **constatées** — clé primaire `(date, time)` de la basse mer Port-Tudy,
colonne `observed`) et **`lexicon`** (v5 : lexique éditable du « mot du jour » — `id`, `term`,
`definition`, `type` marée/pêche, `sort_order` ; amorcé depuis `service/lexiconSeed.ts`). Migration
additive par palier `if (version < N)`.

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
- `src/api/tides.ts` — `getTides(from,to,site)`, `getMeta`, `getSites` (`fetch`, chemins `/api/...`).
- `src/lib/tides.ts` — `flatten()` (aplatit `days` en `FlatTide[]` triés), `filterTides()`
  (plage de dates inclusive, type, coef min) et `matchNavihanReference(site, reference)` (annote
  chaque marée du port sélectionné d'un `refTime` = heure Port-Tudy de même type la plus proche,
  tolérance 3 h, sinon `null`), `groupByDay(tides)` (regroupe par jour → `DayTides` : pleines/
  basses mers triées + coef du jour) et `periodWindow(from, rangeDays, offset, min, max)` (fenêtre
  du tableau décalée de `offset` périodes, bornée) — **fonctions pures, testées**.
- `src/lib/format.ts` — `formatDate`, `formatHeight`, `todayKey`, `addDays`, `coefBand`,
  `relativeDayLabel` (« aujourd'hui »/« demain »/date — lève l'ambiguïté d'une heure seule).
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
  `StatCards.test.ts`.
- `components/StatsPanel.vue` — **panneau « Statistiques d'accès »** (offcanvas) : KPIs (visites,
  LAN/externe), graphe visites/jour, pays/navigateurs/appareils. Charge `getStats()` à l'ouverture.
  Le bouton (navbar, `App.vue`) et le panneau ne sont montés que si `useAuth().isAdmin` ; le verrou
  réel est côté serveur (`/api/stats` → 403 hors rôle admin). `SettingsPanel` affiche un
  avertissement (`useSettings.saveError`) quand un enregistrement est refusé.
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
  Le bouton **« Nouveau mot »** de l'en-tête incrémente `offset` (état **éphémère** de la carte, non
  persisté) : chaque cran avance d'une entrée dans le lexique (déterministe, aucun aléa) et un tour
  complet ramène au mot du jour ; un lien « Revenir au mot du jour » s'affiche dès que `offset > 0`.
  Le lexique est **persisté en base** (table `lexicon`, servie par `useLexicon` → `api/lexicon.ts`,
  fallback embarqué `LEXIQUE` hors-ligne). `components/LexiconPanel.vue` — **panneau « Lexique du mot
  du jour »** (offcanvas, **admin-only**) : ajout / édition inline / suppression + « Rétablir les
  défauts » ; bouton navbar admin-only.
- `components/ForcePasswordChange.vue` — écran **bloquant** de changement de mot de passe, affiché par
  `App.vue` quand `useAuth().mustChangePassword` (ex. compte `admin`/`admin` amorcé) : appelle
  `changeMyPassword` puis réhydrate le statut. `useAuth` expose désormais `user` et `mustChangePassword`.
- `Dashboard.vue` affiche un encart explicatif : heures **Port-Tudy** = référence, le but est
  d'en déduire les heures **Navihan** (basse mer, pleine mer, « remise à flot »).
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

`deploy/save-image.sh` (build + `docker save | gzip` → `marees-image.tar.gz`),
`deploy/docker-compose.nas.yml` (image chargée, volume `/volume1/docker/marees/data`),
`deploy/README.md` (procédure NAS Synology DS218+ par transfert de fichier). Le `docker-compose.yml`
racine reste pour le local.

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
  produisaient des jours à 3 remises à flot. Contrôle de non-régression : `npm -w server run
  check-tides` (entre deux extrêmes il doit y avoir alternance, et jamais moins de 3 h d'écart).
  **4 anomalies subsistent côté pleines mers**, à reprendre depuis l'annuaire officiel — ce sont des
  valeurs *manquantes ou fausses*, non reconstituables par déduction : 15/08 pleine mer du matin
  datée 01:12 (à 3 min d'une basse mer ; devrait être vers 07:13 d'après ses voisines), 20/08 et
  31/08 sans pleine mer du soir, 21-22/08 dupliquée à 3,64 m. Sans effet sur les remises à flot,
  mais elles faussent le marégramme et les heures « pleine mer » de ces jours.
