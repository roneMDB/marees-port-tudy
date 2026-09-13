# Navigation par onglets — plan d'implémentation

> **Pour un agent exécutant :** SOUS-COMPÉTENCE REQUISE : `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes sont des cases à
> cocher (`- [ ]`).

**But :** remplacer le bouton unique qui alternait entre les deux pages par deux onglets toujours
visibles — barre fixe en bas sur mobile, groupe segmenté dans la navbar au-delà de `sm`.

**Architecture :** un composant `NavTabs.vue` porte la liste des pages comme source de vérité
unique et en dérive deux variantes ; `useMediaQuery` choisit laquelle rendre. La hauteur de la
barre transite par une variable CSS partagée avec le pied de page.

**Pile :** Vue 3 `<script setup>` + TypeScript, Vue Router, Bootstrap 5.3, Vitest + @vue/test-utils
(jsdom).

**Spec :** `docs/superpowers/specs/2026-09-13-navigation-onglets-design.md` (commit `5fc24cf`).

## État de départ — à lire avant de commencer

⚠️ **Ce plan ne part pas d'une page blanche.** Un prototype validé visuellement (thème clair *et*
sombre) existe déjà dans l'arbre de travail, **non commité** :

```
client/src/composables/useMediaQuery.ts   (nouveau)
client/src/components/NavTabs.vue         (nouveau)
client/src/components/NavTabs.test.ts     (nouveau)
client/src/App.vue                        (modifié : <NavTabs /> + dégagement du pied de page)
client/src/assets/app.css                 (modifié : --app-navtabs-h)
```

Le plan porte donc sur **la finition** : corriger le défaut que le `type-check` a révélé, vérifier,
documenter, commiter. Ne pas réécrire ce qui existe.

## Contraintes globales

- Point de rupture `sm` = **576 px**, celui déjà utilisé par toute la navbar.
- Libellés **« Marées »** et **« Pêche »**, icônes `bi-water` et `bi-bucket`.
- L'actif porte `aria-current="page"` — **jamais** `aria-pressed` (ce sont des liens).
- **Pas** de `router-link-active` : il s'allume pour tout sur la route `/`.
- `npm test` **ne suffit pas** : Vitest passe par esbuild et ne vérifie aucun type.
  **`npm run type-check` est obligatoire** avant tout commit.
- Commentaires et messages de commit **en français**.

---

### Tâche 1 : corriger l'erreur de typage du hook `beforeEach`

`npm test` est au vert (400 tests) alors que `npm run type-check` échoue. C'est précisément le
piège documenté dans `CLAUDE.md` : esbuild ne vérifie pas les types, une erreur peut donc laisser
toute la suite verte.

La cause : une fonction fléchée **à corps d'expression** renvoie la valeur de l'expression.
`vi.unstubAllGlobals()` rend `VitestUtils`, que Vitest interprète comme une fonction de nettoyage
de hook — d'où `Type 'VitestUtils' is not assignable to type 'Awaitable<HookCleanupCallback>'`.

**Fichiers :**
- Modifier : `client/src/components/NavTabs.test.ts:33`

**Interfaces :**
- Consomme : rien.
- Produit : rien. Correction interne au test.

- [ ] **Étape 1 : reproduire l'échec**

```bash
npm run type-check
```

Attendu : ÉCHEC avec
`src/components/NavTabs.test.ts(33,20): error TS2322: Type 'VitestUtils' is not assignable to type 'Awaitable<HookCleanupCallback>'.`

- [ ] **Étape 2 : passer le corps de la fonction en bloc**

Remplacer :

```ts
  beforeEach(() => vi.unstubAllGlobals());
```

par :

```ts
  // Corps en bloc, et non en expression : une fonction fléchée à corps d'expression renverrait le
  // `VitestUtils` de `unstubAllGlobals`, que Vitest prendrait pour une fonction de nettoyage.
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
```

- [ ] **Étape 3 : vérifier que le typage passe**

```bash
npm run type-check
```

Attendu : SUCCÈS, aucune sortie d'erreur.

- [ ] **Étape 4 : vérifier que les tests passent toujours**

```bash
npx vitest run src/components/NavTabs.test.ts
```

(depuis `client/`) Attendu : `4 passed`.

---

### Tâche 2 : vérifier l'ensemble et commiter l'implémentation

**Fichiers :**
- Commiter : les cinq fichiers listés dans « État de départ ».

**Interfaces :**
- Consomme : la correction de la tâche 1.
- Produit : `NavTabs` disponible pour toute page future ; `useMediaQuery(query, fallback)` →
  `Readonly<Ref<boolean>>`, utilitaire réutilisable.

- [ ] **Étape 1 : suite complète des deux workspaces**

```bash
npm test
```

Attendu : serveur et client au vert. Référence avant modification : **400 tests client**, dont les
**4** de `NavTabs.test.ts`.

- [ ] **Étape 2 : typage complet**

```bash
npm run type-check
```

Attendu : SUCCÈS.

- [ ] **Étape 3 : vérifier qu'aucune trace de prototype ne subsiste**

```bash
grep -rn "PROTOTYPE\|NavTabs.css.vue" client/src/ || echo "propre"
```

Attendu : `propre`.

- [ ] **Étape 4 : commiter**

```bash
git add client/src/components/NavTabs.vue client/src/components/NavTabs.test.ts \
        client/src/composables/useMediaQuery.ts client/src/App.vue client/src/assets/app.css
