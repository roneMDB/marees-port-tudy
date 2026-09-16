# Statistiques du carnet de pêche

**Date** : 2026-09-16
**Statut** : validé
**Touche** : `client/src/lib/fishingStats.ts` (nouveau), `client/src/components/FishingStatsPanel.vue`
(nouveau), `client/src/lib/fishing.ts` (export de `dayCoefficient`),
`client/src/views/FishingView.vue` (bouton + montage du panneau).

## 1. Point de départ

Le carnet de pêche (issue #3) enregistre des sorties datées, leurs prises (espèce, engin, quantité,
gardé / relâché), l'indicateur `baited` (« casiers boëttés », v9) et un instantané météo **figé à la
création**. Il les **liste** — une carte par sortie, antichronologique — mais ne les **agrège
jamais**.

Rien ne dit donc ce qui a été pris en tout, ni si boëtter change quelque chose. C'est précisément ce
qu'un carnet sert à savoir, et toutes les données sont déjà là : le contexte de marée lui-même est
recalculé depuis la date (`tripTideContext`), sans rien stocker.

État de la base au moment du design : **11 sorties, 19 prises saisies, 115 individus** (dont
96 crevettes bouquet), 6 sorties boëttées contre 5, `size_cm` / `weight_g` **jamais** renseignés.

## 2. Le piège central : les espèces ne se somment pas

19 prises saisies font 115 individus, dont 96 crevettes. Toute moyenne « prises par sortie » calculée
sur un total toutes espèces confondues serait, en pratique, **un compteur de crevettes** : une sortie
à 25 crevettes pèserait vingt-cinq fois une sortie à un homard, et la comparaison « boëtté ou non »
ne mesurerait plus que le casier à crevettes.

Trois conséquences, qui structurent tout le reste :

1. **« Prises » et « individus » sont deux chiffres distincts**, jamais confondus. `catchLines` compte
   les lignes saisies, `individuals` somme les quantités.
2. **Aucune comparaison ne porte sur un total mêlé.** Les croisements donnent des moyennes
   **par espèce**, en colonnes (les trois espèces majeures du carnet).
3. Le classement par espèce est le cœur du bilan, pas un détail.

## 3. Ce que le bloc « tendances » promet, et ce qu'il ne promet pas

À 11 sorties, aucun croisement n'est une preuve. Le design l'assume plutôt que de le maquiller :

- l'effectif `n` est affiché **sur chaque ligne**, jamais en note de bas de page ;
- un bandeau d'avertissement ouvre le bloc et rappelle l'effectif total ;
- **aucun test de significativité**, aucun p-value, aucune formulation conclusive. Un appareil
  statistique donnerait une autorité que ces effectifs n'ont pas.
- ⚠️ La réserve la plus forte porte sur la **météo** : six variables figées (`tempMin`, `tempMax`,
  `windMax`, `windDir`, `weatherCode`, `seaTemperature`) pour onze points, le bruit dépasse largement
  le signal. Elle est incluse **à la demande explicite de l'utilisateur**, après que la réserve a été
  posée, et traitée exactement comme les autres dimensions — pas mieux, pas moins.

Le bloc n'est pas un gadget pour autant : il est **conçu pour vieillir**. Les groupes sans sortie ne
sont pas rendus, les bandes de coefficient réutilisent le vocabulaire du projet (`coefBand`), et le
croisement par mois n'a que deux barres aujourd'hui mais sera la vue la plus parlante dans une saison.

## 4. Calcul : côté client, pur, sans route

Aucune route ni agrégat SQL n'est créé. `useFishing.load()` rapatrie déjà **toutes** les sorties avec
leurs prises, et `FishingView` charge déjà les marées Port-Tudy couvrant les dates des sorties. Le
panneau reçoit tout en props ; le calcul vit dans un module **pur et testé**, `lib/fishingStats.ts`,
qui n'importe rien de Vue.

Un agrégat SQL aurait obligé à parser le blob JSON `weather` en SQL (`json_extract`) et à joindre un
référentiel **sans clé étrangère** (volontairement : une sortie ancienne ne doit pas perdre son espèce
quand on nettoie le référentiel). Pour onze sorties, le client suffit et reste testable en fonctions
pures.

### Réutilisations

- `dayCoefficient` (`lib/fishing.ts`) — aujourd'hui **privée**, exportée telle quelle plutôt que de
  réécrire « le coefficient du jour est le plus fort de ses pleines mers ».
- `coefBand` (`lib/format.ts`) — les cinq bandes du projet, pas un découpage inventé pour l'occasion.
- `beaufort` (`lib/weather.ts`) — déjà utilisé par `WeatherCard`.
- `formatDate` (`lib/format.ts`) pour les libellés de mois.

### Contrat

