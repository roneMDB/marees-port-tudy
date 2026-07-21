import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampDate, filterTides, flatten, resolveWindow, withSiteTimes } from './tides';
import { addDays } from './format';
import type { FlatTide, Settings, TideOutput } from '../types';

const baseSettings: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3
};

const sample: TideOutput = {
  siteId: 'test',
  timezone: 'Europe/Paris',
  from: '2026-06-01',
  to: '2026-06-02',
  days: {
    '2026-06-02': [
      { time: '15:00', height: 4.2, type: 'high', coefficient: 95, navihan: { 'Pleine mer': '16:15' } }
    ],
    '2026-06-01': [
      { time: '09:00', height: 1.1, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:15', 'A flot': '11:40' } },
      { time: '03:00', height: 4.6, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:15' } }
    ]
  }
};

describe('flatten', () => {
  it('flattens days into dated extremes sorted by date+time', () => {
    const flat = flatten(sample);
    expect(flat).toHaveLength(3);
    expect(flat.map(t => `${t.date} ${t.time}`)).toEqual([
      '2026-06-01 03:00',
      '2026-06-01 09:00',
      '2026-06-02 15:00'
    ]);
    expect(flat[0].date).toBe('2026-06-01');
  });
});

describe('clampDate', () => {
  it('returns the date when within bounds', () => {
    expect(clampDate('2026-07-18', '2026-06-01', '2026-10-31')).toBe('2026-07-18');
  });

  it('clamps to min when before the range', () => {
    expect(clampDate('2026-01-01', '2026-06-01', '2026-10-31')).toBe('2026-06-01');
  });

  it('clamps to max when after the range', () => {
    expect(clampDate('2027-01-01', '2026-06-01', '2026-10-31')).toBe('2026-10-31');
  });

  it('ignores empty bounds', () => {
    expect(clampDate('2026-07-18', '', '')).toBe('2026-07-18');
  });
});

describe('addDays', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-07-18', 30)).toBe('2026-08-17');
    expect(addDays('2026-10-15', 30)).toBe('2026-11-14');
    expect(addDays('2026-07-18', 0)).toBe('2026-07-18');
  });
});

describe('resolveWindow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mode today: spans today → today + rangeDays, clamped', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-18T12:00:00'));
    expect(resolveWindow(baseSettings, '2026-06-01', '2026-10-31')).toEqual({
      from: '2026-07-18',
      to: '2026-08-17'
    });
  });

  it('mode today: clamps the end to the max available date', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-20T12:00:00'));
    expect(resolveWindow(baseSettings, '2026-06-01', '2026-10-31')).toEqual({
      from: '2026-10-20',
      to: '2026-10-31'
    });
  });

  it('mode date: uses startDate + rangeDays', () => {
    const s: Settings = { ...baseSettings, startMode: 'date', startDate: '2026-08-01', rangeDays: 7 };
    expect(resolveWindow(s, '2026-06-01', '2026-10-31')).toEqual({
      from: '2026-08-01',
      to: '2026-08-08'
    });
  });

  it('mode date without startDate falls back to today', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-18T12:00:00'));
    const s: Settings = { ...baseSettings, startMode: 'date', startDate: null, rangeDays: 10 };
    expect(resolveWindow(s, '2026-06-01', '2026-10-31')).toEqual({
      from: '2026-07-18',
      to: '2026-07-28'
    });
  });
});

describe('filterTides', () => {
  const flat: FlatTide[] = flatten(sample);

  it('filters by inclusive date range', () => {
    const res = filterTides(flat, { from: '2026-06-02', to: '2026-06-02', type: 'all', minCoef: null });
    expect(res).toHaveLength(1);
    expect(res[0].date).toBe('2026-06-02');
  });

  it('filters by tide type', () => {
    const res = filterTides(flat, { from: '', to: '', type: 'low', minCoef: null });
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('low');
  });

  it('filters by minimum coefficient, excluding entries without a coefficient', () => {
    const res = filterTides(flat, { from: '', to: '', type: 'all', minCoef: 90 });
    expect(res).toHaveLength(1);
    expect(res[0].coefficient).toBe(95);
  });

  it('returns everything with empty/neutral filters', () => {
    const res = filterTides(flat, { from: '', to: '', type: 'all', minCoef: null });
    expect(res).toHaveLength(3);
  });
});

describe('withSiteTimes', () => {
  const reference: FlatTide[] = [
    { date: '2026-06-01', time: '03:00', height: 4.6, type: 'high', coefficient: 71, navihan: {} },
    { date: '2026-06-01', time: '09:00', height: 1.1, type: 'low', coefficient: null, navihan: {} },
    { date: '2026-06-01', time: '15:30', height: 4.7, type: 'high', coefficient: 71, navihan: {} },
    { date: '2026-06-01', time: '21:45', height: 1.2, type: 'low', coefficient: null, navihan: {} }
  ];

  it('substitutes time/height from the paired site tide, keeping coef & navihan from reference', () => {
    const site: FlatTide[] = [
      { date: '2026-06-01', time: '03:20', height: 5.1, type: 'high', coefficient: 71, navihan: {} },
      { date: '2026-06-01', time: '09:25', height: 0.6, type: 'low', coefficient: null, navihan: {} },
      { date: '2026-06-01', time: '15:55', height: 5.2, type: 'high', coefficient: 71, navihan: {} },
      { date: '2026-06-01', time: '22:10', height: 0.7, type: 'low', coefficient: null, navihan: {} }
    ];
    const merged = withSiteTimes(reference, site);
    expect(merged.map(t => t.displayTime)).toEqual(['03:20', '09:25', '15:55', '22:10']);
    expect(merged.map(t => t.displayHeight)).toEqual([5.1, 0.6, 5.2, 0.7]);
    // Référence intacte (heure Port-Tudy conservée pour Navihan).
    expect(merged.map(t => t.time)).toEqual(['03:00', '09:00', '15:30', '21:45']);
    expect(merged[0].coefficient).toBe(71);
  });

  it('pairs by rank within day+type (1re/2e marée), independent of interleaved order', () => {
    const site: FlatTide[] = [
      { date: '2026-06-01', time: '15:55', height: 5.2, type: 'high', coefficient: 71, navihan: {} },
      { date: '2026-06-01', time: '03:20', height: 5.1, type: 'high', coefficient: 71, navihan: {} }
    ];
    const merged = withSiteTimes(reference, site);
    // 1re haute réf (03:00) ↔ 1re haute site (03:20) ; 2e haute réf (15:30) ↔ 2e haute site (15:55).
    expect(merged[0].displayTime).toBe('03:20');
    expect(merged[2].displayTime).toBe('15:55');
  });

  it('marks missing site tides with empty time / NaN height', () => {
    const merged = withSiteTimes(reference, []);
    expect(merged.every(t => t.displayTime === '')).toBe(true);
    expect(merged.every(t => Number.isNaN(t.displayHeight))).toBe(true);
  });
});
