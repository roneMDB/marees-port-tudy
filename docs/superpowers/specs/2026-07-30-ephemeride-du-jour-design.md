# Éphéméride du jour + force Beaufort

**Date** : 2026-07-30
**Issue** : #13 « Ajouter les informations du jour »

## Besoin

Le dashboard sait tout de la marée et rien du jour qui l'entoure. L'issue demande le **lever et le
coucher du soleil**, le **saint du jour**, le **quantième**, en invitant à proposer d'autres
éléments ; et pose une question annexe : la météo n'affiche pas la force **Beaufort**
(`WeatherCard.vue` donne le vent en km/h brut).

Retenu après échange : les quatre familles — **soleil** (avec durée du jour et midi solaire),
**lune** (phase et prochaine syzygie), **calendrier** (saint, quantième, semaine ISO), **mer**
(marnage, température de l'eau, indice UV). La lune manque particulièrement à un site de marées :
c'est elle qui explique les gros coefficients, et le lien n'est nulle part visible.

## Décisions

- **Soleil et lune calculés localement**, en fonctions pures testées, pas via Open-Meteo. Open-Meteo
  sait donner `sunrise`/`sunset` mais **pas la phase de lune** : la calculer localement de toute
  façon, puis aller chercher le soleil sur le réseau, mettrait **deux régimes de fiabilité dans une
  seule carte**. Tout calculer localement rend la carte utilisable hors-ligne, ce que la PWA promet
  déjà pour la coquille et les marées.
- **Saint du jour = jeu de 366 entrées embarqué et figé** (`lib/saints.ts`), pas de table en base ni
  d'écran d'admin comme le lexique : c'est une donnée calendaire stable, sans raison d'être éditée
  depuis l'application.
- **Température de l'eau et indice UV viennent d'Open-Meteo**, donc du serveur : ce sont les deux
  seules valeurs non calculables. Elles affichent « — » hors-ligne, le reste de la tuile Mer (le
  marnage) restant renseigné.
- **Un seul appel `/api/weather`** : l'état météo passe dans un composable singleton, sinon la carte
  Météo et la carte Éphéméride le solliciteraient chacune.

## Design

### Serveur — `src/service/weather.ts`

Deux paramètres en plus des requêtes déjà faites (vérifiés opérationnels sur les coordonnées de
Belz) :

- forecast, `daily` : `uv_index_max` → `DailyWeather.uvIndexMax: number | null` (`?? null`, comme
  `windDirection`) ;
- marine, `current` : `sea_surface_temperature` → `MarineWeather.current.seaTemperature: number |
  null` ; marine, `daily` : `sea_surface_temperature_max` → `daily[].seaTemperatureMax: number |
  null`.

La température d'eau réutilise `units.temperature` (pas de nouvelle unité). Le `try/catch` qui met
`marine = null` près des côtes couvre déjà l'indisponibilité. Miroir client à mettre à jour dans
`client/src/types.ts` (`WeatherDaily`, `WeatherMarine`).

### `client/src/lib/ephemeride.ts` (nouveau)

Aucune dépendance, tout pur et testé, dans l'esprit de `lib/maregram.ts` / `lib/navihan.ts`.

- `EPHEMERIDE_LOCATION = { latitude: 47.677, longitude: -3.166 }` — Belz. **Miroir** de
  `DEFAULT_LAT`/`DEFAULT_LON` (`server/src/routes/weather.ts`), à documenter comme tel ; même
  précédent que `DEFAULT_WEATHER_LINKS` dans `client/src/types.ts`. Constante côté client et non
  valeur lue dans `weather.location` : sinon le soleil dépendrait du réseau.
- `sunTimes(dateKey, lat, lon)` → `{ sunrise, sunset, solarNoon: Date; daylightMinutes: number }`.
  Algorithme NOAA : jour julien → anomalie moyenne → équation du centre → longitude écliptique →
  déclinaison → angle horaire à zénith 90,833°. Renvoie des **instants UTC** ; le formatage est
  séparé, sinon les tests dépendraient du fuseau de la machine (aucun `TZ` n'est épinglé dans
  `client/vite.config.ts`).
- `formatTimeInZone(d, tz = 'Europe/Paris')` → `HH:MM` (`Intl.DateTimeFormat`).
- `daylightDelta(dateKey, lat, lon)` → écart en minutes avec la veille (« −2 min »).
- `moonPhase(dateKey)` → `{ age, illumination (0–1), name, icon }`. Huit phases françaises :
  Nouvelle lune, Premier croissant, Premier quartier, Gibbeuse croissante, Pleine lune, Gibbeuse
  décroissante, Dernier quartier, Dernier croissant.
- `nextSyzygy(dateKey)` → `{ kind: 'new' | 'full'; date; at; daysAway }`. **Formule de Meeus**
  tronquée aux termes périodiques principaux (`M`, `M'`, `F`), pas la seule lunaison moyenne :
  celle-ci se trompe de ±14 h, donc visiblement d'un jour sur un compte à rebours affiché en jours.

**Deux écarts trouvés en validant contre des références externes**, à ne pas réintroduire :

- le terme `+0,0009` de l'énoncé courant de l'algorithme solaire compense un **arrondi de `n` à
  l'entier** que ce calcul ne fait pas (`n` = jour julien exact à 12:00 UT) ; il ajoutait 1,3 min de
  retard systématique ;
- nommer la phase d'après le mois synodique **moyen** fait lire « gibbeuse décroissante » le jour de
  la pleine lune : la vitesse de la lune varie, la vraie demi-lunaison n'est pas `SYNODIC/2`, et la
  pleine lune du 2026-08-28 tombe à une fraction de 0,52. La fraction est donc rapportée à la
  **lunaison réelle**, et le jour d'une syzygie porte son nom comme dans un almanach.
- `dayOfYear(dateKey)` → `{ day, total }` (366 les années bissextiles) — le « quantième » demandé.
- `isoWeek(dateKey)` → numéro de semaine ISO 8601.

### `client/src/lib/saints.ts` (nouveau)

`SAINTS_BY_MONTH` : un tableau par mois, 366 entrées au total (`02-29` incluse), calendrier civil
français usuel ; `saintOfDay(dateKey)`. Rangé par mois plutôt qu'en clés `MM-DD` plates : les
longueurs se vérifient d'un coup d'œil, et un test les compare aux longueurs de mois attendues —
c'est ainsi qu'une entrée manquante (sainte Élodie, 22 octobre) a été détectée.

Chaque entrée porte son **libellé complet**, « Saint » / « Sainte » compris, plutôt qu'un prénom nu
dont on déduirait le genre : une trentaine de prénoms masculins du calendrier se terminent par « e »
(Blaise, Achille, Alexandre, Christophe, Étienne, Jérôme…), et toute heuristique produirait des
« Sainte Blaise ».

### Ajouts aux libs existantes

- `lib/weather.ts` : `beaufort(kmh)` → `{ force: 0–12; label }`, à côté de `degToCompass`. Échelle
  française, seuils en km/h : 2, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118.
- `lib/tides.ts` : `tidalRange(day: DayTides)` → marnage = `max(highs.height) − min(lows.height)`,
  `null` si une des deux listes est vide. Se pose à côté de `groupByDay`, qui fournit déjà
  `highs`/`lows` triés.

### `client/src/composables/useWeather.ts` (nouveau)

Singleton sur le patron de `useSettings` / `useSite` / `useLexicon` : état `weather`/`loading`/
`error` au niveau module, `load()` **idempotent** (ne refait rien si déjà chargé ou en cours),
`reload()` forcé pour le bouton de rafraîchissement. `WeatherCard.vue` s'y branche à la place de son
état local ; comportement inchangé.

### `client/src/composables/useEphemeride.ts` (nouveau)

Copie du patron de `useMotDuJour.ts` : clé `localStorage` **`marees-ephemeride`**, visible par
défaut, `visible`/`hide`/`show`.

### `client/src/components/EphemerideCard.vue` (nouveau)

Carte **pleine largeur** repliable, structure calquée sur `ResourcesCard.vue` (repli **éphémère** :
`ref` local + `v-show` + chevron, aucun JS Bootstrap) et `MotDuJourCard.vue` (bouton masquer, et
lien « Afficher l'éphéméride » quand masquée). Prop `allTides: FlatTide[]` pour le marnage, comme
`StatCards` et `MotDuJourCard`.

Quatre tuiles en `row g-3` / `col-12 col-sm-6 col-xl-3`, avec la pastille d'icône thématique déjà
stylée dans ces composants (variables `--bs-*-bg-subtle`, donc juste en thème sombre) :

| Tuile | Contenu |
|---|---|
| Soleil | lever → coucher, durée du jour + écart avec la veille, midi solaire |
| Lune | phase + illumination en %, prochaine syzygie et compte à rebours |
| Calendrier | date en clair, « 211e jour / 365 · sem. 31 », saint du jour |
| Mer | température de l'eau, indice UV |

La mention **« vives-eaux à suivre »** de la tuile Lune ne s'affiche **que** si la syzygie est à
≤ 2 jours : les vives-eaux suivent la syzygie de ~36 h, l'afficher sans condition serait faux.

Le **marnage ne figure pas** dans la tuile Mer, contrairement à l'intention initiale : `StatCards`
affiche déjà une carte « Marnage du jour ». `tidalRange` sert donc à remplacer la logique inline de
`StatCards` par une fonction pure testée, plutôt qu'à répéter l'information. La carte n'a par
conséquent **aucune prop**.

La date n'est affichée **qu'une fois**, dans la tuile Calendrier, et sa majuscule est posée en JS :
`text-capitalize` en met une à chaque mot (« Jeudi 30 Juillet »), or les mois français s'écrivent en
minuscules.

`Dashboard.vue` : `<EphemerideCard :all-tides="allTides" />` **après `<StatCards>`**, avant la
rangée météo / mot du jour, avec le même montage conditionnel que `MotDuJourCard` pour le rappel en
état masqué.

### `client/src/components/WeatherCard.vue`

- le vent est donné **dans les deux unités sur une même ligne**, vitesse comme rafales :
  `Vent 18 km/h O · 3 Bft, petite brise (rafales 34 km/h · 5 Bft)`. Ce sont deux expressions du même
  vent ; les mettre sur deux lignes séparées, comme au premier jet, casse le lien entre elles ;
- tuiles de prévision : les deux chiffres sans le libellé (`22 km/h O · 4 Bft`), et **2 tuiles par
  ligne sous `sm`** — à 4 colonnes sur un téléphone, la ligne se disloque sur trois lignes ;
- eau et UV **ne sont pas** ajoutés ici : ils vivent dans la tuile Mer de l'éphéméride, pour ne pas
  dire deux fois la même chose.

## Tests

- `lib/ephemeride.test.ts` : `sunTimes` à Belz le 2026-07-30 → **06:47 / 21:50** en Europe/Paris
  (valeurs Open-Meteo relevées), tolérance ±2 min, plus une date d'hiver et une autour du changement
  d'heure ; `nextSyzygy` sur des syzygies publiées, tolérance quelques heures ; `dayOfYear` sur un
  31 décembre bissextile et non bissextile ; `isoWeek` sur un 1er janvier en semaine 53.
- `lib/saints.test.ts` : 366 clés, aucune vide, quelques dates repères.
- `lib/weather.test.ts` : `beaufort` aux bornes de chaque force.
- `lib/tides.test.ts` : `tidalRange` nominal et `null` sur jour incomplet.
- `components/EphemerideCard.test.ts` sur le patron de `StatCards.test.ts` : horloge figée
  (`vi.useFakeTimers`), marées factices, assertions sur les quatre tuiles, le repli et le masquage.
- `server/src/service/weather.test.ts` : fixtures étendues aux deux nouveaux champs (`fetchImpl` est
  déjà injectable).

## Hors-ligne : ce qui est réellement vrai

Vérifié en build de production avec un navigateur piloté :

- les tuiles **Soleil, Lune, Calendrier** n'ont **aucune dépendance réseau** — si la requête météo
  échoue, elles restent renseignées et seules l'eau et l'UV passent à « — » (test dédié) ;
- hors-ligne avec le **cache PWA chaud**, la carte est **complète**, l'eau et l'UV venant du
  `NetworkFirst` sur `/api` ;
- hors-ligne sur **cache froid**, en revanche, **rien ne s'affiche** : la carte est dans le `v-else`
  de `Dashboard.vue`, après les états loading/error, donc l'échec de `/api/tides` masque tout le
  dashboard. Et le cache runtime ne se remplit qu'à partir de la **2ᵉ** visite, le service worker ne
  contrôlant pas encore la page lors de la première.

Ce dernier point est un **comportement PWA préexistant**, pas une conséquence de cette issue : il
vaudrait pour n'importe quelle carte du dashboard. Le corriger (précacher `/api/tides`, ou sortir
les cartes sans dépendance de données du `v-else`) dépasse le périmètre de #13.

## Hors périmètre

- Pas de saint éditable en base (décision ci-dessus).
- Pas de lever/coucher de lune : le calcul est nettement plus lourd que celui du soleil (parallaxe,
  série lunaire) pour un intérêt moindre que la phase.
- Pas de crépuscules civil/nautique : à ajouter plus tard si le besoin se confirme, `sunTimes` étant
  déjà paramétrable par l'angle de zénith.
- Éphéméride du **jour courant** seulement : pas de navigation par date comme `HeightChart`.
