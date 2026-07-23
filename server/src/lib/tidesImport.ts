import { normalizeTides, type MareeType, type RawTideData, type RawTideEntry } from './readTides';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Coerce une hauteur (chaîne ou nombre) en chaîne numérique valide, sinon `null`. */
function cleanHauteur(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === 'number' ? String(value) : String(value).trim();
  return s !== '' && Number.isFinite(parseFloat(s)) ? s : null;
}

/** Coerce un coefficient (chaîne ou nombre) en entier-chaîne valide, sinon `undefined`. */
function cleanCoefficient(value: unknown): string | undefined {
  if (value == null) return undefined;
  const n = parseInt(typeof value === 'number' ? String(value) : String(value).trim(), 10);
  return Number.isFinite(n) ? String(n) : undefined;
}

/**
 * Valide/normalise un objet arbitraire (format graine, deux formes acceptées) en `RawTideData`
 * propre pour l'import : ne conserve que les dates `YYYY-MM-DD` et, par entrée, une `maree`
 * (`haute`/`basse`), une `heure` `HH:MM` et une `hauteur` numérique ; `coefficient` optionnel.
 * Entrées et jours invalides écartés. Fonction pure.
 */
export function sanitizeImport(parsed: unknown): RawTideData {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const normalized = normalizeTides(parsed as Record<string, unknown>);
  const result: RawTideData = {};

  for (const [date, entries] of Object.entries(normalized)) {
    if (!DATE_RE.test(date) || !Array.isArray(entries)) continue;
    const clean: RawTideEntry[] = [];
    for (const raw of entries) {
      if (raw == null || typeof raw !== 'object') continue;
      const e = raw as unknown as Record<string, unknown>;
      if (e.maree !== 'haute' && e.maree !== 'basse') continue;
      if (typeof e.heure !== 'string' || !TIME_RE.test(e.heure)) continue;
      const hauteur = cleanHauteur(e.hauteur);
      if (hauteur == null) continue;

      const entry: RawTideEntry = { maree: e.maree as MareeType, heure: e.heure, hauteur };
      const coefficient = cleanCoefficient(e.coefficient);
      if (coefficient !== undefined) entry.coefficient = coefficient;
      clean.push(entry);
    }
    if (clean.length > 0) result[date] = clean;
  }

  return result;
}
