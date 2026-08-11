/**
 * Types miroir du contrat REST exposé par le serveur (`@marees/server`).
 * Le découplage passe par le JSON de l'API — pas de package partagé.
 */

export interface Extreme {
  time: string;
  height: number;
  type: 'high' | 'low';
  navihan: Record<string, string>;
  coefficient: number | null;
}

export interface TideOutput {
  siteId: string;
  timezone: string;
  from: string;
  to: string;
  days: Record<string, Extreme[]>;
}

export interface TidesMeta {
  siteId: string;
  timezone: string;
  minDate: string | null;
  maxDate: string | null;
  navihanOffsets: {
    basseMer: string;
    aFlot: string;
  };
}

/** Un extrême aplati avec sa date, pour le tableau et les graphiques. */
export interface FlatTide extends Extreme {
  date: string;
  /**
   * Heure de la marée **Port-Tudy** (référence) servant au calcul Navihan. Pour Port-Tudy
   * c'est `time` ; pour un autre port, l'heure de la marée Port-Tudy de même type la plus
   * proche (appariement par proximité). `null` = pas de référence appariée → Navihan « — ».
   */
  refTime?: string | null;
  /** Date `YYYY-MM-DD` de la marée Port-Tudy appariée (`refTime`) — clé des observations. */
  refDate?: string | null;
  /** Estimation Navihan de remise à flot par **seuil de hauteur** (issue #4), `HH:MM` ou `null`. */
  aflotEstimate?: string | null;
  /** Heure de remise à flot **réellement constatée** (saisie), `HH:MM` ou `null`. */
  aflotObserved?: string | null;
}

/** Heure de remise à flot constatée (miroir du contrat `/api/aflot-observations`). */
export interface AflotObservation {
  date: string; // date de la basse mer Port-Tudy (YYYY-MM-DD)
  time: string; // heure de la basse mer Port-Tudy (HH:MM)
  observed: string; // heure réellement constatée (HH:MM)
}

/** Un port dont on expose les horaires (miroir du contrat `/api/sites`). */
export interface Site {
  id: string;
  label: string;
}

/** Statistiques d'accès (miroir du contrat `/api/stats`). */
export interface AccessCount {
  name: string;
  count: number;
}

/**
 * Activité d'un utilisateur : son volume, ses bornes, **son propre rythme** et ses dernières
 * visites. Les répartitions globales mêlent tous les visiteurs ; celles-ci disent quand **cette
 * personne** consulte l'app.
 */
export interface AccessUser extends AccessCount {
  firstTs: string;
  lastTs: string;
  perHour: number[]; // 24 cases, heure locale
  perWeekday: number[]; // 7 cases, lundi = 0
  recent: string[]; // dernières visites, la plus récente en tête
}

/** Fenêtre d'analyse demandée à `/api/stats` (nombre de jours, ou tout l'historique). */
export type StatsPeriod = 7 | 30 | 90 | 'all';

export interface AccessStats {
  total: number; // toutes natures confondues
  visits: number; // ouvertures réelles de l'app (balise) — le chiffre de tête
  pageLoads: number; // chargements de coquille / sondes externes
  logins: number; // connexions réussies
  uniqueVisitors: number;
  lan: number;
  external: number;
  firstTs: string | null;
  lastTs: string | null;
  perDay: { date: string; count: number }[];
  perHour: number[]; // 24 cases, heure locale
  perWeekday: number[]; // 7 cases, lundi = 0
  countries: AccessCount[];
  browsers: AccessCount[];
  devices: AccessCount[];
  users: AccessUser[]; // visites par utilisateur
}

/** Décalages Navihan (en minutes) appliqués aux heures de Port-Tudy. */
export interface NavihanOffsets {
  basseMer: number;
  pleineMer: number;
  aFlot: number;
}

/** Fenêtre de dates (bornes inclusives, vides = ignorées). */
export interface TideFilters {
  from: string;
  to: string;
}

/**
 * Filtres d'affichage du tableau, au **grain du jour** (issue #10) — préférence personnelle par
 * navigateur, persistée en `localStorage` par `useTideFilters`. Le tableau affichant une ligne par
 * jour, filtrer marée par marée mutilait les cellules au lieu de sélectionner des lignes.
 */
export interface TideDayFilters {
  minCoef: number | null; // bornes inclusives sur le coefficient du jour
  maxCoef: number | null;
  weekdays: number[]; // lundi = 0 ; liste vide (ou les 7 jours) = pas de filtre
  aflotFrom: string | null; // plage horaire `HH:MM` de la remise à flot (décalage fixe)
  aflotTo: string | null;
}

