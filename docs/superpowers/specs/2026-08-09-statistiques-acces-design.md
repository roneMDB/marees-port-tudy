# Statistiques d'accès plus fines : qui accède et quand (issue #16)

## Besoin

L'issue demande « des statistiques plus fines sur **qui** accède et **quand** », et de proposer des
améliorations à l'existant. Or l'existant ne peut répondre ni à l'un ni à l'autre, pour trois raisons
qui tiennent au code, pas au format d'affichage.

**1. Le comptage est largement faussé.** `accessLog()` ne journalise que les requêtes de **document
HTML**. Or la PWA précache la coquille (`navigateFallback: 'index.html'` dans `client/vite.config.ts`)
: dès la deuxième visite, le service worker sert la navigation **sans toucher au serveur**. Le
compteur ne bouge donc plus après la première visite d'un appareil — l'usage réel, qui est fait de
visites répétées, est invisible.

**2. « Qui » est inexploitable.** `recordAccess` ne lit pas le cookie de session : une ouverture de
page **authentifiée** s'enregistre avec `login: null`. Seules les **connexions** portent un login, et
comme le cookie « se souvenir de moi » dure 30 jours, elles sont rares. Le panneau ne peut pas dire
qui utilise l'application.

**3. « Quand » s'arrête au jour.** Seul `perDay` existe : pas d'heure de la journée, pas de jour de
semaine, pas de sélecteur de période — `GET /api/stats` recharge tout l'historique en mémoire à
chaque appel et l'agrège en bloc.

## Décisions de cadrage

### Comptage par balise explicite

Le client appelle **`POST /api/visit`** une fois à l'ouverture de l'application. Le serveur y lit le
cookie de session : un enregistrement = une ouverture réelle, service worker actif ou non, et il
porte l'utilisateur.

Deux alternatives ont été écartées :

- **Journaliser tous les appels `/api`** — aucun code client, mais une ouverture génère cinq à six
  appels (`auth/status`, `tides`, `settings`, `sites`, `weather`…). Il faudrait dédupliquer par
  fenêtre de temps : comptage indirect, bruité, difficile à expliquer et à tester.
- **Se greffer sur `/api/auth/status`** — appelé exactement une fois au montage par
  `useAuth.checkStatus()`, donc zéro code client. Mais le couplage est implicite et invisible :
  quiconque déplace cet appel casserait les statistiques sans le savoir.

La balise est la seule option où « une visite » est une **notion explicite**, qu'on peut définir,
tester et faire évoluer (reprise de session, gestion du hors-ligne).

### Journal typé plutôt que remplacé

On garde *aussi* la journalisation des documents, distinguée par une colonne **`kind`** :

| `kind`  | Signification                                                        |
| ------- | -------------------------------------------------------------------- |
| `visit` | Ouverture réelle de l'app (balise) — **le chiffre de tête**          |
| `page`  | Chargement de coquille, sonde externe, bot                            |
| `login` | Connexion réussie                                                     |

L'application étant exposée à l'extérieur, la visibilité sur les accès non authentifiés a une valeur
propre ; elle ne doit simplement plus polluer le compteur de visites. Les lignes historiques
(`kind` à `NULL`) sont **lues comme `page`** — c'est exactement ce qu'elles sont.

### Aucune purge, lecture bornée

L'historique est conservé intégralement. C'est la **lecture** qui est bornée par la période demandée
(`?days=`), ce qui suffit à éviter la dégradation que la purge visait à prévenir.

### Hors périmètre (YAGNI)

Mesurer *ce qui* est consulté (port sélectionné, panneaux ouverts), distinguer nouveaux et
récurrents, tracer une courbe d'activité par utilisateur.

## Design

### Schéma — `access_log` v6

`SCHEMA_VERSION` passe à 6, palier additif ajoutant la colonne **`kind TEXT`**. Comme en v3,
`ALTER TABLE … ADD COLUMN` n'étant pas idempotent en SQLite, la colonne n'est ajoutée qu'après un
`PRAGMA table_info(access_log)` confirmant son absence — robuste à un rollback ayant remis
`user_version` en arrière puis re-migré.

Pas de colonne `user_id` : le `login` textuel existant suffit, et une visite doit rester lisible
après suppression du compte.

### Serveur — capture

