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
