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
- Par workspace : `npm -w server run <script>`, `npm -w client run <script>`.
- Un seul test : `npx vitest run -t "<nom>"` depuis `server/` ou `client/`. Watch : `npx vitest`.
- `npm -w client run type-check` — `vue-tsc --noEmit` (le build Vite ne type-check pas).

## Architecture

### Serveur (`server/`)

Flux : `src/index.ts` (pino + `initStorage` (base SQLite, cf. Persistance) + `createApp`) → `src/app.ts`
(Express : `trust proxy`, **helmet** (CSP off), **rate-limit** global + météo + login, routeur
public `auth` (login/logout/status), **garde d'authentification optionnel** (`middleware/auth.ts`,
monté sur `/api`), `express.json`, routers `/api`, statique `client/dist` en prod, error handler
qui renvoie **400** sur erreur client — ex. JSON invalide — sinon 500). Servi en même origine →
**pas de CORS**.

**Authentification & rôles / exposition externe** (variables d'env, cf. `deploy/INSTALLATION-NAS.md`
§8) : la connexion se fait via une **mire** (`client` `LoginScreen.vue`) qui pose un **cookie de
session signé HMAC** portant un **rôle** (`lib/session.ts`). Deux rôles selon le mot de passe :
**`viewer`** (`APP_USER`/`APP_PASSWORD`, défaut user `marees`) = consultation ; **`admin`**
(`ADMIN_USER`/`ADMIN_PASSWORD`, défaut user `admin`) = **édition des réglages + statistiques**,
depuis n'importe où. Auth active dès qu'`APP_PASSWORD` **ou** `ADMIN_PASSWORD` est défini (les deux
vides → désactivée, dev/tests intacts → rôle `admin` ouvert). Le garde (monté sur `/api`, hors
`/health`, `/login`, `/logout`, `/auth/status`) accepte **cookie OU en-tête Basic**, pas de
`WWW-Authenticate`. **`PUT /api/settings` et `GET /api/stats` exigent le rôle `admin`**
(`requestRole(req)`), **plus de verrou LAN ni de `READ_ONLY`**. `COOKIE_SECURE=true` force le flag
`Secure` du cookie. Conteneur non-root (`USER node`) + `HEALTHCHECK` sur `/api/health`. Tests :
`src/security.test.ts`, `src/routes/auth.test.ts`, `src/lib/session.test.ts`.

Routes tides (`src/routes/tides.ts`) :
- `GET /api/health` → `{ status: 'ok' }`.
- `GET /api/sites` → liste des ports `{ id, label }` (depuis `config/sites.ts`).
- `GET /api/tides/meta?site` → `Maree.getMeta()` (bornes min/max + offsets Navihan).
- `GET /api/tides?site&from&to` → `Maree.getTidesRange(from, to)` (**plage inclusive**, défaut =
  toute la plage disponible). Valide le format `YYYY-MM-DD` et `from <= to`, sinon **400**.
- Le paramètre `?site=` (défaut `DEFAULT_SITE_ID` = `port-tudy`) sélectionne le fichier
  d'horaires ; **site inconnu → 400**. Une instance `Maree` est mémoïsée par site.

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
- `POST /api/login` `{ user, password, remember }` → `resolveRole` (admin puis viewer) ; pose le
  cookie de session signé portant le rôle ; renvoie `{ ok, role }` ; 401 si aucun rôle.
- `POST /api/logout` → efface le cookie.
- `GET /api/auth/status` → `{ authRequired, authenticated, role }`. Le client (`useAuth`) en déduit
  `isAdmin` et n'affiche les boutons/panneaux **Réglages** et **Stats** que si `admin`.

Routes accès/stats (`src/routes/stats.ts` + `src/middleware/accessLog.ts`) :
- `GET /api/stats` → agrégats d'accès (`lib/stats.ts` `aggregateAccess`), **réservé au rôle `admin`**
  (403 sinon). Le middleware `accessLog` journalise chaque **ouverture de page** (requête de document
  HTML, hors `/api`/assets) dans la table **`access_log`** de la base — anonymisé : IP **tronquée**
  (`net.truncateIp`), pays via **`geoip-lite`** (hors-ligne), User-Agent. `readAccessEntries(db)` lit
  la table ; `aggregateAccess` reste une fonction pure.

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
`tidesRepository.ts` (`getSiteData`/`replaceSiteData`/`countTides`), `bootstrap.ts`
(`initStorage(logger?, db?)`). Schéma v1 : tables `tides` (par site), `settings` (document JSON,
ligne unique `id=1`), `access_log`.

