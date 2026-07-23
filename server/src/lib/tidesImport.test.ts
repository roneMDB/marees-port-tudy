import { describe, expect, it } from 'vitest';
import { sanitizeImport } from './tidesImport';

describe('sanitizeImport', () => {
  it('keeps valid entries from the date-keyed form', () => {
    const out = sanitizeImport({
      '2026-06-01': [
        { maree: 'haute', heure: '05:59', hauteur: '4.59', coefficient: '71' },
        { maree: 'basse', heure: '00:02', hauteur: '1.50' }
      ]
    });
    expect(out).toEqual({
      '2026-06-01': [
        { maree: 'haute', heure: '05:59', hauteur: '4.59', coefficient: '71' },
        { maree: 'basse', heure: '00:02', hauteur: '1.50' }
      ]
    });
  });

  it('flattens the month-grouped form', () => {
    const out = sanitizeImport({
      juin: { '2026-06-01': [{ maree: 'haute', heure: '05:59', hauteur: '4.59', coefficient: '71' }] }
    });
    expect(Object.keys(out)).toEqual(['2026-06-01']);
  });

  it('drops invalid entries (bad maree, bad heure, non-numeric hauteur)', () => {
    const out = sanitizeImport({
      '2026-06-01': [
        { maree: 'zzz', heure: '05:59', hauteur: '4.59' }, // maree invalide
        { maree: 'haute', heure: '5h59', hauteur: '4.59' }, // heure invalide
        { maree: 'basse', heure: '00:02', hauteur: 'NaN' }, // hauteur non numérique
        { maree: 'haute', heure: '06:10', hauteur: '4.70', coefficient: '75' } // valide
      ]
    });
    expect(out).toEqual({
      '2026-06-01': [{ maree: 'haute', heure: '06:10', hauteur: '4.70', coefficient: '75' }]
    });
  });

  it('omits an invalid coefficient but keeps the entry', () => {
    const out = sanitizeImport({
      '2026-06-01': [{ maree: 'haute', heure: '06:10', hauteur: '4.70', coefficient: 'abc' }]
    });
    expect(out['2026-06-01'][0]).toEqual({ maree: 'haute', heure: '06:10', hauteur: '4.70' });
  });

  it('drops dates with no valid entry and returns {} for garbage', () => {
    expect(sanitizeImport({ '2026-06-01': [{ maree: 'zzz', heure: 'x', hauteur: 'y' }] })).toEqual({});
    expect(sanitizeImport(null)).toEqual({});
    expect(sanitizeImport('nope')).toEqual({});
    expect(sanitizeImport({ 'not-a-date': [{ maree: 'haute', heure: '06:10', hauteur: '4.70' }] })).toEqual({});
  });

  it('accepts numeric hauteur/coefficient by coercing to string', () => {
    const out = sanitizeImport({ '2026-06-01': [{ maree: 'haute', heure: '06:10', hauteur: 4.7, coefficient: 75 }] });
    expect(out['2026-06-01'][0]).toEqual({ maree: 'haute', heure: '06:10', hauteur: '4.7', coefficient: '75' });
  });
});
