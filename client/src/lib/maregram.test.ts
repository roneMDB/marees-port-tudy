import { describe, expect, it } from 'vitest';
import {
  buildMaregram,
  buildNavihanMaregram,
  heightAtMinute,
  inverseCosineRising,
  navihanAflotByThreshold,
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

  it('navihanAflotByThreshold marks low tides where the rising Navihan curve reaches the threshold', () => {
    // Courbe Navihan : basse (195 min, h1) → pleine (555 min, h5). Seuil 3 = mi-hauteur → mi-temps.
    const pts = navihanAflotByThreshold(extremes, day, offsets, 3);
    expect(pts).toHaveLength(1);
    expect(pts[0].minutes).toBeCloseTo(375, 5); // 195 + 0.5 * 360
    expect(pts[0].height).toBe(3); // hauteur = seuil (constante)
  });

  it('navihanAflotByThreshold omits low tides whose next high never reaches the threshold', () => {
    // Pleine mer à 5 m : un seuil de 5,5 m n'est jamais atteint ce cycle.
    expect(navihanAflotByThreshold(extremes, day, offsets, 5.5)).toEqual([]);
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

describe('modèle seuil — variation avec le coefficient', () => {
  const offsets: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };
  const d = '2026-08-01';
  const lo = (h: number): FlatTide => ext(d, '02:00', h, 'low');
  const hi = (h: number): FlatTide => ext(d, '08:00', h, 'high');
  const delay = (extr: FlatTide[]): number =>
    navihanAflotByThreshold(extr, d, offsets, 2.8)[0].minutes - (120 + offsets.basseMer);

  it('gives a shorter refloat delay in vive-eau (fort coef) than in morte-eau (faible coef)', () => {
    const morteEau = delay([lo(2.0), hi(3.6)]); // faible amplitude
    const viveEau = delay([lo(0.6), hi(5.4)]); // forte amplitude
    expect(viveEau).toBeLessThan(morteEau);
  });
});
