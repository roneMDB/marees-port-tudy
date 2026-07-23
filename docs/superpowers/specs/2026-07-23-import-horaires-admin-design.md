# Import des horaires au runtime (admin) — issue #8 Phase 2

**Date** : 2026-07-23
**Suite de** : `2026-07-23-navihan-*` puis #8 Phase 1 (persistance SQLite).

## Besoin

Objectif de l'issue #8 : **éditer les horaires au runtime** sans redéployer l'image. Décidé avec
l'utilisateur : **import en lot uniquement** (pas d'édition ligne à ligne), via un **panneau
offcanvas admin** (comme Statistiques / Réglages). Repose sur la base SQLite de la Phase 1.

## Serveur

Nouvelle route (dans `server/src/routes/tides.ts`), **réservée au rôle `admin`**
(`requestRole(req) === 'admin'`, sinon **403**) :

- **`POST /api/tides/import?site=&mode=merge|replace`**
  - `site` : port cible (défaut `DEFAULT_SITE_ID`) ; site inconnu → **400**.
  - Corps = JSON au **format graine** (accepte les deux formes que `readTides` normalise :
    clés date directes et sections groupées par mois). On **exporte** `normalizeTides(parsed)`
    depuis `lib/readTides.ts` (extrait de la logique actuelle) et on le réutilise ici.
  - `sanitizeImport(parsed)` (pur, testé) : ne garde que les dates `YYYY-MM-DD` et, par entrée,
    `maree ∈ {haute,basse}` + `heure` `HH:MM` + `hauteur` (chaîne) + `coefficient?` (chaîne).
    Entrées/jours invalides écartés ; **rien de valide → 400**.
  - `mode` : **`merge` (défaut, plus sûr)** = remplace seulement les **jours fournis**
    (`mergeSiteData`) ; `replace` = remplace **tout le site** (`replaceSiteData`, Phase 1).
  - Réponse `{ ok: true, site, mode, dates, entries }`.
  - **Pas d'invalidation de cache** : `Maree` relit la base à chaque requête (Phase 1) → l'import
    est reflété immédiatement par `GET /api/tides`.

Repository (`server/src/db/tidesRepository.ts`) : ajouter **`mergeSiteData(db, siteId, data)`**
(dans une transaction : pour chaque date fournie, `DELETE` puis `INSERT`).

## Client

- `client/src/api/tidesAdmin.ts` : `importTides(site, mode, data)` → `POST /api/tides/import`
  (réutilise `fetchJson`). Retourne `{ dates, entries }` ou lève sur erreur (message serveur).
- **Signal de rechargement** : petit composable singleton `useDataRefresh` (`token` ref + `bump()`).
  `useTides` observe `token` → `reload()` du dashboard après un import réussi.
- `client/src/components/TidesImportPanel.vue` (offcanvas, **admin-only** via `useAuth().isAdmin`) :
  - cible = **port sélectionné** (`useSite().current`, affiché) ;
  - zone de texte JSON + **import de fichier** (remplit la zone) ;
  - choix du **mode** (fusionner / remplacer, radios) ;
  - bouton « Importer » → `importTides` ; alerte succès (`N jours / M marées`) ou erreur ;
  - succès → `useDataRefresh().bump()`.
- `client/src/App.vue` : **bouton navbar** (admin-only) ouvrant l'offcanvas, comme Stats/Réglages.

## Tests

- Serveur (`server/src/routes/tides.test.ts` ou nouveau) : `POST /import`
  succès **merge** et **replace** (reflété par `GET /tides`), **400** corps invalide / site inconnu,
  **403** en rôle viewer (dans `security.test.ts`). `sanitizeImport` : tests purs.
  `mergeSiteData` : test repository.
- Client : `TidesImportPanel.vue` (rendu admin, appel `importTides` mocké, affichage succès/erreur),
  `tidesAdmin` api. e2e : optionnel (parcours d'import) — hors périmètre initial.

## Hors périmètre

- Édition ligne à ligne / par jour (non retenue).
- Pas de vue-router (offcanvas dans la page unique existante).
- Pas d'historique/annulation d'import.