/** Lien externe affiché sous la météo. L'URL accepte les placeholders `{lat}`/`{lon}`. */
export interface WeatherLink {
  label: string;
  url: string;
}

/** Configuration persistée côté serveur (miroir du contrat `/api/settings`). */
export interface Settings {
  startMode: 'today' | 'date';
  startDate: string | null; // YYYY-MM-DD quand startMode = 'date'
  rangeDays: number; // « Au » = début + rangeDays
  navihan: NavihanOffsets; // décalages en minutes (basseMer/pleineMer ; aFlot déprécié, cf. aFlotThreshold)
  aFlotThreshold: number; // hauteur d'eau (m) déclenchant la remise à flot (modèle seuil, issue #4)
  aFlotDays: number; // carte « À flot · N prochains jours »
  coefDays: number; // durée (jours) du graphe des coefficients
  weatherLinks: WeatherLink[]; // liens sous la météo (éditables dans les réglages)
}

/** Météo (miroir du contrat `/api/weather`). */
export interface WeatherCurrent {
  time: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  weatherText: string;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  precipitation: number;
}

export interface WeatherDaily {
  date: string;
  weatherCode: number;
  weatherText: string;
  tempMin: number;
  tempMax: number;
  precipitation: number;
  windMax: number;
  gustMax: number;
  windDirection: number | null;
  uvIndexMax: number | null;
}

export interface WeatherMarine {
  current: {
    time: string;
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    seaTemperature: number | null;
  } | null;
  daily: { date: string; waveHeightMax: number; wavePeriodMax: number; seaTemperatureMax: number | null }[];
  /** Température de l'eau de lieux secondaires (ex. Étel), servie par la même requête marine. */
  extra: { label: string; seaTemperature: number | null }[];
}

export interface Weather {
  location: { latitude: number; longitude: number; timezone: string };
  units: { temperature: string; wind: string; precipitation: string; wave: string; wavePeriod: string };
  current: WeatherCurrent;
  daily: WeatherDaily[];
  marine: WeatherMarine | null;
}

/** Libellés Navihan (clés de `Extreme.navihan`, alignées sur le serveur). */
export const NAVIHAN = {
  basseMer: 'Basse mer',
  pleineMer: 'Pleine mer',
  aFlot: 'A flot'
} as const;

/** Liens météo par défaut (miroir du serveur ; `{lat}`/`{lon}` = coordonnées du lieu). */
export const DEFAULT_WEATHER_LINKS: WeatherLink[] = [
  { label: 'Windy', url: 'https://www.windy.com/?{lat},{lon},9' },
  { label: 'Météo-France', url: 'https://meteofrance.com/previsions-meteo-france/belz/56550' },
  { label: 'Open-Meteo', url: 'https://open-meteo.com' }
];

/** Référentiel du carnet de pêche : espèce ou engin (miroir du contrat `/api/fishing/refs`). */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
  /**
   * Libellé au pluriel, **saisi** et non calculé (« lieu jaune » → « lieus jaunes », « crevette
   * bouquet » → « crevettes bouquet »). Toujours présent : le serveur le fait valoir le singulier
   * quand il n'est pas fourni.
   */
  labelPlural: string;
}

/** Une ligne de prise. `sizeCm`/`weightG` sont optionnels : sans objet pour 40 crevettes. */
export interface FishingCatch {
  speciesId: string;
  gearId: string;
  quantity: number;
  sizeCm: number | null;
  weightG: number | null;
  kept: boolean;
}

/**
 * Instantané météo d'une sortie, **figé à la création côté serveur**. À l'inverse, le contexte
 * marée n'est jamais stocké : il est recalculé à l'affichage (`lib/fishing.tripTideContext`).
 */
export interface TripWeather {
  tempMin: number | null;
  tempMax: number | null;
  windMax: number | null;
  windDir: number | null;
  weatherCode: number | null;
  seaTemperature: number | null;
}

/** Une sortie de pêche (miroir du contrat `/api/fishing/trips`). */
export interface FishingTrip {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  weather: TripWeather | null;
  catches: FishingCatch[];
  createdAt: string;
  updatedAt: string;
}

/** Champs saisis d'une sortie (l'id, les horodatages et la météo viennent du serveur). */
export interface FishingTripInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  catches: FishingCatch[];
}
