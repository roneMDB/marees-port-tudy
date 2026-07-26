import type { FlatTide, NavihanOffsets } from '../types';
import { NAVIHAN } from '../types';
import { inverseCosineRising, type OffsetPoint } from './maregram';

/** Décalages Navihan par défaut, en minutes (basse mer/pleine mer +1h15, à flot déprécié). */
export const DEFAULT_OFFSETS: NavihanOffsets = {
  basseMer: 75,
  pleineMer: 75,
  aFlot: 160
};

/**
 * Seuil de remise à flot par défaut (m), **rétro-calibré** sur les horaires Port-Tudy pour
 * reproduire ~2h40 après la basse mer au coefficient médian (~69). Cf. modèle seuil, issue #4.
 */
export const DEFAULT_AFLOT_THRESHOLD = 2.8;

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
 * basse mer → `Basse mer` + `A flot` (**décalage fixe**, calcul historique conservé) ;
 * pleine mer → `Pleine mer`. L'**estimation** de remise à flot par seuil de hauteur (issue #4) est
 * calculée à part (`aflotTimeByThreshold`) et exposée dans un champ distinct (`aflotEstimate`).
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

/** Minutes epoch d'un extrême (date + heure locale), pour situer les instants entre eux. */
function epochMinutes(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime() / 60000;
}

/**
 * **Estimation** de remise à flot (`HH:MM`) d'une basse mer, par **modèle seuil de hauteur**
 * (issue #4) — n'est affichée que dans le **tableau du dashboard** (pastille « Estimation ») :
 * instant où la courbe Navihan montante (basse mer → pleine mer suivante, décalées) atteint
 * `thresholdHeight`. Le décalage après la basse mer varie ainsi avec le coefficient. `null` si le
 * seuil n'est pas atteint avant la pleine mer (morte-eau extrême) ou s'il n'y a pas de pleine mer
 * suivante. `ptExtremes` = extrêmes **Port-Tudy** (les hauteurs de référence Navihan).
 */
export function aflotTimeByThreshold(
  ptExtremes: FlatTide[],
  low: FlatTide,
  offsets: NavihanOffsets,
  thresholdHeight: number
): string | null {
  if (!Number.isFinite(low.height)) return null;
  const lowEpoch = epochMinutes(low.date, low.time);
  const nextHigh = ptExtremes
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, t: epochMinutes(e.date, e.time) }))
    .filter(x => x.t > lowEpoch)
    .sort((p, q) => p.t - q.t)[0];
  if (!nextHigh) return null;
  const a: OffsetPoint = { offset: lowEpoch + offsets.basseMer, height: low.height };
  const b: OffsetPoint = { offset: nextHigh.t + offsets.pleineMer, height: nextHigh.e.height };
  const cross = inverseCosineRising(a, b, thresholdHeight);
  if (cross == null) return null;
  const d = new Date(cross * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Prochain à-flot (basse mer + `aFlotOffset`) dont l'heure est ≥ `now`, avec sa basse source. */
export interface NextAflot {
  time: string; // heure à-flot décalée, `HH:MM`
  date: string; // date réelle de l'à-flot, `YYYY-MM-DD` (gère le passage de minuit)
  basse: FlatTide; // basse mer d'origine
}

/** Un instant de remise à flot (décalage fixe `aFlot`) avec la basse mer d'origine. */
export interface AflotEvent {
  dt: Date;
  basse: FlatTide;
}

/**
 * Instants de **remise à flot** de toutes les basses mers, par **décalage fixe** (`offsets.aFlot`,
 * l'heure « Remise à flot » de Navihan), triés chronologiquement. Base commune de `nextAflot` et de
 * la carte « Prochaines remises à flot ». L'**estimation** par seuil de hauteur
 * (`aflotTimeByThreshold`) est volontairement réservée au tableau du dashboard.
 * `tides` = extrêmes **Port-Tudy**.
 */
export function aflotEvents(tides: FlatTide[], offsets: NavihanOffsets): AflotEvent[] {
  return tides
    .filter(t => t.type === 'low')
    .map(low => ({
      dt: new Date(new Date(`${low.date}T${low.time}:00`).getTime() + offsets.aFlot * 60000),
      basse: low
    }))
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());
}

/**
 * Cherche le prochain « à flot » à venir (heure **Remise à flot**, décalage fixe), dérivé de la
 * basse mer dont l'instant de remise à flot est le premier ≥ `now` — indépendamment du fait que la
 * toute prochaine marée soit une pleine ou une basse mer. Renvoie `null` s'il n'y en a plus.
 */
export function nextAflot(tides: FlatTide[], offsets: NavihanOffsets, now: Date): NextAflot | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = aflotEvents(tides, offsets).find(e => e.dt >= now);
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
