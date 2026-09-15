# Agenda des remises à flot : panneau latéral au lieu du dépliement

**Date** : 2026-09-15
**Statut** : validé
**Touche** : `StatCards.vue` (carte « Prochaines remises à flot »), `lib/navihan.ts`,
`SettingsStore.ts` (`aFlotDays`).

## 1. Point de départ

La carte « Prochaines remises à flot » du dashboard liste les `settings.aFlotDays` prochains jours
(1 à 14, défaut 3). Comme c'est la plus haute de sa rangée, elle en **imposerait** la hauteur :
au-delà de 3 jours le surplus est replié derrière « + N autres jours » / « Voir moins » (repli
éphémère, `ref` local).

Deux limites de ce dépliement :

- **Il ne fait que déplacer le problème.** Déplié, la carte étire toute la rangée — exactement ce
  que le budget de 3 lignes cherchait à éviter. On ne peut donc pas lire un agenda long sans
  déformer le dashboard.
- **Le plafond de 14 jours est une contrainte de place, pas un besoin.** Préparer une sortie à trois
  semaines demande de changer un réglage, puis de le remettre.

Les six panneaux latéraux existants (Stats, Import, Utilisateurs, Lexique, Référentiels pêche,
Réglages) montrent qu'un offcanvas `offcanvas-end` est l'endroit du projet pour du contenu long qui
ne doit pas pousser la page.

## 2. Ce qu'on construit

