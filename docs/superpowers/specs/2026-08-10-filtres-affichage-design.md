# Filtres d'affichage : sortis des réglages, au grain du jour (issue #10)

**Date** : 2026-08-10
**Issue** : #10 — « sortir des settings les Filtres d'affichage »

## Besoin

Les filtres d'affichage doivent être **utilisables par tous les utilisateurs** (pas seulement
`admin`) et **liés à leur session** — donc persistés en `localStorage`, comme le thème, le port ou
la légende Navihan. L'issue demande aussi de vérifier si les filtres existants sont **toujours
d'actualité** et d'en ajouter de pertinents.

## Constat

Deux problèmes distincts, tous deux réels.

### 1. Inaccessibles aux lecteurs

Les filtres vivent dans la 4ᵉ section de `SettingsPanel.vue`. Or ce panneau **et** son bouton de
navbar sont montés derrière `isAdmin` (`views/Dashboard.vue`, `App.vue`). Un compte `viewer` n'a
donc **aucun** accès aux filtres : ils restent figés à `{ type: 'all', minCoef: null }` pour lui.
C'est cohérent pour de la configuration serveur, absurde pour une préférence d'affichage locale.

### 2. Périmés depuis le passage à « une ligne par jour »

`filterTides` filtre **marée par marée**, puis `groupByDay` regroupe **par jour**. Depuis que le
tableau affiche une ligne par jour (`TideDayTable`), les deux filtres se comportent mal :

- dans les données, **seules les pleines mers portent un `coefficient`** (les basses mers ont
  `coefficient: null`). Poser un `Coef min` supprime donc **toutes les basses mers** : la colonne
  « Basses mers » se vide, les pastilles Navihan `bm` / `flot` / `flotEst` disparaissent et la
  colonne « Constaté » n'affiche plus rien. C'est-à-dire l'essentiel de ce que l'app sert à montrer ;
- `Type = pleine mer` ne retire **aucune ligne**, il vide une colonne. `Type = basse mer` fait en
  plus disparaître le **coefficient du jour**, calculé sur les pleines mers ;
- la **légende Navihan cliquable** (5 types masquables, déjà persistée en `localStorage`) couvre
  déjà le besoin « montrer moins ».

Un filtre qui mutile des cellules au lieu de sélectionner des lignes n'est pas un filtre. Il faut
les reprendre **au grain du jour**, qui est le grain du tableau.

## Décisions

| Sujet | Décision |
|---|---|
| Emplacement | Barre repliable sous l'en-tête de la carte « Horaires par jour », ouverte par un bouton **Filtres** posé à côté de la navigation par période |
| Portée | **Le tableau seul.** Le graphe des coefficients garde sa série complète — un graphe de barres troué se lit mal et son axe des dates deviendrait irrégulier |
| Persistance | `localStorage`, clé `marees-tide-filters` |
| Filtres retenus | Coefficient **min/max** et **jours de la semaine** (filtres de **lignes**) ; **plage horaire de remise à flot** (masque des **heures**, garde les lignes) |
| Filtres supprimés | « Type de marée » et le `minCoef` marée-par-marée |

Le choix des filtres suit la question métier de l'app : *quand puis-je repartir à une heure
praticable ?* D'où la plage horaire de remise à flot, qui n'existait pas.

## Design

### Composable `client/src/composables/useTideFilters.ts` (nouveau)

Singleton module-level, calqué sur `useNavihanDisplay` (état `reactive` créé hors de la fonction,
lecture initiale défensive, `watch(..., { deep: true })` qui persiste).

```ts
export interface TideDayFilters {
  minCoef: number | null;
  maxCoef: number | null;
  weekdays: number[];       // lundi = 0 ; [] ou 7 valeurs = pas de filtre
  aflotFrom: string | null; // 'HH:MM'
  aflotTo: string | null;   // 'HH:MM'
}
```

- Clé `marees-tide-filters` (série `marees-*`).
- Lecture initiale **tolérante** : JSON absent / illisible / partiel → défauts, chaque clé validée
  par type. Un stockage écrit par une version antérieure ne doit jamais casser l'app.
