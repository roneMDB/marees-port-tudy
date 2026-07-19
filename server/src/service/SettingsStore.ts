import fs from 'fs';
import path from 'path';
import { SETTINGS_FILE } from '../config/dataDir';

export interface NavihanOffsets {
  basseMer: number;
  pleineMer: number;
  aFlot: number;
}

/** Configuration persistée de l'application (fenêtre de dates, Navihan, carte à flot). */
export interface Settings {
  startMode: 'today' | 'date';
  startDate: string | null; // YYYY-MM-DD quand startMode = 'date'
  rangeDays: number; // « Au » = début + rangeDays
  navihan: NavihanOffsets; // décalages en minutes
  aFlotDays: number; // carte « À flot · N prochains jours »
}

export const DEFAULT_SETTINGS: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MINUTES = 24 * 60 - 1;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
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
    aFlotDays: clampInt(o.aFlotDays, 1, 14, DEFAULT_SETTINGS.aFlotDays)
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
