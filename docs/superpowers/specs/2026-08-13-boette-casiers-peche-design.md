# Boëtte des casiers (issue #3, suite)

**Date** : 2026-08-13
**Issue** : #3 — carnet de pêche

## Besoin

Une sortie enregistre sa date, son créneau, ses notes, sa météo figée et N lignes de prises (espèce,
engin, quantité, taille/poids, gardé). Rien ne dit si **les casiers ont été boëttés**. C'est
pourtant le geste qui conditionne le rendement d'une pose : sans l'information, le graphique
« prises par sortie » annoncé comme évolution future mêlerait des casiers appâtés et des casiers
posés à vide, et ne voudrait rien dire.

## Décisions

| Sujet | Décision |
|---|---|
| Grain | **Un indicateur au niveau de la sortie**, pas par ligne de prise |
| Nature | **Oui / non** — on ne saisit **pas** avec quoi on a boëtté |
| Sorties antérieures | **« Non »** (`baited INTEGER NOT NULL DEFAULT 0`), pas de troisième état |
| Saisie | Case à cocher **toujours visible**, sous les notes |
| Libellé | **« Casiers boëttés »** |
| Affichage sur la carte | **Seul le « oui » s'affiche** |
| Réécriture au `PUT` | **Oui** — contrairement à la météo |

## Pourquoi un booléen et non un référentiel de boëttes

Le patron `fishing_refs` était disponible et tentant : une troisième valeur de `kind` (`'bait'`), une
troisième section dans le panneau « Espèces et engins », les pluriels et l'ordre réglable gratuits. Il
est écarté parce que **le besoin exprimé est un oui/non** : savoir *si* on a boëtté, pas *avec quoi*.
Une nomenclature de boëttes serait une donnée que personne ne saisirait, et un `<select>` de plus
dans un formulaire qu'on remplit debout sur une cale. Si le besoin de la matière apparaît un jour,
il s'ajoutera par-dessus ce booléen sans le contredire.

## Pourquoi la case reste toujours visible

La tentation symétrique était de n'afficher la case que lorsqu'un casier est en jeu. Deux obstacles :

- **`fishing_refs` ne sait pas ce qu'est un casier.** Un engin n'a qu'un `kind` (`gear`), un `label`
  et un pluriel. Le deviner sur le libellé (« casier… ») est exactement ce que le projet s'interdit
  déjà pour les pluriels, et il faudrait sinon un drapeau de plus sur le référentiel — beaucoup de
  schéma pour masquer une case à cocher.
- **Une sortie bredouille au casier ne porte aucune ligne de prise.** La case disparaîtrait donc
  précisément dans le cas où l'information est la plus intéressante : les casiers ont été posés,
  boëttés, et n'ont rien donné.

## Pourquoi « non » par défaut, et pourquoi le « non » ne s'affiche pas

Deux décisions distinctes, qui pourraient sembler se contredire.

La colonne est `NOT NULL DEFAULT 0` : les sorties déjà saisies deviennent « non boëttées », plutôt
que de porter un troisième état « non renseigné » qu'il faudrait ensuite gérer partout — dans le
formulaire (case indéterminée), sur la carte, et dans les futurs agrégats. Le carnet compte quelques
dizaines de sorties : l'utilisateur sait ce qu'il a fait, et corrigera au besoin.

Mais **la carte n'affiche la mention que si elle est vraie**. Écrire « Casiers sans boëtte » sur
chaque sortie à la ligne serait un non-sens, et l'écrire sur toutes les sorties antérieures
présenterait comme constaté un négatif qu'on n'a jamais saisi. L'absence de mention se lit « rien à
signaler », pas « négatif constaté ».

## Design

### Serveur

**Migration v9** (`db/index.ts`) :

```sql
ALTER TABLE fishing_trips ADD COLUMN baited INTEGER NOT NULL DEFAULT 0;
```

