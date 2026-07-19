import type { FlatTide, NavihanOffsets } from '../types';
import { NAVIHAN } from '../types';

/** Décalages Navihan par défaut, en minutes (basse mer/pleine mer +1h15, à flot +2h40). */
export const DEFAULT_OFFSETS: NavihanOffsets = {
  basseMer: 75,
  pleineMer: 75,
  aFlot: 160
};

const DAY_MINUTES = 24 * 60;

/** Ajoute `offsetMinutes` à une heure `HH:MM`, avec passage de minuit géré. */
export function shiftTime(time: string, offsetMinutes: number): string {
  const [hours, minutes] = time.split(':').map(Number);
  const total = (hours * 60 + minutes + offsetMinutes + DAY_MINUTES) % DAY_MINUTES;
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Construit la map des heures Navihan d'un extrême selon les décalages courants :
 * basse mer → `Basse mer` + `A flot` ; pleine mer → `Pleine mer`.
 */
export function computeNavihan(
  ext: { time: string; type: 'high' | 'low' },
  offsets: NavihanOffsets
): Record<string, string> {
  if (ext.type === 'low') {
    return {
      [NAVIHAN.basseMer]: shiftTime(ext.time, offsets.basseMer),
      [NAVIHAN.aFlot]: shiftTime(ext.time, offsets.aFlot)
    };
  }
  return {
    [NAVIHAN.pleineMer]: shiftTime(ext.time, offsets.pleineMer)
  };
}

/** Prochain à-flot (basse mer + `aFlotOffset`) dont l'heure est ≥ `now`, avec sa basse source. */
export interface NextAflot {
  time: string; // heure à-flot décalée, `HH:MM`
  date: string; // date réelle de l'à-flot, `YYYY-MM-DD` (gère le passage de minuit)
  basse: FlatTide; // basse mer d'origine
}

/**
 * Cherche le prochain « à flot » à venir, dérivé de la basse mer dont l'heure décalée
 * est la première ≥ `now` — indépendamment du fait que la toute prochaine marée soit
 * une pleine ou une basse mer. Renvoie `null` s'il n'y en a plus.
 */
export function nextAflot(tides: FlatTide[], aFlotOffset: number, now: Date): NextAflot | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  const upcoming = tides
    .filter(t => t.type === 'low')
    .map(t => {
      const dt = new Date(`${t.date}T${t.time}:00`);
      dt.setMinutes(dt.getMinutes() + aFlotOffset);
      return { dt, basse: t };
    })
    .filter(c => c.dt >= now)
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());

  const first = upcoming[0];
  if (!first) return null;
  const { dt, basse } = first;
  return {
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    basse
  };
}

/** Formate des minutes en libellé `XhYY` (ex. 75 → "1h15", 120 → "2h"). */
export function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}
