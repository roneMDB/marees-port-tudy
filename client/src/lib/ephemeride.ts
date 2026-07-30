/**
 * Éphéméride du jour (issue #13) : soleil, lune, calendrier.
 *
 * Tout est **calculé localement**, sans appel réseau : Open-Meteo sait donner le lever et le
 * coucher du soleil mais **pas la phase de lune**, qu'il faudrait de toute façon calculer ici —
 * mélanger les deux sources mettrait deux régimes de fiabilité dans une seule carte. La carte
 * reste donc renseignée hors-ligne, comme le reste de la PWA.
 *
 * **Précision constatée** (cf. `ephemeride.test.ts`) : lever/coucher à **moins de 2 minutes** des
 * valeurs Open-Meteo sur quatre saisons — la limite de la série solaire tronquée employée ici, sans
 * conséquence pour un affichage en `HH:MM`. Syzygies à **moins de 5 minutes** des instants publiés
 * des éclipses de 2026.
 *
 * Fonctions pures et testées, dans l'esprit de `maregram.ts` / `navihan.ts`.
 */

/**
 * Lieu de référence de l'éphéméride : Belz (Morbihan), là où l'application est consultée.
 * **Miroir** de `DEFAULT_LAT`/`DEFAULT_LON` (`server/src/routes/weather.ts`) — même précédent que
 * `DEFAULT_WEATHER_LINKS` dans `types.ts`. Constante côté client plutôt que valeur lue dans
 * `weather.location` : sinon les heures de soleil dépendraient du réseau.
 */
export const EPHEMERIDE_LOCATION = { latitude: 47.677, longitude: -3.166 };

const RAD = Math.PI / 180;
/** Jour julien de J2000.0 (2000-01-01 à 12:00 UT). */
const J2000 = 2451545;
/** Jour julien de l'époque Unix (1970-01-01 à 00:00 UT). */
const JD_UNIX_EPOCH = 2440587.5;
/** Mois synodique moyen, en jours (Meeus). */
const SYNODIC_MONTH = 29.530588861;
/**
 * Dépression du centre du soleil au lever/coucher : −0,833° = rayon apparent du disque
 * (~0,267°) + réfraction atmosphérique (~0,567°). Soit un zénith de 90,833°.
 */
const SUNRISE_ALTITUDE = -0.833;

function sinDeg(deg: number): number {
  return Math.sin(deg * RAD);
}

