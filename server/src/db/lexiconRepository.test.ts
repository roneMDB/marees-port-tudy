import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  addEntry,
  countLexicon,
  deleteEntry,
  getLexicon,
  resetLexicon,
  seedLexiconIfEmpty,
  updateEntry
} from './lexiconRepository';
import type { LexiconSeedEntry } from '../service/lexiconSeed';

const SEED: LexiconSeedEntry[] = [
  { id: 'flot', term: 'Flot', definition: 'La marée montante.', type: 'maree' },
  { id: 'casier', term: 'Casier', definition: 'Piège appâté.', type: 'peche' }
];

describe('lexiconRepository', () => {
  it('is empty on a fresh base', () => {
    const db = openDb(':memory:');
    expect(getLexicon(db)).toEqual([]);
    db.close();
  });

  it('seeds only when empty and preserves order', () => {
    const db = openDb(':memory:');
    seedLexiconIfEmpty(db, SEED);
    expect(getLexicon(db)).toEqual(SEED);
    // Deuxième amorçage : ne double pas.
    seedLexiconIfEmpty(db, SEED);
    expect(countLexicon(db)).toBe(2);
    db.close();
  });

  it('adds an entry with a generated slug id, appended at the end', () => {
    const db = openDb(':memory:');
    seedLexiconIfEmpty(db, SEED);
    const added = addEntry(db, { term: 'Marée d’équinoxe', definition: 'Les plus grandes marées.', type: 'maree' });
    expect(added.id).toBe('maree-d-equinoxe');
    expect(getLexicon(db).map(e => e.id)).toEqual(['flot', 'casier', 'maree-d-equinoxe']);
    db.close();
  });

  it('disambiguates a duplicate slug', () => {
    const db = openDb(':memory:');
    const a = addEntry(db, { term: 'Bar', definition: 'Le loup.', type: 'peche' });
    const b = addEntry(db, { term: 'Bar', definition: 'Encore lui.', type: 'peche' });
    expect(a.id).toBe('bar');
    expect(b.id).toBe('bar-2');
    db.close();
  });

  it('updates an entry (including a seeded default)', () => {
    const db = openDb(':memory:');
    seedLexiconIfEmpty(db, SEED);
    const updated = updateEntry(db, 'flot', { term: 'Flot', definition: 'Le flux qui monte.', type: 'maree' });
    expect(updated?.definition).toBe('Le flux qui monte.');
    expect(getLexicon(db).find(e => e.id === 'flot')?.definition).toBe('Le flux qui monte.');
    expect(updateEntry(db, 'inconnu', { term: 'X', definition: 'Y', type: 'maree' })).toBeNull();
    db.close();
  });

  it('deletes an entry', () => {
    const db = openDb(':memory:');
    seedLexiconIfEmpty(db, SEED);
    expect(deleteEntry(db, 'casier')).toBe(true);
    expect(getLexicon(db).map(e => e.id)).toEqual(['flot']);
    expect(deleteEntry(db, 'casier')).toBe(false);
    db.close();
  });

  it('resets the lexicon back to the seed', () => {
    const db = openDb(':memory:');
    seedLexiconIfEmpty(db, SEED);
    addEntry(db, { term: 'Extra', definition: '…', type: 'peche' });
    deleteEntry(db, 'flot');
    resetLexicon(db, SEED);
    expect(getLexicon(db)).toEqual(SEED);
    db.close();
  });
});
