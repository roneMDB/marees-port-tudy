import type { FlatTide } from '../types';
import { cosineHeightAt, inverseCosineRising, type OffsetPoint } from './maregram';
import { AFLOT_COEF_REF, AFLOT_COEF_SLOPE, aflotThresholdFor } from './navihan';

/**
 * Étalonnage du modèle de remise à flot sur les heures **constatées** (issue #4, suite).
 *
 * Le modèle a deux paramètres : une **pente** en coefficient et un **niveau**. La pente est figée
 * dans `lib/navihan.ts` (c'est une correction du modèle de courbe, pas une propriété du mouillage) ;
 * seul le niveau est étalonné ici. Mesuré sur 18 relevés, n'étalonner que le niveau fait **mieux**
 * qu'étalonner les deux (5,2 min contre 5,6 en validation leave-one-out) : un paramètre libre suffit
 * et il est plus stable.
 *
 * Cf. `docs/superpowers/specs/2026-09-14-etalonnage-aflot-observations-design.md`.
 */

/** Nombre de relevés exploitables en deçà duquel on s'en tient au réglage. */
export const MIN_AFLOT_SAMPLES = 4;

export interface AflotCalibration {
  /** Niveau retenu : hauteur **Port-Tudy** de flottaison au coefficient `AFLOT_COEF_REF`. */
  refHeight: number;
  /** Relevés exploitables ayant servi à l'étalonnage. */
  samples: number;
  /** Écart moyen résiduel du modèle étalonné sur ces relevés, en minutes (`null` si repli). */
  mae: number | null;
  /** `false` = trop peu de relevés, `refHeight` est la valeur du réglage. */
  calibrated: boolean;
}

/** Un relevé exploitable : le segment montant Port-Tudy et le délai réellement constaté. */
interface Sample {
  a: OffsetPoint; // basse mer Port-Tudy
  b: OffsetPoint; // pleine mer suivante
  coefficient: number | null; // coefficient de la pleine mer suivante
  observed: number; // instant constaté, en minutes epoch
}

function epochMinutes(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime() / 60000;
}

/**
 * Apparie chaque observation à sa basse mer Port-Tudy et à la pleine mer suivante.
 *
 * Écarte le relevé si la basse mer est introuvable, si une hauteur manque, s'il n'y a pas de pleine
 * mer suivante, ou si l'heure constatée ne tombe pas **dans la montante** : une saisie hors de ce
 * segment n'est pas descriptible par le modèle et la laisser entrer fausserait le niveau.
 */
function collectSamples(ptTides: FlatTide[], observations: Record<string, string>): Sample[] {
  const highs = ptTides
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, t: epochMinutes(e.date, e.time) }))
    .sort((p, q) => p.t - q.t);
  const lows = new Map<string, FlatTide>();
  for (const e of ptTides) if (e.type === 'low') lows.set(`${e.date} ${e.time}`, e);

  const out: Sample[] = [];
  for (const [key, observedTime] of Object.entries(observations)) {
    const low = lows.get(key);
    if (!low || !Number.isFinite(low.height)) continue;
    const lowEpoch = epochMinutes(low.date, low.time);
    const nextHigh = highs.find(x => x.t > lowEpoch);
    if (!nextHigh || nextHigh.e.height <= low.height) continue;

    // L'heure constatée est un `HH:MM` nu, rattaché au jour de la basse mer : un à-flot qui franchit
    // minuit se lit donc « avant » elle et doit être reporté au lendemain.
    let observed = epochMinutes(low.date, observedTime);
    if (!Number.isFinite(observed)) continue;
    if (observed < lowEpoch) observed += 24 * 60;
    if (observed <= lowEpoch || observed >= nextHigh.t) continue;

    out.push({
      a: { offset: lowEpoch, height: low.height },
      b: { offset: nextHigh.t, height: nextHigh.e.height },
      coefficient: nextHigh.e.coefficient,
      observed
    });
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Écart moyen (min) du modèle au niveau `refHeight`, sur les relevés retenus. */
function meanAbsoluteError(samples: Sample[], refHeight: number): number | null {
  const errors: number[] = [];
  for (const s of samples) {
    const predicted = inverseCosineRising(s.a, s.b, aflotThresholdFor(s.coefficient, refHeight));
    if (predicted == null) continue;
    errors.push(Math.abs(predicted - s.observed));
  }
  if (!errors.length) return null;
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

/**
 * Étalonne le niveau de flottaison sur les heures constatées.
 *
 * Pour chaque relevé, on lit la hauteur **Port-Tudy** atteinte à l'heure constatée, puis on la
 * ramène au coefficient de référence en retirant la pente. Le niveau retenu est la **médiane** de
 * ces hauteurs, pas la moyenne : une saisie fausse de 30 min ne déplace alors la médiane que de
 * 0,017 m et laisse l'erreur sur les relevés sains inchangée.
 *
 * Sous `minSamples` relevés exploitables, on renvoie `fallbackRefHeight` (le réglage) avec
 * `calibrated: false` — l'étalonnage converge dès 4 relevés, mais en deçà il n'a rien à dire.
 *
 * `ptTides` = extrêmes **Port-Tudy** ; `observations` = la map de `useAflotObservations`
 * (clé `${date} ${heure}` de la basse mer Port-Tudy → heure constatée `HH:MM`).
 */
export function calibrateAflot(
  ptTides: FlatTide[],
  observations: Record<string, string>,
  fallbackRefHeight: number,
  minSamples: number = MIN_AFLOT_SAMPLES
): AflotCalibration {
  const samples = collectSamples(ptTides, observations);
  if (samples.length < minSamples) {
    return { refHeight: fallbackRefHeight, samples: samples.length, mae: null, calibrated: false };
  }
  const refHeight = median(
    samples.map(
      s =>
        cosineHeightAt(s.a, s.b, s.observed) -
        (s.coefficient == null || !Number.isFinite(s.coefficient)
          ? 0
          : AFLOT_COEF_SLOPE * (s.coefficient - AFLOT_COEF_REF))
    )
  );
  return { refHeight, samples: samples.length, mae: meanAbsoluteError(samples, refHeight), calibrated: true };
}
