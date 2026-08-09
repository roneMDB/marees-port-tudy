import { describe, expect, it } from 'vitest';
import { aggregateAccess, classifyUa, localParts, type AccessEntry } from './stats';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile/15E Safari/604';

/** Fabrique une entrée `visit` (le cas courant) en n'exigeant que ce qui compte pour le test. */
function visit(partial: Partial<AccessEntry> & { ts: string }): AccessEntry {
  return { kind: 'visit', scope: 'lan', ip: '192.168.x.x', country: null, ua: CHROME, ...partial };
}

describe('classifyUa', () => {
  it('détecte navigateur et appareil', () => {
    expect(classifyUa(CHROME)).toEqual({ browser: 'Chrome', device: 'Ordinateur' });
    expect(classifyUa(IPHONE)).toEqual({ browser: 'Safari', device: 'Mobile' });
    expect(classifyUa('Mozilla/5.0 Edg/120')).toMatchObject({ browser: 'Edge' });
    expect(classifyUa('')).toEqual({ browser: 'Autre', device: 'Ordinateur' });
  });
});

describe('localParts — fuseau Europe/Paris', () => {
  // `ts` est un instant UTC. Sans conversion, les visites de fin et de début de nuit tombent le
  // mauvais jour et à la mauvaise heure : c'est exactement ce que mesure « quand ».
  it('applique l’heure d’été (UTC+2)', () => {
    expect(localParts('2026-07-20T23:30:00.000Z')).toMatchObject({ date: '2026-07-21', hour: 1 });
  });

  it('applique l’heure d’hiver (UTC+1)', () => {
    expect(localParts('2026-01-20T23:30:00.000Z')).toMatchObject({ date: '2026-01-21', hour: 0 });
  });

  it('donne le jour de semaine, lundi = 0', () => {
    // 2026-07-20 est un lundi, 2026-07-26 un dimanche.
    expect(localParts('2026-07-20T09:00:00.000Z').weekday).toBe(0);
    expect(localParts('2026-07-26T09:00:00.000Z').weekday).toBe(6);
  });
});

describe('aggregateAccess — nature des accès', () => {
  const entries: AccessEntry[] = [
    visit({ ts: '2026-07-20T08:00:00.000Z' }),
    visit({ ts: '2026-07-20T09:00:00.000Z', kind: 'page' }),
    visit({ ts: '2026-07-20T10:00:00.000Z', kind: 'login', login: 'admin' }),
    visit({ ts: '2026-07-21T10:00:00.000Z' })
  ];

  it('sépare visites, chargements de page et connexions', () => {
    const s = aggregateAccess(entries);
    expect(s.total).toBe(4);
    expect(s.visits).toBe(2);
    expect(s.pageLoads).toBe(1);
    expect(s.logins).toBe(1);
  });

  it('ne compte que les visites dans les répartitions', () => {
    const s = aggregateAccess(entries);
    // Les deux visites tombent le 20 et le 21 ; la page et la connexion sont exclues.
    expect(s.perDay).toEqual([
      { date: '2026-07-20', count: 1 },
      { date: '2026-07-21', count: 1 }
    ]);
    expect(s.devices).toEqual([{ name: 'Ordinateur', count: 2 }]);
  });
});

