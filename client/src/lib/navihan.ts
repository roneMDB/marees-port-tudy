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
 * Hauteur de flottaison de référence par défaut (m), lue sur la courbe **Port-Tudy** au coefficient
 * `AFLOT_COEF_REF`. Étalonnée sur les 18 heures de remise à flot **constatées** du 2026-07-25 au
 * 2026-09-13 (cf. `docs/superpowers/specs/2026-09-14-etalonnage-aflot-observations-design.md`).
 *
 * Ne sert que de **repli** : dès qu'il y a assez de relevés, le niveau est recalculé sur eux
 * (`lib/aflotCalibration.ts`). La valeur d'avant (2,8 m, rétro-calibrée sur le décalage fixe) était
 * fausse de bout en bout — cf. `aflotTimeByThreshold`.
 */
export const DEFAULT_AFLOT_REF_HEIGHT = 3.02;

/** Coefficient auquel la hauteur de flottaison de référence est exprimée (médiane Port-Tudy). */
export const AFLOT_COEF_REF = 70;

/**
 * Pente du seuil en fonction du coefficient (m par point de coefficient).
 *
 * Les relevés montrent que la hauteur implicite de flottaison **croît avec le coefficient**
 * (corrélation 0,72 : 2,90 m à coef 40, 3,13 m à coef 100), très probablement parce que
 * l'interpolation cosinus s'écarte de la vraie courbe d'autant plus que l'amplitude est grande.
 * C'est donc une **correction empirique du modèle de courbe**, pas une grandeur physique : elle est
 * figée ici, là où le niveau, lui, s'étalonne sur les relevés. La corriger divise l'erreur par
 * trois (7,6 → 4,9 min de MAE) sans surapprentissage (validation leave-one-out : 5,6 min).
 */
export const AFLOT_COEF_SLOPE = 0.0037;

/**
 * Hauteur d'eau **Port-Tudy** à laquelle le bateau flotte, pour un coefficient donné.
 * Coefficient inconnu → le niveau de référence seul.
 */
export function aflotThresholdFor(coefficient: number | null, refHeight: number): number {
  if (coefficient == null || !Number.isFinite(coefficient)) return refHeight;
  return refHeight + AFLOT_COEF_SLOPE * (coefficient - AFLOT_COEF_REF);
}

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
 * Première pleine mer **de hauteur exploitable** après `low` : la montante sur laquelle le bateau
 * se remet à flot. La comparaison porte sur les **instants**, donc une basse mer de fin de soirée
 * trouve bien sa pleine mer au petit matin du lendemain.
 *
 * ⚠️ `lib/aflotCalibration.ts` garde sa propre version : la sienne ajoute un garde
 * (hauteur de la pleine mer **supérieure** à celle de la basse mer) et son comportement est figé
 * par la fixture des 18 relevés réels. La mutualiser déplacerait le modèle d'étalonnage sans rien
 * gagner : le partage s'arrête où les sémantiques divergent.
 */
export function nextHighAfter(ptExtremes: FlatTide[], low: FlatTide): FlatTide | null {
  const lowEpoch = epochMinutes(low.date, low.time);
  const next = ptExtremes
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, t: epochMinutes(e.date, e.time) }))
    .filter(x => x.t > lowEpoch)
    .sort((p, q) => p.t - q.t)[0];
  return next ? next.e : null;
}

/**
 * **Estimation** de remise à flot d'une basse mer, par **modèle seuil de hauteur** (issue #4) —
 * n'est affichée que dans le **tableau du dashboard** (pastille « Estimation ») : instant où la
 * courbe **Port-Tudy** montante (basse mer → pleine mer suivante) atteint le seuil de flottaison du
 * jour, `aflotThresholdFor(coefficient de la pleine mer suivante, refHeight)`. Le délai après la
 * basse mer varie ainsi avec le coefficient.
 *
 * ⚠️ Le seuil est une **hauteur Port-Tudy**, pas une cote bathymétrique à Navihan : c'est un proxy
 * empirique qui **absorbe la propagation** Port-Tudy → Navihan. Ne pas réintroduire les décalages
 * `basseMer`/`pleineMer` dans le segment — c'était l'erreur d'origine (le seuil 2,8 m avait été
 * rétro-calibré sur la courbe Port-Tudy, donc propagation déjà comprise, et la construire sur la
 * courbe décalée l'ajoutait une seconde fois : **+59 min sur les 18 relevés constatés, sans
 * exception**). Effet de bord utile : retoucher les décalages Navihan ne déforme plus l'estimation.
 *
 * Renvoie l'instant **daté** (`{ date, time }`) : un à-flot peut franchir minuit, et la règle du
 * projet est qu'une heure Navihan est rangée au jour où elle a réellement lieu. `null` si le seuil
 * n'est pas atteint avant la pleine mer (morte-eau extrême) ou s'il n'y a pas de pleine mer
 * suivante. `ptExtremes` = extrêmes **Port-Tudy**.
 */
export function aflotTimeByThreshold(
  ptExtremes: FlatTide[],
  low: FlatTide,
  refHeight: number
): { date: string; time: string } | null {
  if (!Number.isFinite(low.height)) return null;
  const lowEpoch = epochMinutes(low.date, low.time);
  const nextHigh = nextHighAfter(ptExtremes, low);
  if (!nextHigh) return null;
  const a: OffsetPoint = { offset: lowEpoch, height: low.height };
  const b: OffsetPoint = { offset: epochMinutes(nextHigh.date, nextHigh.time), height: nextHigh.height };
  const threshold = aflotThresholdFor(nextHigh.coefficient, refHeight);
  const cross = inverseCosineRising(a, b, threshold);
  if (cross == null) return null;
  const dt = new Date(cross * 60000);
  return { date: localDate(dt), time: localTime(dt) };
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
