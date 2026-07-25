# Remise à flot Navihan variable selon le coefficient — modèle « seuil de hauteur »

_Issue #4 — étude & conception. 2026-07-24._

## 1. Problème

L'application dérive les heures **Navihan** (remise à flot à Belz, ria d'Étel) des marées de
**Port-Tudy** par **décalages fixes en minutes** : basse mer +1h15, pleine mer +1h15, et surtout
**« remise à flot » = basse mer + 2h40** (`settings.navihan.aFlot = 160`).

L'issue #4 signale que ce décalage **n'est pas constant** : il « semble varier selon le coefficient
de marée », et demande s'il existe un algorithme connu pour le calculer précisément.

**Confirmation par les données.** Sur les 299 basses mers de la graine Port-Tudy (2026-06 → 2026-10),
en fixant un seuil de hauteur S = 2,8 m et en mesurant le temps mis par la marée montante (courbe
reconstruite) pour l'atteindre depuis la basse mer :

| Coefficient | Délai moyen après la basse mer |
|---|---|
| 20–39 (morte-eau) | ~134 min |
| 40–59 | ~160 min |
| 60–79 | ~161 min |
| 80–99 (vive-eau) | ~170 min |

Le décalage fixe de 160 min se trompe donc de **±25 à 35 min** aux extrémités de coefficient. La
prémisse de l'issue est exacte.

## 2. Physique de la remise à flot

Un bateau échoué **reflotte quand la hauteur d'eau atteint une cote fixe** — celle qui recouvre la
coque à son poste, déterminée par la **bathymétrie du fond** (invariante). Ce n'est donc pas un
*délai* qui est constant, mais une *hauteur seuil*.

Le temps mis pour atteindre cette hauteur depuis la basse mer dépend de la **vitesse de montée** de
la marée, elle-même fonction de l'**amplitude** (donc du coefficient). Le décalage temporel varie
mécaniquement avec le coefficient : c'est l'inverse du modèle actuel, qui fige le temps et laisse la
hauteur de remise à flot varier.

## 3. Algorithmes connus de prédiction de hauteur

- **Règle des douzièmes** : approximation marin classique — la marée monte de 1/12, 2/12, 3/12,
  3/12, 2/12, 1/12 de l'amplitude à chaque heure des ~6 h de flot. Simple mais grossière (paliers).
- **Méthode de l'Amirauté / analyse harmonique** : somme des composantes harmoniques (M2, S2, N2,
  K1…). La plus précise, mais exige les **constantes harmoniques du SHOM** pour le point considéré,
  dont on ne dispose pas pour Navihan.
- **Interpolation cosinus entre extrêmes** : `h(t) = h_a + (h_b − h_a)·(1 − cos(π·r))/2` entre deux
  extrêmes encadrants. Équivalent au **premier harmonique**, continu et dérivable. **Déjà utilisée**
  dans l'app (`client/src/lib/maregram.ts`, marégramme). Précision suffisante en l'absence de
  constantes harmoniques, et cohérente avec l'existant.

## 4. Modèle retenu — seuil de hauteur + inversion cosinus

On **inverse** l'interpolation cosinus sur le segment montant basse mer `a` → pleine mer suivante `b`
pour trouver l'instant où la courbe atteint la hauteur seuil `S` :

```
x = (S − h_a) / (h_b − h_a)            (fraction d'amplitude, clampée dans [0,1])
r = acos(1 − 2·x) / π
t = t_a + r · (t_b − t_a)
```

