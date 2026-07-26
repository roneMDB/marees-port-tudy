import { describe, expect, it } from 'vitest';
import {
  buildMaregram,
  buildNavihanMaregram,
  heightAtMinute,
  inverseCosineRising,
  navihanAflotFixed,
  navihanExtremes,
  navihanHeightAtMinute
} from './maregram';
import type { FlatTide, NavihanOffsets } from '../types';

function ext(date: string, time: string, height: number, type: 'high' | 'low'): FlatTide {
  return { date, time, height, type, coefficient: null, navihan: {} };
}

const day = '2026-07-18';
const extremes: FlatTide[] = [
  ext(day, '02:00', 1, 'low'),
  ext(day, '08:00', 5, 'high')
];

describe('buildMaregram', () => {
  it('interpolates heights (cosine) between two extremes', () => {
    const pts = buildMaregram(extremes, day, 60);
    const at = (m: number) => pts.find(p => p.minutes === m)?.height;

    // Aux extrêmes, on retrouve les hauteurs; au milieu, la moyenne.
    expect(at(120)).toBeCloseTo(1, 5); // 02:00
    expect(at(480)).toBeCloseTo(5, 5); // 08:00
    expect(at(300)).toBeCloseTo(3, 5); // 05:00, mi-chemin
  });

  it('omits times not bracketed by two extremes', () => {
    const pts = buildMaregram(extremes, day, 60);
    // Rien avant 02:00 ni après 08:00 (pas d'extrême encadrant).
    expect(pts.every(p => p.minutes >= 120 && p.minutes <= 480)).toBe(true);
  });

  it('returns nothing for a day outside the data', () => {
    expect(buildMaregram(extremes, '2030-01-01')).toEqual([]);
  });
});

describe('heightAtMinute', () => {
  it('interpolates the height at a given minute', () => {
    expect(heightAtMinute(extremes, day, 120)).toBeCloseTo(1, 5); // 02:00
    expect(heightAtMinute(extremes, day, 480)).toBeCloseTo(5, 5); // 08:00
    expect(heightAtMinute(extremes, day, 300)).toBeCloseTo(3, 5); // 05:00
  });

  it('returns null when the minute is not bracketed by extremes', () => {
    expect(heightAtMinute(extremes, day, 0)).toBeNull(); // avant le 1er extrême
    expect(heightAtMinute(extremes, day, 1000)).toBeNull(); // après le dernier
  });
});

describe('Navihan marégramme', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };

  it('shifts extremes to Navihan times (basseMer / pleineMer)', () => {
    const pts = buildNavihanMaregram(extremes, day, offsets, 15);
    const at = (m: number) => pts.find(p => p.minutes === m)?.height;
    expect(at(195)).toBeCloseTo(1, 5); // 03:15 = 02:00 + 1h15
    expect(at(555)).toBeCloseTo(5, 5); // 09:15 = 08:00 + 1h15
    expect(at(375)).toBeCloseTo(3, 5); // mi-chemin
  });

  it('navihanHeightAtMinute interpolates on the Navihan curve', () => {
    expect(navihanHeightAtMinute(extremes, day, offsets, 195)).toBeCloseTo(1, 5);
    expect(navihanHeightAtMinute(extremes, day, offsets, 555)).toBeCloseTo(5, 5);
  });

  it('navihanExtremes lists the shifted extreme markers', () => {
    expect(navihanExtremes(extremes, day, offsets)).toEqual([
      { minutes: 195, height: 1, type: 'low' },
      { minutes: 555, height: 5, type: 'high' }
    ]);
  });

  it('navihanAflotFixed marks each low at basse mer + aFlot, on the Navihan curve', () => {
    // Basse 02:00 → remise à flot 04:40 = 280 min ; hauteur = celle de la courbe Navihan.
    const pts = navihanAflotFixed(extremes, day, offsets);
    expect(pts).toHaveLength(1);
    expect(pts[0].minutes).toBe(280); // 120 + 160
    expect(pts[0].height).toBeCloseTo(navihanHeightAtMinute(extremes, day, offsets, 280)!, 5);
  });

  it('navihanAflotFixed omits an à-flot outside the day / not bracketed by extremes', () => {
    expect(navihanAflotFixed([ext(day, '22:00', 1, 'low')], day, offsets)).toEqual([]);
  });
});

describe('inverseCosineRising', () => {
  const a = { offset: 120, height: 1 }; // basse mer
  const b = { offset: 480, height: 5 }; // pleine mer suivante (durée 360 min)

  it('returns the mid-time when the threshold is the mid-height', () => {
    expect(inverseCosineRising(a, b, 3)).toBeCloseTo(300, 5); // 120 + 0.5 * 360
  });

  it('clamps to the low-tide time when the threshold is at or below the low', () => {
    expect(inverseCosineRising(a, b, 1)).toBe(120); // = a.height
    expect(inverseCosineRising(a, b, 0.5)).toBe(120); // < a.height (déjà à flot)
  });

  it('returns null when the threshold is at or above the high', () => {
    expect(inverseCosineRising(a, b, 5)).toBeNull(); // = b.height
    expect(inverseCosineRising(a, b, 6)).toBeNull(); // > b.height (jamais atteint)
  });

  it('returns null for a non-rising segment', () => {
    expect(inverseCosineRising({ offset: 0, height: 5 }, { offset: 100, height: 5 }, 4)).toBeNull();
    expect(inverseCosineRising({ offset: 0, height: 5 }, { offset: 100, height: 3 }, 4)).toBeNull();
  });
});
