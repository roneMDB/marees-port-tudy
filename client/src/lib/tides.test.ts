import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampDate, filterTides, flatten, groupByDay, matchNavihanReference, matchesAflotWindow,
  matchesDayFilters, periodWindow, resolveWindow, tidalRange
} from './tides';
import type { DayFacts, DayTides } from './tides';
import { addDays } from './format';
import type { FlatTide, Settings, TideDayFilters, TideOutput } from '../types';

const baseSettings: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotRefHeight: 2.8,
  aFlotDays: 3,
  coefDays: 20,
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
    const res = filterTides(flat, { from: '2026-06-02', to: '2026-06-02' });
    expect(res).toHaveLength(1);
    expect(res[0].date).toBe('2026-06-02');
  });

  it('keeps a tide sitting exactly on either bound', () => {
    expect(filterTides(flat, { from: '2026-06-01', to: '2026-06-02' })).toHaveLength(3);
  });

  it('returns everything with empty bounds', () => {
    expect(filterTides(flat, { from: '', to: '' })).toHaveLength(3);
  });
});

describe('matchesDayFilters', () => {
  const NEUTRAL: TideDayFilters = {
    minCoef: null, maxCoef: null, weekdays: [], aflotFrom: null, aflotTo: null
  };
  const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
    coefficient: 70,
    weekday: 0, // lundi
    ...over
  });

  it('garde tout quand aucun filtre n’est posé', () => {
    expect(matchesDayFilters(facts({ coefficient: null }), NEUTRAL)).toBe(true);
  });

  it('borne le coefficient de façon inclusive', () => {
    expect(matchesDayFilters(facts({ coefficient: 70 }), { ...NEUTRAL, minCoef: 70 })).toBe(true);
    expect(matchesDayFilters(facts({ coefficient: 69 }), { ...NEUTRAL, minCoef: 70 })).toBe(false);
    expect(matchesDayFilters(facts({ coefficient: 70 }), { ...NEUTRAL, maxCoef: 70 })).toBe(true);
    expect(matchesDayFilters(facts({ coefficient: 71 }), { ...NEUTRAL, maxCoef: 70 })).toBe(false);
    expect(matchesDayFilters(facts({ coefficient: 60 }), { ...NEUTRAL, minCoef: 45, maxCoef: 70 })).toBe(true);
  });

  it('écarte un jour sans coefficient dès qu’une borne est posée, le garde sinon', () => {
    expect(matchesDayFilters(facts({ coefficient: null }), { ...NEUTRAL, minCoef: 40 })).toBe(false);
    expect(matchesDayFilters(facts({ coefficient: null }), { ...NEUTRAL, maxCoef: 120 })).toBe(false);
    expect(matchesDayFilters(facts({ coefficient: null }), NEUTRAL)).toBe(true);
  });

  it('traite la sélection de jours comme neutre à 0 et à 7 valeurs', () => {
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(matchesDayFilters(facts({ weekday: 2 }), { ...NEUTRAL, weekdays: [] })).toBe(true);
    expect(matchesDayFilters(facts({ weekday: 2 }), { ...NEUTRAL, weekdays: all })).toBe(true);
  });

  it('ne garde que les jours de semaine sélectionnés (lundi = 0)', () => {
    const weekend = { ...NEUTRAL, weekdays: [5, 6] };
    expect(matchesDayFilters(facts({ weekday: 5 }), weekend)).toBe(true); // samedi
    expect(matchesDayFilters(facts({ weekday: 6 }), weekend)).toBe(true); // dimanche
    expect(matchesDayFilters(facts({ weekday: 0 }), weekend)).toBe(false); // lundi
  });

  it('ignore la plage horaire de remise à flot : elle masque des heures, pas des lignes', () => {
    const window = { ...NEUTRAL, aflotFrom: '09:00', aflotTo: '19:00' };
    expect(matchesDayFilters(facts(), window)).toBe(true);
  });

  it('exige que tous les critères de ligne posés soient satisfaits', () => {
    const f: TideDayFilters = { minCoef: 80, maxCoef: null, weekdays: [5, 6], aflotFrom: null, aflotTo: null };
    expect(matchesDayFilters(facts({ coefficient: 90, weekday: 5 }), f)).toBe(true);
    expect(matchesDayFilters(facts({ coefficient: 70, weekday: 5 }), f)).toBe(false);
    expect(matchesDayFilters(facts({ coefficient: 90, weekday: 1 }), f)).toBe(false);
  });
});

