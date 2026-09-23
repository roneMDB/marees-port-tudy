# Engin par défaut d'une espèce (issue #3, suite)

**Date** : 2026-09-23
**Issue** : #3 — carnet de pêche

## Besoin

Dans le formulaire d'une sortie, chaque prise porte une espèce et un engin. Aujourd'hui une prise
ajoutée démarre sur le **premier engin** de la liste et changer d'espèce ne touche pas à l'engin :
il faut le corriger à la main à chaque crevette. Or, dans les faits, l'espèce dit presque toujours
l'engin — les 27 prises de la base de prod (rapatriée le 2026-09-23) le confirment : étrilles,
tourteaux, moussettes, homards au casier à crabes, crevettes bouquet au casier à crevettes (une
seule exception, un congre au casier à crevettes).

Choisir l'espèce doit donc **pré-sélectionner** son engin habituel, **sans empêcher** d'en choisir
un autre.

Au passage : ajouter l'engin **« Casier à morgates »** et l'espèce **« Morgate »**, reliés.

## Décisions

| Sujet | Décision |
|---|---|
| Où vit le lien | **Donnée saisie** sur l'espèce (`default_gear_id`), éditable dans le panneau admin |
| Écarté | Déduction de l'historique des prises (rien pour une espèce neuve, une erreur de saisie devient la règle) ; table codée en dur (une espèce ajoutée au panneau n'en profiterait jamais) |
| Contrainte | **Pas de clé étrangère**, comme pour les prises ; validation explicite dans la route |
| Suppression d'un engin utilisé comme défaut | **Permise** : le défaut des espèces concernées est remis à `NULL` (ce n'est qu'une commodité de saisie, pas une donnée historique) |
| Déclencheur côté formulaire | **Le changement d'espèce par l'utilisateur**, et l'ajout d'une prise ; jamais le chargement d'une sortie existante |
| Engin changé à la main | **Respecté** tant que l'espèce ne change pas |
| Espèce sans défaut | L'engin courant **ne bouge pas** |

## Données (serveur)

### Schéma v10

Colonne `fishing_refs.default_gear_id TEXT` (nullable), ajoutée par un palier `if (version < 10)`
qui teste d'abord `PRAGMA table_info` (`ADD COLUMN` n'est pas idempotent, cf. v3/v6/v8/v9). Elle
n'a de sens que pour `kind = 'species'` ; un engin la garde à `NULL`.

### Graine (`service/fishingSeed.ts`)

`FishingRef` gagne `defaultGearId: string | null`. Ajouts :

- engin `casier-morgates` — « Casier à morgates » / « Casiers à morgates » (même forme que
  « Casier à crabes », complément au pluriel), placé après `casier-crevettes` ;
- espèces `moussette` — « Moussette » / « Moussettes », `homard` — « Homard » / « Homards » (déjà
  présentes en prod, ajoutées par le panneau : les mêmes ids), et `morgate` — « Morgate » /
  « Morgates ».

Défauts de la graine :

| Engin | Espèces |
|---|---|
| `casier-crabes` | étrille, tourteau, araignée, moussette, homard |
| `casier-crevettes` | crevette bouquet, crevette grise |
| `casier-morgates` | morgate |
| aucun | toutes les autres |

### Mise à niveau d'une base existante — **une seule fois, dans le palier v10**

Contrairement au pluriel (`backfillSeedPlurals`, rejoué à chaque `initStorage`), ce complément est
fait **dans la migration**, donc une seule fois. Raison : pour le pluriel, `NULL` voulait toujours
dire « jamais renseigné » ; ici, `NULL` est aussi un **choix légitime** (« aucun défaut »). Rejoué
à chaque démarrage, le complément remettrait un défaut que l'utilisateur a retiré. C'est pour cela
que l'étape n'est déclenchée **que lorsque le palier vient d'ajouter la colonne**
`default_gear_id` (jamais quand elle existe déjà) : un rollback vers un ancien binaire remet
`user_version` en arrière sans jamais retirer la colonne, et une re-migration qui suivrait ne
rejoue donc pas le complément.

Le palier v10, dans une transaction :

1. **insère** les entrées de la graine dont l'**id est absent** (en prod : `casier-morgates` et
   `morgate`), `sort_order` = max + 1 à la suite (le regroupement par `kind` se fait côté client) ;
