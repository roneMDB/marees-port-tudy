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

  it('should format text output as a grouped table for tide data', () => {
    const tideData = {
      siteId: 'test-site',
      timezone: 'Europe/Paris',
      from: '2026-06-01',
      to: '2026-06-02',
      days: {
        '2026-06-01': [
          { time: '03:00', height: 1.23, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:20' } },
          { time: '09:00', height: 0.95, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:20', 'A flot': '11:50' } }
        ]
      }
    };

    const formatted = maree.formatTextOutput(tideData as any);
    const plain = formatted.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');

    expect(plain).toContain('✅ Marées test-site');
    expect(plain).toContain('Port Tudy');
    expect(plain).toContain('Navihan');
    expect(plain).toContain('Pleine Mer');
    expect(plain).toContain('03:00');
    expect(plain).toContain('1.23m');
    expect(plain).toContain('04:20');
    expect(plain).toContain('Basse Mer');
    expect(plain).toContain('10:20');
    expect(plain).toContain('11:50');
  });
});