- API : `filters` (reactive), `activeCount` (computed), `reset()`.
- **`activeCount` compte des critères, pas des champs** : coefficient (1 si une borne est posée),
  jours (1 si la sélection n'est pas neutre), remise à flot (1 si une borne est posée) → 0 à 3.
  C'est ce nombre qu'affiche le badge du bouton.

### Prédicat pur `matchesDayFilters` (`client/src/lib/tides.ts`)

```ts
export interface DayFacts {
  coefficient: number | null;
  weekday: number; // lundi = 0
}
export function matchesDayFilters(facts: DayFacts, f: TideDayFilters): boolean
export function matchesAflotWindow(time: string, f: TideDayFilters): boolean
```

**Deux natures de filtre, à ne pas confondre.**

*Filtres de ligne* — `matchesDayFilters` :

- Bornes de coefficient **inclusives**. Un jour **sans** coefficient est écarté dès qu'une borne est
  posée — comportement explicite : on ne peut pas affirmer qu'il satisfait le critère.
- `weekdays` neutre à 0 **et** à 7 valeurs.

*Filtre d'heures* — `matchesAflotWindow` : la plage horaire ne supprime **aucune ligne**, elle
masque les remises à flot qui en sortent. Le jour reste affiché, avec « — » si aucun à-flot n'est
retenu. Bornes inclusives, chacune facultative ; `from > to` (plage franchissant minuit, ex.
22:00 → 06:00) se lit en **union**, sinon une plage de nuit ne retiendrait jamais rien.

L'heure jugée est la **« Remise à flot » à décalage fixe**, jamais l'estimation par seuil : règle du
projet, seule la pastille ↗ du tableau utilise l'estimation ; cartes, marégramme et colonne
« Constaté » utilisent le décalage fixe. **Les trois lectures d'un même à-flot disparaissent
ensemble** — pastille ✓, estimation ↗ et ligne « Constaté » — sinon l'heure masquée dans la colonne
Navihan réapparaîtrait immédiatement à droite.

Ajout dans `client/src/lib/format.ts` : `weekdayIndex(dateKey)` → lundi = 0, même convention que
les statistiques serveur, même astuce « midi local » que `formatDate` / `addDays`.

### `client/src/components/TideDayTable.vue`

`rows` filtre les jours **après** `groupByDay` (coefficient et jours de la semaine) :

- **la liste plate `props.tides` n'est pas filtrée en amont** : `navihanByDate` et `constateByDate`
  se construisent dessus, donc les heures Navihan d'un jour masqué (ou du jour d'amorce) qui
  franchissent minuit restent rendues sur le jour visible suivant ;
- quand des lignes sont masquées, un pied de tableau discret l'annonce
  (« N jour(s) masqué(s) par les filtres · Réinitialiser »). Sans lui, un filtre **persisté** rend
  le tableau incompréhensible au retour — c'est le prix de la persistance, il doit être payé ici.

La **plage horaire** agit ailleurs, **dans** `navihanByDate` et `constateByDate` : chaque basse mer
dont la remise à flot (décalage fixe) sort de la plage perd sa pastille ✓, son estimation ↗ et sa
ligne « Constaté ». Aucune ligne ne disparaît, le pied ne la compte donc pas.

### `client/src/components/TideFiltersBar.vue` (nouveau)

Bande de contrôles purement présentationnelle, adossée au singleton (aucune prop, aucun emit) :
coefficient min/max (bornés **en JS**, pas seulement par les attributs HTML), 7 boutons-pastilles
`L M M J V S D` sur le patron exact de la légende Navihan (`aria-pressed`, état « off » atténué),
deux `input type="time"`, et un bouton **Réinitialiser** visible seulement si un filtre est actif.
Désélectionner le dernier jour ramène à « tous les jours » plutôt qu'à un tableau vide.

### `client/src/views/Dashboard.vue`

Bouton bascule dans l'en-tête de la carte, **plein** (`btn-primary`) dès qu'un filtre est actif et
portant le badge du nombre de critères : la barre peut être repliée, l'état filtré reste visible.

### Suppressions

`SettingsPanel` perd sa section « Filtres d'affichage », sa prop `filters` et son emit `reset` ; il
ne contient plus que de la configuration serveur et se renomme **« Réglages »** (navbar comprise).
`useTides` perd `filters`, `filterTides` se réduit à la plage de dates, `TideTypeFilter` et
`TideDisplayFilters` disparaissent de `types.ts`.

## Tests

- `lib/tides.test.ts` — `filterTides` réduit à la plage de dates ; `matchesDayFilters` : bornes
  inclusives, jour sans coefficient écarté dès qu'une borne est posée, `weekdays` neutre à 0 et 7,
  plage horaire **sans effet** sur la sélection de lignes, filtres neutres ; `matchesAflotWindow` :
  bornes incluses, borne seule, plage franchissant minuit, aucune borne.
- `lib/format.test.ts` — `weekdayIndex` (lundi = 0, dimanche = 6).
- `composables/useTideFilters.test.ts` — patron de `useNavihanDisplay.test.ts` (`vi.resetModules()`
  + import dynamique) : défauts, lecture d'un état stocké, persistance, JSON invalide, objet
  partiel, `activeCount`, `reset()`.
- `components/TideFiltersBar.test.ts` — saisie bornée, bascule d'un jour, désélection du dernier
  jour, visibilité du bouton Réinitialiser.
- `components/TideDayTable.test.ts` — un filtre de coefficient masque des lignes ; pied « N jours
  masqués » ; **les pastilles Navihan d'un jour masqué qui franchissent minuit restent rendues** ; la
  plage horaire masque la pastille ✓ **sans** supprimer de ligne, et emporte l'estimation ↗ et la
  ligne « Constaté » du même à-flot.

## Hors périmètre

- Aucun changement serveur : ces filtres sont une préférence locale, pas de la configuration.
- Pas de synchronisation multi-appareils (choix volontairement local, comme le thème et le port).
- Les cartes, le marégramme et le graphe des coefficients restent non filtrés.
