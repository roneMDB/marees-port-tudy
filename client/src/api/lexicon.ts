import type { LexiconEntry, LexiconType } from '../lib/lexique';
import { fetchJson } from './tides';

/** Champs modifiables d'une entrée (l'id est généré côté serveur / porté par l'URL). */
export interface LexiconInput {
  term: string;
  definition: string;
  type: LexiconType;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /api/lexicon — lexique du mot du jour (ordonné, lecture ouverte). */
export function getLexicon(): Promise<LexiconEntry[]> {
  return fetchJson<LexiconEntry[]>('/api/lexicon');
}

/** POST /api/lexicon — ajoute un terme (**admin**). */
export function addLexiconEntry(input: LexiconInput): Promise<LexiconEntry> {
  return fetchJson<LexiconEntry>('/api/lexicon', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
}

/** PUT /api/lexicon/:id — met à jour un terme (**admin**). */
export function updateLexiconEntry(id: string, input: LexiconInput): Promise<LexiconEntry> {
  return fetchJson<LexiconEntry>(`/api/lexicon/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

/** DELETE /api/lexicon/:id — supprime un terme (**admin**). */
export async function deleteLexiconEntry(id: string): Promise<void> {
  const res = await fetch(`/api/lexicon/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}

/** POST /api/lexicon/reset — rétablit les termes par défaut (**admin**). */
export function resetLexicon(): Promise<LexiconEntry[]> {
  return fetchJson<LexiconEntry[]>('/api/lexicon/reset', { method: 'POST' });
}
