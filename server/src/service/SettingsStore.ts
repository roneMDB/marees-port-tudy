import fs from 'fs';
import path from 'path';
import { SETTINGS_FILE } from '../config/dataDir';

export interface NavihanOffsets {
  basseMer: number;
  pleineMer: number;
  aFlot: number;
}

/** Lien externe affiché sous la météo. L'URL accepte les placeholders `{lat}`/`{lon}`. */
export interface WeatherLink {
  label: string;
  url: string;
}

/** Configuration persistée de l'application (fenêtre de dates, Navihan, carte à flot). */
export interface Settings {
  startMode: 'today' | 'date';
  startDate: string | null; // YYYY-MM-DD quand startMode = 'date'
  rangeDays: number; // « Au » = début + rangeDays
  navihan: NavihanOffsets; // décalages en minutes
  aFlotDays: number; // carte « À flot · N prochains jours »
  weatherLinks: WeatherLink[]; // liens affichés sous la météo (éditables)
}

/** Liens météo par défaut (Windy centré sur le lieu via placeholders, Météo-France, Open-Meteo). */
export const DEFAULT_WEATHER_LINKS: WeatherLink[] = [
  { label: 'Windy', url: 'https://www.windy.com/?{lat},{lon},9' },
  { label: 'Météo-France', url: 'https://meteofrance.com/previsions-meteo-france/belz/56550' },
  { label: 'Open-Meteo', url: 'https://open-meteo.com' }
];

export const DEFAULT_SETTINGS: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3,
  weatherLinks: DEFAULT_WEATHER_LINKS.map(l => ({ ...l }))
};

const MAX_WEATHER_LINKS = 12;
const MAX_LABEL_LEN = 40;
const MAX_URL_LEN = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MINUTES = 24 * 60 - 1;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normalise la liste de liens météo : chaque entrée doit avoir un libellé non vide et une URL
 * http(s). Les entrées invalides sont écartées, libellé/URL tronqués et la liste bornée.
 * Si l'entrée n'est **pas un tableau** (config ancienne / champ absent), on retombe sur les défauts.
 */
function sanitizeWeatherLinks(input: unknown): WeatherLink[] {
  if (!Array.isArray(input)) return DEFAULT_WEATHER_LINKS.map(l => ({ ...l }));
  return input
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map(x => ({
      label: String(x.label ?? '').trim().slice(0, MAX_LABEL_LEN),
      url: String(x.url ?? '').trim().slice(0, MAX_URL_LEN)
    }))
    .filter(l => l.label.length > 0 && /^https?:\/\//i.test(l.url))
    .slice(0, MAX_WEATHER_LINKS);
}

/** Normalise/borne un objet arbitraire en `Settings` valides (fusion sur les défauts). */
export function sanitizeSettings(input: unknown): Settings {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const nav = o.navihan && typeof o.navihan === 'object' ? (o.navihan as Record<string, unknown>) : {};
  const startMode: Settings['startMode'] = o.startMode === 'date' ? 'date' : 'today';
  const startDate = typeof o.startDate === 'string' && DATE_RE.test(o.startDate) ? o.startDate : null;

  return {
    startMode,
    startDate: startMode === 'date' ? startDate : null,
    rangeDays: clampInt(o.rangeDays, 1, 365, DEFAULT_SETTINGS.rangeDays),
    navihan: {
      basseMer: clampInt(nav.basseMer, 0, MAX_MINUTES, DEFAULT_SETTINGS.navihan.basseMer),
      pleineMer: clampInt(nav.pleineMer, 0, MAX_MINUTES, DEFAULT_SETTINGS.navihan.pleineMer),
      aFlot: clampInt(nav.aFlot, 0, MAX_MINUTES, DEFAULT_SETTINGS.navihan.aFlot)
    },
    aFlotDays: clampInt(o.aFlotDays, 1, 14, DEFAULT_SETTINGS.aFlotDays),
    weatherLinks: sanitizeWeatherLinks(o.weatherLinks)
  };
}

/** Lit la config (défauts si le fichier est absent ou illisible). */
export function readSettings(file: string = SETTINGS_FILE): Settings {
  try {
    return sanitizeSettings(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

/** Écrit la config (normalisée) de façon atomique (fichier temporaire + rename). */
export function writeSettings(input: unknown, file: string = SETTINGS_FILE): Settings {
  const settings = sanitizeSettings(input);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  return settings;
}

/** Crée `settings.json` avec les défauts s'il n'existe pas (init d'un volume vide). */
export function ensureSettingsFile(file: string = SETTINGS_FILE): void {
  if (!fs.existsSync(file)) {
    writeSettings(DEFAULT_SETTINGS, file);
  }
}