function cosDeg(deg: number): number {
  return Math.cos(deg * RAD);
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

/** Jour julien à 12:00 UT de la date donnée (entier ajouté à J2000, d'où l'absence d'arrondi). */
function jdAtNoonUtc(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return Date.UTC(year, month - 1, day, 12) / 86_400_000 + JD_UNIX_EPOCH;
}

function jdToDate(jd: number): Date {
  return new Date((jd - JD_UNIX_EPOCH) * 86_400_000);
}

export interface SunTimes {
  /** Lever du soleil, ou `null` en jour/nuit polaire (jamais aux latitudes bretonnes). */
  sunrise: Date | null;
  sunset: Date | null;
  /** Passage du soleil au méridien du lieu (toujours défini). */
  solarNoon: Date;
  /** Durée du jour en minutes (0 en nuit polaire, 1440 en jour polaire). */
  daylightMinutes: number;
}

/**
 * Lever, coucher et midi solaire pour une date et un lieu (algorithme NOAA / « sunrise equation »).
 *
 * Renvoie des **instants** (UTC sous le capot) et non des chaînes : le formatage est délégué à
 * `formatTimeInZone`, sinon le résultat — et donc les tests — dépendrait du fuseau de la machine,
 * qu'aucune configuration Vitest n'épingle.
 *
 * `altitude` permet de viser une autre hauteur du soleil que le lever/coucher standard
 * (ex. −6° pour le crépuscule civil).
 */
export function sunTimes(
  dateKey: string,
  latitude: number = EPHEMERIDE_LOCATION.latitude,
  longitude: number = EPHEMERIDE_LOCATION.longitude,
  altitude: number = SUNRISE_ALTITUDE
): SunTimes {
  const n = jdAtNoonUtc(dateKey) - J2000;

  // Midi solaire moyen au méridien du lieu : décalé de la longitude (vers l'est = plus tôt).
  // Pas de terme correctif `+0.0009` ici, contrairement à l'énoncé courant de l'algorithme : il y
  // compense l'arrondi de `n` à l'entier, alors que `n` est exact (jour julien à 12:00 UT).
  const meanSolarNoon = n - longitude / 360;

  const meanAnomaly = norm360(357.5291 + 0.98560028 * meanSolarNoon);
  const center = 1.9148 * sinDeg(meanAnomaly) + 0.02 * sinDeg(2 * meanAnomaly) + 0.0003 * sinDeg(3 * meanAnomaly);
  const eclipticLongitude = norm360(meanAnomaly + center + 180 + 102.9372);

  // Transit vrai : midi moyen corrigé de l'équation du temps.
  const transit =
    J2000 + meanSolarNoon + 0.0053 * sinDeg(meanAnomaly) - 0.0069 * sinDeg(2 * eclipticLongitude);

  const declination = Math.asin(sinDeg(eclipticLongitude) * sinDeg(23.4397)) / RAD;
  const cosHourAngle =
    (sinDeg(altitude) - sinDeg(latitude) * sinDeg(declination)) / (cosDeg(latitude) * cosDeg(declination));

  const solarNoon = jdToDate(transit);

  // |cos ω| > 1 : le soleil ne franchit pas la hauteur visée — nuit ou jour polaire.
  if (cosHourAngle > 1) return { sunrise: null, sunset: null, solarNoon, daylightMinutes: 0 };
  if (cosHourAngle < -1) return { sunrise: null, sunset: null, solarNoon, daylightMinutes: 1440 };

  const hourAngle = Math.acos(cosHourAngle) / RAD;
  return {
    sunrise: jdToDate(transit - hourAngle / 360),
    sunset: jdToDate(transit + hourAngle / 360),
    daylightMinutes: (hourAngle / 360) * 2 * 1440,
    solarNoon
  };
}

/** Formate un instant en `HH:MM` dans un fuseau explicite (déterministe, indépendant de la machine). */
export function formatTimeInZone(date: Date, timeZone = 'Europe/Paris'): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone
  }).format(date);
}

/** Formate une durée en minutes sous la forme `15 h 16`. */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/**
 * Variation de la durée du jour par rapport à la veille, en minutes (négative après le solstice
 * d'été). `null` si l'un des deux jours n'a ni lever ni coucher.
 */
export function daylightDelta(
  dateKey: string,
  latitude: number = EPHEMERIDE_LOCATION.latitude,
  longitude: number = EPHEMERIDE_LOCATION.longitude
): number | null {
  const today = sunTimes(dateKey, latitude, longitude);
  const { year, month, day } = parseDateKey(dateKey);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  const previousKey = previous.toISOString().slice(0, 10);
  const yesterday = sunTimes(previousKey, latitude, longitude);
  if (!today.sunrise || !yesterday.sunrise) return null;
  return today.daylightMinutes - yesterday.daylightMinutes;
}

/**
 * Instant (jour julien) de la nouvelle lune (`k` entier) ou de la pleine lune (`k` + 0,5),
 * d'après Meeus, *Astronomical Algorithms*, ch. 49, tronqué aux termes périodiques principaux.
 * Précision de l'ordre de quelques minutes — les termes suivants valent moins d'une minute.
 */
