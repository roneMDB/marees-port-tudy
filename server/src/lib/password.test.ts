import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('lib/password', () => {
  it('produit un hash différent du mot de passe en clair', async () => {
    const hash = await hashPassword('s3cret!');
    expect(hash).not.toBe('s3cret!');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('vérifie un mot de passe correct', async () => {
    const hash = await hashPassword('s3cret!');
    expect(await verifyPassword(hash, 's3cret!')).toBe(true);
  });

  it('rejette un mot de passe incorrect', async () => {
    const hash = await hashPassword('s3cret!');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('sale : deux hachages du même mot de passe diffèrent', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same')).toBe(true);
    expect(await verifyPassword(b, 'same')).toBe(true);
  });

  it('renvoie false sur un hash invalide au lieu de lever', async () => {
    expect(await verifyPassword('pas-un-hash', 'x')).toBe(false);
  });
});
