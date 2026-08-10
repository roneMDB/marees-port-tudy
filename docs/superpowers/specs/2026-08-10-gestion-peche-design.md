# Carnet de pêche : collecte des sorties (issue #3)

**Date** : 2026-08-10
**Issue** : #3 — « Ajout de la gestion de la pêche »

## Besoin

Collecter les données de pêche **par sortie**. L'usage décrit dans l'issue : en routine 2 casiers à
crabes et 2 casiers à crevettes, et de temps en temps de la pêche à la ligne (bar, dorade, vieille,
lieu…). Les graphiques sont explicitement annoncés comme une **évolution future** : le présent
chantier ne fait que la collecte — mais il doit produire une donnée dont on pourra tirer ces
graphiques **sans ressaisir l'historique**.

Exigence ajoutée en cours de conception : une sortie découle en général d'une **remise à flot**, et
la saisie doit partir de sa date et de son heure.

## Décisions

| Sujet | Décision |
|---|---|
| Grain de la donnée | Une sortie contient **N lignes de prises** (espèce, engin, quantité, taille/poids optionnels, gardé/relâché) |
| Situation dans le temps | Date + heures de début/fin optionnelles ; contexte marée **dérivé** de la date |
| Emplacement | **Vue plein écran** `/peche` via `vue-router` (l'app n'avait pas de routeur) |
| Rôles | Carnet **commun** ; lecture ouverte à tout compte connecté, écriture réservée à `admin` |
| Référentiels | Espèces et engins **éditables en base**, amorcés + « Rétablir les défauts » (patron `lexicon`) |
| Stockage | **Relationnel** : `fishing_trips` + `fishing_catches` |
| Champs de sortie retenus | Notes libres, météo capturée automatiquement |
| Remise à flot | **Pré-remplissage seul** de date et heure de début — aucun ancrage stocké |

Champs **écartés** : lieu de pêche, photos, carnet par utilisateur, export.

## Modèle de données (migration v7)