2. pose `default_gear_id` sur les espèces **de la graine** dont l'id existe, dont le **libellé est
   encore celui de la graine** (un libellé renommé n'est plus l'espèce dont on connaît l'engin) et
   dont l'engin par défaut **existe** en base avec `kind = 'gear'`.

Le palier ne fait **rien** si `fishing_refs` est **vide** : une base neuve passe par v10 avant
l'amorçage, et c'est `seedFishingRefsIfEmpty` qui l'amorce ensuite, défauts compris. Sans cette
garde, la migration peuplerait aussi les bases `:memory:` des tests, qui supposent une table vide
après `openDb`.

⚠️ Conséquence à connaître : l'étape 1 ne réinsère **jamais** une entrée supprimée *après* la v10,
puisqu'elle ne tourne qu'une fois. Une suppression reste une suppression.

### Repository (`db/fishingRefsRepository.ts`)

- `toRef` renvoie `defaultGearId: r.default_gear_id ?? null` ; toutes les lectures sélectionnent la
  colonne.
- `addRef(db, kind, label, labelPlural?, defaultGearId?)` et `updateRef(db, id, label,
  labelPlural?, defaultGearId?)` : `defaultGearId` vide ou absent → `NULL` ; forcé à `NULL` pour
  un engin.
- `deleteRef` : quand l'entrée supprimée est un engin, `UPDATE fishing_refs SET default_gear_id =
  NULL WHERE default_gear_id = ?` dans la même transaction. La garde `in-use` (prises) est
  inchangée.
- `insertSeed` (donc `seedFishingRefsIfEmpty` et `resetFishingRefs`) écrit `default_gear_id`. Les
  entrées **conservées** par le reset gardent le leur, sauf s'il désigne un engin qui n'existe plus
  → `NULL`.
- La validation réemploie `refExists(db, id, 'gear')`, qui existe déjà.

### Routes (`routes/fishing.ts`)

`POST /fishing/refs` et `PUT /fishing/refs/:id` acceptent un `defaultGearId` **facultatif** :

- absent, `null` ou `''` → aucun défaut (le `PUT` **remplace** l'entrée, comme il le fait déjà
  pour `labelPlural`) ;
- chaîne ne désignant pas un engin existant (id inconnu, ou id d'une espèce) → **400** ;
- ignoré (forcé à `NULL`) pour un `kind = 'gear'`. Pour le `PUT`, le `kind` est lu en base.

## Client

### Types et API

- `types.ts` : `FishingRef.defaultGearId: string | null`.
- `api/fishing.ts` : `addRef(kind, label, labelPlural, defaultGearId)` et `updateRef(id, label,
  labelPlural, defaultGearId)` envoient le champ ; `useFishingRefs.add`/`update` le relaient.

### Règle pure (`lib/fishing.ts`)

```ts
/**
 * Engin à pré-sélectionner pour une espèce : son `defaultGearId` s'il désigne un engin connu,
 * sinon `null` (l'appelant garde alors l'engin courant).
 */
export function defaultGearFor(speciesId: string, species: FishingRef[], gears: FishingRef[]): string | null
```

Un défaut qui pointerait vers un engin absent de `gears` (référentiel modifié dans un autre onglet)
vaut `null` : on ne sélectionne jamais une option qui n'existe pas.

### Formulaire (`FishingTripForm.vue`)

- Le `<select>` d'espèce reçoit un `@change="onSpeciesChange(c)"` : si `defaultGearFor` rend un
  engin, `c.gearId` le prend ; sinon rien ne change. `@change` et non un `watch` : un `watch` sur
  `speciesId` se déclencherait aussi au **chargement** d'une sortie existante (`props.initial`), et
  réécrirait un engin saisi.
- `addCatch` : l'engin initial est `defaultGearFor(species[0].id, …) ?? gears[0]?.id ?? ''`.
- Le `<select>` d'engin reste libre ; un choix manuel n'est écrasé qu'au prochain changement
  d'espèce de **cette** ligne.

### Panneau (`FishingRefsPanel.vue`)

- Ajout et édition inline d'une **espèce** : un `<select>` « Engin par défaut » (`— aucun —` + les
  engins, dans leur ordre). Absent pour un engin.
- Affichage : l'engin par défaut suit le libellé dans la liste des espèces (même traitement discret
  que le pluriel, `text-muted small`), rien si aucun.

## Tests

**Serveur**

- migration v10 : colonne ajoutée ; sur une base v9 portant les 19 entrées de la prod,
  `casier-morgates` et `morgate` sont insérés et les défauts posés ; une espèce de la graine
  **renommée** ne reçoit pas de défaut ; migration rejouée (`user_version` remis à 9) sans erreur
  ni doublon ;
- une base neuve a tous les défauts de la graine ;
- `POST`/`PUT` : défaut valide enregistré et relu ; id inconnu → 400 ; id d'une espèce → 400 ;
  `''` → `null` ; ignoré pour un engin ;
- `DELETE` d'un engin servant de défaut → 204 et défaut remis à `null` ;
- `reset` : défauts de la graine rétablis ; une entrée conservée garde le sien.

**Client**

- `defaultGearFor` : défaut connu, pas de défaut, défaut pointant vers un engin absent, espèce
  inconnue ;
- formulaire : choisir « Crevette bouquet » sélectionne le casier à crevettes ; changer ensuite
  l'engin à la main est conservé ; choisir une espèce sans défaut ne touche pas à l'engin ;
  ouvrir une sortie existante ne modifie aucun engin ; une prise ajoutée démarre sur l'engin par
  défaut de la première espèce ;
- panneau : le sélecteur est présent pour une espèce, absent pour un engin, et sa valeur part dans
  l'appel `add`/`update`.

## Documentation

`CLAUDE.md` : schéma **v10**, colonne `default_gear_id`, la raison pour laquelle le complément est
fait **dans la migration** (et non rejoué comme `backfillSeedPlurals`), la suppression d'engin qui
efface le défaut, et le `@change` (pas de `watch`) du formulaire.

## Hors périmètre

- Déduire un défaut de l'historique des prises.
- Plusieurs engins par défaut pour une espèce.
- Rendre la suppression d'un engin impossible tant qu'il sert de défaut.
