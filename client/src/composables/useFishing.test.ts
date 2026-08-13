import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  getRefs: vi.fn()
};

vi.mock('../api/fishing', () => ({
  getTrips: (...a: unknown[]) => api.getTrips(...a),
  createTrip: (...a: unknown[]) => api.createTrip(...a),
  updateTrip: (...a: unknown[]) => api.updateTrip(...a),
  deleteTrip: (...a: unknown[]) => api.deleteTrip(...a),
  getRefs: (...a: unknown[]) => api.getRefs(...a),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
}));

import { resetFishingForTests, useFishing } from './useFishing';
import { resetFishingRefsForTests, useFishingRefs } from './useFishingRefs';

const trip = (over: Record<string, unknown> = {}) => ({
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: null,
  notes: null,
  baited: false,
  weather: null,
  catches: [],
  createdAt: 'x',
  updatedAt: 'x',
  ...over
});

describe('useFishing', () => {
  beforeEach(() => {
    Object.values(api).forEach(m => m.mockReset());
    resetFishingForTests();
    resetFishingRefsForTests();
  });

  it('charge les sorties une seule fois, puis les expose', async () => {
    api.getTrips.mockResolvedValue([trip()]);
    const { trips, load } = useFishing();
    await load();
    await load();
    expect(api.getTrips).toHaveBeenCalledTimes(1);
    expect(trips.value).toHaveLength(1);
  });

  it('remonte une erreur de chargement sans laisser loading à true', async () => {
    api.getTrips.mockRejectedValue(new Error('serveur muet'));
    const { error, loading, load } = useFishing();
    await load();
    expect(error.value).toBe('serveur muet');
    expect(loading.value).toBe(false);
  });

  it('insère une création en tête et remplace une mise à jour sur place', async () => {
    api.getTrips.mockResolvedValue([trip({ id: 1, date: '2026-08-01' })]);
    const { trips, load, save } = useFishing();
    await load();

    api.createTrip.mockResolvedValue(trip({ id: 2, date: '2026-08-09' }));
    await save({ date: '2026-08-09', startTime: null, endTime: null, notes: null, baited: false, catches: [] });
    expect(trips.value.map(t => t.id)).toEqual([2, 1]);

    api.updateTrip.mockResolvedValue(trip({ id: 1, date: '2026-08-01', notes: 'corrigé' }));
    await save(
      { date: '2026-08-01', startTime: null, endTime: null, notes: 'corrigé', baited: false, catches: [] },
      1
    );
    expect(api.updateTrip).toHaveBeenCalledWith(1, expect.objectContaining({ notes: 'corrigé' }));
    expect(trips.value.find(t => t.id === 1)!.notes).toBe('corrigé');
  });

  it('retire une sortie supprimée de la liste', async () => {
    api.getTrips.mockResolvedValue([trip({ id: 1 }), trip({ id: 2 })]);
    api.deleteTrip.mockResolvedValue(undefined);
    const { trips, load, remove } = useFishing();
    await load();
    await remove(1);
    expect(trips.value.map(t => t.id)).toEqual([2]);
  });

  it("donne le libellé d'un référentiel, et l'id brut s'il a disparu", async () => {
    api.getRefs.mockResolvedValue([
      { id: 'bar', kind: 'species', label: 'Bar' },
      { id: 'ligne', kind: 'gear', label: 'Ligne' }
    ]);
    const { species, gears, labelOf, load } = useFishingRefs();
    await load();
    expect(species.value.map(r => r.id)).toEqual(['bar']);
    expect(gears.value.map(r => r.id)).toEqual(['ligne']);
    expect(labelOf('bar')).toBe('Bar');
    expect(labelOf('espece-supprimee')).toBe('espece-supprimee');
  });
});
