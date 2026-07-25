import { describe, expect, it } from 'vitest';
import { LEXIQUE, noteOfTheDay } from './lexique';

describe('LEXIQUE', () => {
  it('a des termes et définitions non vides', () => {
    for (const entry of LEXIQUE) {
      expect(entry.term.trim().length).toBeGreaterThan(0);
      expect(entry.definition.trim().length).toBeGreaterThan(0);
    }
  });

  it('a des identifiants uniques', () => {
    const ids = LEXIQUE.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('type chaque entrée en maree ou peche', () => {
    for (const entry of LEXIQUE) {
      expect(['maree', 'peche']).toContain(entry.type);
    }
    // Termes de pêche bien typés, termes de marée aussi.
    expect(LEXIQUE.find(e => e.id === 'casier')?.type).toBe('peche');
    expect(LEXIQUE.find(e => e.id === 'bar')?.type).toBe('peche');
    expect(LEXIQUE.find(e => e.id === 'marnage')?.type).toBe('maree');
    expect(LEXIQUE.find(e => e.id === 'grande-maree')?.type).toBe('maree');
  });
});

describe('noteOfTheDay — sélection contextuelle', () => {
  it('coef ≥ 100 → grande marée', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-23', coef: 105, prevCoef: 98 }).id).toBe('grande-maree');
  });

  it('coef en bande vive-eau → vive-eau', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-23', coef: 85, prevCoef: 80 }).id).toBe('vive-eau');
  });

  it('coef bas → morte-eau', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-23', coef: 38, prevCoef: 42 }).id).toBe('morte-eau');
  });

  it('marée moyenne en nette hausse → revif', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-23', coef: 60, prevCoef: 48 }).id).toBe('revif');
  });

  it('marée moyenne en nette baisse → déchet', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-23', coef: 50, prevCoef: 66 }).id).toBe('dechet');
  });

  it('marée moyenne stable → pas de terme contextuel (rotation)', () => {
    const note = noteOfTheDay({ dateKey: '2026-07-23', coef: 58, prevCoef: 57 });
    expect(['revif', 'dechet', 'grande-maree', 'vive-eau', 'morte-eau']).not.toContain(note.id);
  });
});

describe('noteOfTheDay — rotation', () => {
  it('renvoie un terme même sans coefficient', () => {
    const note = noteOfTheDay({ dateKey: '2026-07-23', coef: null, prevCoef: null });
    expect(LEXIQUE.some(e => e.id === note.id)).toBe(true);
  });

  it('est déterministe pour une même date', () => {
    const a = noteOfTheDay({ dateKey: '2026-07-23', coef: null, prevCoef: null });
    const b = noteOfTheDay({ dateKey: '2026-07-23', coef: null, prevCoef: null });
    expect(a.id).toBe(b.id);
  });

  it('varie selon la date', () => {
    const ids = new Set<string>();
    for (let day = 1; day <= 14; day++) {
      const dateKey = `2026-07-${String(day).padStart(2, '0')}`;
      ids.add(noteOfTheDay({ dateKey, coef: null, prevCoef: null }).id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('privilégie un terme de marée quand la marée du jour est marquante', () => {
    expect(noteOfTheDay({ dateKey: '2026-07-10', coef: 102, prevCoef: 95 }).type).toBe('maree');
    expect(noteOfTheDay({ dateKey: '2026-07-10', coef: 38, prevCoef: 40 }).type).toBe('maree');
  });

  it('fait tourner des termes de pêche et de marée les jours peu marquants', () => {
    const types = new Set<string>();
    for (let day = 1; day <= 28; day++) {
      const dateKey = `2026-06-${String(day).padStart(2, '0')}`;
      types.add(noteOfTheDay({ dateKey, coef: null, prevCoef: null }).type);
    }
    expect(types.has('peche')).toBe(true);
    expect(types.has('maree')).toBe(true);
  });

  it('renvoie toujours un id présent dans le lexique', () => {
    for (let day = 1; day <= 28; day++) {
      const dateKey = `2026-06-${String(day).padStart(2, '0')}`;
      const note = noteOfTheDay({ dateKey, coef: null, prevCoef: null });
      expect(LEXIQUE.some(e => e.id === note.id)).toBe(true);
    }
  });
});
