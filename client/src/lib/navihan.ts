import type { NavihanOffsets } from '../types';
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

/** Formate des minutes en libellé `XhYY` (ex. 75 → "1h15", 120 → "2h"). */
export function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}
