import type { FishingCatch, FishingRef, FlatTide, NavihanOffsets } from '../types';
import { aflotEvents } from './navihan';
import { addDays, formatDate } from './format';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Date locale `YYYY-MM-DD` d'un instant (donc la date **réelle**, après passage de minuit). */
function localDate(dt: Date): string {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Heure locale `HH:MM` d'un instant. */
function localTime(dt: Date): string {
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Coefficient d'un jour = le plus fort de ses pleines mers (les basses mers n'en portent pas). */
export function dayCoefficient(tides: FlatTide[], date: string): number | null {
  const coefs = tides
    .filter(t => t.date === date && t.coefficient != null)
    .map(t => t.coefficient as number);
  return coefs.length ? Math.max(...coefs) : null;
}

/**
 * Résumé d'une sortie en une ligne : « 12 crevettes bouquet · 3 tourteaux · 1 bar 42 cm ».
 * Une sortie sans prise n'est **pas** une absence de donnée : elle se lit « Bredouille ».
 * Un id absent du référentiel s'affiche brut, pour qu'une prise ancienne reste lisible.
 *
 * Le pluriel vient du **référentiel** (`labelPlural`), il n'est pas calculé : « lieu jaune » fait
 * « lieus jaunes » là où « lieu » l'endroit ferait « lieux », et « crevette bouquet » garde son
 * apposition invariable — aucune règle ne couvre les deux. Corollaire : un id **disparu** du
 * référentiel s'affiche tel quel jusque dans les quantités, plutôt que de se voir inventer une
 * marque du pluriel.
 */
export function summarizeCatches(catches: FishingCatch[], refs: FishingRef[]): string {
  if (catches.length === 0) return 'Bredouille';
  const labelOf = (id: string, quantity: number) => {
    const ref = refs.find(r => r.id === id);
    if (!ref) return id;
    return quantity > 1 ? ref.labelPlural : ref.label;
  };
  return catches
    .map(c => {
      const parts = [`${c.quantity}`, labelOf(c.speciesId, c.quantity).toLowerCase()];
      if (c.sizeCm != null) parts.push(`${c.sizeCm} cm`);
      else if (c.weightG != null) parts.push(`${c.weightG} g`);
      const text = parts.join(' ');
      return c.kept ? text : `${text} (${c.quantity > 1 ? 'relâchés' : 'relâché'})`;
    })
    .join(' · ');
}

/**
 * Engin à pré-sélectionner pour une espèce : son `defaultGearId` s'il désigne un engin **présent
 * dans la liste**, sinon `null` — l'appelant garde alors l'engin courant. Un défaut vers un engin
 * disparu (référentiel modifié dans un autre onglet) ne doit pas sélectionner une option absente.
 */
export function defaultGearFor(speciesId: string, species: FishingRef[], gears: FishingRef[]): string | null {
  const gearId = species.find(s => s.id === speciesId)?.defaultGearId;
  return gearId && gears.some(g => g.id === gearId) ? gearId : null;
}

/** Une remise à flot proposée au pré-remplissage du formulaire de sortie. */
export interface AflotChoice {
  /** Clé de la basse mer Port-Tudy d'origine (`YYYY-MM-DD HH:MM`) — identifie le choix. */
  key: string;
  /** Date **réelle** de la remise à flot (minuit franchi compris). */
  date: string;
  /** Heure retenue : constatée si elle existe, sinon décalage fixe. */
  time: string;
  source: 'observed' | 'fixed';
  coefficient: number | null;
  /** Libellé du sélecteur, ex. « lun. 10 août · 22:22 · coef 84 ». */
  label: string;
}

/**
 * Remises à flot proposées autour d'aujourd'hui, pour le sélecteur du formulaire (issue #3).
 *
 * Construit **sur `aflotEvents`** (`lib/navihan.ts`) : aucune formule d'à-flot n'est réécrite ici,
 * sans quoi deux calculs cohabiteraient et finiraient par diverger. L'heure retenue est celle
 * **constatée** si elle a été saisie pour cette basse mer, sinon celle du **décalage fixe** — jamais
 * l'estimation par seuil, cantonnée au tableau du dashboard. `observations` est la map de
 * `useAflotObservations` (clé `` `${date} ${heure}` `` de la basse mer Port-Tudy).
 */
export function aflotChoices(
  tides: FlatTide[],
  offsets: NavihanOffsets,
  observations: Record<string, string>,
  now: Date,
  daysBefore = 7,
  daysAfter = 7
): AflotChoice[] {
  const today = localDate(now);
  const min = addDays(today, -daysBefore);
  const max = addDays(today, daysAfter);

  return aflotEvents(tides, offsets)
    .map(({ dt, basse }) => {
      const key = `${basse.date} ${basse.time}`;
      const observed = observations[key];
      const date = localDate(dt);
      const time = observed ?? localTime(dt);
      const coefficient = dayCoefficient(tides, basse.date);
      const coefText = coefficient == null ? '' : ` · coef ${coefficient}`;
      return {
        key,
        date,
        time,
        source: observed ? ('observed' as const) : ('fixed' as const),
        coefficient,
        label: `${formatDate(date)} · ${time}${coefText}`
      };
    })
    .filter(c => c.date >= min && c.date <= max)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

/**
 * Remise à flot **la plus proche de maintenant**, passée ou à venir. Le passé compte autant que
 * l'avenir : on note souvent ses prises en rentrant, et proposer alors l'à-flot du lendemain matin
 * obligerait à corriger à chaque saisie.
 */
export function nearestAflot(choices: AflotChoice[], now: Date): AflotChoice | null {
  let best: AflotChoice | null = null;
  let bestGap = Infinity;
  for (const choice of choices) {
    const gap = Math.abs(new Date(`${choice.date}T${choice.time}:00`).getTime() - now.getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = choice;
    }
  }
  return best;
}

/** Contexte marée d'un jour de sortie — **recalculé**, jamais stocké. */
export interface TripTideContext {
  coefficient: number | null;
  /** Heures des basses mers Port-Tudy du jour, chronologiques. */
  lowTides: string[];
  /** Heures des remises à flot **ayant lieu ce jour-là** (décalage fixe), chronologiques. */
  aflot: string[];
}

/**
 * Contexte marée d'une sortie, dérivé de sa date. Rien n'en est persisté : ce projet a déjà repris
 * 11 journées de graine depuis l'annuaire officiel, et une correction doit profiter aux sorties
 * déjà saisies. Un jour non couvert renvoie un contexte vide, sans jamais faire échouer l'affichage.
 */
export function tripTideContext(
  date: string,
  tides: FlatTide[],
  offsets: NavihanOffsets
): TripTideContext {
  return {
    coefficient: dayCoefficient(tides, date),
    lowTides: tides
      .filter(t => t.date === date && t.type === 'low')
      .map(t => t.time)
      .sort(),
    // Regroupement par date **réelle** de l'à-flot : une basse mer de la veille peut donner une
    // remise à flot de ce jour, et une basse mer tardive du jour la donne au lendemain.
    aflot: aflotEvents(tides, offsets)
      .filter(({ dt }) => localDate(dt) === date)
      .map(({ dt }) => localTime(dt))
  };
}
