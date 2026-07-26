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
    const r = nextAflot(day, offsets, new Date('2026-07-19T15:48:00'));
    expect(r).not.toBeNull();
    expect(r!.date).toBe('2026-07-19');
    expect(r!.basse.time).toBe('15:29');
    // Heure « Remise à flot » = décalage fixe après la basse mer (pas l'estimation par seuil).
    expect(r!.time).toBe(shiftTime('15:29', offsets.aFlot));
  });

  it('skips à-flots already passed and moves to the next day', () => {
    const r = nextAflot(day, offsets, new Date('2026-07-19T22:00:00'));
    expect(r!.basse.date).toBe('2026-07-20');
    expect(r!.basse.time).toBe('03:52');
    expect(r!.time).toBe(shiftTime('03:52', offsets.aFlot));
  });

  it('wraps past midnight when the fixed offset falls on the next day', () => {
    const late = [tide('2026-07-19', '23:00', 'low', 1.2)];
    const r = nextAflot(late, offsets, new Date('2026-07-19T23:30:00'));
    expect(r!.date).toBe('2026-07-20');
    expect(r!.time).toBe('01:40'); // 23:00 + 2h40
  });

  it('returns null when no upcoming à-flot exists', () => {
    expect(nextAflot(day, offsets, new Date('2026-07-21T00:00:00'))).toBeNull();
    expect(nextAflot([tide('2026-07-19', '08:58', 'high', 5)], offsets, new Date('2026-07-19T00:00:00'))).toBeNull();
  });

  it('aflotEvents lists every low (fixed offset), sorted chronologically', () => {
    const events = aflotEvents(day, offsets);
    expect(events.map(e => e.basse.time)).toEqual(['03:07', '15:29', '03:52']);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].dt.getTime()).toBeGreaterThan(events[i - 1].dt.getTime());
    }
  });

  it('aflotEvents keeps a low with no following high (fixed offset needs no high)', () => {
    const orphan = [tide('2026-07-19', '15:29', 'low', 1.5)];
    expect(aflotEvents(orphan, offsets).map(e => e.basse.time)).toEqual(['15:29']);
  });
});

// L'estimation (seuil de hauteur) n'alimente plus que le tableau : on garde la calibration du
// modèle — le délai après la basse mer se raccourcit quand l'amplitude (coef) augmente.
describe('modèle seuil — variation avec le coefficient', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const delay = (lowHeight: number, highHeight: number): number => {
    const low = tide('2026-08-01', '02:00', 'low', lowHeight);
    const high = tide('2026-08-01', '08:00', 'high', highHeight);
    const t = aflotTimeByThreshold([low, high], low, offsets, 2.8);
    return toMinutes(t!) - (120 + offsets.basseMer);
  };

  it('gives a shorter refloat delay in vive-eau (fort coef) than in morte-eau (faible coef)', () => {
    expect(delay(0.6, 5.4)).toBeLessThan(delay(2.0, 3.6));
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
