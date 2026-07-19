import { describe, expect, it } from 'vitest';
import {
  buildMaregram,
  buildNavihanMaregram,
  heightAtMinute,
  navihanAflot,
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

  it('navihanAflot marks low tides at +aFlot on the rising Navihan curve', () => {
    const pts = navihanAflot(extremes, day, offsets);
    expect(pts).toHaveLength(1);
    expect(pts[0].minutes).toBe(280); // 02:00 basse mer + 2h40
    expect(pts[0].height).toBeGreaterThan(1);
    expect(pts[0].height).toBeLessThan(5);
  });
});