function syzygyJd(k: number): number {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;

  const mean =
    2451550.09766 + SYNODIC_MONTH * k + 0.00015437 * t2 - 0.00000015 * t3 + 0.00000000073 * t4;

  // Excentricité de l'orbite terrestre, décroissante avec le temps.
  const e = 1 - 0.002516 * t - 0.0000074 * t2;
  // Anomalie moyenne du soleil.
  const m = norm360(2.5534 + 29.1053567 * k - 0.0000014 * t2 - 0.00000011 * t3);
  // Anomalie moyenne de la lune.
  const mp = norm360(201.5643 + 385.81693528 * k + 0.0107582 * t2 + 0.00001238 * t3 - 0.000000058 * t4);
  // Argument de latitude de la lune.
  const f = norm360(160.7108 + 390.67050284 * k - 0.0016118 * t2 - 0.00000227 * t3 + 0.000000011 * t4);
  // Longitude du nœud ascendant.
  const omega = norm360(124.7746 - 1.56375588 * k + 0.0020672 * t2 + 0.00000215 * t3);

  // Les deux jeux de coefficients ne diffèrent que sur les premiers termes (nouvelle vs pleine lune).
  const isNew = Math.abs(k - Math.round(k)) < 0.01;
  const c1 = isNew ? -0.4072 : -0.40614;
  const c2 = isNew ? 0.17241 : 0.17302;
  const c3 = isNew ? 0.01608 : 0.01614;
  const c4 = isNew ? 0.01039 : 0.01043;
  const c5 = isNew ? 0.00739 : 0.00734;

  const correction =
    c1 * sinDeg(mp) +
    c2 * e * sinDeg(m) +
    c3 * sinDeg(2 * mp) +
    c4 * sinDeg(2 * f) +
    c5 * e * sinDeg(mp - m) +
    -0.00515 * e * sinDeg(mp + m) +
    0.00209 * e * e * sinDeg(2 * m) +
    -0.00111 * sinDeg(mp - 2 * f) +
    -0.00057 * sinDeg(mp + 2 * f) +
    0.00056 * e * sinDeg(2 * mp + m) +
    -0.00042 * sinDeg(3 * mp) +
    0.00042 * e * sinDeg(m + 2 * f) +
    0.00038 * e * sinDeg(m - 2 * f) +
    -0.00024 * e * sinDeg(2 * mp - m) +
    -0.00017 * sinDeg(omega) +
    -0.00007 * sinDeg(mp + 2 * m);

  return mean + correction;
}

/** `k` approximatif de la lunaison contenant un jour julien donné (0 = nouvelle lune de janvier 2000). */
function approximateK(jd: number): number {
  return (jd - 2451550.09766) / SYNODIC_MONTH;
}

/**
 * Syzygies (nouvelles et pleines lunes) encadrant un jour julien, à `span` lunaisons près,
 * triées chronologiquement.
 */
function syzygiesAround(jd: number, span: number): { jd: number; kind: 'new' | 'full' }[] {
  const base = Math.floor(approximateK(jd)) - span;
  const found: { jd: number; kind: 'new' | 'full' }[] = [];
  for (let i = 0; i <= 2 * span; i += 1) {
    found.push({ jd: syzygyJd(base + i), kind: 'new' });
    found.push({ jd: syzygyJd(base + i + 0.5), kind: 'full' });
  }
  return found.sort((a, b) => a.jd - b.jd);
}

export type MoonPhaseName =
  | 'Nouvelle lune'
  | 'Premier croissant'
  | 'Premier quartier'
  | 'Gibbeuse croissante'
  | 'Pleine lune'
  | 'Gibbeuse décroissante'
  | 'Dernier quartier'
  | 'Dernier croissant';

export interface MoonPhase {
  /** Âge de la lune en jours depuis la dernière nouvelle lune. */
  age: number;
  /** Fraction de la lunaison parcourue (0 = nouvelle lune, ~0,5 = pleine lune). */
  fraction: number;
  /** Part éclairée du disque vue de la Terre, de 0 à 1. */
  illumination: number;
  name: MoonPhaseName;
  /**
   * Glyphe bootstrap-icons approchant la phase. Le jeu n'a pas de croissants orientés :
   * l'icône reste indicative, c'est le nom qui porte la précision.
   */
  icon: string;
}

function phaseName(fraction: number): MoonPhaseName {
  if (fraction < 0.02 || fraction >= 0.98) return 'Nouvelle lune';
  if (fraction < 0.23) return 'Premier croissant';
  if (fraction < 0.27) return 'Premier quartier';
  if (fraction < 0.48) return 'Gibbeuse croissante';
  if (fraction < 0.52) return 'Pleine lune';
  if (fraction < 0.73) return 'Gibbeuse décroissante';
  if (fraction < 0.77) return 'Dernier quartier';
  return 'Dernier croissant';
}

function phaseIcon(name: MoonPhaseName): string {
  if (name === 'Nouvelle lune') return 'bi-circle';
  if (name === 'Pleine lune') return 'bi-circle-fill';
  if (name === 'Premier quartier' || name === 'Dernier quartier') return 'bi-circle-half';
  if (name === 'Premier croissant' || name === 'Dernier croissant') return 'bi-moon-fill';
  return 'bi-moon-stars-fill';
}

