import type { AccessStats, Site, TideOutput, TidesMeta } from '../types';

/** Récupère du JSON, en remontant le message d'erreur de l'API si présent. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* corps non-JSON : on garde le message par défaut */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** GET /api/tides — marées d'un port sur une plage optionnelle (défaut = toute la plage). */
export function getTides(from?: string, to?: string, site?: string): Promise<TideOutput> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (site) params.set('site', site);
  const qs = params.toString();
  return fetchJson<TideOutput>(`/api/tides${qs ? `?${qs}` : ''}`);
}

/** GET /api/tides/meta — bornes de dates disponibles + offsets Navihan (référence Port-Tudy). */
export function getMeta(): Promise<TidesMeta> {
  return fetchJson<TidesMeta>('/api/tides/meta');
}

/** GET /api/sites — liste des ports disponibles. */
export function getSites(): Promise<Site[]> {
  return fetchJson<Site[]>('/api/sites');
}

/** GET /api/context — indique si le client est sur le réseau local. */
export function getContext(): Promise<{ local: boolean }> {
  return fetchJson<{ local: boolean }>('/api/context');
}

/** GET /api/stats — statistiques d'accès (réservé au réseau local, 403 sinon). */
export function getStats(): Promise<AccessStats> {
  return fetchJson<AccessStats>('/api/stats');
}
