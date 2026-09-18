# Coefficient par pleine mer — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** afficher le coefficient de **chaque** pleine mer à côté de sa marée dans le tableau
« Horaires par jour », là où seul le maximum du jour est visible aujourd'hui.

**Architecture :** changement **purement présentationnel**, confiné à
`client/src/components/TideDayTable.vue`. La donnée existe déjà : `FlatTide.coefficient` est porté par
chaque pleine mer et arrive intact jusqu'au composant, qui l'ignore au rendu. Aucune fonction n'est
créée, aucune signature modifiée, aucun style ajouté — on ajoute un fragment de template calqué sur
celui de la hauteur d'eau, et une mention dans la légende.

**Tech Stack :** Vue 3 (`<script setup>` + TypeScript), Bootstrap 5.3, Vitest + @vue/test-utils
(environnement `jsdom`).

**Spec :** `docs/superpowers/specs/2026-09-18-coefficient-par-pleine-mer-design.md`

## Global Constraints

- **Aucun changement serveur.** Routes, contrat REST, schéma SQLite et graines restent intacts.
- **Aucun changement de logique.** `groupByDay` continue de calculer `coefficient` = max des pleines
  mers du jour ; `matchesDayFilters` continue de filtrer sur ce max ; `coefBand`, `CoefChart`,
  `StatCards`, `lib/fishingStats.ts` ne sont pas touchés.
- **La colonne « Coef » est conservée telle quelle** : pastille du max du jour, colorée par bande.
- **Pleines mers uniquement.** La cellule « Basses mers » n'est pas modifiée : aucune basse mer ne
  porte de coefficient (vérifié sur les deux graines : 0 sur 592 entrées Port-Tudy, 0 sur 476 à Étel).
- **Coefficient `null` → rien n'est écrit.** Ni le mot « coef », ni un tiret.
- **Libellé exact du fragment : `coef {{ valeur }}`** (minuscule, sans accent), attribut
  `title="Coefficient de marée"`.
- **Aucun style CSS nouveau.** `.tide-values` est déjà en `inline-flex` + `flex-wrap`.
- Commentaires, libellés d'interface, noms de tests et messages de commit **en français**.
- Commits en **conventional commits**, terminés par
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Toutes les commandes se lancent **depuis `client/`** sauf mention contraire.

## File Structure

| Fichier | Rôle dans ce plan |
|---|---|
| `client/src/components/TideDayTable.vue` | **Modifié** — cellule « Pleines mers » (tâche 1), légende de tête (tâche 2) |
| `client/src/components/TideDayTable.test.ts` | **Modifié** — 3 cas ajoutés + 1 assertion resserrée (tâche 1), 1 cas ajouté (tâche 2) |

Aucun fichier créé, aucun fichier supprimé.

## Contexte utile à qui n'a jamais ouvert ce composant

- Le tableau affiche **une ligne par jour**, pas une ligne par marée. `groupByDay`
  (`client/src/lib/tides.ts:88-94`) regroupe les `FlatTide` par date en `{ date, highs, lows,
  coefficient }`, où `coefficient` est le **maximum** des coefficients des pleines mers.
- Chaque `<td>` porte un `data-label` (`Jour`, `Coef`, `Pleines mers`, `Basses mers`, `Navihan`,
  `Constaté`). Ce `data-label` sert **au CSS mobile** (cartes empilées) **et aux tests**, qui ciblent
  une cellule précise par `row.find('td[data-label="…"]')`. C'est le moyen d'assertion à privilégier :
  une assertion sur le texte de la ligne entière attrape les autres colonnes.
- `formatHeight` (`client/src/lib/format.ts:10-12`) rend `"4.44 m"` — **point décimal**, unité incluse.
- La fixture de test `tides` (`TideDayTable.test.ts:26-51`) contient déjà exactement le cas qu'il faut :
  le **2026-07-22** porte deux pleines mers, **07:10 à coef 71** et **19:18 à coef 69**. Le maximum du
  jour est 71 ; 69 n'apparaît nulle part dans le rendu actuel.

---

### Task 1: Le coefficient rejoint sa pleine mer

**Files:**
- Modify: `client/src/components/TideDayTable.vue:259-269` (cellule « Pleines mers »)
- Test: `client/src/components/TideDayTable.test.ts` (3 cas ajoutés, 1 assertion resserrée à la ligne 100)

**Interfaces:**
- Consomme : `FlatTide.coefficient: number | null` (déjà défini dans `client/src/types.ts`) et
  `day.highs: FlatTide[]` produit par `groupByDay`. Rien de nouveau n'est introduit.
