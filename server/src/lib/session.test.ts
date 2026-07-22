import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, parseCookies, signSession, verifySession } from './session';

// Secret déterministe pour des tests reproductibles.
beforeAll(() => { process.env.SESSION_SECRET = 'test-secret'; });
afterAll(() => { delete process.env.SESSION_SECRET; });

describe('lib/session', () => {
  const now = 1_700_000_000_000;

  it('expose le nom du cookie', () => {
    expect(SESSION_COOKIE).toBe('marees_session');
  });

  it('accepte un jeton valide non expiré', () => {
    const token = signSession(60_000, now);
    expect(verifySession(token, now + 30_000)).toBe(true);
  });

  it('refuse un jeton expiré', () => {
    const token = signSession(60_000, now);
    expect(verifySession(token, now + 60_001)).toBe(false);
  });

  it('refuse un jeton à la signature altérée', () => {
    const token = signSession(60_000, now);
    const [payload] = token.split('.');
    expect(verifySession(`${payload}.deadbeef`, now)).toBe(false);
  });

  it('refuse un jeton dont la charge utile a été modifiée', () => {
    const token = signSession(60_000, now);
    const [, sig] = token.split('.');
    const forgedExpiry = String(now + 10 ** 12);
    expect(verifySession(`${forgedExpiry}.${sig}`, now)).toBe(false);
  });

  it('refuse un jeton malformé ou absent', () => {
    expect(verifySession(undefined, now)).toBe(false);
    expect(verifySession('', now)).toBe(false);
    expect(verifySession('pas-un-jeton', now)).toBe(false);
  });

  it('parse les cookies en paires clé/valeur', () => {
    expect(parseCookies('a=1; marees_session=xyz; b=2')).toMatchObject({
      a: '1', marees_session: 'xyz', b: '2'
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});
