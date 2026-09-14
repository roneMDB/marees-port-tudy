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

/**
 * Hauteur sur le segment cosinus `a → b` à l'instant `offset` (même unité que les `offset` des
 * points). Inverse exacte de `inverseCosineRising` ; suppose `a.offset ≤ offset ≤ b.offset`.
 * Exportée pour que `lib/aflotCalibration.ts` lise la hauteur atteinte à une heure **constatée**
 * avec la formule utilisée par le marégramme, plutôt que d'en dupliquer une seconde.
 */
export function cosineHeightAt(a: OffsetPoint, b: OffsetPoint, offset: number): number {
  const ratio = (offset - a.offset) / (b.offset - a.offset);
  return a.height + ((b.height - a.height) * (1 - Math.cos(Math.PI * ratio))) / 2;
}

/** Interpolation cosinus de la hauteur à l'instant `t` (min), ou null si non encadré. */
function interpolate(pts: OffsetPoint[], t: number): number | null {
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].offset < t) i++;
  const a = pts[i];
  const b = pts[i + 1];
  if (!a || !b || t < a.offset || t > b.offset) return null;
  return cosineHeightAt(a, b, t);
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
 * Points « remise à flot » du jour, **décalage fixe** (`offsets.aFlot`) : pour chaque basse mer,
 * l'heure Navihan « Remise à flot » (basse mer Port-Tudy + `aFlot`), à la hauteur de la courbe
 * Navihan à cet instant. L'**estimation** par seuil de hauteur (`aflotTimeByThreshold`, issue #4)
 * n'est pas tracée ici : elle reste cantonnée au tableau du dashboard.
 */
export function navihanAflotFixed(
  extremes: FlatTide[],
  dateKey: string,
  offsets: NavihanOffsets
): MaregramPoint[] {
  const dayStart = new Date(`${dateKey}T00:00:00`).getTime();
  const curve = toOffsetPoints(extremes, dateKey, navihanShift(offsets));
  const out: MaregramPoint[] = [];
  for (const low of extremes.filter(e => e.type === 'low' && Number.isFinite(e.height))) {
    const minutes =
      (new Date(`${low.date}T${low.time}:00`).getTime() - dayStart) / 60000 + offsets.aFlot;
    if (minutes < 0 || minutes > 1440) continue;
    const height = interpolate(curve, minutes);
    if (height == null) continue; // instant non encadré par deux extrêmes (bord de plage)
    out.push({ minutes, height });
  }
  return out;
}
