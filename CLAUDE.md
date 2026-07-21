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

Flux : `src/index.ts` (pino + `ensureDataDir`/`ensureSettingsFile` + `createApp`) → `src/app.ts`
(Express : `trust proxy`, **helmet** (CSP off), **rate-limit** global + météo, **auth Basic
optionnelle** (`middleware/auth.ts`), `express.json`, routers `/api`, statique `client/dist` en
prod, error handler qui renvoie **400** sur erreur client — ex. JSON invalide — sinon 500). Servi
en même origine → **pas de CORS**.

**Durcissement / exposition externe** (variables d'env, cf. `deploy/INSTALLATION-NAS.md` §8) :
`APP_PASSWORD` (+ `APP_USER`, défaut `marees`) active l'auth Basic sur tout sauf `/api/health`
(vide → désactivée, dev/tests intacts) ; `READ_ONLY=true` → `PUT /api/settings` renvoie **403**.
Conteneur non-root (`USER node`) + `HEALTHCHECK` sur `/api/health`. Tests : `src/security.test.ts`.

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

Service `src/service/Maree.ts` (données uniquement, aucun rendu) :
- `getTidesRange(from?, to?)` — filtre `[from, to]` **inclusif** ; sans bornes → tout le fichier.
- `getTides(nbDays)` — fenêtre `[aujourd'hui, +nbDays[` (**`to` exclusif**) ; historique, conservé.
- `getMeta()` — min/max des dates + offsets Navihan formatés.
- `toExtreme()` mappe chaque entrée → `{ time, height, type, coefficient, navihan }` en ajoutant
  les heures Navihan par décalage fixe : basse mer +1h15, à flot +2h40. `formatNavihanTime()`
  gère le wrap autour de minuit. `mapDay()` filtre/mappe/trie les entrées d'un jour.
- Types exportés (contrat REST) : `Extreme`, `TideOutput`, `TidesMeta`.

**Répertoire de données** (`src/config/dataDir.ts`) : `DATA_DIR` (env, défaut `<cwd>/data`)
contient `settings.json` et **un fichier d'horaires par site** (`horaires_marees_port-tudy.json`,
`horaires_marees_etel.json`, isolés pour un volume Docker). `ensureDataDir()` crée le dossier et,
**pour chaque site de `SITES`**, copie le fichier depuis la graine (`dist/resources/`, via
`__dirname`) s'il est absent (volume vide au 1er run). `tidesFileForSite(id)` résout le chemin
runtime d'un site. `ensureSettingsFile()` écrit les défauts si `settings.json` manque. Les données
d'Étel ne sont pas encore fournies : la graine `horaires_marees_etel.json` est un objet vide `{}`
(le port s'affiche « Aucune marée » jusqu'à ce qu'on la remplisse, comme pour Port-Tudy).

**Config** (`src/service/SettingsStore.ts`) : type `Settings` (`startMode`/`startDate`/`rangeDays`,
`navihan` en minutes, `aFlotDays`, `weatherLinks` = liens météo éditables `{ label, url }`, défauts
`DEFAULT_WEATHER_LINKS`), `DEFAULT_SETTINGS`, `sanitizeSettings` (validation/bornage ; les
`weatherLinks` invalides — libellé vide ou URL non http(s) — sont écartés, liste plafonnée à 12 ;
tableau absent → défauts, tableau vide explicite conservé), `readSettings`/`writeSettings`
(paramètre `file` pour la testabilité, comme `readTides`).

Source des horaires : lue par `src/lib/readTides.ts` (**pas de scraping, pas d'API distante**) ;
le fichier contient déjà les **extrêmes** et `readTides()` **normalise** deux formes (clés date
directes et sections groupées par mois) vers `{ date: entries }` (entrées sans `heure` ignorées).
`Maree` accepte une option `dataFile` : les routes passent `TIDES_FILE` (dans `DATA_DIR`) ; sans
option (tests), `readTides` retombe sur la graine `src/resources/` — **tests inchangés**.

### Client (`client/`)

Vite + Vue 3 (`<script setup>` + TypeScript) + Bootstrap 5.3 natif (+ bootstrap-icons) + Chart.js
(`vue-chartjs`). `src/main.ts` importe le CSS/JS Bootstrap et enregistre Chart.js.

- `src/types.ts` — miroir du contrat REST (`Extreme`, `TideOutput`, `TidesMeta`, `FlatTide`,
  `TideFilters`) ; découplage via le JSON, **pas de package partagé**.
- `src/api/tides.ts` — `getTides(from,to,site)`, `getMeta`, `getSites` (`fetch`, chemins `/api/...`).
- `src/lib/tides.ts` — `flatten()` (aplatit `days` en `FlatTide[]` triés), `filterTides()`
  (plage de dates inclusive, type, coef min) et `matchNavihanReference(site, reference)` (annote
  chaque marée du port sélectionné d'un `refTime` = heure Port-Tudy de même type la plus proche,
  tolérance 3 h, sinon `null`) — **fonctions pures, testées**.
- `src/lib/format.ts` — `formatDate`, `formatHeight`.
- `src/composables/useSettings.ts` — **config serveur** (singleton) : `settings` réactif (défauts
  puis hydraté via `GET /api/settings`), `load()`, et **sauvegarde auto débouncée** (~500 ms → `PUT`).
  Un flag `hydrating` empêche l'hydratation initiale de déclencher un save. `src/api/settings.ts`
  (`getSettings`/`saveSettings`) réutilise `fetchJson` (exporté de `api/tides.ts`).
- `src/composables/useSite.ts` — **port sélectionné** (singleton, persisté en `localStorage`
  `marees-site`, comme le thème) : `sites` (hydraté via `getSites()`), `siteId`, `current`,
  `isReference` (= `port-tudy`, référence Navihan), `setSite`, `load`. Sélecteur dans `App.vue`.
- `src/composables/useTides.ts` — charge config + sites + meta + marées au montage, expose `loading/
  error/meta/settings/filters/dateWindow/filteredTides/allTides`. `allTides` = **référence
  Port-Tudy** (marégramme, carte à flot). Les **lignes** (`filteredTides`) sont les marées du **port
  sélectionné** : pour la référence, `refTime = time` ; sinon `matchNavihanReference(siteTides,
  allTides)`. Le Navihan est (re)calculé par `computeNavihan(refTime, …)`, « — » si `refTime` null.
  `watch(siteId)` recharge à la bascule. `filters` = **filtres éphémères** (`type`, `minCoef`). La fenêtre de dates dérive de `resolveWindow(settings, minDate, maxDate)`
  (`src/lib/tides.ts`, pure/testée) : début = aujourd'hui (`today`) ou `startDate` (`date`), fin =
  début + `rangeDays`, bornée. Filtrage **côté client**.
- `src/composables/useNavihan.ts` + `src/lib/navihan.ts` — décalages Navihan **éditables** (basse
  mer / pleine mer / à flot indépendants, en minutes) ; `useNavihan` est désormais **adossé à
  `useSettings` (`settings.navihan`)** — persisté **côté serveur** (plus de localStorage).
  `useTides.filteredTides` **recalcule** `navihan` via `computeNavihan(t, settings.navihan)`, donc
  tableau/cartes/graphiques se mettent à jour en direct. UI : `components/NavihanSettings.vue`
  (panneau repliable, saisie h+min, + champ **`aFlotDays`**). Fonctions pures testées dans
  `lib/navihan.test.ts`.
- `components/SettingsPanel.vue` — **un seul panneau repliable « Réglages & filtres »** (props
  `filters` + `meta`, émet `reset`) regroupant 4 sections : **Période** (config : `startMode`
  `today`/`date` + `startDate` + `rangeDays`), **Décalages Navihan** (config : 3 offsets + `aFlotDays`,
  bouton défauts), **Liens météo** (config : liste éditable `settings.weatherLinks` — libellé + URL,
  ajout/suppression, bouton défauts), **Filtres d'affichage** (éphémères : `Type`, `Coef min`, reset).
  Remplace les anciens `TideFilters.vue` / `NavihanSettings.vue`. `StatCards.vue` — carte « À flot »
  sur `settings.aFlotDays`.
- `Dashboard.vue` affiche un encart explicatif : heures **Port-Tudy** = référence, le but est
  d'en déduire les heures **Navihan** (basse mer, pleine mer, « à flot »).
- `src/composables/useTheme.ts` — thème clair/sombre (singleton). Applique `data-bs-theme`
  (mode couleur natif Bootstrap 5.3) sur `<html>`, persiste dans `localStorage`, défaut =
  préférence système. Bascule via le bouton de la navbar ; les graphiques Chart.js lisent
  `isDark` pour adapter ticks/grilles.
- `src/views/Dashboard.vue` — assemble `TideFilters` + `StatCards` + `HeightChart`/`CoefChart`
  + `TideTable` ; états loading (spinner) / error (alert).
- `HeightChart.vue` — **marégramme du jour** (aujourd'hui, fixe) : courbe de hauteur reconstruite
  par interpolation cosinus entre extrêmes via `lib/maregram.ts` (`buildMaregram`, testée), axe x
  linéaire en minutes ; coef du jour au titre. `CoefChart.vue` — barres des coefficients sur la
  sélection filtrée, nombre de jours dans le titre. Tous deux reçoivent leurs données du Dashboard
  (`HeightChart` = `allTides`, indépendant du filtre ; `CoefChart` = `filteredTides`).
- Colonnes du tableau (`TideTable.vue`) = Date, Type, **Heure ‹port sélectionné›**, Hauteur, Coef,
  Navihan basse mer, Navihan pleine mer, Navihan à flot. Chaque ligne est une marée du port
  sélectionné (Heure/Hauteur/Coef propres, en-tête via prop `siteLabel`) ; les colonnes Navihan
  sont dérivées de Port-Tudy (« — » si pas de marée de référence appariée). Tri par colonne.
  Lignes colorées par type.

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
- `server/src/lib/readTides.ts`, `server/src/resources/horaires_marees_port-tudy.json` — données.
- `client/src/composables/useTides.ts`, `client/src/lib/tides.ts` — état + filtrage.
- `client/src/views/Dashboard.vue` + `client/src/components/*.vue` — dashboard.
- Tests : `server/src/**/*.test.ts` (Vitest + supertest), `client/src/**/*.test.ts`
  (Vitest + @vue/test-utils, environnement `jsdom`).

## Conventions

- Serveur : CommonJS (`module: commonjs`), TypeScript `strict`. Client : ESM, `strict`.
- Ne pas éditer les `dist/` (générés, gitignorés). Modifier les sources.
- `DATA_DIR` (défaut `server/data` en dev) est **gitignoré** ; c'est le fichier runtime. Pour
  changer les marées durablement, éditer la **graine** `server/src/resources/horaires_marees_port-tudy.json`
  (embarquée dans l'image) puis recréer le `DATA_DIR`/volume, ou éditer directement le fichier
  dans `DATA_DIR`.
- Les tests du service figent l'horloge (`vi.useFakeTimers`) pour `getTides` (part de
  `new Date()`) ; `getTidesRange` à bornes explicites en est indépendant.
- Couverture actuelle des données Port-Tudy : 2026-06-01 → 2026-10-31. **Étel : pas encore de
  données** (graine `{}`) ; pour les fournir, remplir `server/src/resources/horaires_marees_etel.json`
  (même format) puis recréer le `DATA_DIR`/volume, ou éditer directement le fichier dans `DATA_DIR`.
