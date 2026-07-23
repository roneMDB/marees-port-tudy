# Navihan : choix des types affichés (persisté localStorage)

**Date** : 2026-07-23
**Suite de** : `2026-07-23-navihan-pleine-basse-mer-tableau-design.md`

## Besoin

Dans la colonne « Navihan » du tableau, pouvoir **choisir quels types afficher** parmi
**basse mer**, **remise à flot** et **pleine mer**. Le choix est une **préférence personnelle
par navigateur**, **persistée en localStorage** (comme le thème et le port sélectionné) et
disponible pour **tous les utilisateurs** (viewer + admin), hors du panneau Réglages (admin).

## Design

### Composable `client/src/composables/useNavihanDisplay.ts` (nouveau)

Singleton sur le modèle de `useSite`/`useTheme` :

- Clé localStorage **`marees-navihan-display`**.
- État `visible` réactif : `{ bm: boolean; flot: boolean; pm: boolean }`, **défaut = les 3 à `true`**.
- Lecture au démarrage **robuste** : JSON absent/illisible/partiel → complété par les défauts
  (`true`). Chaque clé manquante ou non booléenne retombe sur `true`.
- Persistance auto : `watch(visible, …, { deep: true })` → `localStorage.setItem` (JSON).
- API exportée : `visible` (reactive), `toggle(key: 'bm' | 'flot' | 'pm')`.

### `client/src/components/TideDayTable.vue`

- `NavihanEntry` gagne un champ `key: 'bm' | 'flot' | 'pm'`.
- `navihanEntries(day)` **filtre** les entrées selon `useNavihanDisplay().visible[key]`
  (tri chronologique conservé).
- **Légende interactive** : les 3 chips (↓ Basse mer · ✓ Remise à flot · ↑ Pleine mer) deviennent
  des `<button>` bascule appelant `toggle(key)` :
  - `aria-pressed` reflète l'état ; `title` explicite (« Afficher / Masquer … ») ;
  - état masqué = style atténué (opacité réduite + libellé barré), curseur `pointer` ;
  - les 3 boutons restent toujours visibles (on peut réactiver même si tout est masqué).
- Cellule « — » quand aucun type n'est visible pour le jour (comportement existant réutilisé).

Aucune prop nouvelle (le composable est un singleton). Aucun changement serveur ni de
`useSettings` / `useTides`.

## Tests

- `client/src/composables/useNavihanDisplay.test.ts` (via `vi.resetModules` + import dynamique,
  comme `useSite.test.ts`) : défaut (tout visible) ; lecture d'une valeur stockée ; `toggle`
  bascule ; persistance en localStorage ; JSON invalide/partiel → défauts.
- `client/src/components/TideDayTable.test.ts` : masquer un type retire ses pastilles ;
  la légende expose des boutons bascule (`aria-pressed`). Réinitialiser l'état visible en
  `beforeEach` pour éviter la pollution entre cas (singleton).

## Hors périmètre

- Serveur inchangé ; pas de synchronisation multi-appareils (choix volontairement local).
- Le graphe de hauteur (`HeightChart`) n'est pas concerné (il n'affiche que l'à-flot).
