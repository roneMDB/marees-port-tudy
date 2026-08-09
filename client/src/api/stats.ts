import { fetchJson } from './tides';
import type { AccessStats, StatsPeriod } from '../types';

/** GET /api/stats — statistiques d'accès (réservé au rôle admin, 403 sinon). */
export function getStats(days: StatsPeriod = 'all'): Promise<AccessStats> {
  return fetchJson<AccessStats>(`/api/stats?days=${days}`);
}

/**
 * POST /api/visit — signale une ouverture de l'application.
 *
 * Volontairement **hors de `fetchJson`** : un échec ne doit ni remonter d'erreur à l'écran, ni
 * émettre `api-unauthorized` (ce qui renverrait l'utilisateur à la mire pour une simple balise).
 * Le comptage est un service rendu à l'administrateur, jamais une gêne pour le visiteur.
 */
export async function pingVisit(): Promise<void> {
  try {
    await fetch('/api/visit', { method: 'POST' });
  } catch {
    /* hors-ligne : la visite est perdue, l'app continue */
  }
}
