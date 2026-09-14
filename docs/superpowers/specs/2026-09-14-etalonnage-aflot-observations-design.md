# Étalonner l'estimation de remise à flot sur les heures constatées

**Date** : 2026-09-14
**Statut** : validé
**Corrige** : `2026-07-24-navihan-coefficient-design.md` §5 (calibration) — le modèle physique de ce
spec est confirmé, sa calibration et son implémentation sont fausses.

## 1. Point de départ

L'issue #4 a introduit trois heures de remise à flot par basse mer :

| Valeur | Modèle | Où |
|---|---|---|
| « Remise à flot » | décalage fixe `navihan.aFlot` | cartes, marégramme, carnet de pêche |
| « Estimation » | seuil de hauteur `aFlotThreshold` | **tableau du dashboard uniquement** |
| « Constaté » | saisie (`aflot_observations`) | colonne « Constaté » |

Le spec de juillet notait (§5) qu'aucune observation de terrain n'existait alors : le seuil 2,80 m
avait été **rétro-calibré** pour reproduire le décalage fixe au coefficient médian. Et (§8) la table
`aflot_observations` était désignée comme « le jeu d'observations destiné à caler le seuil sur le
terrain plus tard ». Ce spec est ce « plus tard ».

**18 relevés** sont saisis (25/07 → 13/09/2026) : coefficients 32 à 101, basses mers de 0,73 m à
2,25 m, matin comme après-midi. Le délai réel constaté va de **2 h 28 à 3 h 06** (médiane 2 h 56).

## 2. Diagnostic : la propagation est comptée deux fois

`aflotTimeByThreshold` construit le segment montant sur la courbe **décalée Navihan** :

```ts
const a = { offset: lowEpoch + offsets.basseMer,    height: low.height };
const b = { offset: nextHigh.t + offsets.pleineMer, height: nextHigh.e.height };
```

Le croisement renvoyé est donc « l'instant où l'eau atteint le seuil **à Navihan** », soit l'instant
du croisement à Port-Tudy **plus** les 75-85 min de propagation.

Or le seuil 2,80 m avait été obtenu (§5) en lisant la hauteur de la courbe **Port-Tudy** à
`basse mer + 160 min` : cette valeur contient *déjà* la propagation. Elle est ensuite ajoutée une
seconde fois.

Mesuré sur les 18 relevés, avec le seuil 2,80 m d'origine : l'estimation tombe **+59 min trop tard,
sur les 18 sans exception** (+44 à +74 min).

Les réglages en service (`basseMer`/`pleineMer` = 85, `aFlot` = 170, `aFlotThreshold` = **2,05**)
portent la trace d'un rattrapage à la main. Abaisser le seuil annule bien le biais moyen, mais
déplace le croisement vers le début de la montante, là où la courbe est plate : le biais disparaît,
la dispersion explose.

| Réglages réellement en service | biais | MAE | erreur max |
|---|---|---|---|
| « Remise à flot » — décalage fixe 2 h 50 | −3,7 min | **9,7 min** | 22 min |
| « Estimation » — seuil 2,05 m | −6,8 min | **27,7 min** | **80 min** |

**L'estimation est trois fois pire que le décalage fixe qu'elle est censée raffiner.** Ce n'est pas
un problème de réglage : le meilleur seuil possible *en gardant la formule actuelle* laisse encore
**27,6 min** de MAE. Aucune valeur ne sauve la formule ; il faut retirer le décalage.

## 3. Le modèle physique, lui, se vérifie

Seuil relu sur la courbe **Port-Tudy** (sans décalage), hauteur reconstruite à l'heure constatée par
la même interpolation cosinus que `buildMaregram` :

- seuil implicite : moyenne **3,02 m**, **σ = 0,10 m**, étendue 2,81 → 3,18 ;
- à comparer au délai (σ = 10,6 min) et à la montée d'eau (σ = 0,53 m).

C'est bien la **hauteur** qui est invariante, pas le temps : la thèse centrale du spec de juillet est
confirmée par les relevés.

### 3.1 Un résidu net : le seuil croît avec le coefficient

Corrélation seuil implicite / coefficient = **0,72** (2,90 m à coef 40, 3,13 m à coef 100).

Origine probable : l'interpolation cosinus s'écarte de la vraie courbe d'autant plus que l'amplitude
est grande (un modèle à courbe déformée à seuil unique atteint la même précision, ce qui va dans ce
sens). La cause n'est pas établie et la correction est donc assumée comme **empirique** — pas comme
une grandeur physique.

| Modèle (seuil lu sur la courbe Port-Tudy) | biais | MAE | max | MAE en validation croisée |
|---|---|---|---|---|
| décalage fixe recalibré 2 h 54 | +0,3 | 9,1 | 26 | 9,6 |
| seuil constant 3,03 m | +2,5 | 7,6 | 31 | 8,0 |
| **seuil affine en coefficient** | +0,2 | **4,9** | **16,5** | **5,6** |

La validation croisée est un **leave-one-out** sur les 18 points : la correction en coefficient n'est
pas du surapprentissage.

### 3.2 Plancher de bruit

