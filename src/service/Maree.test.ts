import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    maree = new Maree(fakeLogger as any, 'dummy-api-key', { useMock: true });
  });

  it('should format Navihan time with offset and wrap over midnight', () => {
    const formatted = (maree as any).formatNavihanTime('23:15', 2.5);
    expect(formatted).toBe('01:45');
  });

  it('should detect high tide extremes from tidal points', () => {
    const points = [
      { datetime: '2026-06-01T00:00:00', height: 1 },
      { datetime: '2026-06-01T01:00:00', height: 2 },
      { datetime: '2026-06-01T02:00:00', height: 1 },
      { datetime: '2026-06-01T03:00:00', height: 3 },
      { datetime: '2026-06-01T04:00:00', height: 0.5 },
      { datetime: '2026-06-01T05:00:00', height: 1 }
    ];

    const extremes = (maree as any).findExtremes(points);

    expect(extremes).toEqual([
      { time: '01:00', height: 2, type: 'high' },
      { time: '02:00', height: 1, type: 'low' },
      { time: '03:00', height: 3, type: 'high' },
      { time: '04:00', height: 0.5, type: 'low' }
    ]);
  });

  it('should return a valid tide output using mock data', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-05-26T00:00:00Z'));
    const tideData = await maree.getTides(3);

    expect(tideData.siteId).toBe('ile-de-groix-port-tudy');
    expect(tideData.timezone).toBe('Europe/Paris');
    expect(Object.keys(tideData.days)).toEqual(['2026-05-26', '2026-05-27', '2026-05-28']);
    expect(tideData.days['2026-05-26'].length).toBeGreaterThan(0);
    expect(tideData.days['2026-05-27'].length).toBeGreaterThan(0);
    expect(tideData.days['2026-05-28'].length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it('should format text output as a grouped table for tide data', () => {
    const tideData = {
      siteId: 'test-site',
      timezone: 'Europe/Paris',
      intervalMinutes: 5,
      navihanOffsetHours: 2.75,
      from: '2026-06-01T00:00',
      to: '2026-06-02T00:00',
      days: {
        '2026-06-01': [
          { time: '03:00', height: 1.23, type: 'high', navihan: { 'Pleine mer': '04:20' } },
          { time: '09:00', height: 0.95, type: 'low', navihan: { 'Basse mer': '10:20', 'A flot': '11:50' } }
        ]
      }
    };

    const formatted = maree.formatTextOutput(tideData as any);
    const plain = formatted.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');

    expect(plain).toContain('✅ Marées test-site');
    expect(plain).toContain('Port-Tudy');
    expect(plain).toContain('Navihan');
    expect(plain).toContain('03:00 1.23m 🌊 Pleine Mer');
    expect(plain).toContain('Pleine mer: 04:20');
    expect(plain).toContain('09:00 0.95m ⬇️ Basse Mer');
    expect(plain).toContain('Basse mer: 10:20');
    expect(plain).toContain('A flot: 11:50');
  });
});
