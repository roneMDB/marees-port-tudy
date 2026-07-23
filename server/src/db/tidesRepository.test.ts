import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import { getSiteData, replaceSiteData, mergeSiteData, countTides } from './tidesRepository';
import type { RawTideData } from '../lib/readTides';

const sample: RawTideData = {
  '2026-06-01': [
    { maree: 'haute', heure: '05:59', hauteur: '4.59', coefficient: '71' },
    { maree: 'basse', heure: '00:02', hauteur: '1.50' }
  ],
  '2026-06-02': [{ maree: 'haute', heure: '06:40', hauteur: '4.70', coefficient: '75' }]
};

describe('tidesRepository', () => {
  it('round-trips data identically (strings preserved, coefficient omitted when absent)', () => {
    const db = openDb(':memory:');
    replaceSiteData(db, 'port-tudy', sample);
    expect(getSiteData(db, 'port-tudy')).toEqual(sample);
    db.close();
  });

  it('isolates data per site', () => {
    const db = openDb(':memory:');
    replaceSiteData(db, 'port-tudy', sample);
    replaceSiteData(db, 'etel', { '2026-07-01': [{ maree: 'basse', heure: '03:00', hauteur: '2.10' }] });
    expect(Object.keys(getSiteData(db, 'port-tudy'))).toEqual(['2026-06-01', '2026-06-02']);
    expect(Object.keys(getSiteData(db, 'etel'))).toEqual(['2026-07-01']);
    expect(countTides(db, 'port-tudy')).toBe(3);
    expect(countTides(db)).toBe(4);
    db.close();
  });

  it('mergeSiteData replaces only the provided dates, keeping the others', () => {
    const db = openDb(':memory:');
    replaceSiteData(db, 'port-tudy', sample);
    mergeSiteData(db, 'port-tudy', {
      '2026-06-02': [{ maree: 'basse', heure: '07:00', hauteur: '1.20' }], // remplace ce jour
      '2026-06-03': [{ maree: 'haute', heure: '08:00', hauteur: '5.10', coefficient: '80' }] // ajoute
    });
    const data = getSiteData(db, 'port-tudy');
    expect(Object.keys(data)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(data['2026-06-01']).toEqual(sample['2026-06-01']); // inchangé
    expect(data['2026-06-02']).toEqual([{ maree: 'basse', heure: '07:00', hauteur: '1.20' }]); // remplacé
    db.close();
  });

  it('replaceSiteData replaces the whole site set', () => {
    const db = openDb(':memory:');
    replaceSiteData(db, 'port-tudy', sample);
    replaceSiteData(db, 'port-tudy', { '2026-09-09': [{ maree: 'haute', heure: '10:00', hauteur: '5.00', coefficient: '90' }] });
    expect(Object.keys(getSiteData(db, 'port-tudy'))).toEqual(['2026-09-09']);
    expect(countTides(db, 'port-tudy')).toBe(1);
    db.close();
  });
});