- Produit : aucune interface programmatique. La **chaîne rendue** `coef <n>` devient un point d'appui
  pour les tests de la tâche 2.

- [ ] **Step 1 : Écrire les trois tests qui échouent**

Les ajouter dans `client/src/components/TideDayTable.test.ts`, **juste après** le cas
`it('shows the day coefficient as the max of the day highs', …)` (qui se termine ligne 101), pour que
les quatre cas relatifs au coefficient se lisent ensemble :

```ts
  it('affiche le coefficient de chaque pleine mer, et pas seulement le max du jour', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const row = wrapper.findAll('tbody tr').find(r => r.text().includes('22 juil.'))!;
    const highs = row.find('td[data-label="Pleines mers"]').text();
    expect(highs).toContain('coef 71'); // pleine mer de 07:10
    expect(highs).toContain('coef 69'); // pleine mer de 19:18, masquée jusqu'ici par le max du jour
  });

  it("n'affiche aucun coefficient sur les basses mers", () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const row = wrapper.findAll('tbody tr').find(r => r.text().includes('22 juil.'))!;
    expect(row.find('td[data-label="Basses mers"]').text()).not.toContain('coef');
  });

  it("n'écrit rien pour une pleine mer dont le coefficient est absent", () => {
    // Les graines sont complètes aujourd'hui, mais `check-tides` a déjà trouvé des journées
    // trouées : l'absence doit rester silencieuse, sans « coef — ».
    const sansCoef: FlatTide[] = [
      {
        date: '2026-07-22', time: '07:10', height: 4.44, type: 'high', coefficient: null,
        navihan: { 'Pleine mer': '08:25' }
      }
    ];
    const wrapper = mount(TideDayTable, { props: { tides: sansCoef } });
    const highs = wrapper.find('td[data-label="Pleines mers"]').text();
    expect(highs).toContain('07:10');
    expect(highs).toContain('4.44 m');
    expect(highs).not.toContain('coef');
    expect(highs).not.toContain('—');
  });
```

- [ ] **Step 2 : Lancer ces trois tests pour vérifier qu'ils échouent**

```bash
cd client && npx vitest run src/components/TideDayTable.test.ts -t "coefficient"
```

Attendu : **les deux premiers nouveaux cas échouent**, avec un message de la forme
`expected '07:10 4.44 m 19:18 4.64 m' to contain 'coef 71'`.

