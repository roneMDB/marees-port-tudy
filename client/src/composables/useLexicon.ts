import { computed, ref } from 'vue';
import {
  addLexiconEntry,
  deleteLexiconEntry,
  getLexicon,
  resetLexicon,
  updateLexiconEntry,
  type LexiconInput
} from '../api/lexicon';
import { LEXIQUE, type LexiconEntry } from '../lib/lexique';

/**
 * Lexique du « mot du jour » persisté en base (issue #4 suite), partagé (singleton). Tant qu'il n'est
 * pas chargé (ou hors ligne au tout premier accès), on retombe sur le lexique embarqué `LEXIQUE`.
 */
const entries = ref<LexiconEntry[]>([]);
let loadPromise: Promise<void> | null = null;

async function load(force = false): Promise<void> {
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    try {
      entries.value = await getLexicon();
    } catch {
      /* serveur indisponible → on garde le fallback embarqué */
    }
  })();
  return loadPromise;
}

export function useLexicon() {
  /** Liste effective : base si chargée, sinon fallback embarqué. */
  const list = computed<LexiconEntry[]>(() => (entries.value.length ? entries.value : LEXIQUE));

  async function add(input: LexiconInput): Promise<LexiconEntry> {
    const entry = await addLexiconEntry(input);
    entries.value = [...entries.value, entry];
    return entry;
  }

  async function update(id: string, input: LexiconInput): Promise<void> {
    const entry = await updateLexiconEntry(id, input);
    entries.value = entries.value.map(e => (e.id === id ? entry : e));
  }

  async function remove(id: string): Promise<void> {
    await deleteLexiconEntry(id);
    entries.value = entries.value.filter(e => e.id !== id);
  }

  async function reset(): Promise<void> {
    entries.value = await resetLexicon();
  }

  return { entries: list, load, add, update, remove, reset };
}
