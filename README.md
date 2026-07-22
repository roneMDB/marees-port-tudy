# marees-port-tudy

Application **client/serveur** des marées (pleines et basses mers) du port de Port-Tudy
(île de Groix), avec les heures dérivées « Navihan » (basse mer +1h15, à flot +2h40).

- **Serveur** Node.js/Express (TypeScript) exposant les marées en **REST**.
- **Client** Vue 3 (Vite + TypeScript) — un **dashboard** Bootstrap 5.3 avec tableau par jour,
  filtres, graphiques (marégramme, coefficients) et météo.

**Multi-sites** : plusieurs ports sont exposés (Port-Tudy, Étel) ; les heures **Navihan** restent
dérivées de **Port-Tudy** (port de référence) quel que soit le port affiché. Une **authentification
optionnelle** (mire + rôles `viewer`/`admin`) protège l'app en cas d'exposition externe — voir
[Authentification & rôles](#authentification--rôles).

> Monorepo npm workspaces. Node **≥ 20** requis (image Docker en Node 22). La version CLI historique
> a été retirée (voir l'historique git). Architecture détaillée : **`CLAUDE.md`**.

## Arborescence

```
marees-port-tudy/
├── server/                     # API REST Express (TypeScript)
│   └── src/
│       ├── index.ts            # démarrage (pino + app.listen)
│       ├── app.ts              # app Express (routes + statique client en prod)
│       ├── routes/tides.ts     # GET /api/tides, /api/tides/meta, /api/health
│       ├── service/Maree.ts    # logique métier (données, Navihan)
│       ├── lib/readTides.ts    # lecture + normalisation du JSON
│       └── resources/horaires_marees_port-tudy.json   # source unique de données
└── client/                     # dashboard Vue 3 (Vite + Bootstrap 5.3 + Chart.js)
    └── src/
        ├── main.ts, App.vue, types.ts
        ├── api/tides.ts, api/auth.ts, api/settings.ts   # appels REST
        ├── composables/        # useTides, useSettings, useAuth, useSite, useTheme…
        ├── views/Dashboard.vue
        └── components/         # LoginScreen, SettingsPanel, StatsPanel, StatCards,
                                #   TideDayTable, HeightChart, CoefChart, WeatherCard…
```

## Installation

```bash
npm install        # installe les deux workspaces (server + client)
```

## Développement

```bash
npm run dev        # lance serveur (:3000) + client Vite (:5173) en parallèle
npm run dev:auth   # idem, mais AVEC authentification (défaut marees / marees-dev)
```

Ouvrir http://localhost:5173. Le client proxifie `/api` vers le serveur (`:3000`).

Commandes par workspace :

```bash
npm -w server run dev     # API seule (ts-node, :3000)
npm -w client run dev     # dashboard seul (Vite, :5173)
```

## Production

```bash
npm run build      # build serveur (tsc + copie ressources) puis client (vite build)
npm start          # node dist/index.js — sert l'API ET le client buildé sur :3000
```

En production, le serveur sert `client/dist` en statique (repli SPA), donc l'API et le
dashboard sont sur la **même origine** (http://localhost:3000).

## API REST

Base : `/api`.

| Méthode & route | Description |
| --- | --- |
| `GET /api/health` | Sonde de vie → `{ "status": "ok" }`. Public. |
| `GET /api/auth/status` | `{ authRequired, authenticated, role }`. Public. |
| `POST /api/login` / `POST /api/logout` | Connexion (pose le cookie de session signé porteur du rôle) / déconnexion. Public. |
| `GET /api/sites` | Liste des ports `{ id, label }`. |
| `GET /api/tides/meta?site` | Bornes de dates disponibles (`minDate`/`maxDate`) + libellés d'offsets Navihan. |
| `GET /api/tides?site&from=YYYY-MM-DD&to=YYYY-MM-DD` | Marées sur une **plage inclusive**. Sans paramètres → toute la plage disponible. `400` si date malformée ou `from > to`. |
| `GET /api/settings` | Configuration persistée (fenêtre de dates, Navihan, liens météo…). |
| `PUT /api/settings` | Enregistre la configuration (fusion + validation/bornage). **Rôle `admin` requis** (403 sinon). `400` si corps JSON invalide. |
| `GET /api/weather?lat&lon&days` | Météo via **Open-Meteo** (gratuit, sans clé) : conditions actuelles + prévisions quotidiennes + marine (vagues). Sans `lat`/`lon` → zone de Port-Tudy (Groix). `400` si coordonnées invalides. |
| `GET /api/stats` | Agrégats d'accès (anonymisés). **Rôle `admin` requis** (403 sinon). |

Quand l'authentification est active, tout `/api` (hors routes publiques ci-dessus) exige une session
valide (cookie) ou un en-tête Basic.

Chaque marée (`Extreme`) : `time`, `height`, `type` (`high`/`low`), `coefficient`
(`null` sur les basses mers), et `navihan` (`Basse mer` + `A flot` pour les basses mers,
`Pleine mer` pour les pleines mers).

La **configuration** (`settings.json`) : `startMode` (`today`|`date`) + `startDate` + `rangeDays`
(fin = début + N jours), `navihan` (décalages en minutes) et `aFlotDays`. Le dashboard
l'enregistre automatiquement (débounce) à chaque changement.

Exemple :

```bash
curl "http://localhost:3000/api/tides?from=2026-07-18&to=2026-07-20"
```

## Authentification & rôles

En accès libre tant qu'aucun mot de passe n'est défini. Dès que `APP_PASSWORD` **ou**
`ADMIN_PASSWORD` est renseigné, une **mire de connexion** protège l'app et pose un **cookie de
session signé (HMAC)** portant un **rôle** :

- **`viewer`** (`APP_USER` / `APP_PASSWORD`) — consultation, depuis n'importe où.
- **`admin`** (`ADMIN_USER` / `ADMIN_PASSWORD`) — consultation **+ édition des réglages +
  statistiques**, depuis n'importe où.

`COOKIE_SECURE=true` force le flag `Secure` du cookie derrière un reverse proxy HTTPS. Toutes les
variables sont décrites dans **`.env.example`**. Exposition sur Internet (reverse proxy DSM, HTTPS,
durcissement) : **[deploy/INSTALLATION-NAS.md](deploy/INSTALLATION-NAS.md)**.

## Tests & qualité

```bash
npm test                  # server (Vitest + supertest) puis client (Vitest + @vue/test-utils)
npm -w server run test
npm -w client run test
npm -w client run type-check   # vue-tsc
npm run lint              # ESLint (TS + Vue) sur tout le dépôt
npm run format            # Prettier (écriture)
```

Une **CI GitHub Actions** (`.github/workflows/ci.yml`) exécute lint + type-check + tests + build sur
chaque push/PR.

## Docker

Image multi-stage (build serveur + client, image finale légère) + volume pour les données.

```bash
docker compose up --build      # build l'image et lance le conteneur sur :3000
```

Ouvrir http://localhost:3000. Le **volume** `./data:/data` contient `settings.json` et
`horaires_marees_port-tudy.json` : la config et les horaires **survivent** aux reconstructions.
Au 1er démarrage sur un volume vide, le répertoire est **auto-initialisé** depuis la graine
embarquée dans l'image.

Sans compose :

```bash
docker build -t marees-port-tudy .
docker run -p 3000:3000 -v "$(pwd)/data:/data" marees-port-tudy
```

### Déploiement NAS Synology (DS218+)

Build sur le PC, transfert de l'image en fichier, exécution sur le NAS (Container Manager) :

```bash
./deploy/save-image.sh      # → marees-image.tar.gz (à transférer sur le NAS)
```

Guide d'installation complet pas-à-pas (prérequis, dossiers, chargement de l'image, Container
Manager, reverse proxy, mises à jour, sauvegarde, dépannage) :
**[deploy/INSTALLATION-NAS.md](deploy/INSTALLATION-NAS.md)** (voir aussi l'index
**[deploy/README.md](deploy/README.md)**).

## Hors-ligne (PWA)

Le client est une **PWA** : un service worker (via `vite-plugin-pwa`) précache la coquille de
l'app et met en cache les réponses `/api` (stratégie *network-first*). Après une première visite
**en ligne**, la page et les **dernières données consultées** restent accessibles **hors-ligne**,
et l'app est *installable* (« Ajouter à l'écran d'accueil »). Actif uniquement sur le build de
production (servi par le serveur / Docker), pas en `npm run dev`.

## Répertoire de données (`DATA_DIR`)

Le serveur lit/écrit ses données runtime dans **`DATA_DIR`** (défaut `<cwd>/data`, soit
`server/data` en dev, `/data` dans l'image) :

- `settings.json` — la configuration (créée aux valeurs par défaut si absente) ;
- `horaires_marees_port-tudy.json` — les horaires (copiés depuis la graine si absents).

La **graine** versionnée reste `server/src/resources/horaires_marees_port-tudy.json` (embarquée
dans l'image). Deux formes de fichier d'horaires sont acceptées et aplaties à la lecture :

- clés date directes : `"2026-06-01": [ { "maree": "haute", "heure": "05:59", "hauteur": "4.59", "coefficient": "71" }, ... ]`
- sections groupées par mois : `"septembre": { "2026-09-01": [ ... ] }`

Pour mettre à jour les marées, remplacer le fichier dans `DATA_DIR` (ou la graine, puis
recréer le volume). Couverture actuelle : 2026-06-01 → 2026-10-31.
