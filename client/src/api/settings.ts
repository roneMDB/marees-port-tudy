import type { Settings } from '../types';
import { fetchJson } from './tides';

/** GET /api/settings — configuration persistée côté serveur. */
export function getSettings(): Promise<Settings> {
  return fetchJson<Settings>('/api/settings');
}

/** PUT /api/settings — enregistre la configuration (renvoie l'objet normalisé/borné). */
export function saveSettings(settings: Settings): Promise<Settings> {
  return fetchJson<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
}
