import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { SESSION_COOKIE, parseCookies, signSession, verifySession } from './session';

// Secret déterministe pour des tests reproductibles.
beforeAll(() => { process.env.SESSION_SECRET = 'test-secret'; });
afterAll(() => { delete process.env.SESSION_SECRET; });

describe('lib/session', () => {
  const now = 1_700_000_000_000;

  it('expose le nom du cookie', () => {
    expect(SESSION_COOKIE).toBe('marees_session');
  });

  it('porte et relit l’identifiant utilisateur', () => {
    const token = signSession(42, 60_000, now);
    expect(verifySession(token, now + 30_000)).toBe(42);
  });

  it('refuse un jeton expiré', () => {
    const token = signSession(1, 60_000, now);
    expect(verifySession(token, now + 60_001)).toBe(null);
  });

  it('refuse un jeton à la signature altérée', () => {
    const token = signSession(1, 60_000, now);
    const [id, expiry] = token.split('.');
    expect(verifySession(`${id}.${expiry}.deadbeef`, now)).toBe(null);
  });

  it('refuse un jeton dont l’identifiant a été modifié sans re-signature', () => {
    const token = signSession(1, 60_000, now);
    const [, expiry, sig] = token.split('.');
    expect(verifySession(`2.${expiry}.${sig}`, now)).toBe(null);
  });

  it('refuse un identifiant non numérique même correctement signé', () => {
    const expiry = String(now + 60_000);
    const sig = createHmac('sha256', 'test-secret').update(`abc.${expiry}`).digest('base64url');
    expect(verifySession(`abc.${expiry}.${sig}`, now)).toBe(null);
  });

  it('refuse un jeton malformé, absent ou à l’ancien format', () => {
    expect(verifySession(undefined, now)).toBe(null);
    expect(verifySession('', now)).toBe(null);
    expect(verifySession('pas-un-jeton', now)).toBe(null);
    // Ancien format "<expiry>.<sig>" (2 parties) → invalide.
    expect(verifySession(`${now + 60_000}.abcd`, now)).toBe(null);
  });

  it('parse les cookies en paires clé/valeur', () => {
    expect(parseCookies('a=1; marees_session=xyz; b=2')).toMatchObject({
      a: '1', marees_session: 'xyz', b: '2'
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});