Le troisième cas (« n'écrit rien… ») **passe déjà** : rien n'est affiché aujourd'hui, donc l'absence
est trivialement vérifiée. C'est normal et voulu — il fige le comportement pour empêcher qu'une
implémentation ultérieure n'écrive « coef — ». Ne pas chercher à le faire échouer.

- [ ] **Step 3 : Ajouter le fragment dans la cellule « Pleines mers »**

Dans `client/src/components/TideDayTable.vue`, remplacer le bloc de la cellule « Pleines mers »
(lignes 259-269) par :

```html
          <td data-label="Pleines mers">
            <span v-if="!day.highs.length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="h in day.highs" :key="h.time" class="tide-cell text-nowrap">
                <span class="fw-semibold">{{ h.time }}</span>
                <span class="text-muted small ms-1" title="Hauteur d'eau">
                  <i class="bi bi-water"></i> {{ formatHeight(h.height) }}
                </span>
                <!--
                  Le coefficient est une propriété de **cette pleine mer**, pas du jour : la colonne
                  « Coef » n'en montre que le maximum (`groupByDay`), or 143 des 153 jours de la
                  graine en portent deux, avec un écart médian de 4 points. Écrit ici comme la
                  hauteur, à côté de la marée qu'il décrit. Absent → rien, jamais « coef — ».
                -->
                <span
                  v-if="h.coefficient != null"
                  class="text-muted small ms-1"
                  title="Coefficient de marée"
                >coef {{ h.coefficient }}</span>
              </span>
            </span>
          </td>
```

Ne **rien** changer à la cellule « Basses mers » qui suit.

Deux points de vigilance :
- Le `<span>` du coefficient est écrit **sur une seule ligne autour de son contenu**
  (`>coef {{ h.coefficient }}</span>`). Aéré sur trois lignes, Vue élaguerait les blancs de bord et
  le rendu collerait le fragment au précédent — le projet a déjà connu ce défaut sur `WeatherCard`
  (« 3 Bftpetite brise »).
- `.tide-cell` porte `text-nowrap` : heure + hauteur + coefficient restent **insécables** ensemble,
  et c'est `.tide-values` (`flex-wrap`, ligne 377) qui fait passer les marées à la ligne entre elles.
  C'est le comportement voulu ; ne pas retirer `text-nowrap` pour « faire tenir » la cellule.
- Le coefficient rendu est celui du **port sélectionné**, sans effort particulier : `props.tides`
  porte déjà les marées du port choisi (`useTides.windowedTides`), et Étel a ses propres
  coefficients (238 pleines mers, toutes pourvues). La colonne **Navihan** reste, elle, dérivée de
  Port-Tudy — ne pas confondre les deux et aller chercher un coefficient de référence.

- [ ] **Step 4 : Relancer tout le fichier de tests et constater la rupture attendue**

```bash
cd client && npx vitest run src/components/TideDayTable.test.ts
```

Attendu : les trois nouveaux cas passent, et **un cas existant échoue** —
`shows the day coefficient as the max of the day highs`, avec
`expected '… 19:18 4.64 m coef 69 …' not to contain '69'`.

**Ce n'est pas une régression.** Ce test assère sur le texte de la **ligne entière** alors qu'il
décrit le comportement de la **colonne Coef** ; 69 est désormais affiché légitimement, dans une autre
cellule. L'assertion doit être resserrée sur la cellule, comme le fait déjà le cas
`garde les basses mers et les pastilles Navihan des jours retenus` (ligne 369).

- [ ] **Step 5 : Resserrer l'assertion du test existant**

Dans `client/src/components/TideDayTable.test.ts`, remplacer le cas des lignes 96-101 par :

```ts
  it('shows the day coefficient as the max of the day highs', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    // Assertion portée sur la **cellule** et non sur la ligne : depuis que chaque pleine mer
    // affiche son propre coefficient, 69 apparaît légitimement dans « Pleines mers ».
    const coef = wrapper.findAll('tbody tr')[0].find('td[data-label="Coef"]').text();
    expect(coef).toContain('71');
    expect(coef).not.toContain('69'); // la colonne Coef ne montre que le max du jour
  });
```

- [ ] **Step 6 : Vérifier que tout le fichier est vert**

```bash
cd client && npx vitest run src/components/TideDayTable.test.ts
```

Attendu : **33 tests passés** (30 existants + 3 ajoutés), 0 échec.

- [ ] **Step 7 : Vérifier les types**

```bash
cd /home/erwan/repositories/marees-port-tudy && npm -w client run type-check
```

Attendu : aucune sortie d'erreur, code de retour 0. **Cette étape n'est pas optionnelle** : Vitest
passe par esbuild et ne vérifie aucun type, une erreur de typage laisserait tous les tests au vert.

- [ ] **Step 8 : Commit**

```bash
cd /home/erwan/repositories/marees-port-tudy
git add client/src/components/TideDayTable.vue client/src/components/TideDayTable.test.ts
git commit -F - <<'MSG'
feat(tableau): affiche le coefficient de chaque pleine mer

La colonne « Coef » ne montre que le maximum du jour retenu par
groupByDay, alors que 143 jours sur 153 portent deux pleines mers de
coefficients différents, avec un écart médian de 4 points. Le second
chiffre n'apparaissait nulle part dans le tableau.

Chaque pleine mer porte désormais son coefficient à côté de son heure et
de sa hauteur. La colonne « Coef » reste inchangée : elle est le miroir
du filtre « Coef min/max », qui porte sur le max du jour.

L'assertion du test du max est resserrée sur la cellule « Coef » : elle
portait sur la ligne entière, où 69 s'affiche maintenant légitimement.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 2: Annoncer le coefficient dans la légende de lecture

**Files:**
- Modify: `client/src/components/TideDayTable.vue:183-186` (légende de tête)
- Test: `client/src/components/TideDayTable.test.ts` (1 cas ajouté)

**Interfaces:**
- Consomme : la chaîne `coef <n>` rendue par la tâche 1. Aucune autre dépendance.
- Produit : rien de programmatique.

**Pourquoi une tâche distincte :** la tâche 1 est fonctionnelle sans elle, et le libellé de la légende
est le point le plus discutable du lot — un relecteur peut vouloir le reformuler sans remettre en
cause l'affichage.

- [ ] **Step 1 : Écrire le test qui échoue**

L'ajouter dans `client/src/components/TideDayTable.test.ts`, juste après le cas
`it("n'écrit rien pour une pleine mer dont le coefficient est absent", …)` de la tâche 1 :

```ts
  it('annonce le coefficient dans la légende de lecture des marées', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    expect(wrapper.text()).toContain("hauteur d'eau (m)");
    expect(wrapper.text()).toContain('coefficient (pleines mers)');
  });
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd client && npx vitest run src/components/TideDayTable.test.ts -t "légende de lecture"
```

Attendu : **FAIL**, avec un message contenant `to contain 'coefficient (pleines mers)'`.

- [ ] **Step 3 : Compléter la légende**

Dans `client/src/components/TideDayTable.vue`, remplacer le bloc des lignes 183-186 par :

```html
  <div class="small text-muted px-3 pt-2">
    Chaque marée : <span class="fw-semibold text-body">heure</span>
    · <i class="bi bi-water text-primary"></i> <span class="text-body">hauteur d'eau (m)</span>
    · <span class="text-body">coef</span> <span>coefficient (pleines mers)</span>
  </div>
