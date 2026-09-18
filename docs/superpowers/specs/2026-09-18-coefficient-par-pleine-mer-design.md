# Coefficient de chaque pleine mer dans le tableau « Horaires par jour »

**Date** : 2026-09-18
**Portée** : client uniquement — `client/src/components/TideDayTable.vue`

## Besoin

Le tableau « Horaires par jour » affiche **une ligne par jour** et **un seul coefficient** par ligne.
Or une journée porte le plus souvent **deux pleines mers, chacune avec son propre coefficient**.
`groupByDay` (`client/src/lib/tides.ts:92`) retient le **maximum** du jour, et le second chiffre
n'apparaît nulle part dans le tableau.

Mesuré sur la graine Port-Tudy (153 jours) :

| Fait | Valeur |
|---|---|
| Jours portant 2 coefficients | 143 / 153 |
| Jours où les deux sont **égaux** | 12 |
| Écart médian entre les deux | **4 points** |
| Écart maximal | 12 points |
| Jours à un seul coefficient (une seule pleine mer) | 10 |

Ce n'est donc pas un cas marginal : **neuf jours sur dix, la ligne tait une valeur qui diffère de
celle affichée**, en moyenne de 4 points — assez pour franchir les seuils de bande de `coefBand`
(45, 70, 95, 100) et faire lire « vive-eau » là où la seconde marée est moyenne.

Le graphe des coefficients (`CoefChart.vue:23`) montre bien, lui, **une barre par pleine mer**.
L'information existe dans les données et transite déjà jusqu'au composant : `FlatTide.coefficient`
est présent sur chaque pleine mer, il est simplement ignoré à l'affichage du tableau.

## Décisions

| Sujet | Décision |
|---|---|
| Emplacement | **Accolé à sa pleine mer**, dans la cellule « Pleines mers » |
| Colonne « Coef » | **Conservée telle quelle** — max du jour, pastille de bande |
| Cellule « Basses mers » | **Inchangée** — une basse mer n'a pas de coefficient |
| Coefficient absent | **Rien n'est écrit** — pas de « coef — » |
| Port | Le coefficient du **port sélectionné**, comme l'heure et la hauteur |
| Repère de lecture | Le mot **« coef »**, et non une icône |
| Serveur | **Aucun changement** — contrat REST et graines intacts |

## Pourquoi accoler, plutôt que doubler la colonne « Coef »

Trois formes étaient en lice : accoler le coefficient à sa marée, poser deux pastilles dans la
colonne « Coef », ou y écrire une plage « 95 → 97 ».

Les deux dernières affichent les deux chiffres **sans dire lequel va avec quelle marée**. La question
posée est précisément celle-là : sur un jour à 95 puis 97, laquelle des deux pleines mers porte le 97.
Une plage répond encore moins — « 95 → 97 » n'aide pas à choisir un créneau.

Un appariement implicite par position verticale (pastilles de la colonne « Coef » alignées sur les
marées de la colonne voisine) a été envisagé puis écarté : `.tide-values` est en `inline-flex` avec
`flex-wrap` (`TideDayTable.vue:377`), les marées sont donc **côte à côte** et repassent à la ligne
selon la largeur. Aucun alignement entre deux colonnes ne tiendrait.

Accoler suit enfin le patron déjà en place pour la **hauteur d'eau**, qui est de la même nature : une
propriété de cette marée-là, écrite à côté d'elle.

## Pourquoi la colonne « Coef » est conservée malgré la redondance

Le maximum du jour apparaîtra deux fois sur la plupart des lignes : dans la pastille et à côté de la
pleine mer concernée. C'est accepté, pour deux raisons.

- **Le filtre « Coef min/max » porte sur le max du jour** (`matchesDayFilters`, `lib/tides.ts:155`) :
  il sélectionne des **lignes**, et un jour sans coefficient est écarté dès qu'une borne est posée.
  Supprimer la colonne masquerait la valeur sur laquelle l'utilisateur filtre.