Un panneau latéral **« Remises à flot »** listant **toute la plage de marées disponible**
(aujourd'hui → fin des données, soit un à cinq mois selon la graine), ouvert depuis un bouton
**permanent** de la carte. La carte redevient un simple aperçu de 3 jours, sans dépliement.

Le panneau est **ouvert à tous les rôles**. C'est la différence assumée avec les six autres, tous
admin-only : lire un agenda de marées n'est pas de l'administration, et l'ensemble du dashboard est
déjà en lecture ouverte. Aucun garde `isAdmin`, ni côté bouton ni côté panneau.

## 3. Montage et ouverture

- Nouveau composant `client/src/components/AflotAgendaPanel.vue` — offcanvas `offcanvas-end`,
  `id="aflotAgendaOffcanvas"`, `--bs-offcanvas-width: 420px`, prop `allTides: FlatTide[]`.
- **Monté par `Dashboard.vue`, en frère de `<StatCards>`** : les deux reçoivent déjà `allTides`,
  `StatCards` reste une rangée de tuiles, et l'offcanvas n'est pas imbriqué dans un `.card`.
- Ouverture par les **attributs Bootstrap** (`data-bs-toggle="offcanvas"`,
  `data-bs-target="#aflotAgendaOffcanvas"`), comme les panneaux existants : aucun JS d'ouverture,
  et le bouton peut vivre dans un composant différent de celui qui rend le panneau.

## 4. Données — `lib/navihan.ts`

Tout reste **pur et testé**, à côté de l'existant.

### 4.1 `aflotAgenda` : `days` devient facultatif

```ts
export function aflotAgenda(
  tides: FlatTide[],
  offsets: NavihanOffsets,
  now: Date,
  days?: number
): AflotDay[]
```

`days` absent → **pas de `slice`**, donc toute la plage à partir du jour de `now` (inclus). Le reste
est inchangé : regroupement par **date réelle** de la remise à flot (une basse mer tardive dont le
décalage franchit minuit est rangée au lendemain), heures passées conservées et marquées `past`.

### 4.2 `AflotTime` s'enrichit

```ts
export interface AflotTime {
  time: string;              // heure `HH:MM`
  past: boolean;             // déjà passée par rapport à `now`
  basse: FlatTide;           // basse mer Port-Tudy d'origine
  coefficient: number | null; // coefficient de la pleine mer **suivante**
}
```

`basse` est déjà porté par `aflotEvents` : c'est un simple passe-plat. La carte ignore les deux
nouveaux champs.

**Pourquoi le coefficient de la pleine mer suivante** et non celui du jour : une basse mer ne porte
pas de coefficient, et c'est la montante qui suit qui remet le bateau à flot. C'est déjà la
définition retenue par le modèle d'estimation (`aflotThresholdFor(coefficient de la pleine mer
suivante, refHeight)`) et par l'étalonnage. Le coefficient « du jour » (max des pleines mers de la
date) serait faux au bord : un à-flot rangé au lendemain après minuit se verrait attribuer le
coefficient d'un jour dont il ne dépend pas.

### 4.3 `nextHighAfter`, extrait

```ts
export function nextHighAfter(ptExtremes: FlatTide[], low: FlatTide): FlatTide | null
```

Première pleine mer de **hauteur finie** après la basse mer (comparaison sur les instants, donc
robuste au passage de minuit). Appelé par `aflotAgenda` et par `aflotTimeByThreshold`, qui en porte
aujourd'hui une copie identique inline.

⚠️ **`aflotCalibration.ts` garde la sienne.** Sa variante ajoute un garde
(`nextHigh.height > low.height`) et son comportement est figé par la fixture des 18 relevés réels
(MAE < 6 min, max < 20). La mutualiser déplacerait le modèle sans rien gagner : le partage doit
s'arrêter là où les sémantiques divergent.

## 5. Rendu du panneau

En-tête : `bi-life-preserver` + « Remises à flot », bouton de fermeture, sur le patron de
`StatsPanel`.

Corps : **un bloc par jour** portant au moins une remise à flot, du jour courant à la fin des
données. Les jours sans à-flot sont absents (comme aujourd'hui dans la carte).

Par bloc :

- **en-tête de jour** : date complète capitalisée, suivie de « aujourd'hui » / « demain » quand
  `relativeDayLabel` le donne ;
- **par remise à flot** :
  - l'**heure** en pastille — `bg-success-subtle`, ou `.aflot-past` estompée si déjà passée ;
  - un **badge coefficient** portant sa bande (`coefBand` : morte-eau → grande marée), « — » si le
    coefficient est introuvable ;
  - en sous-ligne, « Basse mer Navihan · HH:MM » — heure **Navihan** (`shiftMoment` sur
    `basse.date`/`basse.time` avec `offsets.basseMer`), **jamais** l'heure Port-Tudy brute. Sa date
    n'est écrite que lorsqu'elle **diffère** de celle de l'à-flot : l'écrire toujours ajouterait du
    bruit sur ~86 % des lignes, ne jamais l'écrire rendrait incompréhensibles les ~14 % où
    l'à-flot a lieu le lendemain de sa basse mer.
- **plage vide** (aucune remise à flot à venir, données épuisées) : un message explicite, pas une
  liste blanche.

Les heures passées **restent listées, estompées** : même règle que la carte — c'est un agenda, il ne
se vide pas au fil de la journée.

L'heure affichée est celle de la **« Remise à flot »** (décalage fixe `aFlot`), **jamais**
l'estimation par seuil, qui reste cantonnée au tableau du dashboard. Règle du projet inchangée.

**Styles** : seule `.aflot-past` monte de `StatCards` (scoped) vers `assets/app.css`, deux
composants la rendant désormais — même raison que la palette des pastilles Navihan. Le reste du
style de la carte (`.aflot-list`, `.aflot-day`, `.aflot-date`, `.aflot-times`) reste `scoped` : la
mise en page du panneau est différente (blocs, pas lignes serrées), la partager n'aurait pas de
sens.

## 6. La carte « Prochaines remises à flot »

Disparaissent : le bouton « + N autres jours » / « Voir moins », `expanded`, `shownAflotDays`,
`hiddenDays`, `canExpand`, et le `watch` qui refermait la carte quand `aFlotDays` retombait sous le
budget.

À la place, un bouton **toujours présent** — « Voir l'agenda complet », `btn btn-link btn-sm` +
chevron droit, aux attributs `data-bs-*` du §3. Toujours présent **même quand tout tient déjà** : le
panneau n'est pas un « déplier autrement », c'est une destination stable ; son accès ne doit pas
dépendre d'un réglage.

La liste montre `settings.aFlotDays` jours, **sans plafond dans le composant** : le budget de
3 lignes — calé sur la hauteur des trois autres cartes de la rangée — est désormais tenu par la
borne du réglage (§7), qui s'applique aussi **à la lecture**. Un `min(…, 3)` ici serait du code que
rien ne peut atteindre. La constante `COLLAPSED_DAYS` disparaît avec le dépliement.

## 7. Le réglage `aFlotDays`

Il existait parce que la carte était la seule vue. La carte ne pouvant plus dépasser 3 lignes, au
delà de 3 il ne ferait plus rien : la borne suit.

- `server/src/service/SettingsStore.ts` : `clampInt(o.aFlotDays, 1, 3, …)`. Défaut **3** inchangé.
- `client/src/components/SettingsPanel.vue` : `max="3"`, `clamp(…, 1, 3)`, libellé et texte d'aide
  reformulés (« jours listés sur la carte ; l'agenda complet est dans le panneau »).
- **Valeurs héritées** (7, 14 en base) : aucune migration nécessaire. `readSettings` passe par
  `sanitizeSettings` **à la lecture** comme à l'écriture ; une base qui stocke 14 sert donc déjà 3.
  C'est ce qui permet à la carte de ne porter aucun plafond de son côté (§6).

Le réglage garde donc un sens : ne montrer qu'un ou deux jours sur la carte.

## 8. Tests

- `client/src/lib/navihan.test.ts` : `aflotAgenda` **sans `days`** rend toute la plage (et `days`
  fourni continue de tronquer) ; `basse` et `coefficient` portés par chaque `AflotTime` ;
  `nextHighAfter` — aucune pleine mer après → `null`, hauteur non finie ignorée, franchissement de
  minuit.
- `client/src/components/AflotAgendaPanel.test.ts` (nouveau) : liste au-delà d'`aFlotDays` ;
  coefficient rendu avec sa bande ; basse mer Navihan datée de la **veille** quand le décalage
  franchit minuit (et date omise sinon) ; heure passée estompée ; plage vide → message.
- `client/src/components/StatCards.test.ts` : bouton d'ouverture présent **même à ≤ 3 jours**, avec
  le bon `data-bs-target` ; plus aucun « + N autres jours » ; la carte rend bien `aFlotDays` jours.
- `server/src/service/SettingsStore.test.ts` : `aFlotDays` borné à 3 à l'écriture **et** une valeur
  héritée de 14 relue à 3 — c'est ce second test qui protège le budget de la carte.
- `npm test` **et** `npm run type-check` (Vitest passe par esbuild et ne vérifie aucun type).

## 9. Écarté

- **Un sélecteur de période dans le panneau** (7 / 30 / tout, comme `StatsPanel`) : un réglage de
  plus pour une liste qui se parcourt au défilement, et le panneau défile déjà.
- **Un regroupement par mois à en-tête collant** : la date complète porte le mois sur chaque ligne.
  À reconsidérer si la liste se révèle pénible à parcourir sur cinq mois.
- **La colonne « Constaté »** dans le panneau : les heures constatées sont des relevés **passés**,
  un agenda tourné vers l'avenir n'en porterait presque jamais.
- **Supprimer `aFlotDays`** : cela retirerait une préférence sans rien simplifier de plus.