describe('matchesAflotWindow', () => {
  it('laisse tout passer quand aucune borne n’est posée', () => {
    expect(matchesAflotWindow('03:00', { aflotFrom: null, aflotTo: null })).toBe(true);
  });

  it('retient les heures de la plage, bornes incluses', () => {
    const w = { aflotFrom: '09:00', aflotTo: '19:00' };
    expect(matchesAflotWindow('09:00', w)).toBe(true);
    expect(matchesAflotWindow('19:00', w)).toBe(true);
    expect(matchesAflotWindow('12:30', w)).toBe(true);
    expect(matchesAflotWindow('08:59', w)).toBe(false);
    expect(matchesAflotWindow('19:01', w)).toBe(false);
  });

  it('accepte une borne seule', () => {
    expect(matchesAflotWindow('08:00', { aflotFrom: '09:00', aflotTo: null })).toBe(false);
    expect(matchesAflotWindow('10:00', { aflotFrom: '09:00', aflotTo: null })).toBe(true);
    expect(matchesAflotWindow('10:00', { aflotFrom: null, aflotTo: '09:00' })).toBe(false);
    expect(matchesAflotWindow('08:00', { aflotFrom: null, aflotTo: '09:00' })).toBe(true);
  });

  it('traite une plage franchissant minuit comme une union', () => {
    const night = { aflotFrom: '22:00', aflotTo: '06:00' };
    expect(matchesAflotWindow('23:10', night)).toBe(true);
    expect(matchesAflotWindow('04:30', night)).toBe(true);
    expect(matchesAflotWindow('12:00', night)).toBe(false);
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
    // La date Port-Tudy appariée est aussi exposée (clé des observations) — passage de minuit géré.
    expect(rows[0].refDate).toBe('2026-07-22'); // apparié à la pleine mer de la veille
    expect(rows[1].refDate).toBe('2026-07-23');
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
    expect(matchNavihanReference(isolated, farRef)[0].refDate).toBeNull();
    expect(matchNavihanReference(isolated, [])[0].refTime).toBeNull();
  });
});

describe('groupByDay', () => {
  const tides: FlatTide[] = [
    { date: '2026-07-23', time: '19:01', height: 2.3, type: 'low', coefficient: null, navihan: { 'A flot': '21:41' } },
    { date: '2026-07-23', time: '12:28', height: 3.8, type: 'high', coefficient: 33, navihan: {} },
    { date: '2026-07-23', time: '06:22', height: 1.9, type: 'low', coefficient: null, navihan: { 'A flot': '09:02' } },
    { date: '2026-07-22', time: '11:19', height: 4.0, type: 'high', coefficient: 45, navihan: {} },
    { date: '2026-07-22', time: '23:47', height: 3.9, type: 'high', coefficient: 40, navihan: {} }
  ];

  it('groups by day (date asc), splits/sorts highs & lows, coef = max of highs', () => {
    const days = groupByDay(tides);
    expect(days.map(d => d.date)).toEqual(['2026-07-22', '2026-07-23']);

    const d22 = days[0];
    expect(d22.highs.map(h => h.time)).toEqual(['11:19', '23:47']);
    expect(d22.lows).toEqual([]);
    expect(d22.coefficient).toBe(45); // max(45, 40)

    const d23 = days[1];
    expect(d23.highs.map(h => h.time)).toEqual(['12:28']); // une seule pleine mer
    expect(d23.lows.map(l => l.time)).toEqual(['06:22', '19:01']);
    expect(d23.coefficient).toBe(33);
  });

  it('sets coefficient to null when no high has one, and handles an empty list', () => {
    const noCoef: FlatTide[] = [
      { date: '2026-07-24', time: '07:00', height: 2.0, type: 'low', coefficient: null, navihan: {} }
    ];
    expect(groupByDay(noCoef)[0].coefficient).toBeNull();
    expect(groupByDay([])).toEqual([]);
  });
});

describe('tidalRange', () => {
  const day = (highs: number[], lows: number[]): DayTides => ({
    date: '2026-07-30',
    highs: highs.map(height => ({
      date: '2026-07-30', time: '12:00', height, type: 'high' as const, coefficient: 80, navihan: {}
    })),
    lows: lows.map(height => ({
      date: '2026-07-30', time: '06:00', height, type: 'low' as const, coefficient: null, navihan: {}
    })),
    coefficient: 80
  });

  it('mesure l’écart entre la plus haute pleine mer et la plus basse basse mer', () => {
    expect(tidalRange(day([5.12], [1.3]))).toBeCloseTo(3.82, 5);
    // Deux marées de chaque type : les extrêmes du jour, pas la première paire.
    expect(tidalRange(day([4.9, 5.2], [1.5, 1.1]))).toBeCloseTo(4.1, 5);
  });

  it('renvoie null quand il manque un type de marée', () => {
    expect(tidalRange(day([5.1], []))).toBeNull();
    expect(tidalRange(day([], [1.3]))).toBeNull();
  });

  it('renvoie null quand les hauteurs ne sont pas exploitables', () => {
    expect(tidalRange(day([Number.NaN], [1.3]))).toBeNull();
  });
});

describe('periodWindow', () => {
  const MIN = '2026-06-01';
  const MAX = '2026-10-31';

  it('offset 0 = fenêtre configurée [from, from+rangeDays]', () => {
    expect(periodWindow('2026-07-21', 30, 0, MIN, MAX)).toEqual({ from: '2026-07-21', to: '2026-08-20' });
  });

  it('offset négatif recule d’une période, positif avance', () => {
    expect(periodWindow('2026-07-21', 30, -1, MIN, MAX)).toEqual({ from: '2026-06-21', to: '2026-07-21' });
    expect(periodWindow('2026-07-21', 30, 1, MIN, MAX)).toEqual({ from: '2026-08-20', to: '2026-09-19' });
  });

  it('borne le début à min et garde une période pleine', () => {
    // Reculer loin : from clampé à MIN, to = MIN + rangeDays.
    expect(periodWindow('2026-07-21', 30, -5, MIN, MAX)).toEqual({ from: '2026-06-01', to: '2026-07-01' });
  });

  it('borne la fin à max', () => {
    expect(periodWindow('2026-10-20', 30, 0, MIN, MAX)).toEqual({ from: '2026-10-20', to: '2026-10-31' });
  });
});
