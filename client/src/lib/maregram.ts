import type { FlatTide, NavihanOffsets } from '../types';

export interface MaregramPoint {
  minutes: number;
  height: number;
}

export interface MarkerPoint {
  minutes: number;
  height: number;
  type: 'high' | 'low';
}

export interface OffsetPoint {
  offset: number;
  height: number;
}

/**
 * Extrêmes → points { offset (min depuis 00:00 du jour cible), height }, triés.
 * `shift(e)` décale chaque extrême (minutes) — utilisé pour le marégramme Navihan.
 */
function toOffsetPoints(extremes: FlatTide[], dateKey: string, shift?: (e: FlatTide) => number): OffsetPoint[] {
  const dayStart = new Date(`${dateKey}T00:00:00`).getTime();
  return extremes
    .filter(e => Number.isFinite(e.height))
    .map(e => ({
      offset: (new Date(`${e.date}T${e.time}:00`).getTime() - dayStart) / 60000 + (shift ? shift(e) : 0),
      height: e.height
    }))
    // Fenêtre autour du jour cible (extrêmes de la veille au surlendemain).
    .filter(p => p.offset >= -1440 && p.offset <= 2880)
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Inverse de l'interpolation cosinus sur un segment **montant** basse mer `a` → pleine mer `b` :
 * instant (même unité que `offset`) où la courbe atteint la hauteur `threshold`.
 * - `b.height ≤ a.height` (segment non montant) → `null`.
 * - `threshold ≤ a.height` (déjà atteint à la basse mer) → `a.offset` (délai nul).
 * - `threshold ≥ b.height` (seuil non atteint avant la pleine mer) → `null`.
 */
export function inverseCosineRising(a: OffsetPoint, b: OffsetPoint, threshold: number): number | null {
  if (b.height <= a.height) return null;
  if (threshold <= a.height) return a.offset;
  if (threshold >= b.height) return null;
  const x = (threshold - a.height) / (b.height - a.height); // ∈ (0,1)
  const ratio = Math.acos(1 - 2 * x) / Math.PI;
  return a.offset + ratio * (b.offset - a.offset);
}

/** Interpolation cosinus de la hauteur à l'instant `t` (min), ou null si non encadré. */
function interpolate(pts: OffsetPoint[], t: number): number | null {
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].offset < t) i++;
  const a = pts[i];
  const b = pts[i + 1];
  if (!a || !b || t < a.offset || t > b.offset) return null;
  const ratio = (t - a.offset) / (b.offset - a.offset);
  return a.height + ((b.height - a.height) * (1 - Math.cos(Math.PI * ratio))) / 2;
}

/** Échantillonne la courbe sur `[0, 1440]` minutes (instants non couverts omis). */
function sample(pts: OffsetPoint[], stepMinutes: number): MaregramPoint[] {
  const out: MaregramPoint[] = [];
  for (let t = 0; t <= 1440; t += stepMinutes) {
    const height = interpolate(pts, t);
    if (height != null) out.push({ minutes: t, height });
  }
  return out;
}

/** Décalage Navihan appliqué à un extrême selon son type (pleine mer / basse mer). */
function navihanShift(offsets: NavihanOffsets): (e: FlatTide) => number {
  return e => (e.type === 'high' ? offsets.pleineMer : offsets.basseMer);
}

/**
 * Marégramme **Port-Tudy** : hauteur d'eau minute par minute pour un jour, par interpolation
 * cosinus entre les extrêmes qui l'encadrent. `minutes` compté depuis 00:00 (0 → 1440).
 */
export function buildMaregram(extremes: FlatTide[], dateKey: string, stepMinutes = 10): MaregramPoint[] {
  return sample(toOffsetPoints(extremes, dateKey), stepMinutes);
}

/** Hauteur Port-Tudy interpolée à `minute` le jour `dateKey`, ou null si non couvert. */
export function heightAtMinute(extremes: FlatTide[], dateKey: string, minute: number): number | null {
  return interpolate(toOffsetPoints(extremes, dateKey), minute);
}

/**
 * Marégramme **Navihan** : mêmes hauteurs qu'à Port-Tudy mais aux heures Navihan (chaque
 * extrême décalé par `offsets.pleineMer`/`offsets.basseMer` selon son type).
 */
export function buildNavihanMaregram(
  extremes: FlatTide[],
  dateKey: string,
  offsets: NavihanOffsets,
  stepMinutes = 10
): MaregramPoint[] {
  return sample(toOffsetPoints(extremes, dateKey, navihanShift(offsets)), stepMinutes);
}

/** Hauteur Navihan interpolée à `minute` (heure Navihan) le jour `dateKey`, ou null. */
export function navihanHeightAtMinute(
  extremes: FlatTide[],
  dateKey: string,
  offsets: NavihanOffsets,
  minute: number
): number | null {
  return interpolate(toOffsetPoints(extremes, dateKey, navihanShift(offsets)), minute);
}

/** Points d'extrêmes Navihan (pleine/basse mer) du jour, aux heures décalées. */
export function navihanExtremes(extremes: FlatTide[], dateKey: string, offsets: NavihanOffsets): MarkerPoint[] {
  const dayStart = new Date(`${dateKey}T00:00:00`).getTime();
  return extremes
    .filter(e => Number.isFinite(e.height))
    .map(e => ({
      minutes:
        (new Date(`${e.date}T${e.time}:00`).getTime() - dayStart) / 60000 +
        (e.type === 'high' ? offsets.pleineMer : offsets.basseMer),
      height: e.height,
      type: e.type
    }))
    .filter(p => p.minutes >= 0 && p.minutes <= 1440);
}

/**
 * Points « remise à flot » du jour, **modèle seuil de hauteur** (issue #4) : pour chaque basse mer,
 * instant où la courbe Navihan montante atteint `thresholdHeight` (hauteur constante = seuil). Le
 * délai après la basse mer varie donc naturellement avec le coefficient. Une basse mer dont la
 * pleine mer suivante n'atteint pas le seuil (morte-eau extrême) est omise.
 */
export function navihanAflotByThreshold(
  extremes: FlatTide[],
  dateKey: string,
  offsets: NavihanOffsets,
  thresholdHeight: number
): MaregramPoint[] {
  const dayStart = new Date(`${dateKey}T00:00:00`).getTime();
  const minuteOf = (e: FlatTide) => (new Date(`${e.date}T${e.time}:00`).getTime() - dayStart) / 60000;
  const highs = extremes
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, m: minuteOf(e) }))
    .sort((p, q) => p.m - q.m);
  const out: MaregramPoint[] = [];
  for (const low of extremes.filter(e => e.type === 'low' && Number.isFinite(e.height))) {
    const lowMinute = minuteOf(low);
    const nextHigh = highs.find(h => h.m > lowMinute);
    if (!nextHigh) continue;
    const a: OffsetPoint = { offset: lowMinute + offsets.basseMer, height: low.height };
    const b: OffsetPoint = { offset: nextHigh.m + offsets.pleineMer, height: nextHigh.e.height };
    const minutes = inverseCosineRising(a, b, thresholdHeight);
    if (minutes == null || minutes < 0 || minutes > 1440) continue;
    out.push({ minutes, height: thresholdHeight });
  }
  return out;
}
