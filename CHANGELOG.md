# Journal des modifications

Toutes les modifications notables de **Marées Navihan**. Format dérivé des messages de commit
conventionnels ; versions selon [SemVer](https://semver.org/lang/fr/).

## [1.6.0] — 11/08/2026

### Fonctionnalités

- **peche** — Ordre réglable des espèces et des engins (flèches ↑/↓)
- **peche** — Icône poisson pour « Espèces et engins »
- **peche** — Panneau admin des espèces et des engins
- **peche** — Vue /peche — liste des sorties et saisie inline
- **peche** — Formulaire de saisie d'une sortie
- **peche** — Carte de lecture d'une sortie
- **peche** — Le client emploie le pluriel saisi des référentiels
- **peche** — Libellé au pluriel des référentiels (schéma v8)
- **peche** — Fonctions pures du carnet (résumé, contexte marée, à-flot)
- **peche** — Contrat client, appels REST et composables du carnet
- **peche** — Routeur client et page /peche
- **peche** — API REST du carnet de pêche
- **peche** — Instantané météo d'une sortie, jours passés compris
- **peche** — Amorce les référentiels espèces/engins au démarrage
- **peche** — Repository des sorties et des prises
- **peche** — Référentiels espèces et engins, amorcés et éditables
- **peche** — Schéma v7 du carnet de pêche et activation des clés étrangères

### Corrections

- **peche** — L'icône poisson raccourcissait son bouton de 7 px
- **peche** — Complète les pluriels d'une base amorcée avant la v8
- **peche** — Redirige les URL inconnues par chemin plutôt que par nom
- **peche** — Restaure les accents des libellés de test du repository
- **peche** — Le reset des référentiels conserve ce qui est encore utilisé

### Documentation

- **peche** — Spec de l'ordre réglable des espèces et des engins
- **peche** — Documente le carnet de pêche dans CLAUDE.md
- **peche** — Le reset des référentiels conserve ce qui est encore utilisé
- **peche** — Espèces supplémentaires dans la graine, engins dédoublonnés
- **peche** — Plan d'implémentation du carnet de pêche (#3)
- **peche** — Spec de conception du carnet de pêche (#3)

### Tests

- **peche** — Couvre le refus 403 des écritures du carnet
## [1.5.0] — 10/08/2026

### Fonctionnalités

- **filtres** — Les bascules Navihan rejoignent la barre, la légende reste (#10)
## [1.4.0] — 10/08/2026

### Fonctionnalités

- **filtres** — La plage horaire masque les remises à flot, sans supprimer de jour (#10)
- **filtres** — Barre de filtres du tableau, au grain du jour et ouverte à tous (#10)

### Documentation

- **specs** — Filtres d'affichage sortis des réglages, au grain du jour (#10)

### Maintenance

- **ci** — Câbler le type-check serveur en CI (#14)
## [1.3.0] — 09/08/2026

### Fonctionnalités

- **stats** — Détail dépliable du rythme de chaque utilisateur (#16)
- **stats** — Panneau d'accès par période, heure et utilisateur (#16)
- **stats** — Compter les vraies visites, les attribuer et les dater (#16)

### Documentation

- **specs** — Design des statistiques d'accès plus fines (#16)
## [1.2.0] — 04/08/2026

### Fonctionnalités

- **deploy** — Script de release, npm run release -- patch|minor|major
## [1.1.0] — 04/08/2026

### Fonctionnalités

- **client** — Lien vers le dépôt GitHub dans le pied de page (#15)

### Documentation

- **readme** — Renvoie vers la section interne pour la séquence de release
- **readme** — Documente le workflow de contribution et de validation
- **specs** — Lien vers le dépôt GitHub dans le pied de page (#15)
## [1.0.0] — 04/08/2026

### Fonctionnalités

- **deploy** — Déploiement déclenché par le push d'un tag (#12)
- **ephemeride** — Nommer les lieux du soleil et de l'eau, ajouter Étel (#13)
- **meteo** — Vent en km/h et en Beaufort sur une même ligne (#13)
- **ephemeride** — Carte du jour, Beaufort et météo partagée (#13)
- **ephemeride** — Calcul local du soleil, de la lune et du calendrier (#13)
- **deploy** — Npm run db:pull + sauvegarde datée de la base sur le NAS (#11)
- **lexicon** — « Nouveau mot » tire un terme au hasard
- **tides** — Détecte les journées recopiées + corrige 28/08 et 31/08
- **tides** — Cible un port (--site) et audite la base servie (--db)
- **tides** — Sortie markdown du rapport de cohérence (--markdown)
- **tides** — Ajoute un rapport de cohérence des horaires (check-tides)
- **lexicon** — Bouton « nouveau mot » sur la carte du mot du jour
- **lexicon** — Mot du jour typé et persisté en base + panneau admin (issue #4)
- **aflot** — Saisie des remises à flot constatées (issue #4)
- **navihan** — Estimation de remise à flot par seuil de hauteur (issue #4)
- **stats** — Attribuer les connexions aux utilisateurs
- **users** — Confirmation de suppression par boutons inline
- **users** — Champ de saisie inline pour réinitialiser un mot de passe
- **auth** — Gestion d'utilisateurs en base avec rôles (#9)
- **client** — Mot du jour tiré d'un lexique des marées
- Import des horaires au runtime (admin) — #8 Phase 2
- **server** — Persistance SQLite (better-sqlite3) — #8 Phase 1
- **client** — Choix des types Navihan affichés, persisté en localStorage
- **client** — Colonne Navihan triée avec icônes dans le tableau des marées
- **security** — Activer une CSP taillée à la place de contentSecurityPolicy:false
- **auth** — Rôle côté client (viewer/admin) remplace la notion « local »
- **auth** — Rôles viewer/admin côté serveur (remplace le verrou LAN)
- **auth** — Afficher la mire tant que non connecté + bouton déconnexion
- **auth** — Jolie mire de connexion (LoginScreen.vue)
- **auth** — API + composable useAuth côté client, dispatch 401
- **auth** — Routes login/logout/status + rate-limit login + câblage app
- **auth** — Garde /api cookie-ou-Basic, coquille SPA publique, sans WWW-Authenticate
- **auth** — Jeton de session signé HMAC (lib/session)
- **table** — Show one row per day with per-period navigation
- **settings** — Hide the settings panel when it cannot be edited
- **stats** — Record and view anonymized access statistics (LAN-only)
- **settings** — Warn in the UI when a settings save is rejected
- **security** — Restrict settings writes to the local network
- **security** — Harden the app for external exposure
- **settings** — Make weather-card links configurable
- **weather** — Add daily wind direction and links to weather sites
- **resources** — Enrich pêche Ria d'Étel links with summaries and sub-links
- **sites** — Add Étel port with a port selector
- **dashboard** — Redesign fishing resources as tiles
- **dashboard** — Move settings into an offcanvas panel
- **dashboard** — Add Morbihan pêche à pied regulation link
- **dashboard** — Add fishing resources card for the Ria d'Étel
- **weather** — Default weather location to Belz instead of Port-Tudy
- **client** — Add a live date/time clock in the navbar
- Migrate CLI to client/server monorepo dashboard
- **output** — Add markdown/print/html formats and column selection

### Corrections

- **docker** — Retire la directive syntax, qui rendait le build dépendant du réseau
- **deploy** — Résout docker via le PATH sur le NAS (#12)
- **lint** — Rétablit `npm run lint` (2 erreurs préexistantes)
- **data** — Corrige les 3 dernières journées Port-Tudy (27/08, 12/10)
- **tides** — Pas de fausse rupture sur un jeu non contigu, et chemins relatifs
- **data** — Ajoute les pleines mers du soir manquantes du 20/08 et 31/08
- **data** — Corrige 4 journées Port-Tudy depuis l'annuaire officiel
- **aflot** — Range chaque heure Navihan au jour où elle a réellement lieu
- **data** — Retire 4 basses mers parasites de la graine Port-Tudy
- **aflot** — Cartes, marégramme et saisie basés sur la remise à flot fixe
- **ui** — Menu admin mobile aligné à droite (évite le débordement à gauche)
- SESSION_SECRET dans le compose NAS + nom d'utilisateur visible sur mobile
- **security** — Durcir l'auth (revue #9)
- **db** — Migration v3 idempotente + StatsPanel tolérant
- **client** — Regrouper les actions admin dans un menu ⋮ sur mobile
- **docker** — Copier server/node_modules dans l'image runtime
- **auth** — Durcissements suite à la revue de sécurité (INFO-001/002/003)
- **auth** — Corriger un contournement du garde via la casse du chemin (/API/…)
- **sites** — Pair Navihan to nearest Port-Tudy tide, rows follow the port
- **theme** — Make low coefficient badges readable in dark theme
- **stat-cards** — Always show the next à-flot, not just before a low tide
- **readTides** — Validate file read and JSON with clear error messages
- Remove dist
- Remove .env file and update .gitignore to exclude it

### Refontes internes

- Read tides from local JSON file instead of scraping

### Documentation

- **changelog** — Section « Non publié » tant qu'aucun tag n'existe (#12)
- **deploy** — Procédure de release par tag, rollback et soupapes (#12)
- **spec** — Déploiement déclenché par le push d'un tag (#12)
- **ephemeride** — Résumé de l'issue #13
- **ephemeride** — Corrections trouvées au contrôle visuel (#13)
- **spec** — Éphéméride du jour et force Beaufort (#13)
- **deploy** — Procédure de sauvegarde/restauration et copie en local (#11)
- **spec** — Sauvegarde et copie de la base de prod (#11)
- **deploy** — Procédure de migration vers SQLite (#8)
- **specs** — Design — import des horaires au runtime (admin, #8 Phase 2)
- **specs** — Design — choix des types Navihan affichés (localStorage)
- **specs** — Design issue #6 — Navihan pleine/basse mer dans le tableau
- **auth** — Rôles viewer/admin + suppression READ_ONLY (compose, install, CLAUDE)
- **auth** — Spécifier les rôles viewer/admin pour l'édition des réglages
- **security** — Compléter la revue de sécurité auth (FIX-001 + INFO-003/004)
- **auth** — Plan d'implémentation de la mire d'authentification
- **auth** — Spécifier la mire d'authentification (cookie de session signé)
- **deploy** — Document scripted push-to-nas / update-on-nas workflow
- **deploy** — Add NAS Synology deployment guide and helper files
- Add fishing-trip planning context (CONTEXTE.md)
- Add AGENTS.md and update README.md with project structure and usage instructions

### Tests

- **security** — Verrouille la CSP par des assertions et clarifie la clé exposée
- **e2e** — Tests Playwright headless (Chromium) + job CI
- **client** — Couvrir useTides (période/coef/Navihan multi-site) + gating de rôle

### Maintenance

- **changelog** — Gabarit sans ligne vide superflue, fichier généré non formaté
- Repart de 0.0.0 avant le versionnement par tag (#12)
- **server** — Script type-check, aligné sur le client
- Ignore les sorties régénérables de check-tides
- **dev** — Dev:auth/start:auth créent aussi un compte admin (admin/admin-dev)
- **cleanup** — CLAUDE.md (Étel a des données), engines Node, @types/node 22, LICENSE
- **tooling** — CI GitHub Actions, ESLint/Prettier, README, .env.example
- **deploy** — Binder le port sur 127.0.0.1 + COOKIE_SECURE (durcissement NAS)
- **deploy** — Read auth env from a .env file on the NAS
- **deploy** — Add PC push + NAS update helper scripts
- Update package-lock.json
- Stop tracking node_modules
- Backup

