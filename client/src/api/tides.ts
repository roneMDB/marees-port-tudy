import type { TideOutput, TidesMeta } from '../types';

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

/** GET /api/tides — marées sur une plage optionnelle (défaut = toute la plage disponible). */
export function getTides(from?: string, to?: string): Promise<TideOutput> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return fetchJson<TideOutput>(`/api/tides${qs ? `?${qs}` : ''}`);
}

/** GET /api/tides/meta — bornes de dates disponibles + offsets Navihan. */
export function getMeta(): Promise<TidesMeta> {
  return fetchJson<TidesMeta>('/api/tides/meta');
}
