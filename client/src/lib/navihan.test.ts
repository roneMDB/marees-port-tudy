import { describe, expect, it } from 'vitest';
import { computeNavihan, DEFAULT_OFFSETS, formatOffset, nextAflot, shiftTime } from './navihan';
import type { FlatTide } from '../types';

// Fabrique une marée aplatie minimale pour les tests (navihan recalculé ailleurs).
function tide(date: string, time: string, type: 'high' | 'low'): FlatTide {
  return { date, time, type, height: 0, coefficient: null, navihan: {} };
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
  it('gives basse mer + à flot for a low tide', () => {
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

describe('nextAflot', () => {
  // Un jour : basse 03:07 & 15:29 (à-flot +160 → 05:47 & 18:09), pleines 08:58 & 21:18.
  const day = [
    tide('2026-07-19', '08:58', 'high'),
    tide('2026-07-19', '21:18', 'high'),
    tide('2026-07-19', '03:07', 'low'),
    tide('2026-07-19', '15:29', 'low'),
    tide('2026-07-20', '03:52', 'low')
  ];

  it('returns the next à-flot even when the next tide is a pleine mer', () => {
    // 15:48 : la basse de 15:29 est passée mais son à-flot (18:09) est à venir ;
    // la prochaine marée chronologique est la pleine mer de 21:18.
    const r = nextAflot(day, 160, new Date('2026-07-19T15:48:00'));
    expect(r).not.toBeNull();
    expect(r!.time).toBe('18:09');
    expect(r!.date).toBe('2026-07-19');
    expect(r!.basse.time).toBe('15:29');
  });

  it('skips à-flots already passed and moves to the next day', () => {
    const r = nextAflot(day, 160, new Date('2026-07-19T18:30:00'));
    expect(r!.basse.date).toBe('2026-07-20');
    expect(r!.basse.time).toBe('03:52');
    expect(r!.time).toBe('06:32');
  });

  it('rolls the date forward when the offset crosses midnight', () => {
    const late = [tide('2026-07-19', '23:15', 'low')];
    const r = nextAflot(late, 160, new Date('2026-07-19T22:00:00'));
    expect(r!.date).toBe('2026-07-20');
    expect(r!.time).toBe('01:55');
  });

  it('returns null when no upcoming à-flot exists', () => {
    expect(nextAflot(day, 160, new Date('2026-07-21T00:00:00'))).toBeNull();
    expect(nextAflot([tide('2026-07-19', '08:58', 'high')], 160, new Date('2026-07-19T00:00:00'))).toBeNull();
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
