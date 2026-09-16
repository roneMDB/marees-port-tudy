import type { FishingRef, FishingTrip, FlatTide } from '../types';
import { dayCoefficient } from './fishing';
import { coefBand, formatDate } from './format';
import { beaufort } from './weather';

/**
 * Agrégats du carnet de pêche — fonctions **pures**, sans dépendance à Vue ni au réseau.
 *
 * Deux règles gouvernent tout ce module :
 *
 * 1. **« Prises » et « individus » sont deux chiffres distincts.** Une ligne saisie (`catchLines`)
 *    n'est pas une quantité (`individuals`) : 19 prises font 118 individus, dont 96 crevettes.
 * 2. **Aucune comparaison ne porte sur un total toutes espèces mêlées.** Sommer 25 crevettes et
 *    1 homard ferait de toute moyenne un compteur de crevettes, et le croisement « boëtté ou non »
 *    ne mesurerait plus que le casier à crevettes. Les croisements rendent donc une moyenne
 *    **par espèce** (cf. `compare`).
 *
 * Rien n'est arrondi ici : le formatage appartient au composant.
 */

export interface LogSummary {
  trips: number;
  /** Lignes de prise saisies. */
  catchLines: number;
  /** Somme des quantités. */
  individuals: number;
  kept: number;
  released: number;
  /** Sorties sans aucune prise : une bredouille est une donnée, pas une absence de donnée. */
  blankTrips: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface SpeciesStat {
  id: string;
  label: string;
  labelPlural: string;
  individuals: number;
  lines: number;
  /** Nombre de **sorties** où l'espèce apparaît (pas de lignes). */
  trips: number;
  kept: number;
  released: number;
  /** Meilleure sortie pour cette espèce (quantités du jour cumulées). */
  best: { date: string; quantity: number } | null;
}

export interface GearStat {
  id: string;
  label: string;
  individuals: number;
  trips: number;
}

/** Un croisement : comment ranger une sortie, et dans quel ordre présenter les groupes. */
export interface Dimension {
  id: string;
  title: string;
  /** Clé du groupe, ou `null` si la sortie ne peut pas être classée (elle tombe dans `excluded`). */
  keyOf: (trip: FishingTrip) => string | null;
  /** Libellé affiché d'une clé (défaut : la clé elle-même). */
  labelOf?: (key: string) => string;
  /** Ordre imposé des clés ; sinon tri naturel (les mois `YYYY-MM` sont donc chronologiques). */
  order?: string[];
  /** Ce qui manque à une sortie exclue, pour l'écrire sans mentir (« sans météo »). */
  excludedLabel?: string;
}

export interface CompareRow {
  label: string;
  trips: number;
  blankTrips: number;
  /** Individus par sortie, aligné sur les `speciesIds` passés à `compare`. */
  perSpecies: number[];
}

export interface Comparison {
  id: string;
  title: string;
  rows: CompareRow[];
  /** Sorties que la dimension n'a pas su classer — affiché, jamais silencieux. */
  excluded: number;
  excludedLabel: string;
}

/** Bilan d'ensemble du carnet. */
export function summarizeLog(trips: FishingTrip[]): LogSummary {
  const summary: LogSummary = {
    trips: trips.length,
    catchLines: 0,
    individuals: 0,
    kept: 0,
    released: 0,
    blankTrips: 0,
    firstDate: null,
    lastDate: null
  };

  for (const trip of trips) {
    if (!trip.catches.length) summary.blankTrips += 1;
    summary.catchLines += trip.catches.length;
    for (const c of trip.catches) {
      summary.individuals += c.quantity;
      if (c.kept) summary.kept += c.quantity;
      else summary.released += c.quantity;
    }
    if (summary.firstDate === null || trip.date < summary.firstDate) summary.firstDate = trip.date;
    if (summary.lastDate === null || trip.date > summary.lastDate) summary.lastDate = trip.date;
  }

  return summary;
}

/**
 * Classement des espèces par individus décroissants.
 *
 * Le libellé et son pluriel viennent du **référentiel**, ils ne sont jamais calculés (« lieu jaune »
 * fait « lieus jaunes » là où « lieu » l'endroit ferait « lieux »). Un identifiant disparu du
 * référentiel s'affiche **brut**, comme le fait déjà `summarizeCatches`.
 */
export function speciesRanking(trips: FishingTrip[], refs: FishingRef[]): SpeciesStat[] {
  const stats = new Map<string, SpeciesStat>();

  for (const trip of trips) {
    const perTrip = new Map<string, number>();
    for (const c of trip.catches) {
      const stat = ensureSpecies(stats, c.speciesId, refs);
      stat.individuals += c.quantity;
      stat.lines += 1;
      if (c.kept) stat.kept += c.quantity;
      else stat.released += c.quantity;
      perTrip.set(c.speciesId, (perTrip.get(c.speciesId) ?? 0) + c.quantity);
    }
    for (const [id, quantity] of perTrip) {
      const stat = stats.get(id) as SpeciesStat;
      stat.trips += 1;
      if (!stat.best || quantity > stat.best.quantity) stat.best = { date: trip.date, quantity };
    }
  }

  return [...stats.values()].sort(
    (a, b) => b.individuals - a.individuals || a.label.localeCompare(b.label, 'fr')
  );
}

/** Individus et sorties par engin, même conventions de libellé que `speciesRanking`. */
export function gearRanking(trips: FishingTrip[], refs: FishingRef[]): GearStat[] {
  const stats = new Map<string, GearStat>();

  for (const trip of trips) {
    const seen = new Set<string>();
    for (const c of trip.catches) {
      let stat = stats.get(c.gearId);
      if (!stat) {
        stat = { id: c.gearId, label: labelOf(c.gearId, refs), individuals: 0, trips: 0 };
        stats.set(c.gearId, stat);
      }
      stat.individuals += c.quantity;
      seen.add(c.gearId);
    }
    for (const id of seen) (stats.get(id) as GearStat).trips += 1;
  }

  return [...stats.values()].sort(
    (a, b) => b.individuals - a.individuals || a.label.localeCompare(b.label, 'fr')
  );
}

/**
 * Croise les sorties selon une dimension. Chaque groupe rend son effectif et, **pour chaque espèce
 * de `speciesIds`**, la moyenne d'individus par sortie. Un groupe sans sortie n'est pas rendu.
 */
export function compare(
  trips: FishingTrip[],
  speciesIds: string[],
  dim: Dimension
): Comparison {
  const groups = new Map<string, { trips: number; blankTrips: number; totals: number[] }>();
  let excluded = 0;

  for (const trip of trips) {
    const key = dim.keyOf(trip);
    if (key === null) {
      excluded += 1;
      continue;
    }
    let group = groups.get(key);
    if (!group) {
      group = { trips: 0, blankTrips: 0, totals: speciesIds.map(() => 0) };
      groups.set(key, group);
    }
    group.trips += 1;
    if (!trip.catches.length) group.blankTrips += 1;
    for (const c of trip.catches) {
      const index = speciesIds.indexOf(c.speciesId);
      if (index >= 0) group.totals[index] += c.quantity;
    }
  }

  const keys = [...groups.keys()].sort(
    dim.order ? byOrder(dim.order) : (a, b) => a.localeCompare(b, 'fr')
  );

  return {
    id: dim.id,
    title: dim.title,
    excluded,
    excludedLabel: dim.excludedLabel ?? 'non classée(s)',
    rows: keys.map(key => {
      const group = groups.get(key) as { trips: number; blankTrips: number; totals: number[] };
      return {
        label: dim.labelOf ? dim.labelOf(key) : key,
        trips: group.trips,
        blankTrips: group.blankTrips,
        perSpecies: group.totals.map(total => total / group.trips)
      };
    })
  };
}

const COEF_ORDER = ['Morte-eau', 'Marée moyenne', 'Vive-eau', 'Grande vive-eau', 'Grande marée'];
const WIND_ORDER = ['0–3 Bft', '4 Bft', '5 Bft et plus'];
const SEA_ORDER = ['< 18 °C', '18–20 °C', '≥ 20 °C'];
const SKY_ORDER = ['Clair', 'Couvert', 'Pluie', 'Orage'];

/**
 * Les six croisements proposés. Le coefficient a besoin des marées **Port-Tudy**, d'où la fermeture.
 *
 * ⚠️ Les trois dimensions météo excluent toute sortie dont la capture a échoué (`weather` null, ou
 * champ manquant) : la capture est best-effort — hors fenêtre Open-Meteo, la colonne reste `NULL`.
 */
export function buildDimensions(tides: FlatTide[]): Dimension[] {
  return [
    {
      id: 'baited',
      title: 'Casiers boëttés',
      keyOf: trip => (trip.baited ? 'Oui' : 'Non'),
      order: ['Oui', 'Non']
    },
    {
      id: 'coef',
      title: 'Coefficient de marée',
      keyOf: trip => {
        const coef = dayCoefficient(tides, trip.date);
        return coef == null ? null : coefBand(coef).label;
      },
      order: COEF_ORDER,
      excludedLabel: 'hors des horaires connus'
    },
    {
      id: 'month',
      title: 'Mois',
      keyOf: trip => trip.date.slice(0, 7),
      labelOf: monthLabel
    },
    {
      id: 'wind',
      title: 'Vent',
      keyOf: trip => windBucket(trip.weather?.windMax),
      order: WIND_ORDER,
      excludedLabel: 'sans météo'
    },
    {
      id: 'sea',
      title: "Température de l'eau",
      keyOf: trip => seaBucket(trip.weather?.seaTemperature),
      order: SEA_ORDER,
      excludedLabel: 'sans météo'
    },
    {
      id: 'sky',
      title: 'Ciel',
      keyOf: trip => skyBucket(trip.weather?.weatherCode),
      order: SKY_ORDER,
      excludedLabel: 'sans météo'
    }
  ];
}

function ensureSpecies(
  stats: Map<string, SpeciesStat>,
  id: string,
  refs: FishingRef[]
): SpeciesStat {
  let stat = stats.get(id);
  if (!stat) {
    const ref = refs.find(r => r.id === id);
    stat = {
      id,
      label: ref?.label ?? id,
      labelPlural: ref?.labelPlural || ref?.label || id,
      individuals: 0,
      lines: 0,
      trips: 0,
      kept: 0,
      released: 0,
      best: null
    };
    stats.set(id, stat);
  }
  return stat;
}

function labelOf(id: string, refs: FishingRef[]): string {
  return refs.find(r => r.id === id)?.label ?? id;
}

/** Clés hors de l'ordre imposé rangées en fin, par ordre alphabétique. */
function byOrder(order: string[]): (a: string, b: string) => number {
  return (a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  };
}

/**
 * « Septembre 2026 » — la majuscule est posée **en JS** (initiale seule) : `text-capitalize`
 * écrirait une majuscule à chaque mot, or les mois s'écrivent en minuscules en français.
 */
function monthLabel(key: string): string {
  const text = formatDate(`${key}-01`, { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function windBucket(kmh: number | null | undefined): string | null {
  if (kmh == null || !Number.isFinite(kmh)) return null;
  const { force } = beaufort(kmh);
  if (force <= 3) return WIND_ORDER[0];
  if (force === 4) return WIND_ORDER[1];
  return WIND_ORDER[2];
}

function seaBucket(celsius: number | null | undefined): string | null {
  if (celsius == null || !Number.isFinite(celsius)) return null;
  if (celsius < 18) return SEA_ORDER[0];
  if (celsius < 20) return SEA_ORDER[1];
  return SEA_ORDER[2];
}

/** Codes WMO en quatre ciels. ≥ 51 = précipitation (la neige, sans objet ici, y tombe aussi). */
function skyBucket(code: number | null | undefined): string | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code >= 95) return SKY_ORDER[3];
  if (code >= 51) return SKY_ORDER[2];
  if (code >= 2) return SKY_ORDER[1];
  return SKY_ORDER[0];
}
