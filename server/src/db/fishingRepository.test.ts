import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
  type FishingTripInput
} from './fishingRepository';

const NOW = '2026-08-10T18:00:00.000Z';

function input(over: Partial<FishingTripInput> = {}): FishingTripInput {
  return {
    date: '2026-08-10',
    startTime: '19:42',
    endTime: null,
    notes: null,
    catches: [
      { speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true },
      { speciesId: 'tourteau', gearId: 'casier-crabes', quantity: 3, sizeCm: null, weightG: null, kept: true }
    ],
    ...over
  };
}

describe('fishingRepository', () => {
  it('renvoie une liste vide sur une base neuve', () => {
    const db = openDb(':memory:');
    expect(listTrips(db)).toEqual([]);
    db.close();
  });

  it('cree une sortie avec ses prises, dans l ordre de saisie', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    expect(trip.id).toBeGreaterThan(0);
    expect(trip.date).toBe('2026-08-10');
    expect(trip.startTime).toBe('19:42');
    expect(trip.catches).toHaveLength(2);
    expect(trip.catches[0]).toEqual({
      speciesId: 'bar',
      gearId: 'ligne',
      quantity: 1,
      sizeCm: 42,
      weightG: null,
      kept: true
    });
    expect(trip.catches[1].speciesId).toBe('tourteau');
    db.close();
  });

  it('accepte une sortie bredouille (aucune prise)', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input({ catches: [] }), null, NOW);
    expect(trip.catches).toEqual([]);
    expect(listTrips(db)).toHaveLength(1);
    db.close();
  });

  it('conserve l instantane meteo tel quel', () => {
    const db = openDb(':memory:');
    const weather = { tempMin: 14, tempMax: 22, windMax: 18, windDir: 250, weatherCode: 3, seaTemperature: 19.5 };
    const trip = createTrip(db, input(), weather, NOW);
    expect(getTrip(db, trip.id)!.weather).toEqual(weather);
    db.close();
  });

  it('liste les sorties de la plus recente a la plus ancienne', () => {
    const db = openDb(':memory:');
    createTrip(db, input({ date: '2026-08-01' }), null, NOW);
    createTrip(db, input({ date: '2026-08-09' }), null, NOW);
    createTrip(db, input({ date: '2026-08-05' }), null, NOW);
    expect(listTrips(db).map(t => t.date)).toEqual(['2026-08-09', '2026-08-05', '2026-08-01']);
    db.close();
  });

  it('filtre sur une plage de dates inclusive', () => {
    const db = openDb(':memory:');
    createTrip(db, input({ date: '2026-08-01' }), null, NOW);
    createTrip(db, input({ date: '2026-08-05' }), null, NOW);
    createTrip(db, input({ date: '2026-08-09' }), null, NOW);
    expect(listTrips(db, '2026-08-05', '2026-08-09').map(t => t.date)).toEqual(['2026-08-09', '2026-08-05']);
    expect(listTrips(db, '2026-08-05', '2026-08-05').map(t => t.date)).toEqual(['2026-08-05']);
    db.close();
  });

  it('remplace toutes les prises a la mise a jour', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    const updated = updateTrip(
      db,
      trip.id,
      input({
        notes: 'Vent d ouest',
        catches: [
          { speciesId: 'seiche', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: 900, kept: false }
        ]
      }),
      '2026-08-11T09:00:00.000Z'
    );
    expect(updated!.catches).toHaveLength(1);
    expect(updated!.catches[0]).toMatchObject({ speciesId: 'seiche', kept: false, weightG: 900 });
    expect(updated!.notes).toBe('Vent d ouest');
    expect(updated!.updatedAt).toBe('2026-08-11T09:00:00.000Z');
    expect(updated!.createdAt).toBe(NOW);
    const orphans = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(orphans.c).toBe(1);
    db.close();
  });

  it('ne touche pas a la meteo lors d une mise a jour', () => {
    const db = openDb(':memory:');
    const weather = { tempMin: 14, tempMax: 22, windMax: 18, windDir: 250, weatherCode: 3, seaTemperature: 19.5 };
    const trip = createTrip(db, input(), weather, NOW);
    const updated = updateTrip(db, trip.id, input({ notes: 'corrige' }), NOW);
    expect(updated!.weather).toEqual(weather);
    db.close();
  });

  it('renvoie null sur une sortie absente', () => {
    const db = openDb(':memory:');
    expect(getTrip(db, 404)).toBeNull();
    expect(updateTrip(db, 404, input(), NOW)).toBeNull();
    expect(deleteTrip(db, 404)).toBe(false);
    db.close();
  });

  it('supprime une sortie et ses prises', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    expect(deleteTrip(db, trip.id)).toBe(true);
    expect(listTrips(db)).toEqual([]);
    const rest = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(rest.c).toBe(0);
    db.close();
  });
});