Cas limites :
- `h_b ≤ h_a` (segment non montant / données douteuses) → pas de remise à flot (`null`).
- `S ≤ h_a` (déjà à flot dès la basse mer) → délai nul (`t = t_a`).
- `S ≥ h_b` (le seuil n'est pas atteint avant la pleine mer, morte-eau extrême) → `null` → « — ».

**Seuil absolu** (hauteur au-dessus du zéro hydrographique) et non relatif à la basse mer : le fond
du poste est fixe. Vérification du sens de variation (durée de flot ≈ 6h12) :

| Scénario | Basse → Pleine | Délai à S = 2,8 m |
|---|---|---|
| Morte-eau | 2,0 m → 3,6 m | plus long |
| Vive-eau | 0,6 m → 5,4 m | plus court |

En vive-eau la montée est plus raide, la cote fixe est franchie plus tôt : délai plus court. Le
modèle reproduit donc la variation observée, sans paramètre supplémentaire.

## 5. Calibration du seuil (sans observations)

Aucune heure de remise à flot **réellement observée** à Navihan n'est disponible dans le dépôt. Le
seuil est donc **rétro-calibré** pour reproduire le comportement actuel au **coefficient médian** :

1. Médiane des coefficients Port-Tudy = **69**.
2. Hauteur de la courbe Port-Tudy à `basse mer + 160 min` pour les marées de coef ≈ 69 :
   **S ≈ 2,8 m** (médiane 2,80 ; interquartile 2,71–2,90 m).
3. Valeur par défaut retenue : **`aFlotThreshold = 2,8 m`** (constante
   `DEFAULT_AFLOT_THRESHOLD`, réglage admin `settings.aFlotThreshold`).

Ainsi, au coefficient médian, le nouveau modèle donne ~160 min (continuité avec l'ancien) ; il
s'en écarte physiquement pour les autres coefficients.

## 6. Limites & incertitudes

- **Pas de bathymétrie réelle** : le seuil 2,8 m est calibré sur l'ancien décalage, pas mesuré au
  poste. Il reste **ajustable** par l'admin dès qu'une observation terrain sera disponible.
- **Propagation Port-Tudy → Belz supposée constante** : les décalages `basseMer`/`pleineMer` restent
  des délais fixes ; leur éventuelle variation avec le coefficient exigerait des relevés locaux.
- **Courbe cosinus** : approximation du premier harmonique, pas une vraie somme harmonique SHOM.

## 7. Piste vent (surcote) — non chiffrée

Le vent agit sur la remise à flot via une **surcote/décote** (hauteur d'eau), pas via un décalage
temporel : un vent portant (secteur entrant dans la ria) relève le plan d'eau et **avance** la remise
à flot. Le modèle raisonnant déjà en hauteur, l'injection future est naturelle :

```
S_effectif = S − surcote(vent)
```

Faute de calibration, aucune valeur n'est appliquée aujourd'hui. La météo du jour (déjà exposée par
l'app) sert d'**indication qualitative**. Point d'ancrage : `aflotTimeByThreshold` /
`navihanAflotByThreshold` reçoivent une hauteur seuil ; il suffira d'y soustraire une surcote.

## 8. Impact code

- `client/src/lib/maregram.ts` : `inverseCosineRising` (inversion), `navihanAflotByThreshold`
  (remplace `navihanAflot`), export de `OffsetPoint`.
- `client/src/lib/navihan.ts` : `aflotTimeByThreshold`, `aflotEvents`, `nextAflot` révisé,
  `computeNavihan` ne produit plus `A flot`, constante `DEFAULT_AFLOT_THRESHOLD`.
- `client/src/composables/useTides.ts` : `windowedTides` calcule `A flot` par seuil (toujours sur
  les hauteurs Port-Tudy, y compris pour un port secondaire via `refTime`).
- `server/src/service/SettingsStore.ts` (+ miroirs `client/src/types.ts`, `useSettings.ts`) :
  réglage `aFlotThreshold` (m, défaut 2,8), `clampFloat`.
- `client/src/components/{StatCards,HeightChart,SettingsPanel}.vue`, `composables/useNavihan.ts` :
  branchement UI + réglage « Seuil de remise à flot (m) ».

Le décalage `settings.navihan.aFlot` (minutes) reste le calcul **« Remise à flot »** (fixe,
historique). L'**estimation par seuil** est exposée à part (`aflotEstimate`).

**Suivi (issue #4, suite) — saisie des remises à flot constatées.** Table SQLite `aflot_observations`
(schéma v4), routes `/api/aflot-observations` (lecture ouverte ; écriture **admin**), composable
`useAflotObservations`, colonne **« Constaté »** éditable (admin) dans `TideDayTable`. Ces relevés
sont pour l'instant **stockés et affichés** (pas de recalibrage automatique) ; ils constituent le
**jeu d'observations** qui permettra, ultérieurement, de caler le seuil (§5) sur le terrain plutôt
que de l'estimer.
