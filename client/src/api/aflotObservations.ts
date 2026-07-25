import type { AflotObservation } from '../types';
import { fetchJson } from './tides';

/** GET /api/aflot-observations — heures de remise à flot constatées (issue #4). */
export function getObservations(): Promise<AflotObservation[]> {
  return fetchJson<AflotObservation[]>('/api/aflot-observations');
}

/** PUT /api/aflot-observations — enregistre/écrase une observation (**admin**). */
export function saveObservation(obs: AflotObservation): Promise<AflotObservation> {
  return fetchJson<AflotObservation>('/api/aflot-observations', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obs)
  });
}

/** DELETE /api/aflot-observations — supprime l'observation d'une basse mer (**admin**). */
export async function deleteObservation(date: string, time: string): Promise<void> {
  const res = await fetch('/api/aflot-observations', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, time })
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}