`recordAccess(req, db?, opts?)` prend désormais `{ kind, login? }` et, **quand `login` n'est pas
fourni, le résout depuis la session** via `requestUser(req, db)`. C'est le correctif central du
« qui ». L'écriture reste **best-effort** : elle ne doit jamais faire échouer la requête.

`readAccessEntries(db?, sinceIso?)` filtre `WHERE ts >= ?` quand la borne est fournie (l'index
`idx_access_ts` existe déjà).

Nouvelle route **`POST /api/visit`** dans le routeur des statistiques : derrière le garde
d'authentification déjà monté sur `/api`, enregistre `kind: 'visit'`, répond **204**. Un rate-limit
dédié (60 requêtes / 5 min) empêche qu'un client bavard ou une boucle ne gonfle le journal.

### Serveur — agrégation

`aggregateAccess` **reste une fonction pure** (aucune horloge). `AccessStats` gagne :

- `visits` / `pageLoads` / `logins` — décompte par `kind` ;
- `uniqueVisitors` — `login` distincts, plus `ip|ua` distincts pour les entrées anonymes ;
- `perHour: number[24]` et `perWeekday: number[7]`, sur les visites ;
- `users: { name, count, lastTs }[]` — visites par compte **et dernière visite**, la réponse directe
  à « qui accède » ; remplace l'actuel décompte des seules connexions.

`perDay`, `countries`, `browsers` et `devices` sont conservés, mais calculés sur les **visites**.

**Piège qui change les chiffres — le fuseau horaire.** `ts` est un instant **UTC** et `perDay` fait
aujourd'hui `ts.slice(0, 10)` : une visite à 01 h 30 heure locale en été est comptée **la veille**.
Un helper unique, appuyé sur `Intl.DateTimeFormat` en `Europe/Paris`, sert donc **jour, heure et jour
de semaine**. Sans lui, l'histogramme horaire — le cœur du « quand » — serait décalé d'une à deux
heures selon la saison.

`GET /api/stats?days=7|30|90|all` valide son paramètre (**400** sinon, comme `routes/tides.ts` pour
ses dates) et calcule la borne. Le **403** hors rôle `admin` reste inchangé.

### Client

- **`api/stats.ts`** (nouveau) : `getStats(days)` et `pingVisit()`, sur `fetchJson`. `getStats`
  quitte `api/tides.ts`, où il n'avait rien à faire.
- **`composables/useVisitPing.ts`** (nouveau) : ping best-effort — un échec (hors-ligne, 401, 403)
  est silencieux. Anti-doublon par variable de module, nouveau ping à la reprise
  (`visibilitychange`) si le précédent date de plus de **30 minutes**. C'est la définition
  opérationnelle d'une visite.
- **`App.vue`** : le ping part depuis `ensureAppData()`, déjà garanti une seule fois par démarrage et
  atteint après `checkStatus()`, donc authentifié. Il ne part **pas** quand un changement de mot de
  passe est exigé : le garde renvoie alors `403 PASSWORD_CHANGE_REQUIRED` sur tout `/api`.
- **`StatsPanel.vue`** : sélecteur de période (7 / 30 / 90 / tout) ; KPI revus
  (Visites · Visiteurs uniques · Local · Externe) ; visites par jour ; **histogramme par heure** ;
  **répartition par jour de semaine** ; utilisateurs avec dernière visite ; puis pays, navigateurs,
  appareils. Chargements de coquille et connexions passent en ligne secondaire : ce sont des
  diagnostics, pas le chiffre de tête. Le style des graphes reprend celui de `CoefChart` et
  `HeightChart` (options thème-aware via `useTheme`).

## Tests

Serveur : décompte par `kind` (dont `NULL` → `page`), `uniqueVisitors`, `users` avec `lastTs`,
`perWeekday`, et `perHour`/`perDay` vérifiés **en été et en hiver** — seul moyen d'attraper une
régression de fuseau. Résolution du login depuis la session dans `recordAccess`. Migration v6
idempotente. Route : `?days=` valide et invalide, 403 hors admin, `POST /visit` (401 sans session,
204 avec).

Client : `useVisitPing` (ping unique par démarrage, nouveau ping après 30 min, échec silencieux) et
un `StatsPanel.test.ts`, qui n'existait pas.

## Vérification de bout en bout

Le sous-comptage ne se vérifie **qu'en build de production** (`npm run build && npm start`) : c'est
le seul mode où le service worker est actif. Avant le correctif, le compteur cessait de bouger après
la première visite ; après, chaque ouverture doit compter.