```ts
export interface LogSummary {
  trips: number; catchLines: number; individuals: number;
  kept: number; released: number; blankTrips: number;
  firstDate: string | null; lastDate: string | null;
}
export interface SpeciesStat {
  id: string; label: string; labelPlural: string;
  individuals: number; lines: number; trips: number; kept: number; released: number;
  best: { date: string; quantity: number } | null;   // meilleure sortie pour CETTE espèce
}
export interface GearStat { id: string; label: string; individuals: number; trips: number }

export interface Dimension {
  id: string; title: string;
  keyOf: (trip: FishingTrip) => string | null;   // null = sortie exclue du croisement
  order?: string[];                              // ordre imposé ; sinon tri sur la clé
}
export interface CompareRow { label: string; trips: number; blankTrips: number; perSpecies: number[] }
export interface Comparison { id: string; title: string; rows: CompareRow[]; excluded: number }

export function summarizeLog(trips: FishingTrip[]): LogSummary;
export function speciesRanking(trips: FishingTrip[], refs: FishingRef[]): SpeciesStat[];
export function gearRanking(trips: FishingTrip[], refs: FishingRef[]): GearStat[];
export function compare(trips: FishingTrip[], speciesIds: string[], dim: Dimension): Comparison;
export function buildDimensions(tides: FlatTide[]): Dimension[];
```

### Règles de calcul

- `blankTrips` = sorties sans aucune prise. Une bredouille est **une donnée**, pas une absence de
  donnée (même principe que `summarizeCatches`, qui écrit « Bredouille » plutôt qu'une chaîne vide).
- `speciesRanking` trie par `individuals` décroissant. Le libellé vient du **référentiel**
  (`label` / `labelPlural`), **jamais calculé** — le pluriel est une donnée saisie (v8). Une
  `speciesId` absente du référentiel s'affiche **brute**, comme le fait déjà `summarizeCatches`.
  `trips` compte les **sorties** où l'espèce apparaît, pas les lignes.
- `compare` rend, par groupe, l'effectif `trips`, le nombre de bredouilles du groupe, et une moyenne
  d'individus par sortie **pour chacune des espèces de `speciesIds`**. Un groupe sans sortie n'est pas
  rendu ; une sortie dont `keyOf` rend `null` tombe dans `excluded`, qui est **affiché**.

### Les six dimensions

| id | clé | ordre |
|---|---|---|
| `baited` | `Oui` / `Non` | imposé |
| `coef` | `coefBand(dayCoefficient(tides, trip.date)).label` ; `null` si coefficient inconnu | morte-eau → grande marée |
| `month` | `trip.date.slice(0, 7)` | tri naturel (donc chronologique) |
| `wind` | `beaufort(weather.windMax).force` → `0–3 Bft` / `4 Bft` / `5 Bft et plus` | imposé |
| `sea` | `weather.seaTemperature` → `< 18 °C` / `18–20 °C` / `≥ 20 °C` | imposé |
| `sky` | `weather.weatherCode` → `Clair` / `Couvert` / `Pluie` / `Orage` | imposé |

Les trois dimensions météo rendent `null` quand `weather` est `null` ou le champ manquant — la capture
est **best-effort** (hors fenêtre Open-Meteo de 92 j / 7 j, ou échec réseau, la colonne reste `NULL`).
Ces sorties sont comptées dans `excluded` et la mention « N sortie(s) sans météo » s'affiche sous la
table : un effectif silencieusement amputé serait pire qu'une table absente.

⚠️ `baited` est `INTEGER NOT NULL DEFAULT 0` depuis la v9 : les sorties antérieures portent « non »
sans qu'on l'ait saisi. Le croisement les mélange donc aux « non » réels. C'est le prix, déjà assumé
à la v9, de n'avoir pas introduit un troisième état « non renseigné ».

## 5. Présentation : un panneau latéral

Le bilan vit dans un **offcanvas** `offcanvas-end` (`FishingStatsPanel.vue`), ouvert par un bouton de
l'en-tête du carnet. La page des sorties reste intacte, et le panneau autorise un contenu long sans
repousser la liste sur téléphone.

⚠️ **Ouvert à tous les rôles**, comme `AflotAgendaPanel` et contrairement aux panneaux
d'administration : lire un bilan de ses propres sorties n'est pas de l'administration.

Le panneau est **sans état** : `{ trips, refs, tides }` en props, tout en `computed`. Ni chargement,
ni écouteur `show.bs.offcanvas` — les données sont déjà en mémoire quand la vue est montée, ce qui le
distingue de `StatsPanel` (qui, lui, doit interroger `/api/stats`).

Quatre sections :

1. **Bilan** — KPI sorties · prises · individus · bredouilles, période couverte, ligne secondaire
   gardés / relâchés.
2. **Par espèce** — classement à barres proportionnelles en CSS, libellé au pluriel, individus,
   nombre de sorties, meilleure sortie. **Pas de Chart.js** : quelques barres horizontales ne
   justifient pas un graphe (même arbitrage que `MiniBars`).
3. **Par engin** — liste courte.
4. **Tendances** — bandeau d'avertissement puis les six croisements, chacun en table compacte
   `Groupe | n | <3 espèces majeures>`.

État vide : « Aucune sortie enregistrée ».

## 6. Hors périmètre

- **Taille et poids** : les colonnes existent mais ne sont jamais saisies. Un « poids total » serait
  une statistique sur du vide.
- **Persistance d'un contexte de marée** : il reste recalculé depuis la date. Règle du projet — une
  correction de graine doit profiter aux sorties déjà saisies.
- **Croisement sur l'heure de la sortie relative à l'à-flot** : `startTime` est souvent l'heure de
  l'à-flot lui-même (le formulaire la pré-remplit), le croisement ne mesurerait que le
  pré-remplissage.
