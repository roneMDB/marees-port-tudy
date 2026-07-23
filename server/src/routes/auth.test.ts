import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-auth-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_USER = 'marees';
process.env.APP_PASSWORD = 's3cret';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'adm1n';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;
// Cookies obtenus une seule fois et réutilisés : le rate-limiter login (10/5 min) plafonne le
// nombre total de connexions dans la suite.
let viewerCookie: string;
let adminCookie: string;

async function login(user: string, password: string) {
  return request(app).post('/api/login').send({ user, password });
}

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  initStorage();
  app = createApp(fakeLogger);
  viewerCookie = (await login('marees', 's3cret')).headers['set-cookie'][0];
  adminCookie = (await login('admin', 'adm1n')).headers['set-cookie'][0];
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.APP_USER;
  delete process.env.APP_PASSWORD;
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe('routes auth — connexion & rôle', () => {
  it('GET /api/auth/status : authRequired, non authentifié, rôle null sans cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authRequired: true, authenticated: false, role: null });
  });

  it('POST /api/login refuse de mauvais identifiants (401, pas de cookie)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login viewer → rôle viewer + cookie de session (déjà obtenu en beforeAll)', () => {
    expect(viewerCookie).toMatch(/marees_session=/);
    expect(viewerCookie).toMatch(/HttpOnly/i);
    expect(viewerCookie).not.toMatch(/Max-Age|Expires/i); // pas de « se souvenir » → cookie de session
  });

  it('login viewer renvoie le rôle viewer dans le corps', async () => {
    const res = await login('marees', 's3cret');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, role: 'viewer' });
  });

  it('login admin renvoie le rôle admin', async () => {
    const res = await login('admin', 'adm1n');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, role: 'admin' });
  });

  it('login avec remember pose un cookie persistant (Max-Age)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret', remember: true });
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });

  it('force le flag Secure quand COOKIE_SECURE=true (même en HTTP)', async () => {
    process.env.COOKIE_SECURE = 'true';
    try {
      const res = await login('marees', 's3cret');
      const cookie = (res.headers['set-cookie'] || [])[0] || '';
      expect(cookie).toMatch(/Secure/i);
    } finally {
      delete process.env.COOKIE_SECURE;
    }
  });

  it('le cookie viewer ouvre les routes de lecture', async () => {
    const res = await request(app).get('/api/tides/meta').set('Cookie', viewerCookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/status renvoie le rôle avec le cookie', async () => {
    const rv = await request(app).get('/api/auth/status').set('Cookie', viewerCookie);
    expect(rv.body).toEqual({ authRequired: true, authenticated: true, role: 'viewer' });

    const ra = await request(app).get('/api/auth/status').set('Cookie', adminCookie);
    expect(ra.body).toEqual({ authRequired: true, authenticated: true, role: 'admin' });
  });

  it('POST /api/logout efface le cookie', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/marees_session=;?/);
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

describe('routes auth — droits par rôle', () => {
  it('PUT /api/settings : 403 en viewer, 200 en admin', async () => {
    const rv = await request(app).put('/api/settings').set('Cookie', viewerCookie).send({ rangeDays: 12 });
    expect(rv.status).toBe(403);

    const ra = await request(app).put('/api/settings').set('Cookie', adminCookie).send({ rangeDays: 12 });
    expect(ra.status).toBe(200);
    expect(ra.body).toMatchObject({ rangeDays: 12 });
  });

  it('GET /api/stats : 403 en viewer, 200 en admin', async () => {
    const rv = await request(app).get('/api/stats').set('Cookie', viewerCookie);
    expect(rv.status).toBe(403);

    const ra = await request(app).get('/api/stats').set('Cookie', adminCookie);
    expect(ra.status).toBe(200);
  });
});