Précédée de la garde `PRAGMA table_info(fishing_trips)` du patron v3 / v6 / v8 — `ADD COLUMN` n'est
pas idempotent en SQLite. Le `NOT NULL` n'est permis que parce que le `DEFAULT` est non nul.

**`db/fishingRepository.ts`** : `baited: boolean` **obligatoire** sur `FishingTrip` **et**
`FishingTripInput`. Pas d'optionnel : un champ facultatif se ferait oublier silencieusement par un
appelant, là où un champ requis fait échouer `npm run type-check`. Lecture `baited: row.baited === 1`
(patron de `kept`), écriture `input.baited ? 1 : 0`.

⚠️ **Le `PUT` réécrit ce champ**, à la différence de `weather`. La règle du projet n'est pas « le
`PUT` ne touche à rien » mais « le `PUT` ne recapture pas ce qui n'est pas reproductible » : la météo
d'un jour passé ne peut pas être retrouvée, la boëtte est une donnée saisie, corrigeable comme les
notes.

**`routes/fishing.ts`** : dans `parseTrip`, `baited: o.baited === true`. Coercition et non validation
stricte, sur le modèle de `kept: o.kept !== false` de `parseCatch` — la seule différence est le
défaut, faux ici, vrai là-bas. Une valeur non booléenne (`"oui"`, `1`) vaut donc `false` **sans
400** : c'est un booléen d'agrément, pas une clé.

### Client

- `types.ts` — `baited: boolean` sur `FishingTrip` et `FishingTripInput` (miroir du contrat REST).
- `FishingTripForm.vue` — `form.baited`, case à cocher `data-test="baited"` **sous les notes**, sur
  le patron du `form-check` « Gardé » d'une ligne de prise. En édition, `reset()` recopie
  `initial.baited` ; en création, `false`.
- `FishingTripCard.vue` — ligne `.trip-baited` **indépendante** de `.trip-gears` (dont le
  `v-if="gearsUsed.length"` mangerait la mention sur une sortie bredouille), rendue seulement si
  `trip.baited`.

## Tests

**Serveur**

- `db/index.test.ts` — `user_version` à 9 ; la colonne `baited` existe après migration ; rejeu du
  palier depuis `user_version = 8` sans erreur.
- `db/fishingRepository.test.ts` — aller-retour `true` ; défaut `false` ; `updateTrip` **bascule** la
  valeur (contraste explicite avec le test qui vérifie que `weather` n'est pas touché) ; ligne pré-v9
  insérée en SQL brut sans la colonne → relue `false`.
- `routes/fishing.test.ts` — `POST { baited: true }` → 201 avec `baited: true` ; champ absent →
  `false` ; valeur non booléenne → `false` sans 400 ; le `PUT` réécrit bien la valeur.

**Client**

- `FishingTripForm.test.ts` — `save` émet `baited: false` par défaut, `true` une fois coché ;
  l'édition d'une sortie boëttée pré-coche la case.
- `FishingTripCard.test.ts` — `.trip-baited` présent si `baited`, absent sinon, et **présent sur une
  sortie sans prise**.

`npm run type-check` en plus de `npm test` : Vitest passe par esbuild et ne vérifie aucun type — or
c'est ici le filet principal, `baited` étant requis dans `FishingTripInput`.

## Hors périmètre

- **La matière de la boëtte** (référentiel `bait`, texte libre) — cf. décision ci-dessus.
- Une boëtte **par ligne de prise** ou **par casier posé** : il faudrait une table d'effort de pêche
  distincte des prises, chantier sans rapport avec la demande.
- Toute statistique ou graphique exploitant le champ : l'issue #3 annonce les graphiques comme une
  évolution future, ce chantier ne fait que rendre la donnée disponible.
- Un filtre « sorties boëttées » sur le carnet : la liste n'a pas encore de barre de filtres, et
  quelques dizaines de sorties par an ne la justifient toujours pas.