**Amorçage/migration** : `initStorage()` (appelé au boot par `src/index.ts`, remplace les anciens
`ensureDataDir`/`ensureSettingsFile`) crée `DATA_DIR`, ouvre la base et l'amorce **si vide** — par
site sans données : import depuis le fichier **legacy** `DATA_DIR/<site>.json` s'il existe
(déploiements antérieurs), sinon depuis la **graine** embarquée (`dist/resources/`,
`src/resources/`) via `readTides` ; réglages : import de `settings.json` legacy s'il existe, sinon
défauts. Idempotent.

**Config** (`src/service/SettingsStore.ts`) : type `Settings` (`startMode`/`startDate`/`rangeDays`,
`navihan` en minutes, `aFlotDays`, `coefDays` = durée du graphe coef (défaut 20, 1–90),
`weatherLinks` = liens météo éditables `{ label, url }`, défauts
`DEFAULT_WEATHER_LINKS`), `DEFAULT_SETTINGS`, `sanitizeSettings` (validation/bornage ; les
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
- `src/lib/format.ts` — `formatDate`, `formatHeight`.
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
  mer / pleine mer / à flot indépendants, en minutes) ; `useNavihan` est désormais **adossé à
  `useSettings` (`settings.navihan`)** — persisté **côté serveur** (plus de localStorage).
  `useTides` (via `windowedTides`) **recalcule** `navihan` via `computeNavihan(t, settings.navihan)`,
  donc tableau/cartes/graphiques se mettent à jour en direct. UI : `components/NavihanSettings.vue`
  (panneau repliable, saisie h+min, + champ **`aFlotDays`**). Fonctions pures testées dans
  `lib/navihan.test.ts`.
- `components/SettingsPanel.vue` — **un seul panneau repliable « Réglages & filtres »** (props
  `filters` + `meta`, émet `reset`) regroupant 4 sections : **Période** (config : `startMode`
  `today`/`date` + `startDate` + `rangeDays` + `coefDays`), **Décalages Navihan** (config : 3 offsets + `aFlotDays`,
  bouton défauts), **Liens météo** (config : liste éditable `settings.weatherLinks` — libellé + URL,
  ajout/suppression, bouton défauts), **Filtres d'affichage** (éphémères : `Type`, `Coef min`, reset).
  Remplace les anciens `TideFilters.vue` / `NavihanSettings.vue`. **Bouton + panneau masqués si le
  rôle n'est pas `admin`** (`useAuth().isAdmin`) : on ne montre pas des réglages non modifiables.
  `StatCards.vue` — carte « Prochaine remise à flot » / « Prochaines remises à flot » sur
  `settings.aFlotDays`.
- `components/StatsPanel.vue` — **panneau « Statistiques d'accès »** (offcanvas) : KPIs (visites,
  LAN/externe), graphe visites/jour, pays/navigateurs/appareils. Charge `getStats()` à l'ouverture.
  Le bouton (navbar, `App.vue`) et le panneau ne sont montés que si `useAuth().isAdmin` ; le verrou
  réel est côté serveur (`/api/stats` → 403 hors rôle admin). `SettingsPanel` affiche un
  avertissement (`useSettings.saveError`) quand un enregistrement est refusé.
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
  linéaire en minutes ; coef du jour au titre. `CoefChart.vue` — barres des coefficients sur
  `coefDaysView` jours (défaut = réglage `coefDays` = 20) ; **champ durée dans le titre = éphémère**
  (session, non persisté, via `update:days` → `setCoefDaysView` ; revient au réglage au rechargement).
  Labels x sur deux lignes (date + heure). Données du Dashboard (`HeightChart` = `allTides` ;
  `CoefChart` = `coefTides`).
- Tableau `TideDayTable.vue` — **une ligne par jour** (`lib/tides.groupByDay`, pure/testée).
  Colonnes = **Jour · Coef · Pleines mers · Basses mers · Remise à flot**. Chaque cellule
  Pleines/Basses mers liste les marées du **port sélectionné** en `HH:MM · 🌊 h,hh m` (heure +
  hauteur d'eau inline, icône `bi-water` + légende) ; le **Coef** du jour = max des coef des pleines
  mers (Port-Tudy) ; **« Remise à flot »** = heures Navihan (dérivées Port-Tudy) des basses mers,
  en **pastilles teal** (`info-subtle`, thèmes clair/sombre). Explication de « Remise à flot » en
  **infobulle** sur l'en-tête de colonne. Responsive : pile de cartes sur mobile (`.tide-day-table`
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
