import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import { deleteObservation, getObservations, upsertObservation } from './aflotObservationsRepository';

describe('aflotObservationsRepository', () => {
  it('returns an empty list on a fresh base', () => {
    const db = openDb(':memory:');
    expect(getObservations(db)).toEqual([]);
    db.close();
  });

  it('upserts and reads back an observation', () => {
    const db = openDb(':memory:');
    upsertObservation(db, { date: '2026-07-25', time: '08:22', observed: '11:07' });
    expect(getObservations(db)).toEqual([{ date: '2026-07-25', time: '08:22', observed: '11:07' }]);
    db.close();
  });

  it('updates the observed time on a second upsert (unique per date+time)', () => {
    const db = openDb(':memory:');
    upsertObservation(db, { date: '2026-07-25', time: '08:22', observed: '11:07' });
    upsertObservation(db, { date: '2026-07-25', time: '08:22', observed: '11:00' });
    const all = getObservations(db);
    expect(all).toHaveLength(1);
    expect(all[0].observed).toBe('11:00');
    db.close();
  });

  it('keeps observations for distinct tides and returns them sorted', () => {
    const db = openDb(':memory:');
    upsertObservation(db, { date: '2026-07-26', time: '09:10', observed: '12:00' });
    upsertObservation(db, { date: '2026-07-25', time: '20:40', observed: '23:30' });
    upsertObservation(db, { date: '2026-07-25', time: '08:22', observed: '11:07' });
    expect(getObservations(db).map(o => `${o.date} ${o.time}`)).toEqual([
      '2026-07-25 08:22',
      '2026-07-25 20:40',
      '2026-07-26 09:10'
    ]);
    db.close();
  });

  it('deletes an observation', () => {
    const db = openDb(':memory:');
    upsertObservation(db, { date: '2026-07-25', time: '08:22', observed: '11:07' });
    deleteObservation(db, '2026-07-25', '08:22');
    expect(getObservations(db)).toEqual([]);
    db.close();
  });
});