```sql
CREATE TABLE fishing_trips (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,              -- YYYY-MM-DD
  start_time TEXT,                       -- HH:MM, nullable
  end_time   TEXT,                       -- HH:MM, nullable
  notes      TEXT,
  weather    TEXT,                       -- instantané JSON figé, nullable
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_fishing_trips_date ON fishing_trips(date);

CREATE TABLE fishing_catches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id    INTEGER NOT NULL REFERENCES fishing_trips(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  gear_id    TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  size_cm    REAL,                       -- optionnel
  weight_g   INTEGER,                    -- optionnel
  kept       INTEGER NOT NULL DEFAULT 1, -- 1 gardé, 0 relâché
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_fishing_catches_trip ON fishing_catches(trip_id);

CREATE TABLE fishing_refs (
  id         TEXT PRIMARY KEY,           -- slug, comme les ids du lexique
  kind       TEXT NOT NULL,              -- 'species' | 'gear'
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### Trois points de vigilance

**`PRAGMA foreign_keys` est à `OFF` par défaut dans better-sqlite3.** Un `ON DELETE CASCADE` écrit
naïvement ne s'appliquerait donc **jamais**, et les prises d'une sortie supprimée resteraient
orphelines — une anomalie qui ne se voit qu'au bout de plusieurs mois. Le pragma est activé dans
`openDb` (aucune autre clé étrangère n'existe dans le schéma : aucun risque de régression) **et** les
prises sont supprimées explicitement dans la transaction. Les deux, à dessein.

**Pas de clé étrangère de `fishing_catches` vers `fishing_refs`.** Supprimer une espèce encore
utilisée renvoie **409**, sur le modèle de la garde « dernier admin ». Une sortie de 2026 ne doit pas
perdre son espèce parce qu'on a nettoyé le référentiel deux ans plus tard.

**`PUT /trips/:id` remplace la sortie et toutes ses prises en une seule transaction.** Une API de
prises ligne à ligne n'apporterait rien : une sortie s'édite comme un formulaire, d'un bloc.

### Amorçage

`service/fishingSeed.ts` + `seedFishingRefsIfEmpty` dans `bootstrap.ts` (calque de
`seedLexiconIfEmpty`) :

- **engins** : casier à crabes, casier à crevettes, ligne ;
- **espèces** : tourteau, étrille, araignée, crevette bouquet, crevette grise, bar, dorade grise,
  dorade royale, vieille, lieu jaune, maquereau.

## API (`server/src/routes/fishing.ts`, montée sous `/api`)

| Route | Rôle | Réponses |
|---|---|---|
| `GET /fishing/trips?from&to` | lecture ouverte | sorties + prises, plage **inclusive**, `400` si dates invalides |
| `POST /fishing/trips` | **admin** | `201` → sortie créée ; `403` / `400` |
| `PUT /fishing/trips/:id` | **admin** | `200` ; `404` si absente |
| `DELETE /fishing/trips/:id` | **admin** | `204` ; `404` |
| `GET /fishing/refs` | lecture ouverte | liste ordonnée par `kind` puis `sort_order` |
| `POST` / `PUT` / `DELETE /fishing/refs[/:id]` | **admin** | `409` si suppression d'un référentiel utilisé |
| `POST /fishing/refs/reset` | **admin** | rétablit les défauts |

Mêmes conventions d'autorisation que `aflot-observations` et `lexicon` (`requestRole(req) ===
'admin'`, sinon `403`).

**Validation** (`sanitizeTrip`, `400` sinon) : `date` au format `YYYY-MM-DD` ; `start_time` /
`end_time` en `HH:MM` ou absents ; `notes` ≤ 1000 caractères ; au plus 50 lignes de prises ;
`quantity` entier de 1 à 9999 ; `size_cm` de 0 à 300 ; `weight_g` de 0 à 100000 ; `species_id` et
`gear_id` **existants dans `fishing_refs`** avec le bon `kind`.

### Météo figée — à la création seulement

Le `POST` capture la météo, le `PUT` **jamais** : sans cette règle, corriger une note en janvier
écraserait la météo de juillet par un « — ». Le serveur réutilise `service/weather.ts` (`fetchImpl`
injectable, donc testable sans réseau) et stocke `{ tempMin, tempMax, windMax, windDir, weatherCode,
seaTemperature }`. **Un échec réseau ne fait jamais échouer l'enregistrement** : la sortie est la
donnée, la météo un agrément.

La fenêtre exploitable est celle d'Open-Meteo : **`past_days` jusqu'à 92 jours** en arrière et
7 jours de prévision. Hors de cet intervalle, `weather` reste `null`. `fetchWeather` ne prend
aujourd'hui aucune date — il faudra lui passer le paramètre `past_days` pour une sortie antérieure à
aujourd'hui, sans quoi une saisie rétroactive enregistrerait la météo du jour de la saisie, ce qui
serait pire que rien.

## Client

### Routeur

`vue-router` en `createWebHistory` : `/` = dashboard marées, `/peche` = carnet. Deux conséquences,
sans lesquelles un rechargement direct sur `/peche` renvoie une 404 :

- **Express sert `index.html` en repli** pour toute navigation hors `/api`. Le repli est monté
  **après** les routers `/api`, pour qu'une route d'API inconnue continue de renvoyer un 404 JSON et
  non la coquille HTML.
- Côté PWA, `navigateFallback: index.html` couvre déjà le cas hors-ligne — rien à changer.

Le lien **« Pêche »** (`bi-bucket`) rejoint la navbar, **visible de tous** puisque la lecture est
ouverte ; c'est le bouton « Nouvelle sortie » qui est réservé à `admin`.

### Écran

Liste **antichronologique** des sorties, une carte par sortie : date (`relativeDayLabel`), créneau
horaire, contexte marée du jour, résumé des prises (« 12 crevettes bouquet · 3 tourteaux · 1 bar
42 cm »), notes, météo figée. Actions **Modifier** / **Supprimer** en `admin`. États *chargement*,
*erreur* et *liste vide*.

**Pas de barre de filtres au départ** : quelques dizaines de sorties par an ne la justifient pas ;
elle viendra avec les graphiques si le besoin se confirme.

**Le formulaire est une carte dépliée en haut de page, pas une modale** : une sortie, c'est N lignes
de prises à ajouter et retirer, et une modale à quatre champs par ligne est inutilisable sur
téléphone.

### Découpage

| Fichier | Rôle |
|---|---|
| `views/FishingView.vue` | assemblage, états chargement / erreur / liste vide |
| `components/FishingTripForm.vue` | saisie d'une sortie (émet `save` / `cancel`) |
| `components/FishingTripCard.vue` | une sortie en lecture |
| `components/FishingRefsPanel.vue` | offcanvas admin des référentiels (deux sections), calque de `LexiconPanel` |
| `composables/useFishing.ts` | singleton : `trips`, `refs`, `load` / `save` / `remove` |
| `api/fishing.ts` | appels REST sur `fetchJson` |
| `lib/fishing.ts` | fonctions **pures testées** : `summarizeCatches`, `tripTideContext`, `nearestAflot` |

### La marée se recalcule, la météo se fige

Choix asymétrique et délibéré. Le contexte marée d'une sortie (coefficient, basses mers, remise à
flot) est **dérivé de la date à l'affichage**, jamais stocké : ce projet a déjà repris **11 journées
de graine** depuis l'annuaire officiel, et une correction future doit bénéficier aux sorties passées
— ce qu'une valeur gelée en base interdirait. La météo, elle, est une **observation non
reproductible** : elle est figée à l'enregistrement. Un jour non couvert par les horaires affiche
« — », sans jamais bloquer la saisie.

### Pré-remplissage depuis la remise à flot

`nearestAflot(now, tides, settings, observations)` (`lib/fishing.ts`, pure) renvoie l'à-flot **le
plus proche de maintenant** — passé ou à venir — sous la forme `{ date, time, source: 'observed' |
'fixed' }`. Elle est **bâtie sur `aflotEvents` et `shiftMoment`** (`lib/navihan.ts`, déjà testées) :
aucun nouveau calcul d'heure n'est introduit, sans quoi deux formules d'à-flot cohabiteraient et
finiraient par diverger.

Deux règles héritées du projet :

- l'heure retenue est celle **« Constaté »** si elle a été saisie pour cette basse mer, sinon celle
  de **« Remise à flot »** (décalage fixe) — **jamais** l'estimation par seuil, cantonnée au tableau
  du dashboard ;
- l'à-flot est daté du **jour où il a réellement lieu**, pas de celui de sa basse mer (~14 % d'entre
  eux tombent après minuit).

Le formulaire s'ouvre sur cet à-flot et propose un `<select>` des à-flots de **J−7 à J+7**, libellés
« mer. 12 août · 19:42 · coef 84 ». Changer la sélection **réécrit** date et heure de début — c'est
sa raison d'être ; taper directement dans les champs reste libre et ne touche pas au sélecteur.
**L'heure de fin n'est pas pré-remplie** : personne ne sait à quelle heure la sortie se terminera.

`useFishing` charge donc, en plus des sorties, les marées Port-Tudy couvrant l'historique **et** la
fenêtre ±7 jours, ainsi que les heures constatées (`useAflotObservations`).

Rien de tout cela n'est persisté : le pré-remplissage est une commodité de saisie, pas un lien de
données.

## Tests

**Serveur**

- `db/fishingRepository.test.ts` — CRUD, transaction de remplacement des prises, suppression en
  cascade effective, garde `409` sur référentiel utilisé.
- `routes/fishing.test.ts` (supertest) — lecture ouverte, `403` hors `admin` sur chaque écriture,
  `400` sur chaque règle de validation, `404` sur sortie absente.
- `db/index.test.ts` — migration v7 idempotente.
- Météo : `fetchImpl` injecté, y compris un cas d'**échec réseau** qui doit laisser `weather` à
  `null` **sans** faire échouer le `POST`.

**Client**

- `lib/fishing.test.ts` en priorité — `summarizeCatches` ; `nearestAflot` à **horloge figée**, avec
  les cas qui font mal : à-flot après minuit, heure constatée présente vs absente, plage de marées
  non couverte, équidistance passé/futur.
- `FishingTripForm.test.ts`, `FishingView.test.ts`, `FishingRefsPanel.test.ts`.

`npm run type-check` en plus de `npm test` : Vitest passe par esbuild et ne vérifie aucun type.

## Hors périmètre

Graphiques (annoncés « évolution future » dans l'issue), photos, lieu de pêche, carnet par
utilisateur, export. Le carnet n'est **pas rattaché à un port** : les heures d'à-flot dérivent de
Port-Tudy partout dans l'application, le sélecteur de site ne le concerne pas.

## Documentation à mettre à jour

`CLAUDE.md` : nouvelle section carnet de pêche (routes, tables, composants), migration **v7** dans la
liste du schéma, et mention du routeur client — l'application cesse d'être mono-vue.
