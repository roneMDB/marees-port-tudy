# Issue #13 — Informations du jour : résumé

Branche `feat/13-ephemeride-du-jour` · 5 commits · 21 fichiers, +1898 / −49

## Ce qui a été ajouté

### Carte « Éphéméride du jour »

Carte pleine largeur, placée après les cartes de statistiques. Quatre tuiles :

| Tuile | Contenu |
|---|---|
| **Soleil** | lever → coucher, durée du jour et sa variation par rapport à la veille, midi solaire |
| **Lune** | phase et part éclairée, prochaine nouvelle/pleine lune, mention « vives-eaux à suivre » |
| **Calendrier** | date, **quantième** (211e jour / 365), semaine ISO, **saint du jour** |
| **Mer** | température de l'eau, indice UV |

Repliable, masquable, et le masquage est retenu d'une visite à l'autre.

### Force Beaufort dans la météo

Le vent était donné en km/h seulement. Il est maintenant exprimé **dans les deux unités sur une même
ligne**, pour la vitesse comme pour les rafales :

```
Vent 18 km/h O · 3 Bft, petite brise (rafales 34 km/h · 5 Bft)
```

Les tuiles de prévision portent les deux chiffres sans le libellé (`22 km/h O · 4 Bft`).

## Au-delà de ce que demandait l'issue

L'issue invitait à proposer d'autres éléments. Ont été ajoutés :

- **la phase de lune et la prochaine syzygie** — c'est ce qui manquait le plus à un site de marées :
  les vives-eaux suivent la nouvelle et la pleine lune d'environ 36 h, et le lien n'était visible
  nulle part. L'annonce « vives-eaux à suivre » n'apparaît qu'à deux jours ou moins de la syzygie ;
- **la variation de la durée du jour** (« −3 min ») et le **midi solaire** ;
- **la semaine ISO** à côté du quantième ;
- **la température de l'eau** et l'**indice UV**, utiles avant une sortie de pêche à pied ;
- les **rafales en Beaufort**, où la force est souvent la plus parlante (34 km/h = force 5 quand le
  vent moyen n'est qu'à 3).

## Choix techniques

**Tout ce qui peut être calculé l'est localement**, sans appel réseau : soleil, lune et calendrier.
Open-Meteo sait donner le lever et le coucher du soleil, mais pas la phase de lune — qu'il faudrait
de toute façon calculer sur place. Mélanger les deux sources aurait mis deux régimes de fiabilité
dans une même carte. Seules la température de l'eau et l'UV viennent du réseau, via deux paramètres
ajoutés aux requêtes Open-Meteo **déjà faites** (aucune requête supplémentaire).

Le **saint du jour** est un jeu figé de 366 libellés embarqué dans l'application : donnée calendaire
stable, sans raison d'être modifiée depuis l'interface, et disponible hors-ligne.

L'état météo est devenu un **composable partagé** : la carte Météo et la tuile « Mer » ont besoin des
mêmes données, et chacune la chargeant pour son compte aurait appelé l'API deux fois. Un test le
vérifie en montant la carte en double.

## Défauts trouvés en validant, et corrigés

Les calculs ont été confrontés à des références externes, ce qui a révélé deux erreurs de fond :

- **Soleil** : le terme `+0,0009` de l'énoncé courant de l'algorithme compense un arrondi que ce
  calcul ne fait pas. Il ajoutait **1,3 minute de retard systématique**. Après retrait, l'accord avec
  Open-Meteo est inférieur à 2 minutes sur quatre saisons.
- **Lune** : nommer la phase d'après le mois synodique *moyen* faisait lire « gibbeuse décroissante »
  **le jour de la pleine lune** (28 août 2026). La vitesse de la Lune varie, donc la vraie
  demi-lunaison n'est pas la moitié du mois moyen. La phase est désormais rapportée à la lunaison
  réelle, et le jour d'une syzygie porte son nom, comme dans un almanach.

Les syzygies calculées tombent à moins de 5 minutes des instants publiés des **quatre éclipses de
2026**, qui servent d'ancres de test.

Trois défauts d'affichage n'ont été vus qu'en pilotant l'application dans un navigateur, aucun test
unitaire ne pouvant les attraper :

- « Jeudi 30 **J**uillet » — la mise en majuscule de Bootstrap s'applique à chaque mot, alors que les
  mois s'écrivent en minuscules en français ;
- « 211˚ jour » — l'exposant était doublé ;
- « 3 Bft**p**etite brise » — Vue élague les blancs en début de nœud texte ;
- les tuiles de prévision débordaient sur trois lignes à 390 px de large.

Chacun est désormais couvert par un test.

## Deux points laissés à l'appréciation

- **Le marnage ne figure pas dans la tuile « Mer »** : les cartes de statistiques affichent déjà
  « Marnage du jour ». La fonction écrite pour lui sert donc à remplacer la logique dupliquée de ces
  cartes, plutôt qu'à répéter l'information. À dire s'il est préféré aussi dans l'éphéméride.
- **Hors-ligne** : avec le cache déjà constitué, la carte est complète. Sur cache **vide**, rien ne
  s'affiche — la carte dépend du chargement des marées, et le cache ne se remplit qu'à partir de la
  deuxième visite. C'est un comportement préexistant de l'application, vrai pour n'importe quelle
  carte du tableau de bord ; il est consigné plutôt que corrigé, car il dépasse cette issue.

## Vérifications

- 255 tests client et 207 tests serveur au vert, dont 60 nouveaux.
- Contrôle de typage propre.
- Rendu vérifié dans un navigateur en thème clair, thème sombre et largeur mobile : aucun débordement
  horizontal, aucune erreur de console.
- Les trois nouveaux champs météo confirmés de bout en bout depuis le vrai service Open-Meteo.
- Contrôle de cohérence des horaires inchangé (les deux doublons signalés sont les coïncidences déjà
  documentées comme vérifiées).