describe('aggregateAccess', () => {
  const entries: AccessEntry[] = [
    visit({ ts: '2026-07-20T08:00:00.000Z' }),
    visit({ ts: '2026-07-20T09:00:00.000Z', scope: 'external', ip: '88.186.x.x', country: 'FR', ua: IPHONE }),
    visit({ ts: '2026-07-21T10:00:00.000Z', scope: 'external', ip: '8.8.x.x', country: 'US' })
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

  it('range les visites au jour local, pas au jour UTC', () => {
    // 23 h 30 UTC un 20 juillet = 01 h 30 le 21 à Paris. Le regroupement UTC l'aurait mise le 20.
    const s = aggregateAccess([visit({ ts: '2026-07-20T23:30:00.000Z' })]);
    expect(s.perDay).toEqual([{ date: '2026-07-21', count: 1 }]);
  });

  it('gère une liste vide', () => {
    const s = aggregateAccess([]);
    expect(s).toMatchObject({ total: 0, lan: 0, external: 0, visits: 0, uniqueVisitors: 0, firstTs: null, lastTs: null });
    expect(s.perDay).toEqual([]);
    expect(s.users).toEqual([]);
    expect(s.perHour).toHaveLength(24);
    expect(s.perHour.every(n => n === 0)).toBe(true);
    expect(s.perWeekday).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('aggregateAccess — quand', () => {
  it('répartit les visites par heure locale', () => {
    const s = aggregateAccess([
      visit({ ts: '2026-07-20T06:00:00.000Z' }), // 08 h à Paris (été)
      visit({ ts: '2026-07-20T06:30:00.000Z' }), // 08 h aussi
      visit({ ts: '2026-01-20T06:00:00.000Z' }) // 07 h à Paris (hiver)
    ]);
    expect(s.perHour[8]).toBe(2);
    expect(s.perHour[7]).toBe(1);
    expect(s.perHour[6]).toBe(0); // l'heure UTC brute ne doit apparaître nulle part
  });

  it('répartit les visites par jour de semaine (lundi = 0)', () => {
    const s = aggregateAccess([
      visit({ ts: '2026-07-20T09:00:00.000Z' }), // lundi
      visit({ ts: '2026-07-20T11:00:00.000Z' }), // lundi
      visit({ ts: '2026-07-26T09:00:00.000Z' }) // dimanche
    ]);
    expect(s.perWeekday[0]).toBe(2);
    expect(s.perWeekday[6]).toBe(1);
  });
});

describe('aggregateAccess — qui', () => {
  const withUsers: AccessEntry[] = [
    visit({ ts: '2026-07-20T08:00:00.000Z', login: 'admin' }),
    visit({ ts: '2026-07-20T09:00:00.000Z', login: 'admin' }),
    visit({ ts: '2026-07-20T10:00:00.000Z', scope: 'external', country: 'FR', ua: IPHONE, login: 'bob' }),
    visit({ ts: '2026-07-20T11:00:00.000Z' }) // visite anonyme (auth désactivée)
  ];

  it('compte les visites par utilisateur et retient la dernière', () => {
    const s = aggregateAccess(withUsers);
    expect(s.users).toEqual([
      { name: 'admin', count: 2, lastTs: '2026-07-20T09:00:00.000Z' },
      { name: 'bob', count: 1, lastTs: '2026-07-20T10:00:00.000Z' }
    ]);
  });

  it('ne compte pas les connexions comme des visites dans le décompte par utilisateur', () => {
    const s = aggregateAccess([
      visit({ ts: '2026-07-20T08:00:00.000Z', kind: 'login', login: 'admin' }),
      visit({ ts: '2026-07-20T09:00:00.000Z', login: 'admin' })
    ]);
    expect(s.users).toEqual([{ name: 'admin', count: 1, lastTs: '2026-07-20T09:00:00.000Z' }]);
  });

  it('compte les visiteurs uniques : logins distincts, plus les anonymes par IP + navigateur', () => {
    const s = aggregateAccess([
      visit({ ts: '2026-07-20T08:00:00.000Z', login: 'admin' }),
      visit({ ts: '2026-07-20T09:00:00.000Z', login: 'admin' }), // même personne
      visit({ ts: '2026-07-20T10:00:00.000Z', ip: '192.168.x.x', ua: CHROME }), // anonyme A
      visit({ ts: '2026-07-20T11:00:00.000Z', ip: '192.168.x.x', ua: CHROME }), // anonyme A again
      visit({ ts: '2026-07-20T12:00:00.000Z', ip: '88.186.x.x', ua: IPHONE }) // anonyme B
    ]);
    expect(s.uniqueVisitors).toBe(3);
  });
});