git commit -F - <<'MSG'
feat(nav): onglets de navigation entre les marées et le carnet

Le bouton unique de la navbar changeait d'icône selon la page : il montrait
la destination et non la position, et rien ne disait qu'une seconde page
existait. Deux onglets sont désormais visibles en permanence, l'actif mis
en évidence — barre fixe en bas de fenêtre sous `sm`, groupe segmenté dans
la navbar au-delà.

Sur mobile, la navigation quitte du même coup la rangée d'actions de la
navbar, celle qui saturait depuis l'ajout du carnet de pêche.

La variante est choisie par `matchMedia` et non par les utilitaires
`d-none` de Bootstrap : jsdom n'évalue pas les media queries CSS, donc le
pilotage par CSS laisserait les deux variantes dans le DOM du test et
l'on ne pourrait jamais affirmer laquelle est vue.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Tâche 3 : documenter dans `CLAUDE.md`

Sans cette tâche, les trois décisions contre-intuitives du spec seront « corrigées » de bonne foi
lors d'une prochaine session.

**Fichiers :**
- Modifier : `CLAUDE.md`, section **Architecture › Client**, juste après le paragraphe
  « **Routeur** (`src/router.ts`, issue #3) ».
- Modifier : `CLAUDE.md`, section **Fichiers clés**.

**Interfaces :**
- Consomme : l'implémentation commitée en tâche 2.
- Produit : rien de logiciel.

- [ ] **Étape 1 : insérer le paragraphe après celui du routeur**

```markdown
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
  ⚠️ **Pas de `router-link-active`** : sur la route `/` il s'allumerait pour les deux liens ; l'état
  actif vient d'une comparaison sur `route.name`, et l'actif porte `aria-current="page"` (ce sont
  des liens, pas des bascules — donc jamais `aria-pressed`).
  ⚠️ La hauteur de la barre est la variable **`--app-navtabs-h`** (`assets/app.css`) parce qu'elle a
  **deux consommateurs** : `NavTabs` pour sa hauteur, et le **pied de page** d'`App.vue` pour son
  `padding-bottom` sous `sm` — sans ce dégagement, la barre fixe masque la version et le lien
  GitHub. Le calcul ajoute `env(safe-area-inset-bottom)`. Une seule valeur, donc pas de
  désaccord possible. `NavTabs.test.ts`.
```

- [ ] **Étape 2 : ajouter la ligne aux fichiers clés**

Après la ligne `- \`client/src/router.ts\`, …` :

```markdown
- `client/src/components/NavTabs.vue`, `client/src/composables/useMediaQuery.ts` — navigation
  par onglets (barre du bas sur mobile, segment dans la navbar au-delà de `sm`).
```

- [ ] **Étape 3 : vérifier que le fichier reste cohérent**

```bash
grep -n "NavTabs" CLAUDE.md
```

Attendu : trois occurrences au moins (paragraphe Client, `NavTabs.test.ts`, fichiers clés).

- [ ] **Étape 4 : commiter**

```bash
git add CLAUDE.md
git commit -F - <<'MSG'
docs(nav): documente les onglets de navigation

Consigne les trois décisions qu'une prochaine session « corrigerait » de
bonne foi : le pilotage par `matchMedia` plutôt que par `d-none` (jsdom
n'évalue pas les media queries CSS), l'absence de `router-link-active`
(il s'allume pour tout sur `/`), et la variable `--app-navtabs-h`
partagée avec le pied de page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Hors périmètre

- Aucune troisième page.
- Pas de masquage de la barre au défilement.
- Pas de release ni de déploiement : c'est un geste séparé (`npm run release -- <patch|minor>`).
