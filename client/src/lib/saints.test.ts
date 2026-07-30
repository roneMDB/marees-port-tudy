import { describe, expect, it } from 'vitest';
import { DAYS_PER_MONTH, SAINTS_BY_MONTH, saintOfDay } from './saints';

describe('SAINTS_BY_MONTH', () => {
  it('couvre les 366 jours de l’année', () => {
    expect(SAINTS_BY_MONTH).toHaveLength(12);
    expect(SAINTS_BY_MONTH.map(m => m.length)).toEqual(DAYS_PER_MONTH);
    expect(SAINTS_BY_MONTH.flat()).toHaveLength(366);
  });

  it('n’a aucune entrée vide ni espace superflu', () => {
    for (const name of SAINTS_BY_MONTH.flat()) {
      expect(name).not.toBe('');
      expect(name).toBe(name.trim());
    }
  });

  it('porte le libellé complet, genre compris', () => {
    // Le genre est stocké, pas déduit : ces prénoms masculins finissent par « e » et piégeraient
    // toute heuristique.
    expect(saintOfDay('2026-02-03')).toBe('Saint Blaise');
    expect(saintOfDay('2026-05-12')).toBe('Saint Achille');
    expect(saintOfDay('2026-12-26')).toBe('Saint Étienne');
    expect(saintOfDay('2026-09-30')).toBe('Saint Jérôme');
    expect(saintOfDay('2026-08-21')).toBe('Saint Christophe');
  });
});

describe('saintOfDay', () => {
  it('donne le saint du jour', () => {
    expect(saintOfDay('2026-07-30')).toBe('Sainte Juliette');
    expect(saintOfDay('2026-05-19')).toBe('Saint Yves'); // patron de la Bretagne
    expect(saintOfDay('2026-03-03')).toBe('Saint Guénolé');
  });

  it('rend les fêtes civiles et les solennités sans préfixe', () => {
    expect(saintOfDay('2026-01-01')).toBe("Jour de l'an");
    expect(saintOfDay('2026-05-01')).toBe('Fête du Travail');
    expect(saintOfDay('2026-07-14')).toBe('Fête nationale');
    expect(saintOfDay('2026-08-15')).toBe('Assomption');
    expect(saintOfDay('2026-11-01')).toBe('Toussaint');
    expect(saintOfDay('2026-12-25')).toBe('Noël');
  });

  it('couvre le 29 février', () => {
    expect(saintOfDay('2024-02-29')).toBe('Saint Auguste');
  });

  it('renvoie null hors calendrier', () => {
    expect(saintOfDay('2026-02-30')).toBeNull();
    expect(saintOfDay('2026-13-01')).toBeNull();
    expect(saintOfDay('2026-04-31')).toBeNull();
  });
});
