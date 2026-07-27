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
 * Comme `shiftTime`, mais renvoie aussi la **date réelle** du résultat : indispensable dès qu'on
 * affiche une heure Navihan datée, puisqu'un décalage peut franchir minuit (une basse mer
 * Port-Tudy à 23:30 donne une basse mer Navihan à 00:45 **le lendemain**).
 */
export function shiftMoment(
  date: string,
  time: string,
  offsetMinutes: number
): { date: string; time: string } {
  const dt = new Date(new Date(`${date}T${time}:00`).getTime() + offsetMinutes * 60000);
  return { date: localDate(dt), time: localTime(dt) };
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

const pad = (n: number): string => String(n).padStart(2, '0');

/** Heure locale `HH:MM` d'un instant. */
function localTime(dt: Date): string {
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Date locale `YYYY-MM-DD` d'un instant (donc la date **réelle**, après passage de minuit). */
function localDate(dt: Date): string {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Cherche le prochain « à flot » à venir (heure **Remise à flot**, décalage fixe), dérivé de la
 * basse mer dont l'instant de remise à flot est le premier ≥ `now` — indépendamment du fait que la
 * toute prochaine marée soit une pleine ou une basse mer. Renvoie `null` s'il n'y en a plus.
 */
export function nextAflot(tides: FlatTide[], offsets: NavihanOffsets, now: Date): NextAflot | null {
  const first = aflotEvents(tides, offsets).find(e => e.dt >= now);
  if (!first) return null;
  const { dt, basse } = first;
  return { time: localTime(dt), date: localDate(dt), basse };
}

/** Une remise à flot dans l'agenda. */
export interface AflotTime {
  time: string; // heure `HH:MM`
  past: boolean; // déjà passée par rapport à `now`
}

/** Les remises à flot qui ont lieu un jour donné. */
export interface AflotDay {
  date: string; // jour où les remises à flot **ont lieu**, `YYYY-MM-DD`
  times: AflotTime[]; // chronologiques
}

/**
 * Agenda des remises à flot (heure « Remise à flot », décalage fixe `aFlot`) sur les `days`
 * premiers jours à partir de celui de `now` (inclus).
 *
 * Le regroupement se fait par **date réelle de la remise à flot** : une basse mer tardive dont le
 * décalage franchit minuit voit donc son à-flot rangé au **lendemain**, là où il a effectivement
 * lieu. Sur des données saines, un jour porte au plus deux remises à flot.
 *
 * Les heures **déjà passées ne sont pas retirées** (`past` les marque) : la carte reste un agenda
 * stable qui ne se vide pas au fil de la journée. `tides` = extrêmes **Port-Tudy**.
 */
export function aflotAgenda(
  tides: FlatTide[],
  offsets: NavihanOffsets,
  now: Date,
  days: number
): AflotDay[] {
  const today = localDate(now);
  const byDay = new Map<string, AflotTime[]>();

  // `aflotEvents` est déjà trié : l'ordre d'insertion des heures est donc chronologique.
  for (const { dt } of aflotEvents(tides, offsets)) {
    const date = localDate(dt);
    if (date < today) continue;
    const times = byDay.get(date) ?? [];
    times.push({ time: localTime(dt), past: dt < now });
    byDay.set(date, times);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, days)
    .map(([date, times]) => ({ date, times }));
}

/** Formate des minutes en libellé `XhYY` (ex. 75 → "1h15", 120 → "2h"). */
export function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}