- **La pastille colorée est le repère de balayage vertical** de la ligne. Éclatée en une pastille par
  marée, une ligne n'aurait plus de bande unique, et l'on perdrait la lecture d'un coup d'œil des
  grandes marées.

La variante « n'accoler le coefficient que lorsqu'il diffère du max » supprimerait la redondance mais
rendrait la lecture asymétrique : une pleine mer chiffrée, l'autre nue, l'absence se lisant comme
« pas de coefficient » alors qu'elle signifierait « c'est le max ». Les 12 jours à coefficients égaux
n'afficheraient alors plus aucun chiffre. Écartée.

## Design

Dans `TideDayTable.vue`, la cellule **Pleines mers** gagne un troisième fragment par marée, calqué
sur celui de la hauteur (`text-muted small ms-1` + `title`) :

```
04:12  🌊 5,20 m  coef 95      16:41  🌊 5,31 m  coef 97
```

Le fragment est rendu **conditionnellement** (`v-if="h.coefficient != null"`). Les graines sont
complètes aujourd'hui (296 coefficients pour 296 pleines mers à Port-Tudy, 238 à Étel), mais
`check-tides` a déjà trouvé des journées trouées : une absence doit rester silencieuse plutôt que de
produire une colonne de tirets.

La cellule **Basses mers** n'est pas touchée.

La légende de tête passe de :

> Chaque marée : **heure** · 🌊 hauteur d'eau (m)

à :

> Chaque marée : **heure** · 🌊 hauteur d'eau (m) · **coef** coefficient (pleines mers)

Le mot « coef » est écrit plutôt qu'iconifié : `coefBand` n'expose pas d'icône propre au coefficient
— les siennes marquent les bandes ≥ 95 seulement — et un nombre nu après « 5,20 m » serait ambigu.

Aucun style nouveau n'est nécessaire : le `flex-wrap` de `.tide-values` absorbe la largeur
supplémentaire, et sur mobile (cartes empilées, valeurs alignées à droite) la marée passe à la ligne
selon le comportement déjà en place.

Le coefficient rendu est celui du **port sélectionné** : Étel porte ses propres coefficients, et la
règle du projet veut que les lignes du tableau soient les marées de ce port (ses propres heure,
hauteur et coefficient). La colonne **Navihan** reste, elle, dérivée de Port-Tudy — inchangé.

## Ce qui ne change pas

- `groupByDay` — `coefficient` du jour reste le **max des pleines mers**.
- `matchesDayFilters` et la barre `TideFiltersBar` — le filtre continue de porter sur ce max.
- `coefBand`, `CoefChart`, `StatCards`, `lib/fishingStats.ts`, `dayCoefficient`.
- Le serveur : routes, contrat REST, schéma de base et graines.

## Tests

Dans `client/src/components/TideDayTable.test.ts` (30 cas aujourd'hui), quatre ajouts :

1. Un jour à deux pleines mers de coefficients différents affiche **95 et 97** dans la cellule
   « Pleines mers » — et non deux fois le maximum.
2. La cellule « Basses mers » n'affiche **aucun** coefficient.
3. Une pleine mer dont le `coefficient` est `null` n'affiche **rien** (ni « coef », ni tiret).
4. Non-régression : la colonne « Coef » affiche toujours le **maximum du jour**, et le filtre
   « Coef min/max » continue de sélectionner les mêmes lignes.

## Hors périmètre

- Filtrer au grain de la marée plutôt qu'au grain du jour. Le tableau affiche une ligne par jour ;
  filtrer des marées viderait des **cellules** au lieu de sélectionner des lignes — l'erreur que
  l'issue #10 a précisément corrigée.
- Colorer chaque coefficient accolé selon sa bande. La couleur reste l'affaire de la pastille de
  ligne ; deux jeux de couleurs par ligne brouilleraient le balayage vertical.
- Toute modification de `StatCards`, du graphe des coefficients ou du bilan de pêche.
