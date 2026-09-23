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

Routes carnet de pêche (`src/routes/fishing.ts`, issue #3) :
- `GET /api/fishing/trips?from&to` → sorties + prises (lecture ouverte, plage **inclusive**, 400 si
  dates invalides ou `from > to`).
- `POST /api/fishing/trips` (**admin**, 201) → crée. **La météo est figée ici**
  (`service/fishingWeather.captureTripWeather`) et **jamais au `PUT`** : la recapturer écraserait la
  météo de juillet le jour où l'on corrige une note en janvier. Capture **best-effort** — hors
  fenêtre Open-Meteo (92 j d'archive, 7 j de prévision) ou sur échec réseau, `weather` reste `null`
  et l'enregistrement aboutit quand même.
- `PUT /api/fishing/trips/:id` (**admin**) → remplace la sortie **et toutes ses prises** en une
  transaction. `DELETE` (**admin**, 204).
- ⚠️ **`baited` (« casiers boëttés », v9) est réécrit par le `PUT`, contrairement à `weather`.** La
  règle n'est pas « le `PUT` ne touche à rien » mais « il ne recapture pas ce qui n'est pas
  reproductible » : la boëtte est une donnée **saisie**, corrigeable comme les notes. C'est un
  **oui / non** — la matière n'est pas saisie, et un référentiel de boëttes a été écarté (personne ne
  le remplirait ; les notes restent libres). `parseTrip` fait `baited: o.baited === true` :
  **coercition**, pas validation — une valeur farfelue vaut « non » sans 400, sur le modèle de
  `kept` dans `parseCatch` (au défaut inverse près). Spec :
  `docs/superpowers/specs/2026-08-13-boette-casiers-peche-design.md`.
- `GET /api/fishing/refs` (lecture) ; `POST`/`PUT`/`DELETE /api/fishing/refs[/:id]`,
  `POST /api/fishing/refs/reset` et `POST /api/fishing/refs/reorder` (**admin**). ⚠️ Supprimer un référentiel **encore utilisé** par une
  prise renvoie **409** : il n'y a **pas** de clé étrangère vers `fishing_refs`, précisément pour
  qu'une sortie ancienne ne perde pas son espèce lors d'un nettoyage du référentiel. Pour la même
  raison, `reset` **conserve** les entrées hors graine encore référencées par une prise.
- ⚠️ **Le pluriel d'un référentiel est une donnée, pas un calcul** (`labelPlural`, v8) : sur la seule
  graine, l'orthographe demande des choses contradictoires — « lieu jaune » fait « lieus jaunes » là
  où « lieu » l'endroit ferait « lieux », et « crevette bouquet » garde son apposition invariable.
  Une heuristique le rendait faux ; ne pas la réintroduire. `POST`/`PUT` acceptent un `labelPlural`
  **facultatif** : vide ou absent, il vaut `label` (repli posé dans le **repository**, donc valable
  pour tout appelant comme pour toute ligne antérieure à la v8, relue `NULL` → singulier). Ce repli
  étant **silencieux**, une base amorcée avant la v8 garderait « 3 casier à crabes » sans le
  signaler : `backfillSeedPlurals` (appelé par `initStorage`, **pas** par la migration — la graine
  est une donnée de service, pas de schéma) complète les entrées **de la graine** dont le libellé
  n'a pas été renommé et dont le pluriel est encore `NULL`. Un renommage ou un pluriel déjà saisi
  n'est jamais écrasé.
- **Engin par défaut d'une espèce** (`defaultGearId`, v10) : l'engin que le formulaire
  pré-sélectionne quand on choisit l'espèce — **une donnée saisie** dans le panneau, pas une règle
  (même raison que le pluriel : `fishing_refs` ne sait pas ce qu'est un casier). `POST`/`PUT`
  l'acceptent **facultatif** : absent, `null` ou `''` = aucun ; un id qui n'est pas un engin
  existant → **400** (pas de clé étrangère, la route tient la cohérence) ; forcé à `NULL` pour un
  engin. Le `PUT` **remplace** : absent, il efface le défaut. Supprimer un engin **efface** le défaut
  des espèces qui le portaient au lieu de refuser — ce n'est qu'une commodité de saisie.
  ⚠️ Le complément d'une base existante (entrées ajoutées à la graine en v10 — casier à morgates,
  morgate — puis défauts des espèces de la graine au libellé inchangé) est fait **dans le palier de
  migration**, donc **une seule fois**, et **pas** rejoué par `initStorage` comme
  `backfillSeedPlurals` : un pluriel `NULL` voulait toujours dire « jamais renseigné », alors qu'un
  défaut `NULL` peut être un choix ; rejoué, il remettrait un défaut retiré ou une entrée
  supprimée. Le palier ne fait rien sur une table vide (base neuve : l'amorçage s'en charge).
  Spec : `docs/superpowers/specs/2026-09-23-engin-par-defaut-espece-design.md`.
- **Ordre des référentiels** (`POST /api/fishing/refs/reorder` `{ kind, ids }`, `reorderRefs`) :
  réordonne **une section** (les espèces entre elles, les engins entre eux), les deux listes n'étant
  jamais affichées ensemble. `ids` doit être **exactement** l'ensemble des ids de ce `kind`, sinon
  **400** — une liste périmée doit échouer bruyamment plutôt qu'escamoter l'absent. ⚠️ Les rangs ne
  sont **pas** renumérotés 0..N−1 : on **redistribue les rangs déjà occupés** par la section, car
  `sort_order` est **global aux deux types** (la graine numérote par index et `nextSortOrder` rend
  max + 1 quel que soit le `kind` — un engin ajouté après coup passe donc après les espèces, sans
  conséquence puisque le regroupement se fait côté client sur `kind`). ⚠️ C'est un `POST` sur le
  modèle de `/reset` : un `PUT /fishing/refs/order` aurait été capté par `PUT /fishing/refs/:id`.
  Spec : `docs/superpowers/specs/2026-08-11-ordre-referentiels-peche-design.md`.
- `service/weather.ts` expose désormais `DEFAULT_LAT`/`DEFAULT_LON` (la route météo les importe au
  lieu de les redéclarer) et `fetchWeather` prend un 6ᵉ paramètre **`pastDays`** : sans lui, une
  sortie saisie après coup enregistrerait la météo du **jour de la saisie**.

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
  `perDay`, **`perHour[24]`**, **`perWeekday[7]`** (lundi = 0) et `users`. Les répartitions ne
  portent que sur les **visites**.
- Chaque entrée de `users` porte **le rythme propre du compte** : `count`, `firstTs`, `lastTs`, ses
  **`perHour`/`perWeekday`** et `recent` (ses dernières visites, la plus récente en tête). Les
  répartitions globales mêlent tous les visiteurs et ne disent donc pas quand **une personne
  donnée** consulte l'app. `recent` est **plafonné à 10** (`RECENT_VISITS`) : sans ce plafond, un
  `days=all` embarquerait tout l'historique de chacun dans la réponse.
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
`fishingRepository.ts` (sorties et prises : `listTrips`/`getTrip`/`createTrip`/`updateTrip`/`deleteTrip`),
`fishingRefsRepository.ts`
(`getRefs`/`addRef`/`updateRef`/`deleteRef`/`resetFishingRefs`/`seedFishingRefsIfEmpty`),
`bootstrap.ts` (`initStorage(logger?, db?)`,
**async** : le seed admin hache un mot de passe ; amorce aussi le lexique via `seedLexiconIfEmpty`
et les référentiels de pêche via `seedFishingRefsIfEmpty`, `upgradeFishingRefsToV10`).
Schéma **v10** : tables `tides` (par site),
`settings` (document JSON, ligne unique `id=1`), `access_log` (dont colonne **`login`** nullable
(v3) et **`kind`** nullable (v6, issue #16 : `visit`/`page`/`login`, NULL relu comme `page`)),
**`users`** (login unique
`COLLATE NOCASE`, `password_hash` argon2id, `role`, `must_change_password`, timestamps),
**`app_secret`** (secret de session persisté, ligne unique), **`aflot_observations`** (v4, issue #4 :
heures de remise à flot **constatées** — clé primaire `(date, time)` de la basse mer Port-Tudy,
colonne `observed`) et **`lexicon`** (v5 : lexique éditable du « mot du jour » — `id`, `term`,
`definition`, `type` marée/pêche, `sort_order` ; amorcé depuis `service/lexiconSeed.ts`),
**`fishing_trips`** / **`fishing_catches`** / **`fishing_refs`** (v7, issue #3 : carnet de pêche —
une sortie porte N prises ; `weather` est un instantané JSON **figé à la création**, le contexte
marée n'est **pas** stocké), la colonne **`fishing_refs.label_plural`** (v8 : libellé au pluriel,
**saisi**, cf. routes ci-dessus), la colonne **`fishing_trips.baited`** (v9 : casiers boëttés ou
non, `INTEGER NOT NULL DEFAULT 0` — les sorties antérieures basculent donc à « non », décision
assumée plutôt qu'un troisième état « non renseigné » à traiter partout ; le `NOT NULL` n'est permis
que parce que le `DEFAULT` est non nul) et la colonne **`fishing_refs.default_gear_id`**
(v10 : engin par défaut d'une espèce, cf. routes ci-dessus). ⚠️ `openDb` active désormais **`PRAGMA foreign_keys = ON`** :
better-sqlite3 le laisse à `OFF`, et le `ON DELETE CASCADE` de `fishing_catches` serait resté
lettre morte. Migration
additive par palier `if (version < N)`. ⚠️ `ALTER TABLE … ADD COLUMN` **n'est pas idempotent** en
SQLite : les paliers v3, v6, v8, v9 et v10 testent d'abord `PRAGMA table_info` (robustesse à un rollback ayant
remis `user_version` en arrière puis re-migré).

**Amorçage/migration** : `initStorage()` (appelé au boot par `src/index.ts`, remplace les anciens
`ensureDataDir`/`ensureSettingsFile`) crée `DATA_DIR`, ouvre la base et l'amorce **si vide** — par
site sans données : import depuis le fichier **legacy** `DATA_DIR/<site>.json` s'il existe
(déploiements antérieurs), sinon depuis la **graine** embarquée (`dist/resources/`,
`src/resources/`) via `readTides` ; réglages : import de `settings.json` legacy s'il existe, sinon
défauts ; **utilisateurs** (si auth active) : génère le secret de session et amorce l'admin initial
(`ensureAdminUser`) si la table `users` est vide. Idempotent.

**Config** (`src/service/SettingsStore.ts`) : type `Settings` (`startMode`/`startDate`/`rangeDays`,
`navihan` en minutes (basse/pleine mer ; `aFlot` = « Remise à flot » fixe), `aFlotRefHeight` =
**hauteur Port-Tudy de flottaison au coefficient de référence 70** en m (défaut **3,02**, 0–10),
`aFlotDays`, `coefDays` = durée du graphe coef
(défaut 20, 1–90), `weatherLinks` = liens météo éditables `{ label, url }`, défauts
`DEFAULT_WEATHER_LINKS`), `DEFAULT_SETTINGS`, `sanitizeSettings` (validation/bornage — `clampFloat`
pour la hauteur, sans arrondi ; les
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

- **Routeur** (`src/router.ts`, issue #3) — l'application **cesse d'être mono-vue** : `/` = dashboard
  marées, `/peche` = carnet de pêche (chargé à la demande), toute autre URL redirige vers `/`
  (redirection **par chemin**, pas par nom). `createWebHistory` ne demande aucun changement de
  configuration : le repli SPA existait déjà côté Express (`app.get('*')`, monté **après** les
  routers `/api`) et côté PWA (`navigateFallback`).
- `components/NavTabs.vue` + `composables/useMediaQuery.ts` — **navigation entre les pages**.
  Remplace le bouton unique qui alternait entre marées et carnet : son icône montrait la
  **destination**, donc rien ne disait où l'on était ni qu'une seconde page existait. Deux onglets
  sont visibles en permanence, l'actif mis en évidence. Sous `sm` : **barre fixe en bas de
  fenêtre** (`position: fixed`, sous le pouce, et qui **libère la rangée d'actions de la navbar**,
  celle qui saturait à 320 px) ; au-delà : **groupe segmenté** dans la navbar, à la place de
  l'ancien bouton. La constante `PAGES` est la **source de vérité unique** — les deux variantes en
  dérivent par `v-for`, donc ajouter une page est une ligne et elles ne peuvent pas diverger.
  ⚠️ **Une seule variante est rendue, choisie par `matchMedia`** et non par `d-none`/`d-sm-flex` :
  **jsdom n'évalue pas les media queries CSS**, donc sous pilotage CSS les deux variantes seraient
  toujours dans le DOM du test (deux `aria-current`) et l'on ne pourrait jamais affirmer laquelle
  l'utilisateur voit. Corollaire à connaître : `window.matchMedia` est **`undefined` sous jsdom** et
  il n'y a **pas** de `setupFiles` — un test qui monte `App` sans le simuler obtient
  silencieusement le `fallback` (`true` = desktop), si bien qu'`App.test.ts` n'exerce **que** le
  groupe segmenté ; la barre du bas est couverte par `NavTabs.test.ts`, qui simule.
  ⚠️ **Pas de `router-link-active`**, alors qu'il conviendrait ici (`/` et `/peche` sont des routes
  **sœurs**, pas imbriquées, donc sans correspondance par préfixe entre elles) : la comparaison
  explicite sur `route.name` est retenue quand même, indépendante de la forme des URL et testable
  directement ; si des routes imbriquées apparaissaient un jour, `router-link-active` deviendrait
  ambigu là où cette comparaison ne changerait pas. L'actif porte `aria-current="page"` (ce sont
  des liens, pas des bascules — donc jamais `aria-pressed`).
  ⚠️ La hauteur de la barre est la variable **`--app-navtabs-h`** (`assets/app.css`) parce qu'elle a
  **deux consommateurs** : `NavTabs` pour sa hauteur, et le **pied de page** d'`App.vue` pour son
  `padding-bottom` sous `sm` — sans ce dégagement, la barre fixe masque la version et le lien
  GitHub. Le calcul ajoute `env(safe-area-inset-bottom)`, posé **par précaution** : il vaut
  toujours 0, donc sans effet, tant que le `<meta name="viewport">` de `client/index.html` ne porte
  pas `viewport-fit=cover` (absent aujourd'hui — l'ajouter changerait la mise en page de toute
  l'app, hors périmètre de la navigation par onglets). Une seule valeur, donc pas de désaccord
  possible si ce jour vient. `NavTabs.test.ts`.
  ⚠️ **Les six boutons d'administration de la navbar sont passés de `sm` à `lg`** (`App.vue`,
  `d-lg-inline-flex` / menu ⋮ `d-lg-none`) **à cause de ces onglets** : libellés, ils pèsent 179 px
  là où l'ancien bouton icône en faisait 40, et la rangée d'actions réclamait alors 755 px quelle
  que soit la fenêtre. Mesuré sur un compte admin : débordement horizontal dès 640 px (et déjà
  577-624 px avant les onglets), navbar à 162 px de haut à 768 px. Au seuil `lg` : plus aucun
  débordement de 360 à 1400 px et une navbar sur **une seule ligne (90 px) de 768 à 991 px**, soit
  mieux qu'avant. Ne pas redescendre ce seuil « par cohérence » avec le reste sans re-mesurer —
  le débordement revient à 640 px. Le prix assumé est un clic de plus (menu ⋮) pour un admin entre
  768 et 991 px. Reste connu et **non corrigé** : entre 576 et 767 px la rangée passe encore à la
  ligne (+24 px par rapport à l'état d'avant les onglets) ; masquer l'horloge sous `lg` ramènerait
  la navbar à 81 px, mais c'est retirer une fonctionnalité, pas corriger une mise en page.
  ⚠️ `useMediaQuery` **garde l'appel à `addEventListener`** (`typeof … === 'function'`) : avant
  Safari 14 / iOS 14, `MediaQueryList` n'héritait pas d'`EventTarget`, l'appel levait dans le
  `setup` et la page restait **blanche**. La garde troque cette panne totale contre la seule perte
  de réactivité au redimensionnement ; l'API dépréciée `addListener` n'est **pas** reprise.
  `useMediaQuery.test.ts` (5 tests) fige la valeur initiale, la réaction au `change`, le
  désabonnement au démontage, le repli sans `matchMedia`, et ce cas Safari.
- `src/types.ts` — miroir du contrat REST (`Extreme`, `TideOutput`, `TidesMeta`, `FlatTide`,
  `TideFilters`) ; découplage via le JSON, **pas de package partagé**.
- `src/api/tides.ts` — `getTides(from,to,site)`, `getMeta`, `getSites` (`fetch`, chemins `/api/...`)
  et le helper partagé `fetchJson`. Les statistiques ont leur propre module `src/api/stats.ts`
  (`getStats(days)`, `pingVisit()`).
- `src/lib/tides.ts` — `flatten()` (aplatit `days` en `FlatTide[]` triés), `filterTides()`
  (**plage de dates inclusive uniquement**) et `matchNavihanReference(site, reference)` (annote
  chaque marée du port sélectionné d'un `refTime` = heure Port-Tudy de même type la plus proche,
  tolérance 3 h, sinon `null`), `groupByDay(tides)` (regroupe par jour → `DayTides` : pleines/
  basses mers triées + coef du jour), `tidalRange(day)` (**marnage** du jour = plus haute pleine mer
  − plus basse basse mer, `null` s'il manque un type ; utilisé par la carte « Marnage du jour » de
  `StatCards`), `matchesDayFilters(facts, filters)` / `matchesAflotWindow(time, filters)` (filtres
  d'affichage, cf. ci-dessous) et `periodWindow(from, rangeDays, offset, min, max)` (fenêtre
  du tableau décalée de `offset` périodes, bornée) — **fonctions pures, testées**.
  ⚠️ **Les filtres de ligne portent sur le jour, jamais sur la marée** (issue #10). Le tableau
  affiche une ligne par jour : filtrer `FlatTide` par `type`/`minCoef` — ce que faisait
  `filterTides` — vidait des **cellules** au lieu de sélectionner des lignes. Les basses mers n'ayant
  **pas** de coefficient, un « Coef min » les supprimait toutes, emportant les pastilles Navihan et
  la colonne « Constaté ». `matchesDayFilters` prend donc des `DayFacts` (`coefficient` du jour,
  `weekday` lundi = 0) : bornes de coef inclusives, jour **sans** coefficient écarté dès qu'une borne
  est posée, sélection de jours neutre à 0 **comme** à 7 valeurs.
  ⚠️ **La plage horaire de remise à flot, elle, ne filtre pas de lignes** : `matchesAflotWindow`
  masque les **heures** hors plage à l'intérieur de la ligne, qui reste affichée (un jour dont aucun
  à-flot n'est retenu montre « — »). Bornes inclusives, chacune facultative ; `from > to` (22:00 →
  06:00) se lit en **union**, sinon une plage de nuit ne retiendrait jamais rien. L'heure jugée est
  celle du **décalage fixe** — estimation (↗) et « Constaté » décrivent le même à-flot et suivent
  son sort, sinon l'heure masquée dans la colonne Navihan réapparaîtrait dans « Constaté ».
- `src/lib/format.ts` — `formatDate`, `formatHeight`, `todayKey`, `addDays`, `coefBand`,
  `weekdayIndex` (jour de la semaine, **lundi = 0** comme les stats serveur),
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
- `src/composables/useTideFilters.ts` — **filtres d'affichage du tableau** (singleton, persisté en
  `localStorage` `marees-tide-filters`, issue #9→#10) : `filters` (`minCoef`/`maxCoef`, `weekdays`
  lundi = 0, `aflotFrom`/`aflotTo`), `activeCount`, `reset`. **Ouverts à tous les rôles** — ce sont
  des préférences personnelles, pas de la configuration serveur : ils ont donc quitté `SettingsPanel`
  (admin-only) pour la barre `TideFiltersBar` de l'en-tête du tableau. Lecture initiale **validée clé
  par clé** (un stockage ancien ou trafiqué retombe sur les défauts). `activeCount` compte des
  **critères** (0 à 4) et non des champs : les deux bornes de coef = 1, les cinq types Navihan = 1.
  C'est le badge du bouton. ⚠️ `activeCount` et `reset` **incluent `useNavihanDisplay`** bien qu'il
  ait sa propre clé : c'est la même nature de chose (un réglage persisté qui retire du contenu du
  tableau), et un type masqué lors d'une visite précédente doit se signaler. Corollaire pour les
  tests : `reset()` rétablit les 5 types, donc l'appeler **avant** de poser une visibilité.
- `src/composables/useTides.ts` — charge config + sites + meta + marées au montage, expose `loading/
  error/meta/settings/dateWindow/coefTides/tableTides/allTides` (+ nav période). `allTides` =
  **référence Port-Tudy** (marégramme, carte à flot). Les **lignes** (via `windowedTides`) sont les
  marées du **port sélectionné** : pour la référence, `refTime = time` ; sinon
  `matchNavihanReference(siteTides, allTides)` ; le Navihan est (re)calculé par
  `computeNavihan(refTime, …)`, « — » si `refTime` null. `watch(siteId)` recharge à la bascule.
  `windowedTides` ne pose plus que la **fenêtre de dates** : les filtres d'affichage sont passés au
  grain du jour et ne concernent que le tableau (`useTideFilters`, issue #10), donc le graphe des
  coefficients garde sa **série complète**. La fenêtre configurée dérive de
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
  **modèle de seuil de hauteur** — instant où la courbe montante **Port-Tudy** (interpolation
  cosinus) atteint le seuil du jour, `aflotThresholdFor(coef de la pleine mer suivante, refHeight)`
  = `refHeight + AFLOT_COEF_SLOPE × (coef − 70)` ; le délai après la basse mer **varie donc avec le
  coefficient** (spec `2026-07-24-navihan-coefficient-design.md`, **recalibré** par
  `2026-09-14-etalonnage-aflot-observations-design.md`) ;
  **« Constaté »** (`aflotObserved`) = heure **réellement saisie** (persistée serveur, cf. table
  `aflot_observations`). **Périmètre de l'estimation** : elle n'apparaît **que** dans le tableau du
  dashboard (pastille ↗ « Estimation »). Partout ailleurs — cartes « Prochaine(s) remise(s) à
  flot », marqueurs du **marégramme**, rappel de la colonne **Constaté** — c'est l'heure
  **« Remise à flot »** (décalage **fixe** `aFlot`) qui est utilisée.
  ⚠️ **Le seuil est une hauteur Port-Tudy, pas une cote à Navihan** : c'est un proxy empirique qui
  **absorbe** la propagation Port-Tudy → Navihan. Ne **jamais** réintroduire `basseMer`/`pleineMer`
  dans le segment montant de `aflotTimeByThreshold` — c'était l'erreur d'origine (le seuil 2,8 m
  ayant été rétro-calibré sur la courbe Port-Tudy, la propagation y était déjà comprise et la
  construire sur la courbe décalée l'ajoutait une seconde fois : **+59 min sur les 18 heures
  constatées, sans exception**). Abaisser le seuil pour compenser — ce qui avait été fait en prod
  (2,05 m) — annule le biais moyen mais déplace le croisement vers le début de la montante, là où la
  courbe est plate : la dispersion explose (MAE 27,7 min, max 80). Corollaire utile : l'estimation ne
  dépend **plus** des décalages Navihan, les retoucher ne la déforme donc pas. Fonctions pures
  testées : `inverseCosineRising`/`cosineHeightAt`/`navihanAflotFixed` (`lib/maregram.ts`),
  `aflotTimeByThreshold` (estimation, tableau) / `aflotEvents`/`nextAflot`/`aflotAgenda`
  (décalage fixe, cartes) / `shiftTime` (→ `HH:MM`) et `shiftMoment` (→ `{ date, time }`, à
  utiliser dès qu'une heure Navihan est **datée**, car les décalages franchissent minuit)
  (`lib/navihan.ts`) — toujours
  sur les hauteurs / basses mers **Port-Tudy** (`allTides`, `refDate`/`refTime`), même pour un port
  secondaire. `src/composables/useAflotObservations.ts` (singleton : map `date+heure Port-Tudy →
  constaté`, `load`/`get`/`save`/`remove` via `api/aflotObservations.ts`) alimente `aflotObserved` et
  la saisie du tableau. `lib/navihan.test.ts`.
- `src/lib/aflotCalibration.ts` + `useTides.aflotCalibration` — **étalonnage du modèle sur les
  heures constatées** (`calibrateAflot(ptTides, observations, fallbackRefHeight, minSamples = 4)` →
  `{ refHeight, samples, mae, calibrated }`, pur et testé). Le modèle a deux paramètres ; **seul le
  niveau est étalonné**. La **pente** `AFLOT_COEF_SLOPE` (0,0037 m/point) reste figée dans
  `lib/navihan.ts` : elle corrige un écart du **modèle de courbe** (la hauteur implicite de
  flottaison croît avec le coefficient, corrélation 0,72 — l'interpolation cosinus s'écarte d'autant
  plus de la vraie courbe que l'amplitude est grande), ce n'est **pas** une propriété du mouillage.
  ⚠️ Ne pas « améliorer » en étalonnant aussi la pente : sur les 18 relevés, n'étalonner que le
  niveau fait **mieux** (5,2 min contre 5,6 en validation leave-one-out) — un paramètre libre suffit
  et il est plus stable. ⚠️ **Médiane, pas moyenne** : une saisie fausse de 30 min ne déplace alors
  le niveau que de 0,017 m. Sous **4** relevés exploitables (`MIN_AFLOT_SAMPLES`), repli sur le
  réglage `aFlotRefHeight` (défaut 3,02 m, lui-même issu des 18 relevés — une base neuve démarre
  donc déjà juste) ; l'étalonnage converge dès 4 relevés et ne bouge plus après 8. Sont écartés :
  basse mer introuvable, hauteur manquante, pas de pleine mer suivante, heure constatée hors de la
  montante. Une heure constatée « avant » sa basse mer est reportée au **lendemain** (franchissement
  de minuit). Résultat sur les 18 relevés : **MAE 4,9 min, max 17** — contre 9,7 pour le décalage
  fixe. `lib/aflotCalibration.test.ts` porte la **fixture des 18 relevés réels** et asserte
  MAE < 6 min / max < 20 : c'est le garde-fou du modèle, un test figeant des valeurs calculées ne
  dirait rien de sa justesse.
- `components/SettingsPanel.vue` — **un seul panneau repliable « Réglages »** (prop `meta`)
  regroupant 3 sections, **toutes de la configuration serveur** : **Période** (`startMode`
  `today`/`date` + `startDate` + `rangeDays` + `coefDays`), **Décalages Navihan** (basse/pleine
  mer en minutes + **hauteur de flottaison de référence** `aFlotRefHeight` en m, suivie de l'état
  d'étalonnage (« Étalonné sur N heures constatées… » / « Moins de 4 relevés ») + `aFlotDays`,
  bouton défauts ; la calibration arrive en **prop** depuis le `Dashboard`, `useTides` n'étant pas
  un singleton),
  **Liens météo** (liste éditable `settings.weatherLinks` — libellé + URL, ajout/suppression, bouton
  défauts). Remplace les anciens `TideFilters.vue` / `NavihanSettings.vue`. **Bouton + panneau masqués
  si le rôle n'est pas `admin`** (`useAuth().isAdmin`) : on ne montre pas des réglages non modifiables.
  ⚠️ La 4ᵉ section « Filtres d'affichage » **en est sortie** (issue #10) : elle était de fait
  inaccessible aux lecteurs, alors qu'un filtre d'affichage est une préférence personnelle. Ne pas
  l'y remettre — sa place est `TideFiltersBar`.
- `components/TideFiltersBar.vue` — **barre de filtres du tableau** (issue #10), rendue entre
  l'en-tête de la carte « Horaires par jour » et le tableau, **ouverte à tous les rôles**, adossée au
  singleton `useTideFilters` (ni prop ni emit) : bornes de **coefficient** (bornées **en JS**, les
  attributs HTML `min`/`max` n'empêchent pas de taper 999), 7 pastilles **L M M J V S D** sur le
  patron des chips Navihan (`aria-pressed`, `aria-label` = le jour en toutes lettres, sinon un
  bouton « S » n'a pas de nom accessible), une **plage horaire de remise à flot** et les **5 bascules
  de types Navihan** (`useNavihanDisplay`), venues de la légende du tableau. **Trois natures
  de filtre** : coefficient et jours **sélectionnent des lignes** ; la plage horaire **masque des
  heures** dans les lignes conservées ; les types Navihan masquent des **pastilles** (et, pour
  `flotObs`, la colonne « Constaté » entière). Modèle
  « chips » : **aucun jour sélectionné = tous les jours**, donc désélectionner le dernier ne vide
  jamais le tableau. Le bouton bascule vit dans l'en-tête de carte (`Dashboard.vue`, repli
  **éphémère**) et passe en `btn-primary` avec le badge `activeCount` dès qu'un filtre est posé :
  les filtres étant **persistés**, l'état doit rester lisible barre repliée. `TideFiltersBar.test.ts`.
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
  journée. Comme cette carte est la plus haute de la rangée, elle **imposerait** sa hauteur : son budget est
  de **3 lignes de jours + la ligne du bouton** « Voir l'agenda complet » (celui-ci étant désormais
  toujours rendu, la carte est au repos un peu plus haute qu'au temps du dépliement — rien ne
  déborde pour autant), tenu non par un plafond dans le composant mais par
  la **borne du réglage** `aFlotDays` ∈ [1, 3] — `sanitizeSettings` bornant à la **lecture** comme à
  l'écriture, une base antérieure qui stocke 7 ou 14 est servie bornée, sans migration. L'agenda
  complet vit dans **`AflotAgendaPanel`** (cf. ci-dessous), ouvert par un bouton **toujours présent**
  de la carte : le panneau est une destination stable, son accès ne doit pas dépendre d'un réglage.
  ⚠️ Ne pas réintroduire le dépliement « + N autres jours » qu'il remplace : déplier étirait toute
  la rangée, c'est-à-dire exactement ce que le budget cherchait à éviter.
  `StatCards.test.ts`. Le **marnage du jour** de cette carte vient de `tidalRange` (`lib/tides.ts`).
- `components/AflotAgendaPanel.vue` — **panneau « Remises à flot »** (offcanvas `offcanvas-end`,
  monté par `Dashboard.vue` en frère de `StatCards`) : agenda des remises à flot sur **toute la
  plage disponible** (aujourd'hui → fin des horaires), un bloc par jour, chaque créneau portant
  l'heure « Remise à flot » (décalage **fixe**, jamais l'estimation par seuil), le **coefficient de
  la pleine mer suivante** (`AflotTime.coefficient` — une basse mer n'en porte pas, et le coef « du
  jour » serait faux pour un à-flot rangé au lendemain) et la **basse mer Navihan** dont il découle,
  datée de son propre jour et **écrite seulement** quand elle diffère. ⚠️ **Ouvert à tous les
  rôles**, contrairement aux six autres offcanvas, tous admin-only : lire un agenda de marées n'est
  pas de l'administration. L'instant courant vient du singleton **`composables/useNow.ts`** (cf.
  ci-dessous) et le panneau le rafraîchit **en plus** sur `show.bs.offcanvas`. ⚠️ Le test doit
  monter le composant **`attachTo: document.body`** : détaché, `getElementById` ne trouve pas
  l'offcanvas et l'écouteur n'est jamais posé — le mécanisme resterait non exercé.
  `aflotAgenda` appelée **sans `days`** rend toute la plage. ⚠️ La **date longue** d'un bloc de jour
  est capitalisée **en JS** (seule l'initiale), comme dans `EphemerideCard` et `FishingTripCard` :
  `text-capitalize` donnerait « Dimanche 26 Juillet », or les mois s'écrivent en minuscules en
  français, et `text-transform` s'héritant, il débordait aussi sur le repère « · Aujourd'hui ». Le
  quantième est en `numeric` (« 01 septembre » ne s'écrit pas en prose). La date **courte** de la
  basse mer, elle, garde `text-capitalize` — c'est l'usage du projet (`StatCards`, `HeightChart`).
  Tout l'affichage est préparé dans le `computed` (le template n'appelle aucune fonction). `.aflot-past` a quitté le `scoped` de `StatCards` pour
  `assets/app.css`, deux composants la rendant désormais. `AflotAgendaPanel.test.ts`.
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
  **visites par utilisateur** (chaque ligne se **déplie** sur *ses* heures, *ses* jours et *ses*
  dernières visites — repli **éphémère**, plusieurs comptes ouvrables à la fois pour comparer deux
  rythmes ; bouton `btn btn-link` + chevron, aucun JS Bootstrap), puis pays/navigateurs/appareils. Chargements de
  coquille et connexions sont relégués en ligne secondaire : ce sont des diagnostics, pas le chiffre
  de tête. Charge `getStats(days)` (`api/stats.ts`) à l'ouverture et à chaque changement de période.
  Le bouton (navbar, `App.vue`) et le panneau ne sont montés que si `useAuth().isAdmin` ; le verrou
  réel est côté serveur (`/api/stats` → 403 hors rôle admin). `StatsPanel.test.ts`. `SettingsPanel`
  affiche un avertissement (`useSettings.saveError`) quand un enregistrement est refusé.
- `components/MiniBars.vue` — **mini-répartition** (barres CSS, `values`/`labels`/`ticks`/`caption`),
  utilisée pour les heures et les jours d'un compte déplié. **Pas un Chart.js à dessein** : ces strips
  sont rendus une fois par utilisateur ouvert, et un graphe complet pour 7 ou 24 valeurs coûterait
  plus qu'il n'apporte. Série unique → **une seule teinte et pas de légende** (`#0d6efd`, contraste
  validé sur les deux surfaces ; les `#0dcaf0`/`#20c997` des grands graphes tombent sous 3:1 et sont
  trop faibles pour des micro-barres). Piste `var(--bs-tertiary-bg)` : une case vide reste une case.
  Plancher de hauteur à 6 % pour qu'un 1 face à un 100 reste visible. Détail chiffré en infobulle
  native (`title`), donc sans JS. `MiniBars.test.ts`.
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
- **Carnet de pêche** (`views/FishingView.vue`, `components/FishingTrip{Card,Form}.vue`,
  `components/FishingRefsPanel.vue`, `composables/useFishing.ts` + `useFishingRefs.ts`,
  `lib/fishing.ts`, issue #3) — liste antichronologique des sorties, formulaire **inline** (pas une
  modale : N lignes de prises y seraient inutilisables sur téléphone), panneau admin des espèces et
  des engins (bouton navbar admin-only — **icône poisson** `components/IconFish.vue`, un SVG inline
  faute de glyphe bootstrap ; le seau reste au lien de navigation vers le carnet). Le panneau permet
  de **réordonner** chaque section par des **flèches ↑/↓** — et non par glisser-déposer : le DnD
  natif HTML5 ne réagit pas au doigt, or c'est une PWA de téléphone, et le rendre tactile coûterait
  une dépendance pour un geste qu'on fait une fois. Lecture ouverte à tout compte
  connecté, écriture réservée à `admin`.
  ⚠️ **Choix asymétrique assumé : la marée se recalcule, la météo se fige.** `tripTideContext`
  dérive coefficient, basses mers et remises à flot **de la date**, sans rien stocker — ce projet a
  déjà repris 11 journées de graine depuis l'annuaire officiel, et une correction doit profiter aux
  sorties déjà saisies. La météo, elle, n'est pas reproductible : elle est figée à la création.
  `aflotChoices` **s'appuie sur `aflotEvents`** (`lib/navihan.ts`) au lieu de refaire le calcul —
  deux formules d'à-flot finiraient par diverger ; l'heure retenue est celle **« Constaté »** si
  elle existe, sinon le **décalage fixe**, **jamais** l'estimation par seuil (cantonnée au tableau
  du dashboard) ; et un à-flot est daté du **jour où il a lieu**. `nearestAflot` retient le plus
  proche **passé ou à venir** : on note souvent ses prises en rentrant. Le sélecteur d'à-flot
  **réécrit** date et heure de début ; l'heure de fin n'est **jamais** pré-remplie. Rien de ce
  pré-remplissage n'est persisté.
  `summarizeCatches` rend « Bredouille » plutôt qu'une chaîne vide : une sortie sans prise est une
  donnée, pas une absence de donnée. Il emploie le **`labelPlural` du référentiel** et ne calcule
  aucun pluriel (cf. routes serveur) ; un id disparu du référentiel s'affiche **brut**, jusque dans
  les quantités (« 3 licorne ») plutôt que de se voir inventer une marque.
  ⚠️ **« Casiers boëttés »** (`baited`, v9) : case à cocher **toujours visible** du formulaire (sous
  les notes), et sur la carte une ligne `.trip-baited` **indépendante** de `.trip-gears`, rendue
  **seulement si vrai**. Trois pièges à ne pas « corriger » : la case ne doit **pas** se masquer
  faute de casier (`fishing_refs` ne sait pas ce qu'est un casier, et le deviner sur le libellé est
  déjà interdit pour les pluriels) ; la ligne de la carte ne doit **pas** rejoindre `.trip-gears`,
  dont le `v-if` la mangerait sur une sortie **bredouille au casier**, le cas le plus intéressant ;
  et le « non » ne s'affiche **pas** (il serait absurde sur une sortie à la ligne, et toutes les
  sorties antérieures à la v9 le portent sans qu'on l'ait saisi).
  **Engin par défaut** : choisir une espèce dans le formulaire sélectionne son `defaultGearId`
  (`lib/fishing.defaultGearFor`, qui rend `null` si l'engin n'est pas dans la liste) ; une espèce
  sans défaut laisse l'engin tel quel, et un engin changé à la main tient jusqu'au prochain
  changement d'espèce. ⚠️ Branché sur **`@change`**, pas sur un `watch` de `speciesId` : un `watch`
  partirait aussi à l'ouverture d'une sortie existante et réécrirait l'engin saisi. Une prise
  ajoutée démarre sur l'engin par défaut de la première espèce.
  La vue charge les marées **Port-Tudy** sur une plage couvrant les sorties **et** la fenêtre de
  pré-remplissage (± 7 j) ; horaires indisponibles, les cartes disent « marée inconnue » au lieu de
  faire échouer la page.
- **Bilan de pêche** (`components/FishingStatsPanel.vue`, `lib/fishingStats.ts`) — panneau
  (offcanvas) ouvert par le bouton « Bilan » de l'en-tête du carnet, **ouvert à tous les rôles**
  comme `AflotAgendaPanel` : lire un bilan de ses propres sorties n'est pas de l'administration.
  **Sans état** — `{ trips, refs, tides }` en props, tout en `computed` : `useFishing` a déjà chargé
  **toutes** les sorties et la vue les marées Port-Tudy, donc ni chargement ni écouteur
  `show.bs.offcanvas` (ce qui le distingue de `StatsPanel`, qui doit interroger `/api/stats`).
  ⚠️ **« Prises » et « individus » sont deux chiffres distincts, et aucune comparaison ne porte sur
  un total toutes espèces mêlées** : 19 prises saisies font 118 individus dont 96 crevettes, donc
  une moyenne « prises par sortie » serait en réalité un compteur de crevettes, et le croisement
  « boëtté ou non » ne mesurerait plus que le casier à crevettes. Les six croisements
  (`buildDimensions` : boëtte, bande de coefficient via `coefBand`, mois, vent `beaufort`,
  température de l'eau, ciel WMO) rendent donc des moyennes **par espèce**, en colonnes — les
  **3 premières** du classement, au-delà la table devient illisible. Chaque ligne porte son
  effectif `n` et le bloc s'ouvre sur un avertissement : à 11 sorties rien n'est prouvé, et
  **aucun test de significativité n'est calculé**, qui donnerait une autorité que ces effectifs
  n'ont pas. Une sortie que la dimension ne sait pas classer (`weather` `null` — la capture est
  best-effort — ou jour hors des horaires connus) est comptée et **écrite sous la table**, jamais
  escamotée. ⚠️ Le classement prend le pluriel dans le **référentiel** et un id disparu s'affiche
  brut, comme `summarizeCatches` ; `dayCoefficient` a été **exportée** de `lib/fishing.ts` plutôt
  que réécrite. Pas de Chart.js : quelques barres horizontales en CSS ne le justifient pas (même
  arbitrage que `MiniBars`). Spec :
  `docs/superpowers/specs/2026-09-16-statistiques-carnet-peche-design.md`.
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
- `src/composables/useNow.ts` — **instant courant partagé** (singleton) : `now` (ref) et
  `refresh()`. La carte « Prochaine(s) remise(s) à flot » et `AflotAgendaPanel` décrivent **les
  mêmes heures** — deux instants distincts se contrediraient, et poser un écouteur par composant
  pour une notion unique serait absurde. Rafraîchi au **retour au premier plan**
  (`visibilitychange`, comme `useVisitPing`), l'app restant volontiers ouverte des heures : figée
  sur l'instant du montage, la carte annonçait comme prochaine une remise à flot dépassée depuis
  le matin. Pas d'intervalle : un agenda ne change qu'aux heures. `resetNowForTests()` réaligne le
  singleton entre les tests (sur le modèle de `resetWeatherForTests`) — les fixtures de `StatCards`
  et d'`AflotAgendaPanel` l'appellent au montage, sans quoi un `setSystemTime` posé dans le corps
  d'un cas n'atteindrait pas le composant. ⚠️ À ne pas confondre avec `useClock` (horloge de la
  navbar, **par composant**, `setInterval` d'une seconde). `useNow.test.ts`.
- `src/composables/useTheme.ts` — thème clair/sombre (singleton). Applique `data-bs-theme`
  (mode couleur natif Bootstrap 5.3) sur `<html>`, persiste dans `localStorage`, défaut =
  préférence système. Bascule via le bouton de la navbar ; les graphiques Chart.js lisent
  `isDark` pour adapter ticks/grilles.
- `src/views/Dashboard.vue` — assemble `SettingsPanel` + `StatCards` + `HeightChart`/`CoefChart`
  + `TideFiltersBar`/`TideDayTable` ; états loading (spinner) / error (alert).
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
  Colonnes = **Jour · Pleines mers · Basses mers · Navihan · Constaté**. Chaque cellule
  Pleines/Basses mers liste les marées du **port sélectionné** en `HH:MM · 🌊 h,hh m` (heure +
  hauteur d'eau inline, icône `bi-water` + légende) ; **chaque pleine mer porte en plus sa propre
  pastille de coefficient**, colorée selon **sa** bande (`coefBand`), absente → rien, jamais une
  pastille vide ; une basse mer n'en a pas. Les bandes sont préparées dans le `computed` `rows`
  (`highBands`, une par ligne) — le template n'appelle jamais `coefBand()` lui-même.
  ⚠️ **Il y avait une colonne « Coef »** portant la pastille du **max du jour** ; elle a été
  **retirée**. Elle écrivait ce maximum une seconde fois par ligne, et il fallait **deux** endroits
  pour dire que c'en était un : un qualificatif dans le `<th>` — invisible sur téléphone, `app.css`
  masquant le `thead` sous 768 px — **et** une ligne de légende pour rattraper cela. Ne pas la
  réintroduire sans revoir ces deux points.
  ⚠️ **`day.coefficient` (le max du jour) est toujours calculé** par `groupByDay` et sert
  **uniquement** au filtre « Coef min/max » (`matchesDayFilters`) : il n'est plus affiché nulle
  part. Conséquence à connaître : à `minCoef = 70`, une ligne retenue peut montrer une pastille
  **69** — le filtre est au grain du **jour** (issue #10), c'est **correct** et plus rien ne
  l'explique à l'écran.
  ⚠️ **14 % des jours** (16 % à Étel) ont leurs deux coefficients dans des **bandes différentes**,
  presque toujours à **un point d'écart** (70/69, 94/95) : deux couleurs franches y signalent donc
  une différence minime. C'est le coût assumé de la couleur par marée.
  Les 2 marées d'une cellule sont disposées en **grille `1fr 1fr`** (`.tide-values`) et non en
  `inline-flex` : les `<td>` d'une colonne ayant tous la même largeur, les 2ᵉˢ marées tombent au
  même endroit sur **toutes** les lignes. ⚠️ Ne pas repasser en `flex-wrap`, où la 2ᵉ marée se
  décalait selon la largeur de la 1ʳᵉ et où l'empilement dépendait de la place restante, donc du
  nombre de colonnes. Une seule fraction sous 768 px (2 marées ne tiennent pas à 360 px).
  ⚠️ Le test de légende cible le bloc `div.small.text-muted.px-3.pt-2` — **pile d'utilitaires
  Bootstrap à ne pas imiter**, elle casse à la première retouche de marge ; préférer un crochet de
  classe stable, patron de `.navihan-legend`. La colonne **Navihan** (dérivée Port-Tudy) affiche des **pastilles triées par
  heure**, une par **type affichable** (`useNavihanDisplay`, 5 types masquables **depuis
  `TideFiltersBar`**, persistés localStorage) : basse mer (↓), **Remise à flot** fixe (✓ vert),
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
  `table-responsive` (défilement horizontal mobile). Il rend la période
  qu'on lui passe (`tableTides`) ; la **navigation Précédent/Suivant/Début** (par période, cf.
  `useTides`) est dans l'en-tête de carte du `Dashboard`. Remplace l'ancien `TideTable`
  (une-ligne-par-marée, retiré).
  La **légende** « Navihan (dérivé de Port-Tudy) : » du tableau est **statique** depuis l'issue #10
  (des `<span>`, plus des `<button>`) : elle est la clé de lecture des pastilles et doit rester
  visible sans rien déplier, tandis que les bascules vivent dans `TideFiltersBar`. Un type masqué
  s'y affiche **atténué et barré** (`.navihan-toggle--off`), pour que l'état reste lisible barre
  repliée. La palette des pastilles et le style des chips sont **globaux**
  (`assets/app.css`, pas de `scoped`) : deux composants les rendent désormais, les dupliquer dans
  deux blocs scopés les ferait diverger.
  Les **filtres d'affichage** (`useTideFilters`, issue #10) s'appliquent ici. Coefficient et jours
  filtrent `allRows` — donc **après** `groupByDay` et **jamais** sur `props.tides` :
  `navihanByDate`/`constateByDate` se construisent sur la liste plate complète, ce qui garde les
  heures d'un jour masqué (ou du jour d'amorce) qui franchissent minuit sur le jour visible suivant.
  Un pied de tableau (`.hidden-days-row`) annonce « N jour(s) masqué(s) par les filtres ·
  Réinitialiser » : les filtres sont **persistés**, un tableau tronqué sans explication au retour
  serait incompréhensible. La **plage horaire** agit au contraire **dans** `navihanByDate` et
  `constateByDate` (`matchesAflotWindow` sur l'heure du décalage fixe) : elle retire la pastille ✓,
  son estimation ↗ et sa ligne « Constaté », et **ne masque aucun jour** — le pied ne la compte donc
  pas.

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
- `client/src/lib/navihan.ts`, `client/src/lib/aflotCalibration.ts` — heures Navihan, estimation par
  seuil et étalonnage sur les heures constatées.
- `client/src/views/Dashboard.vue` + `client/src/components/*.vue` — dashboard.
- `client/src/components/AflotAgendaPanel.vue` — panneau latéral d'agenda des remises à flot.
- `client/src/composables/useNow.ts` — instant courant partagé (carte et panneau).
- `client/src/router.ts`, `client/src/views/FishingView.vue`, `client/src/lib/fishing.ts` — carnet
  de pêche.
- `client/src/lib/fishingStats.ts`, `client/src/components/FishingStatsPanel.vue` — bilan du
  carnet de pêche (agrégats purs, panneau latéral).
- `client/src/components/NavTabs.vue`, `client/src/composables/useMediaQuery.ts` — navigation
  par onglets (barre du bas sur mobile, segment dans la navbar au-delà de `sm`).
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
