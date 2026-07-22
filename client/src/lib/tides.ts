import type { FlatTide, Settings, TideFilters, TideOutput } from '../types';
import { addDays, todayKey } from './format';

/** Aplatit `TideOutput.days` en une liste d'extrêmes portant leur date, triée par date+heure. */
export function flatten(data: TideOutput): FlatTide[] {
  return Object.entries(data.days)
    .flatMap(([date, extremes]) => extremes.map(e => ({ date, ...e })))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Borne une date `YYYY-MM-DD` dans l'intervalle `[min, max]` (bornes vides ignorées). */
export function clampDate(date: string, min: string, max: string): string {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/**
 * Fenêtre de dates dérivée de la config : début = aujourd'hui (mode `today`) ou
 * `startDate` (mode `date`), fin = début + `rangeDays`. Bornée à `[min, max]`.
 */
export function resolveWindow(settings: Settings, min: string, max: string): { from: string; to: string } {
  const start = settings.startMode === 'date' && settings.startDate ? settings.startDate : todayKey();
  const from = clampDate(start, min, max);
  const to = clampDate(addDays(from, settings.rangeDays), min, max);
  return { from, to };
}

/** Instant absolu (ms) d'un extrême, à partir de sa date + heure locales. */
function tideMs(t: FlatTide): number {
  return new Date(`${t.date}T${t.time}:00`).getTime();
}

/**
 * Annote chaque marée d'un **port** (`site`) avec `refTime` = l'heure de la marée **Port-Tudy**
 * (`reference`) de **même type** la plus proche dans le temps (tous jours confondus, gère le
 * passage de minuit dû au décalage horaire entre les deux ports). Au-delà de `toleranceMin`
 * (défaut 3 h) on considère qu'il n'y a pas de correspondance → `refTime = null` (Navihan « — »).
 * Sert à dériver les heures Navihan (toujours basées sur Port-Tudy) pour les marées d'un autre port.
 */
export function matchNavihanReference(
  site: FlatTide[],
  reference: FlatTide[],
  toleranceMin = 180
): FlatTide[] {
  const refByType: Record<'high' | 'low', { ms: number; time: string }[]> = { high: [], low: [] };
  for (const r of reference) {
    refByType[r.type].push({ ms: tideMs(r), time: r.time });
  }
  const toleranceMs = toleranceMin * 60_000;
  return site.map(t => {
    const ms = tideMs(t);
    let bestTime: string | null = null;
    let bestDiff = Infinity;
    for (const r of refByType[t.type]) {
      const diff = Math.abs(r.ms - ms);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestTime = r.time;
      }
    }
    return { ...t, refTime: bestDiff <= toleranceMs ? bestTime : null };
  });
}

/** Marées d'une journée, regroupées pour un affichage « une ligne par jour ». */
export interface DayTides {
  date: string;
  highs: FlatTide[]; // pleines mers, triées par heure
  lows: FlatTide[]; // basses mers, triées par heure
  coefficient: number | null; // coef du jour = max des coef des pleines mers (null si aucun)
}

/** Regroupe une liste d'extrêmes par jour (trié par date croissante ; marées triées par heure). */
export function groupByDay(tides: FlatTide[]): DayTides[] {
  const byDate = new Map<string, FlatTide[]>();
  for (const t of tides) {
    const list = byDate.get(t.date);
    if (list) list.push(t);
    else byDate.set(t.date, [t]);
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entries]) => {
      const byTime = (a: FlatTide, b: FlatTide) => a.time.localeCompare(b.time);
      const highs = entries.filter(t => t.type === 'high').sort(byTime);
      const lows = entries.filter(t => t.type === 'low').sort(byTime);
      const coefs = highs.map(h => h.coefficient).filter((c): c is number => c != null);
      return { date, highs, lows, coefficient: coefs.length ? Math.max(...coefs) : null };
    });
}

/**
 * Fenêtre du tableau décalée de `offset` périodes de `rangeDays` jours par rapport au début
 * configuré (`offset` négatif = passé). `to` = `from + rangeDays` (période pleine, même en bord de
 * plage). Bornée à `[min, max]` (bornes vides ignorées). `offset = 0` → fenêtre configurée.
 */
export function periodWindow(
  configuredFrom: string,
  rangeDays: number,
  offset: number,
  min: string,
  max: string
): { from: string; to: string } {
  const from = clampDate(addDays(configuredFrom, offset * rangeDays), min, max);
  const to = clampDate(addDays(from, rangeDays), min, max);
  return { from, to };
}

/** Applique les filtres (plage de dates inclusive, type, coefficient minimum). */
export function filterTides(tides: FlatTide[], f: TideFilters): FlatTide[] {
  return tides.filter(t => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.type !== 'all' && t.type !== f.type) return false;
    if (f.minCoef != null && (t.coefficient == null || t.coefficient < f.minCoef)) return false;
    return true;
  });
}
