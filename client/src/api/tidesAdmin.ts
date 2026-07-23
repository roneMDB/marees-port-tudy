import { fetchJson } from './tides';

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  ok: boolean;
  site: string;
  mode: ImportMode;
  dates: number;
  entries: number;
}

/** POST /api/tides/import — import en lot des horaires d'un site (réservé au rôle admin). */
export function importTides(site: string, mode: ImportMode, data: unknown): Promise<ImportResult> {
  const params = new URLSearchParams({ site, mode });
  return fetchJson<ImportResult>(`/api/tides/import?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}
