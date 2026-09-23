import type { FishingRef, FishingRefKind, FishingTrip, FishingTripInput } from '../types';
import { fetchJson } from './tides';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /api/fishing/trips — sorties + prises, plage inclusive optionnelle (lecture ouverte). */
export function getTrips(from?: string, to?: string): Promise<FishingTrip[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return fetchJson<FishingTrip[]>(`/api/fishing/trips${qs ? `?${qs}` : ''}`);
}

/** POST /api/fishing/trips — crée une sortie (**admin**) ; la météo est figée côté serveur. */
export function createTrip(input: FishingTripInput): Promise<FishingTrip> {
  return fetchJson<FishingTrip>('/api/fishing/trips', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

/** PUT /api/fishing/trips/:id — remplace la sortie et ses prises (**admin**). */
export function updateTrip(id: number, input: FishingTripInput): Promise<FishingTrip> {
  return fetchJson<FishingTrip>(`/api/fishing/trips/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

/** DELETE /api/fishing/trips/:id (**admin**). */
export async function deleteTrip(id: number): Promise<void> {
  const res = await fetch(`/api/fishing/trips/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}

/** GET /api/fishing/refs — espèces et engins (lecture ouverte). */
export function getRefs(): Promise<FishingRef[]> {
  return fetchJson<FishingRef[]>('/api/fishing/refs');
}

/**
 * POST /api/fishing/refs (**admin**). `labelPlural` est facultatif : vide ou absent, le serveur
 * le fait valoir `label`. `defaultGearId` n'a de sens que pour une espèce (`null` = aucun).
 */
export function addRef(
  kind: FishingRefKind,
  label: string,
  labelPlural = '',
  defaultGearId: string | null = null
): Promise<FishingRef> {
  return fetchJson<FishingRef>('/api/fishing/refs', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, label, labelPlural, defaultGearId })
  });
}

/**
 * PUT /api/fishing/refs/:id (**admin**) — libellés et engin par défaut changent ; l'id et le type
 * sont figés. C'est un remplacement : `defaultGearId` à `null` efface le défaut.
 */
export function updateRef(
  id: string,
  label: string,
  labelPlural = '',
  defaultGearId: string | null = null
): Promise<FishingRef> {
  return fetchJson<FishingRef>(`/api/fishing/refs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ label, labelPlural, defaultGearId })
  });
}

/**
 * DELETE /api/fishing/refs/:id (**admin**). Un **409** signifie que des prises s'y réfèrent :
 * le message du serveur est remonté tel quel, c'est lui qui explique le refus.
 */
export async function deleteRef(id: string): Promise<void> {
  const res = await fetch(`/api/fishing/refs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) return;
  let message = `Erreur ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* corps non-JSON : message par défaut */
  }
  throw new Error(message);
}

/**
 * POST /api/fishing/refs/reorder (**admin**) — réordonne une section. `ids` doit être exactement
 * l'ensemble des ids de ce `kind` ; sinon le serveur répond 400. Renvoie la liste **complète**
 * réordonnée, qui devient le nouvel état.
 */
export function reorderRefs(kind: FishingRefKind, ids: string[]): Promise<FishingRef[]> {
  return fetchJson<FishingRef[]>('/api/fishing/refs/reorder', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, ids })
  });
}

/** POST /api/fishing/refs/reset (**admin**) — rétablit la graine. */
export function resetRefs(): Promise<FishingRef[]> {
  return fetchJson<FishingRef[]>('/api/fishing/refs/reset', { method: 'POST' });
}
