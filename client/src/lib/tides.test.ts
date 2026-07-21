import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampDate, filterTides, flatten, matchNavihanReference, resolveWindow } from './tides';
import { addDays } from './format';
import type { FlatTide, Settings, TideOutput } from '../types';

const baseSettings: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3,
  weatherLinks: []
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

describe('matchNavihanReference', () => {
  // Port-Tudy (référence Navihan).
  const reference: FlatTide[] = [
    { date: '2026-07-22', time: '23:40', height: 3.9, type: 'high', coefficient: 40, navihan: {} },
    { date: '2026-07-23', time: '06:22', height: 1.9, type: 'low', coefficient: null, navihan: {} },
    { date: '2026-07-23', time: '12:28', height: 3.8, type: 'high', coefficient: 35, navihan: {} },
    { date: '2026-07-23', time: '19:01', height: 2.3, type: 'low', coefficient: null, navihan: {} }
  ];

  it('keeps the selected port tides as rows and matches the nearest same-type reference', () => {
    // Étel : 4 marées le 23, dont une pleine mer à 00:14 (cycle de la veille au soir à Port-Tudy).
    const etel: FlatTide[] = [
      { date: '2026-07-23', time: '00:14', height: 3.93, type: 'high', coefficient: 40, navihan: {} },
      { date: '2026-07-23', time: '06:59', height: 2.36, type: 'low', coefficient: null, navihan: {} },
      { date: '2026-07-23', time: '13:05', height: 3.89, type: 'high', coefficient: 37, navihan: {} },
      { date: '2026-07-23', time: '19:35', height: 2.38, type: 'low', coefficient: null, navihan: {} }
    ];
    const rows = matchNavihanReference(etel, reference);
    // Toutes les marées d'Étel restent (4 lignes), avec leurs propres heures.
    expect(rows.map(t => t.time)).toEqual(['00:14', '06:59', '13:05', '19:35']);
    // Appariement par proximité (même type), passage de minuit géré :
    expect(rows[0].refTime).toBe('23:40'); // 00:14 (23) ↔ pleine mer Port-Tudy 23:40 (22)
    expect(rows[1].refTime).toBe('06:22'); // basse ↔ basse
    expect(rows[2].refTime).toBe('12:28'); // 13:05 ↔ pleine mer 12:28 (et non 23:40)
    expect(rows[3].refTime).toBe('19:01');
  });

  it('returns null refTime when no same-type reference is within tolerance', () => {
    const isolated: FlatTide[] = [
      { date: '2026-07-23', time: '09:00', height: 2.0, type: 'low', coefficient: null, navihan: {} }
    ];
    // Aucune basse mer de référence à moins de 3 h (la plus proche est à 06:22, ~2h38 → OK ;
    // on force le cas « hors tolérance » avec une référence lointaine seulement).
    const farRef: FlatTide[] = [
      { date: '2026-07-23', time: '01:00', height: 1.9, type: 'low', coefficient: null, navihan: {} }
    ];
    expect(matchNavihanReference(isolated, farRef)[0].refTime).toBeNull();
    expect(matchNavihanReference(isolated, [])[0].refTime).toBeNull();
  });
});