/**
 * Phase de la lune à 12:00 UT de la date donnée.
 *
 * L'âge est compté depuis la **nouvelle lune réelle** précédente (Meeus), et la fraction est
 * rapportée à la **durée réelle de la lunaison** plutôt qu'au mois synodique moyen : la vitesse de
 * la lune varie, et une pleine lune peut tomber à 0,52 d'une lunaison moyenne — donc hors de toute
 * bande « pleine lune » raisonnable.
 *
 * Le jour d'une syzygie porte de toute façon son nom (« Pleine lune » le jour de la pleine lune),
 * comme le fait un almanach, quelle que soit l'heure de l'événement dans la journée.
 */
export function moonPhase(dateKey: string, timeZone = 'Europe/Paris'): MoonPhase {
  const jd = jdAtNoonUtc(dateKey);

  // Dernière nouvelle lune : on part de l'estimation puis on redescend tant qu'elle est future.
  let k = Math.floor(approximateK(jd));
  while (syzygyJd(k) > jd) k -= 1;
  while (syzygyJd(k + 1) <= jd) k += 1;

  const lunationStart = syzygyJd(k);
  const age = jd - lunationStart;
  const fraction = age / (syzygyJd(k + 1) - lunationStart);
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;

  const today = syzygyOnDate(dateKey, timeZone);
  const name: MoonPhaseName =
    today === 'new' ? 'Nouvelle lune' : today === 'full' ? 'Pleine lune' : phaseName(fraction);

  return { age, fraction, illumination, name, icon: phaseIcon(name) };
}

export interface Syzygy {
  kind: 'new' | 'full';
  /** Date locale (`YYYY-MM-DD`) de la syzygie, dans le fuseau demandé. */
  date: string;
  /** Instant exact de la syzygie. */
  at: Date;
  /** Nombre de jours pleins entre `dateKey` et `date` (0 = le jour même). */
  daysAway: number;
}

/** Date `YYYY-MM-DD` d'un instant, dans un fuseau explicite. */
function dateKeyInZone(date: Date, timeZone: string): string {
  // `en-CA` produit directement `YYYY-MM-DD`.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone
  }).format(date);
}

/** Nombre de jours pleins entre deux dates `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/**
 * Syzygie tombant le jour même (dans le fuseau donné), ou `null`. Un almanach nomme le jour d'après
 * l'événement qu'il porte, indépendamment de l'heure : c'est ce que reflète `moonPhase`.
 */
function syzygyOnDate(dateKey: string, timeZone: string): 'new' | 'full' | null {
  for (const s of syzygiesAround(jdAtNoonUtc(dateKey), 1)) {
    if (dateKeyInZone(jdToDate(s.jd), timeZone) === dateKey) return s.kind;
  }
  return null;
}

/**
 * Prochaine nouvelle ou pleine lune à partir de `dateKey` — celle du jour même comprise, même déjà
 * passée : c'est un repère de calendrier, pas un compte à rebours à la minute. Sert à annoncer les
 * vives-eaux, qui suivent la syzygie d'environ 36 h.
 */
export function nextSyzygy(dateKey: string, timeZone = 'Europe/Paris'): Syzygy {
  // 00:00 UT de la date : une syzygie tombant plus tard dans la journée reste « à venir ».
  const start = jdAtNoonUtc(dateKey) - 0.5;
  const candidates = syzygiesAround(start, 2);

  // Une syzygie de la veille au soir UT peut tomber le jour même en heure locale : la retenir aussi.
  const best =
    candidates.find(s => dateKeyInZone(jdToDate(s.jd), timeZone) === dateKey) ??
    candidates.find(s => s.jd >= start);

  // La fenêtre de ±2 lunaisons couvre toujours au moins une syzygie future.
  if (!best) throw new Error(`Aucune syzygie trouvée après ${dateKey}`);

  const at = jdToDate(best.jd);
  const date = dateKeyInZone(at, timeZone);
  return { kind: best.kind, date, at, daysAway: daysBetween(dateKey, date) };
}

/** Quantième : rang du jour dans l'année, et nombre de jours de l'année. */
export function dayOfYear(dateKey: string): { day: number; total: number } {
  const { year, month, day } = parseDateKey(dateKey);
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return { day: Math.round((current - start) / 86_400_000) + 1, total: isLeap ? 366 : 365 };
}

/**
 * Numéro de semaine ISO 8601 : la semaine commence le lundi et la semaine 1 est celle qui
 * contient le premier jeudi de l'année.
 */
export function isoWeek(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Se placer sur le jeudi de la semaine courante : son année est celle de la semaine ISO.
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = lundi
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
