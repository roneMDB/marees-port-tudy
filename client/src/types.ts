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

export interface AccessStats {
  total: number;
  lan: number;
  external: number;
  firstTs: string | null;
  lastTs: string | null;
  perDay: { date: string; count: number }[];
  countries: AccessCount[];
  browsers: AccessCount[];
  devices: AccessCount[];
}

/** Décalages Navihan (en minutes) appliqués aux heures de Port-Tudy. */
export interface NavihanOffsets {
  basseMer: number;
  pleineMer: number;
  aFlot: number;
}

export type TideTypeFilter = 'all' | 'high' | 'low';

export interface TideFilters {
  from: string;
  to: string;
  type: TideTypeFilter;
  minCoef: number | null;
}

/** Filtres éphémères (non persistés) : type de marée et coefficient minimum. */
export interface TideDisplayFilters {
  type: TideTypeFilter;
  minCoef: number | null;
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
  navihan: NavihanOffsets; // décalages en minutes
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
}

export interface WeatherMarine {
  current: { time: string; waveHeight: number; wavePeriod: number; waveDirection: number } | null;
  daily: { date: string; waveHeightMax: number; wavePeriodMax: number }[];
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
