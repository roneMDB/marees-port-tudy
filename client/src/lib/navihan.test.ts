import { describe, expect, it } from 'vitest';
import {
  aflotEvents,
  aflotTimeByThreshold,
  computeNavihan,
  DEFAULT_OFFSETS,
  formatOffset,
  nextAflot,
  shiftTime
} from './navihan';
import type { FlatTide, NavihanOffsets } from '../types';

// Fabrique une marée aplatie minimale pour les tests (navihan recalculé ailleurs).
function tide(date: string, time: string, type: 'high' | 'low', height = 0): FlatTide {
  return { date, time, type, height, coefficient: null, navihan: {} };
}

describe('shiftTime', () => {
  it('adds an offset in minutes', () => {
    expect(shiftTime('08:21', 75)).toBe('09:36');
    expect(shiftTime('14:29', 160)).toBe('17:09');
  });

  it('wraps around midnight', () => {
    expect(shiftTime('23:15', 150)).toBe('01:45');
    expect(shiftTime('00:10', -20)).toBe('23:50');
  });
});

describe('computeNavihan', () => {
  it('gives basse mer + remise à flot (décalage fixe) for a low tide', () => {
    const nav = computeNavihan({ time: '14:29', type: 'low' }, DEFAULT_OFFSETS);
    expect(nav).toEqual({ 'Basse mer': '15:44', 'A flot': '17:09' });
  });

  it('gives only pleine mer for a high tide', () => {
    const nav = computeNavihan({ time: '08:21', type: 'high' }, DEFAULT_OFFSETS);
    expect(nav).toEqual({ 'Pleine mer': '09:36' });
  });

  it('honours custom, independent offsets', () => {
    const nav = computeNavihan({ time: '08:00', type: 'high' }, { basseMer: 60, pleineMer: 90, aFlot: 200 });
    expect(nav).toEqual({ 'Pleine mer': '09:30' });
  });
});

describe('aflotTimeByThreshold', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };

  it('returns the HH:MM where the rising Navihan curve reaches the threshold', () => {
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const high = tide('2026-07-18', '08:00', 'high', 5);
    // Navihan : basse 03:15 (h1) → pleine 09:15 (h5). Seuil 3 = mi-hauteur → 06:15 (mi-temps).
    expect(aflotTimeByThreshold([low, high], low, offsets, 3)).toBe('06:15');
  });

  it('returns null when the next high never reaches the threshold', () => {
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const high = tide('2026-07-18', '08:00', 'high', 5);
    expect(aflotTimeByThreshold([low, high], low, offsets, 5.5)).toBeNull();
  });

  it('wraps past midnight when the crossing falls on the next day', () => {
    const low = tide('2026-07-19', '23:00', 'low', 1);
    const high = tide('2026-07-20', '05:00', 'high', 5);
    // Navihan : basse 00:15 (J+1) → pleine 06:15. Seuil 3 → +255 min après 23:00 = 03:15.
    expect(aflotTimeByThreshold([low, high], low, offsets, 3)).toBe('03:15');
  });
});

describe('nextAflot', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };
  // Basses 03:07 (h1.2) & 15:29 (h1.5), pleines 08:58 (h5.0) & 21:18 (h4.8), + J+1 basse 03:52 → pleine 09:30.
  const day = [
    tide('2026-07-19', '08:58', 'high', 5.0),
    tide('2026-07-19', '21:18', 'high', 4.8),
    tide('2026-07-19', '03:07', 'low', 1.2),
    tide('2026-07-19', '15:29', 'low', 1.5),
    tide('2026-07-20', '03:52', 'low', 1.0),
    tide('2026-07-20', '09:30', 'high', 5.1)
  ];

  it('returns the next à-flot, derived from the afternoon low, even before the evening high', () => {
    const r = nextAflot(day, offsets, 2.8, new Date('2026-07-19T15:48:00'));
    expect(r).not.toBeNull();
    expect(r!.date).toBe('2026-07-19');
    expect(r!.basse.time).toBe('15:29');
    // Cohérence : même heure que le calcul direct par seuil pour cette basse.
    expect(r!.time).toBe(aflotTimeByThreshold(day, r!.basse, offsets, 2.8));
  });

  it('skips à-flots already passed and moves to the next day', () => {
    const r = nextAflot(day, offsets, 2.8, new Date('2026-07-19T22:00:00'));
    expect(r!.basse.date).toBe('2026-07-20');
    expect(r!.basse.time).toBe('03:52');
    expect(r!.time).toBe(aflotTimeByThreshold(day, r!.basse, offsets, 2.8));
  });

  it('returns null when no upcoming à-flot exists', () => {
    expect(nextAflot(day, offsets, 2.8, new Date('2026-07-21T00:00:00'))).toBeNull();
    expect(nextAflot([tide('2026-07-19', '08:58', 'high', 5)], offsets, 2.8, new Date('2026-07-19T00:00:00'))).toBeNull();
  });

  it('aflotEvents lists every low with a following high, sorted chronologically', () => {
    const events = aflotEvents(day, offsets, 2.8);
    expect(events.map(e => e.basse.time)).toEqual(['03:07', '15:29', '03:52']);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].dt.getTime()).toBeGreaterThan(events[i - 1].dt.getTime());
    }
  });
});

describe('formatOffset', () => {
  it('formats minutes as XhYY', () => {
    expect(formatOffset(75)).toBe('1h15');
    expect(formatOffset(160)).toBe('2h40');
    expect(formatOffset(120)).toBe('2h');
    expect(formatOffset(0)).toBe('0h');
  });
});
