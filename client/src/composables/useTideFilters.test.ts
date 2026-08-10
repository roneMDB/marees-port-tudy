import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'marees-tide-filters';

const DEFAULTS = { minCoef: null, maxCoef: null, weekdays: [], aflotFrom: null, aflotTo: null };

/** Réimporte le composable avec un état singleton frais (module-level refs). */
async function freshUseTideFilters() {
  vi.resetModules();
  return (await import('./useTideFilters')).useTideFilters;
}

describe('useTideFilters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('part de filtres neutres quand rien n’est stocké', async () => {
    const { filters, activeCount } = (await freshUseTideFilters())();
    expect(filters).toEqual(DEFAULTS);
    expect(activeCount.value).toBe(0);
  });

  it('relit une sélection stockée', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ minCoef: 80, maxCoef: null, weekdays: [5, 6], aflotFrom: '09:00', aflotTo: '19:00' })
    );
    const { filters } = (await freshUseTideFilters())();
    expect(filters).toEqual({ minCoef: 80, maxCoef: null, weekdays: [5, 6], aflotFrom: '09:00', aflotTo: '19:00' });
  });

  it('persiste chaque modification', async () => {
    const { filters } = (await freshUseTideFilters())();
    filters.minCoef = 90;
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ ...DEFAULTS, minCoef: 90 });
  });

  it('retombe sur les défauts si le JSON est illisible', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const { filters } = (await freshUseTideFilters())();
    expect(filters).toEqual(DEFAULTS);
  });

  it('complète un objet partiel et écarte les valeurs de mauvais type', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ minCoef: '80', weekdays: 'lundi', aflotFrom: 42, maxCoef: 70 })
    );
    const { filters } = (await freshUseTideFilters())();
    expect(filters).toEqual({ ...DEFAULTS, maxCoef: 70 });
  });

  it('nettoie la liste de jours (hors bornes, doublons, non entiers)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ weekdays: [6, 6, 7, -1, 2, 1.5, 'x'] }));
    const { filters } = (await freshUseTideFilters())();
    expect(filters.weekdays).toEqual([2, 6]);
  });

  it('compte des critères, pas des champs', async () => {
    const { filters, activeCount } = (await freshUseTideFilters())();
    filters.minCoef = 80;
    expect(activeCount.value).toBe(1);
    filters.maxCoef = 100; // même critère « coefficient »
    expect(activeCount.value).toBe(1);
    filters.aflotFrom = '09:00';
    expect(activeCount.value).toBe(2);
    filters.weekdays = [5, 6];
    expect(activeCount.value).toBe(3);
  });

  it('ne compte pas une sélection de jours neutre (vide ou complète)', async () => {
    const { filters, activeCount } = (await freshUseTideFilters())();
    filters.weekdays = [0, 1, 2, 3, 4, 5, 6];
    expect(activeCount.value).toBe(0);
  });

  it('reset ramène tous les filtres à neutre', async () => {
    const { filters, activeCount, reset } = (await freshUseTideFilters())();
    filters.minCoef = 80;
    filters.weekdays = [5, 6];
    filters.aflotFrom = '09:00';
    filters.aflotTo = '19:00';
    reset();
    expect(filters).toEqual(DEFAULTS);
    expect(activeCount.value).toBe(0);
  });
});
