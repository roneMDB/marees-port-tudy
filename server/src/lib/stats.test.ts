import { describe, expect, it } from 'vitest';
import { aggregateAccess, classifyUa, type AccessEntry } from './stats';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile/15E Safari/604';

describe('classifyUa', () => {
  it('détecte navigateur et appareil', () => {
    expect(classifyUa(CHROME)).toEqual({ browser: 'Chrome', device: 'Ordinateur' });
    expect(classifyUa(IPHONE)).toEqual({ browser: 'Safari', device: 'Mobile' });
    expect(classifyUa('Mozilla/5.0 Edg/120')).toMatchObject({ browser: 'Edge' });
    expect(classifyUa('')).toEqual({ browser: 'Autre', device: 'Ordinateur' });
  });
});

describe('aggregateAccess', () => {
  const entries: AccessEntry[] = [
    { ts: '2026-07-20T08:00:00.000Z', scope: 'lan', ip: '192.168.x.x', country: null, ua: CHROME },
    { ts: '2026-07-20T09:00:00.000Z', scope: 'external', ip: '88.186.x.x', country: 'FR', ua: IPHONE },
    { ts: '2026-07-21T10:00:00.000Z', scope: 'external', ip: '8.8.x.x', country: 'US', ua: CHROME }
  ];

  it('compte total, LAN/externe et bornes temporelles', () => {
    const s = aggregateAccess(entries);
    expect(s.total).toBe(3);
    expect(s.lan).toBe(1);
    expect(s.external).toBe(2);
    expect(s.firstTs).toBe('2026-07-20T08:00:00.000Z');
    expect(s.lastTs).toBe('2026-07-21T10:00:00.000Z');
  });

  it('regroupe par jour, pays, navigateurs et appareils', () => {
    const s = aggregateAccess(entries);
    expect(s.perDay).toEqual([
      { date: '2026-07-20', count: 2 },
      { date: '2026-07-21', count: 1 }
    ]);
    expect(s.countries).toEqual([
      { name: 'FR', count: 1 },
      { name: 'US', count: 1 }
    ]);
    expect(s.browsers[0]).toEqual({ name: 'Chrome', count: 2 });
    expect(s.devices).toEqual([
      { name: 'Ordinateur', count: 2 },
      { name: 'Mobile', count: 1 }
    ]);
  });

  it('gère une liste vide', () => {
    const s = aggregateAccess([]);
    expect(s).toMatchObject({ total: 0, lan: 0, external: 0, firstTs: null, lastTs: null });
    expect(s.perDay).toEqual([]);
  });
});
