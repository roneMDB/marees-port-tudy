# Navigation par onglets entre les deux pages

**Date** : 2026-09-13
**Portée** : client uniquement — aucune route, aucun endpoint, aucune migration.

## Besoin

Depuis que l'app a deux pages (dashboard des marées, carnet de pêche), la navigation tient dans
**un seul bouton icône** de la navbar, qui change de visage selon la page courante : 🌊 quand on est
sur le carnet, 🪣 quand on est sur les marées.

Deux défauts, tous deux signalés à l'usage :

1. **L'icône montre la destination, pas la position.** Rien ne dit où l'on se trouve, ni même
   qu'il existe deux pages. Un bouton qui change de sens selon l'état est une devinette.
2. **La cible est petite et noyée** au milieu de six autres boutons icônes de même facture, dont
   les actions admin. Sur téléphone, viser au pouce est pénible.

## Décisions

| Sujet | Décision |
|---|---|
| Forme | **Les deux pages visibles en permanence**, l'active mise en évidence — pas une bascule |
| Placement mobile (< `sm`) | **Barre d'onglets fixe en bas de fenêtre** |
| Placement desktop (≥ `sm`) | **Groupe segmenté dans la navbar**, à la place du bouton actuel |
| Libellés | **« Marées » / « Pêche »** — symétriques (deux thèmes), et les plus courts |
| Icônes | `bi-water` / `bi-bucket`, celles déjà en place |
| Choix de variante | **`matchMedia` en JS**, une seule variante rendue |
| Point de rupture | `sm` (576 px), celui déjà utilisé par toute la navbar |

### Pourquoi une barre en bas sur mobile

Elle est `position: fixed` : collée au bas de la **fenêtre**, pas de la page. Elle ne défile jamais
et reste sous le pouce. Elle libère surtout un bouton de la rangée d'actions de la navbar —
**précisément celle qui saturait** (le carnet de pêche l'avait déjà fait déborder à 320 px, cf.
les commentaires d'`App.vue`).

Son coût est réel et assumé : ~3,5 rem de hauteur en permanence.

### Pourquoi `matchMedia` plutôt que les utilitaires CSS de Bootstrap

C'est le point contre-intuitif de ce design, et il a été **tranché par l'expérience, pas par
principe**. L'option naturelle était de rendre les deux variantes et de laisser `d-none`/`d-sm-flex`
en masquer une : pas de JS, pas d'état, pas d'écouteur de redimensionnement.

Elle a été écartée parce que **jsdom n'évalue pas les media queries CSS**. Sous ce pilotage, les
deux variantes sont toujours dans le DOM du test : on y trouve deux jeux de liens, deux
`aria-current`, et l'on ne peut **jamais** affirmer laquelle l'utilisateur voit. La question même
devient intestable.

Piloté par `matchMedia`, la branche est **observable et simulable** : le test monte la variante
qu'il veut vérifier et affirme que l'autre est absente.

Le coût est un stub de trois lignes — mais il est **silencieux**, et c'est le vrai piège à
documenter : `window.matchMedia` vaut `undefined` sous jsdom et il n'y a **pas** de `setupFiles`
dans `client/vite.config.ts`. Un test qui monte `App` sans simuler obtient le `fallback` sans
aucun avertissement. Le `fallback` retenu est **`true` (desktop)**, ce qui signifie que
`App.test.ts` n'exerce **que** le groupe segmenté ; la barre du bas est couverte par
`NavTabs.test.ts`, qui, lui, simule.

Vérifications faites sur le prototype avant d'arrêter ce choix :

- bascule correcte au redimensionnement, exactement à la frontière (575 → barre, 576 → segment) ;
- pas de scintillement au premier rendu — `matchMedia` est synchrone, la bonne variante sort
  d'emblée ;
- `typeof window.matchMedia === 'undefined'` confirmé sous l'environnement de test du projet.

### Pourquoi pas `router-link-active`

Sur la route `/`, cette classe s'allume pour **tout** lien dont le chemin en est un préfixe — donc
pour les deux. L'état actif se déduit d'une comparaison explicite sur `route.name`.

Ce sont des **liens**, pas des bascules : l'actif porte `aria-current="page"`, jamais
`aria-pressed`.

## Architecture

### `composables/useMediaQuery.ts` (nouveau)

`useMediaQuery(query, fallback)` → `Readonly<Ref<boolean>>`. Lit `matches` à la création, s'abonne
à `change`, se désabonne à `onBeforeUnmount`. Si `matchMedia` est absent (jsdom), reste au
`fallback` sans échouer.

Générique et sans dépendance au domaine : c'est un utilitaire, pas un composant de navigation.

### `components/NavTabs.vue` (nouveau)

Constante locale `PAGES` = `[{ name, label, icon }]`, **source de vérité unique**. Les deux
variantes en dérivent par `v-for` : ajouter une troisième page est une ligne, et elles ne peuvent
pas diverger — le piège explicitement documenté dans `CLAUDE.md` à propos des variantes
responsives de la navbar.

- **≥ `sm`** : `.btn-group` de `RouterLink`, actif en `btn-light`, inactif en `btn-outline-light`.
- **< `sm`** : `<nav class="nav-tabs-bar">` fixe, deux onglets à `flex: 1`, icône au-dessus du
  libellé, actif coloré avec liseré supérieur.

Style `scoped` : un seul composant rend ces règles. (La palette des pastilles Navihan est globale
parce que **deux** composants la rendent ; ce n'est pas le cas ici.)

### `assets/app.css` — `--app-navtabs-h`

La hauteur de la barre est déclarée **une fois** en variable CSS sur `:root`, parce qu'elle a
**deux consommateurs** :

- `NavTabs` pour sa propre hauteur ;
- le **pied de page** d'`App.vue` pour son `padding-bottom` sous `sm`.

Sans ce dégagement, la barre fixe flotte au-dessus du dernier élément du document et masque la
version et le lien GitHub. Le calcul ajoute `env(safe-area-inset-bottom)` pour ne pas passer sous
la barre de geste des téléphones récents.

Une seule valeur, deux consommateurs : elles ne peuvent pas se désaccorder.

### `App.vue`

Les deux `RouterLink` conditionnels de la navbar sont remplacés par `<NavTabs />`. Le `<footer>`
reçoit la classe `app-footer` et son dégagement sous `sm`.

## Tests

`components/NavTabs.test.ts` :

- ≥ `sm` → le groupe segmenté est rendu, la barre du bas **absente** ;
- < `sm` → l'inverse ;
- les deux variantes affichent les **deux** pages, libellées ;
- la page courante porte `aria-current="page"`, **et elle seule** (vérifié dans les deux variantes).

`App.test.ts` et `router.test.ts` restent valides sans modification : aucun ne vise le bouton de
navigation remplacé.

## Hors périmètre

- Aucune troisième page. `PAGES` la rendrait triviale à ajouter, mais on n'en ajoute pas une ici.
- Pas de masquage de la barre au défilement : elle est un repère permanent, c'est l'intérêt.
- Pas de transition animée entre variantes — la bascule n'a lieu qu'au redimensionnement, geste
  rare sur les appareils concernés.
