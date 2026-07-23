# Navihan : afficher pleine mer + basse mer dans le tableau (issue #6)

**Date** : 2026-07-23
**Issue** : #6 — « Qu'on choisisse Port-Tudy ou Étel, on veut afficher les marées haute et
basse pour Navihan. »

## Contexte / constat

Les heures Navihan de **pleine mer** et de **basse mer** sont **déjà calculées** de bout en
bout, pour les deux ports :

- Serveur (`Maree.toExtreme`) et client (`lib/navihan.computeNavihan`) produisent déjà, pour
  chaque marée, les clés : basse mer → `Basse mer` (+1h15) **et** `A flot` (+2h40) ; pleine mer
  → `Pleine mer` (+1h15).
- `useTides.windowedTides` recalcule `navihan` à partir du `refTime` **Port-Tudy** apparié
  (`matchNavihanReference`), donc les heures Navihan restent dérivées de Port-Tudy même quand
  Étel est sélectionné.

**Seul manque** : `TideDayTable.vue` n'affiche que `A flot` (colonne « Remise à flot »). Les
clés `navihan['Basse mer']` et `navihan['Pleine mer']` sont calculées puis jetées à l'affichage.

**Conclusion** : correction purement côté client, dans `TideDayTable.vue` + son test. Aucun
changement serveur, ni de `useTides` / `matchNavihanReference` / `computeNavihan`.

## Design

La colonne « Remise à flot » devient une colonne **« Navihan »** regroupant, par jour, 3 groupes
de pastilles dans cet ordre vertical (l'à flot au milieu, suivant le cycle physique
basse mer → remise à flot → pleine mer) :

```
Navihan
──────────────────────────
BM     🟡 01:45   🟡 14:20
Flot   🟢 03:10   🟢 15:45
PM     🔵 07:27   🔵 19:55
```

- **BM** (Basse mer) ← `lows[].navihan['Basse mer']`
- **Flot** (À flot) ← `lows[].navihan['A flot']` (l'ancienne « remise à flot »)
- **PM** (Pleine mer) ← `highs[].navihan['Pleine mer']`
- Chaque ligne est préfixée d'un **libellé court** (`BM` / `Flot` / `PM`).
- Un groupe sans valeur est masqué ; la cellule entière affiche « — » si aucune des 3 valeurs.

### Couleurs (pastilles subtle Bootstrap 5.3, thèmes clair/sombre)

Palette sémantique « niveau d'eau » (feu vert = on peut sortir) :

- Basse mer → `warning-subtle` (ambre — peu d'eau)
- À flot → `success-subtle` (vert — feu vert pour sortir ; remplace le teal `.afloat-pill`)
- Pleine mer → `primary-subtle` (bleu — pleine eau)

### En-tête & légende

- Titre de colonne : **« Navihan »** + infobulle mise à jour (3 heures dérivées, toujours de
  Port-Tudy).
- `data-label="Navihan"` pour l'empilement mobile.
- **Ajouter une légende** (près de l'encart existant en haut du tableau) définissant les
  préfixes/couleurs : `BM` = Basse mer, `Flot` = À flot (remise à flot), `PM` = Pleine mer —
  heures Navihan dérivées de Port-Tudy.

## Tests

`client/src/components/TideDayTable.test.ts` :

- Enrichir les fixtures `navihan` avec les clés `Basse mer` (lows) et `Pleine mer` (highs) en
  plus de `A flot`.
- Vérifier que les 3 types de pastilles s'affichent (heures BM, Flot, PM) ; conserver
  l'assertion existante sur l'à flot (`04:19`).
- Ajuster toute assertion qui dépendait du libellé « Remise à flot ».

## Hors périmètre

- Aucune modification serveur.
- Pas de changement de `computeNavihan` / `matchNavihanReference` / `useTides`.
- Encart explicatif du `Dashboard` : inchangé (la légende du tableau suffit).
