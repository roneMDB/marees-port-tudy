import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { openDb } from '../db';
import { recordAccess, readAccessEntries } from './accessLog';

function fakeReq(ip: string, ua = 'TestAgent'): Request {
  return { ip, headers: { 'user-agent': ua } } as unknown as Request;
}

describe('middleware/accessLog — login', () => {
  it('enregistre le login fourni (connexion) et le relit', () => {
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5'), db, 'admin');
    const entries = readAccessEntries(db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ scope: 'lan', login: 'admin' });
    db.close();
  });

  it('login null par défaut (ouverture de page anonyme)', () => {
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5'), db);
    expect(readAccessEntries(db)[0].login).toBeNull();
    db.close();
  });
});