```

Le mot « coef » est écrit plutôt qu'iconifié : `coefBand` (`client/src/lib/format.ts:26-33`) n'expose
pas d'icône propre au coefficient — les siennes marquent les bandes ≥ 95 seulement — et un nombre nu
après « 4.44 m » serait ambigu.

- [ ] **Step 4 : Vérifier que le test passe**

```bash
cd client && npx vitest run src/components/TideDayTable.test.ts
```

Attendu : **34 tests passés**, 0 échec.

- [ ] **Step 5 : Commit**

```bash
cd /home/erwan/repositories/marees-port-tudy
git add client/src/components/TideDayTable.vue client/src/components/TideDayTable.test.ts
git commit -F - <<'MSG'
feat(tableau): annonce le coefficient dans la légende des marées

La légende de tête énumère ce que porte chaque marée ; le coefficient
venant de s'y ajouter, elle le nomme. Le mot « coef » est écrit plutôt
qu'iconifié : coefBand n'a pas d'icône propre au coefficient, et un
nombre nu après la hauteur serait ambigu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: Vérification d'ensemble et carte du projet

**Files:**
- Modify: `CLAUDE.md` (section « Tableau `TideDayTable.vue` »)

**Interfaces:** aucune.

- [ ] **Step 1 : Lancer la suite complète des deux workspaces**

```bash
cd /home/erwan/repositories/marees-port-tudy && npm test
```

Attendu : serveur et client verts, 0 échec. Un échec **aléatoire et non reproductible** sur ce poste
vient en général de la dérive d'horloge WSL, pas du code : relancer le fichier seul pour trancher
avant d'incriminer le changement.

- [ ] **Step 2 : Vérifier les types des deux workspaces**

```bash
cd /home/erwan/repositories/marees-port-tudy && npm run type-check
```

Attendu : aucune erreur.

- [ ] **Step 3 : Mettre la carte du projet à jour**

Dans `CLAUDE.md`, section « Tableau `TideDayTable.vue` », la phrase décrivant les cellules est
aujourd'hui :

> Chaque cellule Pleines/Basses mers liste les marées du **port sélectionné** en `HH:MM · 🌊 h,hh m`
> (heure + hauteur d'eau inline, icône `bi-water` + légende) ; le **Coef** du jour = max des coef des
> pleines mers (Port-Tudy).

La remplacer par :

> Chaque cellule Pleines/Basses mers liste les marées du **port sélectionné** en `HH:MM · 🌊 h,hh m`
> (heure + hauteur d'eau inline, icône `bi-water` + légende) ; **chaque pleine mer porte en plus son
> propre coefficient** (`coef 71`, absent → rien, jamais « coef — »), une basse mer n'en ayant pas.
> La colonne **Coef** garde, elle, le **max des coef des pleines mers** du jour : c'est le miroir du
> filtre « Coef min/max », qui sélectionne des lignes sur ce max. ⚠️ Le maximum apparaît donc deux
> fois par ligne — redondance **assumée**, la pastille colorée restant le repère de balayage vertical.
> Corollaire pour les tests : une assertion sur un coefficient doit cibler
> `td[data-label="Coef"]` et non le texte de la ligne, où les deux coefficients sont désormais écrits.

- [ ] **Step 4 : Commit**

```bash
cd /home/erwan/repositories/marees-port-tudy
git add CLAUDE.md
git commit -F - <<'MSG'
docs: met la carte du projet à jour pour le coefficient par pleine mer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

## Hors périmètre (ne pas faire)

- Colorer chaque coefficient accolé selon sa bande (`coefBand`). La couleur reste l'affaire de la
  pastille de ligne.
- Supprimer ou dédoubler la colonne « Coef ».
- Filtrer au grain de la marée plutôt qu'au grain du jour.
- Toucher à `StatCards`, `CoefChart`, `lib/fishingStats.ts` ou à quoi que ce soit côté serveur.
- Ajouter du CSS. Si la cellule paraît à l'étroit sur un écran donné, le signaler plutôt que de
  modifier `.tide-values` / `.tide-cell` : ces règles servent aussi la cellule « Basses mers ».
