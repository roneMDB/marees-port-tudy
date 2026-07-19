import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Maree from './Maree';

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
};

describe('Maree service', () => {
  let maree: Maree;

  beforeEach(() => {
    vi.clearAllMocks();
    maree = new Maree(fakeLogger as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should format Navihan time with offset and wrap over midnight', () => {
    const formatted = (maree as any).formatNavihanTime('23:15', 2.5);
    expect(formatted).toBe('01:45');
  });

  it('should load tide extremes for the requested days from the resource file', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-06-10T12:00:00'));

    const tideData = await maree.getTides(3);

    expect(tideData.siteId).toBe('ile-de-groix-port-tudy');
    expect(tideData.timezone).toBe('Europe/Paris');
    expect(Object.keys(tideData.days)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);

    const firstDay = tideData.days['2026-06-10'];
    expect(firstDay.length).toBeGreaterThan(0);

    // Les extrêmes sont triés par heure et typés haute/basse.
    const times = firstDay.map(e => e.time);
    expect([...times].sort()).toEqual(times);
    expect(firstDay.every(e => e.type === 'high' || e.type === 'low')).toBe(true);

    // Une pleine mer porte un coefficient et une heure Navihan "Pleine mer".
    const high = firstDay.find(e => e.type === 'high');
    expect(high?.coefficient).toBeTypeOf('number');
    expect(high?.navihan['Pleine mer']).toBeDefined();

    // Une basse mer porte les heures Navihan "Basse mer" et "A flot".
    const low = firstDay.find(e => e.type === 'low');
    expect(low?.navihan['Basse mer']).toBeDefined();
    expect(low?.navihan['A flot']).toBeDefined();
  });

  describe('getTidesRange', () => {
    it('filters days within an inclusive [from, to] range', async () => {
      const tideData = await maree.getTidesRange('2026-06-10', '2026-06-12');

      expect(tideData.from).toBe('2026-06-10');
      expect(tideData.to).toBe('2026-06-12');
      // Bornes incluses (contrairement à getTides dont `to` est exclusif).
      expect(Object.keys(tideData.days)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);
    });

    it('returns the full available range when no bounds are given', async () => {
      const tideData = await maree.getTidesRange();

      expect(tideData.from).toBe('2026-06-01');
      expect(tideData.to).toBe('2026-10-31');
      const keys = Object.keys(tideData.days);
      expect(keys[0]).toBe('2026-06-01');
      expect(keys[keys.length - 1]).toBe('2026-10-31');
    });

    it('is independent of the system clock (explicit bounds)', async () => {
      vi.useFakeTimers().setSystemTime(new Date('2030-01-01T12:00:00'));
      const tideData = await maree.getTidesRange('2026-07-14', '2026-07-14');
      expect(Object.keys(tideData.days)).toEqual(['2026-07-14']);
    });
  });

  describe('getMeta', () => {
    it('exposes the available date bounds and Navihan offsets', () => {
      const meta = maree.getMeta();

      expect(meta.siteId).toBe('ile-de-groix-port-tudy');
      expect(meta.timezone).toBe('Europe/Paris');
      expect(meta.minDate).toBe('2026-06-01');
      expect(meta.maxDate).toBe('2026-10-31');
      expect(meta.navihanOffsets.basseMer).toBe('1h15');
      expect(meta.navihanOffsets.aFlot).toBe('2h40');
    });
  });
});
