import { describe, expect, it } from 'vitest';
import {
  aflotAgenda,
  aflotEvents,
  aflotTimeByThreshold,
  computeNavihan,
  DEFAULT_OFFSETS,
  formatOffset,
  nextAflot,
  shiftMoment,
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
  it('returns the moment where the rising Port-Tudy curve reaches the threshold', () => {
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const high = tide('2026-07-18', '08:00', 'high', 5);
    // Port-Tudy : basse 02:00 (h1) → pleine 08:00 (h5). Seuil 3 = mi-hauteur → 05:00 (mi-temps).
    expect(aflotTimeByThreshold([low, high], low, 3)).toEqual({ date: '2026-07-18', time: '05:00' });
  });

  it('ne décale pas le croisement des offsets Navihan (la propagation est dans le seuil)', () => {
    // Garde-fou du bug corrigé le 2026-09-14 : le segment était construit sur la courbe décalée,
    // ce qui ajoutait une seconde fois une propagation déjà comprise dans le seuil rétro-calibré
    // (+59 min sur les 18 relevés constatés). Le résultat ne doit dépendre d'aucun décalage.
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const high = tide('2026-07-18', '08:00', 'high', 5);
    expect(aflotTimeByThreshold([low, high], low, 3)).toEqual({ date: '2026-07-18', time: '05:00' });
  });

  it('applique la pente en coefficient au seuil (vive-eau → seuil plus haut)', () => {
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const calm = { ...tide('2026-07-18', '08:00', 'high', 5), coefficient: 40 };
    const spring = { ...tide('2026-07-18', '08:00', 'high', 5), coefficient: 100 };
    // Même courbe, seul le coefficient change : le seuil monte de 60 × 0,0037 = 0,222 m, donc le
    // croisement est plus tardif. C'est bien le seuil qui bouge, pas la courbe.
    const a = aflotTimeByThreshold([low, calm], low, 3)!;
    const b = aflotTimeByThreshold([low, spring], low, 3)!;
    expect(b.time > a.time).toBe(true);
  });

  it('returns null when the next high never reaches the threshold', () => {
    const low = tide('2026-07-18', '02:00', 'low', 1);
    const high = tide('2026-07-18', '08:00', 'high', 5);
    expect(aflotTimeByThreshold([low, high], low, 5.5)).toBeNull();
  });

  it('wraps past midnight when the crossing falls on the next day', () => {
    const low = tide('2026-07-19', '23:00', 'low', 1);
    const high = tide('2026-07-20', '05:00', 'high', 5);
    // Basse 23:00 (h1) → pleine 05:00 (h5). Seuil 3 = mi-hauteur → +180 min = 02:00 **le 20**.
    expect(aflotTimeByThreshold([low, high], low, 3)).toEqual({ date: '2026-07-20', time: '02:00' });
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

describe('shiftMoment', () => {
  it('decale une heure en gardant la date quand on reste dans la journee', () => {
    expect(shiftMoment('2026-07-26', '22:09', 75)).toEqual({ date: '2026-07-26', time: '23:24' });
  });

  it('avance la date quand le decalage franchit minuit', () => {
    expect(shiftMoment('2026-07-26', '23:30', 75)).toEqual({ date: '2026-07-27', time: '00:45' });
    expect(shiftMoment('2026-07-26', '22:09', 160)).toEqual({ date: '2026-07-27', time: '00:49' });
  });

  it('recule la date sur un decalage negatif avant minuit', () => {
    expect(shiftMoment('2026-07-26', '00:30', -75)).toEqual({ date: '2026-07-25', time: '23:15' });
  });

  it('franchit les bornes de mois et d annee', () => {
    expect(shiftMoment('2026-07-31', '23:30', 75)).toEqual({ date: '2026-08-01', time: '00:45' });
    expect(shiftMoment('2026-12-31', '23:30', 75)).toEqual({ date: '2027-01-01', time: '00:45' });
  });

  it('laisse la date et l heure intactes a decalage nul', () => {
    expect(shiftMoment('2026-07-26', '09:44', 0)).toEqual({ date: '2026-07-26', time: '09:44' });
  });
});

describe('aflotAgenda', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 170 }; // 2h50
  // Vraies basses mers Port-Tudy du 26 au 31/07/2026 (deux par journée de marée).
  const tides = [
    tide('2026-07-26', '09:44', 'low', 2.07),
    tide('2026-07-26', '22:09', 'low', 1.95),
    tide('2026-07-26', '15:54', 'high', 4.3),
    tide('2026-07-27', '10:28', 'low', 1.88),
    tide('2026-07-27', '22:52', 'low', 1.74),
    tide('2026-07-28', '11:07', 'low', 1.68),
    tide('2026-07-28', '23:29', 'low', 1.54)
  ];

  it('files each refloat under the day it actually happens', () => {
    const days = aflotAgenda(tides, offsets, new Date('2026-07-26T00:00:00'), 3);
    expect(days.map(d => d.date)).toEqual(['2026-07-26', '2026-07-27', '2026-07-28']);
    expect(days.map(d => d.times.map(t => t.time))).toEqual([
      ['12:34'], // 09:44 + 2h50 ; la basse de 22:09 donne 00:59 **le 27**
      ['00:59', '13:18'],
      ['01:42', '13:57']
    ]);
  });

  it('sorts the times of a day chronologically', () => {
    const [, day27] = aflotAgenda(tides, offsets, new Date('2026-07-26T00:00:00'), 2);
    expect(day27.times.map(t => t.time)).toEqual(['00:59', '13:18']);
  });

  it('flags refloats already passed without dropping them', () => {
    const [day26] = aflotAgenda(tides, offsets, new Date('2026-07-26T16:16:00'), 1);
    expect(day26.times.map(t => [t.time, t.past])).toEqual([['12:34', true]]);
  });

  it('keeps the current day even when all its refloats are past', () => {
    const days = aflotAgenda(tides, offsets, new Date('2026-07-26T23:00:00'), 2);
    expect(days[0].date).toBe('2026-07-26');
    expect(days[0].times.every(t => t.past)).toBe(true);
  });

  it('starts at the day of `now` and ignores earlier days', () => {
    const days = aflotAgenda(tides, offsets, new Date('2026-07-28T00:00:00'), 5);
    expect(days.map(d => d.date)).toEqual(['2026-07-28', '2026-07-29']);
  });

  // Données saines : une journée porte au plus deux remises à flot, même lorsqu'une basse mer
  // tardive de la veille déborde sur elle (c'est précisément le cas du 30/07/2026).
  it('gives at most two refloats a day on sound data', () => {
    const across = [
      tide('2026-07-29', '11:42', 'low', 1.52),
      tide('2026-07-30', '00:04', 'low', 1.37),
      tide('2026-07-30', '12:16', 'low', 1.39),
      tide('2026-07-31', '00:38', 'low', 1.25)
    ];
    const days = aflotAgenda(across, offsets, new Date('2026-07-29T00:00:00'), 3);
    expect(days.map(d => [d.date, d.times.map(t => t.time)])).toEqual([
      ['2026-07-29', ['14:32']],
      ['2026-07-30', ['02:54', '15:06']],
      ['2026-07-31', ['03:28']]
    ]);
  });

  it('limits the result to `days` days', () => {
    expect(aflotAgenda(tides, offsets, new Date('2026-07-26T00:00:00'), 2)).toHaveLength(2);
  });

  it('ignores highs and days without any refloat', () => {
    const onlyHighs = [tide('2026-07-26', '15:54', 'high', 4.3)];
    expect(aflotAgenda(onlyHighs, offsets, new Date('2026-07-26T00:00:00'), 3)).toEqual([]);
  });

  it('returns an empty list when no day remains', () => {
    expect(aflotAgenda(tides, offsets, new Date('2026-08-10T00:00:00'), 3)).toEqual([]);
    expect(aflotAgenda([], offsets, new Date('2026-07-26T00:00:00'), 3)).toEqual([]);
  });
});

// L'estimation (seuil de hauteur) n'alimente plus que le tableau : on garde la calibration du
// modèle — le délai après la basse mer se raccourcit quand l'amplitude (coef) augmente.
describe('modèle seuil — variation avec le coefficient', () => {
  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const delay = (lowHeight: number, highHeight: number): number => {
    const low = tide('2026-08-01', '02:00', 'low', lowHeight);
    const high = tide('2026-08-01', '08:00', 'high', highHeight);
    const t = aflotTimeByThreshold([low, high], low, 2.8);
    return toMinutes(t!.time) - 120;
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