Les 23 et 24/08 présentent deux marées presque identiques (coef 32 et 44, basses mers 2,25 et
2,22 m) et donnent des écarts de **−10 et +17 min**. Le bruit de saisie est donc de l'ordre de
±10 min. À ~5 min d'erreur moyenne, on est proche de la limite exploitable : il n'y a pas de gain
substantiel à chercher au-delà.

## 4. Modèle retenu

```
seuil(coef) = refHeight + AFLOT_COEF_SLOPE × (coef − AFLOT_COEF_REF)
t_à-flot     = instant où la courbe Port-Tudy montante atteint seuil(coef)
```

avec `AFLOT_COEF_REF = 70`, `AFLOT_COEF_SLOPE = 0,0037` m/point, `coef` = coefficient de la **pleine
mer suivante** (`null` → `refHeight` seul).

**Le seuil est une hauteur Port-Tudy, pas une hauteur à Navihan.** C'est un proxy empirique qui
absorbe la propagation Port-Tudy → Navihan. Le dire explicitement est ce qui évite de refaire
l'erreur du §2 : la grandeur n'est pas une cote bathymétrique.

Conséquence secondaire utile : l'estimation ne dépend plus des décalages `basseMer`/`pleineMer`, donc
retoucher ces réglages ne la déforme plus.

### 4.1 Étalonnage : un seul paramètre libre, auto-calibré

La **pente** est figée dans le code (biais systématique du modèle de courbe, pas une propriété du
mouillage). Le **niveau** `refHeight` est recalculé à partir des heures constatées.

Trois mesures justifient ce partage :

- **Étalonner le seul niveau fait mieux qu'étalonner les deux** : 5,2 min en leave-one-out contre
  5,6. Un paramètre libre suffit, et il est plus stable.
- **Convergence en 4 relevés** : calé sur les 4 premiers, le modèle prédit les 14 suivants à 6,2 min.
  Après 8, le niveau ne bouge plus (3,006 → 3,016).
- **Robustesse** : une saisie fausse de +30 min déplace la médiane de 3,016 à 3,033 et laisse
  l'erreur sur les relevés sains à 4,9 min. D'où la **médiane** plutôt que la moyenne.

Sous `minSamples = 4` relevés exploitables, repli sur le réglage `aFlotRefHeight`
(défaut **3,02 m**, lui-même issu des 18 relevés — une installation neuve démarre donc déjà juste).

Avec les constantes figées (3,02 / 0,0037), les 18 relevés donnent **MAE 4,91 min, max 15,9 min**.

## 5. Impact

- `client/src/lib/navihan.ts` — `aflotTimeByThreshold` : segment sur les heures Port-Tudy brutes,
  paramètre `offsets` retiré, retour `{ date, time }` au lieu d'un `HH:MM` nu (c'était la seule heure
  Navihan non datée du projet ; `TideDayTable` reconstruisait sa date par heuristique). Nouvelles
  constantes et `aflotThresholdFor(coefficient, refHeight)`.
- `client/src/lib/aflotCalibration.ts` (nouveau) — `calibrateAflot(ptTides, observations,
  fallbackRefHeight, minSamples)` → `{ refHeight, samples, mae, calibrated }`, fonctions pures.
- `client/src/composables/useTides.ts` — `computed` sur `allTides` + la map d'observations, consommé
  par `aflotFor` ; calibration exposée.
- `settings.aFlotThreshold` → **`aFlotRefHeight`**, défaut 3,02. Le renommage **tient lieu de
  migration** : `sanitizeSettings` reconstruit l'objet clé par clé, donc le 2,05 stocké — qui n'a
  plus le même sens — est ignoré à la relecture. Aucun palier de schéma SQLite.
- `SettingsPanel.vue` — libellé « Hauteur de flottaison de référence (Port-Tudy, coef 70) » et état
  d'étalonnage sous le champ. Sans cette ligne, l'auto-calibration serait invisible.
- `CLAUDE.md` — cinq mentions à reprendre.

## 6. Périmètre inchangé

Le **décalage fixe** « Remise à flot » (2 h 50, MAE 9,7 min) n'est pas touché : il reste la valeur
des cartes `StatCards`, des marqueurs du marégramme et du carnet de pêche. L'estimation reste
cantonnée au **tableau du dashboard**. Généraliser le modèle par seuil est une décision distincte, à
prendre sur davantage de relevés.

## 7. Limites

- La correction en coefficient est **empirique** : elle décrit un écart du modèle de courbe, pas une
  physique identifiée. Ne pas lui prêter de sens qu'elle n'a pas.
- Le seuil est une hauteur **Port-Tudy**, pas une cote à Navihan (cf. §4).
- Les relevés sont des saisies humaines à la minute, bruitées à ±10 min (§3.2).
- 18 relevés sur une seule saison (juillet → septembre). Un effet saisonnier éventuel reste invisible.
- Le crochet « vent/surcote » du spec de juillet (§7) reste valide et s'applique désormais au seuil
  renvoyé par `aflotThresholdFor`.

## 8. Non-régression

Le garde-fou est un test portant la **fixture des 18 relevés réels** (basse, pleine, hauteurs,
coefficient, heure constatée) et asserant **MAE < 6 min, erreur max < 20 min**. Un test qui figerait
seulement des valeurs calculées ne dirait rien de la justesse du modèle.
