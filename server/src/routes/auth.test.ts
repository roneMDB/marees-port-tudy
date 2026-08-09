import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Auth activée via ADMIN_* : l'admin initial est amorcé par initStorage. Un lecteur est créé via l'API.
const dataDir = path.join(os.tmpdir(), `marees-auth-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'adm1n';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;
// Cookies obtenus une seule fois et réutilisés : le rate-limiter login (10/5 min) plafonne le
// nombre total de connexions dans la suite.
let viewerCookie: string;
let adminCookie: string;

async function login(user: string, password: string, remember?: boolean) {
  return request(app).post('/api/login').send({ user, password, remember });
}

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  await initStorage();
  app = createApp(fakeLogger);
  adminCookie = (await login('admin', 'adm1n')).headers['set-cookie'][0];
  await request(app).post('/api/users').set('Cookie', adminCookie)
    .send({ login: 'marees', password: 'lecteurpass' });
  viewerCookie = (await login('marees', 'lecteurpass')).headers['set-cookie'][0];
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe('routes auth — connexion & rôle', () => {
  it('GET /api/auth/status : authRequired, non authentifié, sans cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authRequired: true, authenticated: false, role: null, user: null });
  });

  it('POST /api/login refuse de mauvais identifiants (401, pas de cookie)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login lecteur → cookie de session (déjà obtenu en beforeAll)', () => {
    expect(viewerCookie).toMatch(/marees_session=/);
    expect(viewerCookie).toMatch(/HttpOnly/i);
    expect(viewerCookie).not.toMatch(/Max-Age|Expires/i); // pas de « se souvenir » → cookie de session
  });

  it('login admin renvoie le rôle admin', async () => {
    const res = await login('admin', 'adm1n');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, role: 'admin' });
  });

  it('login avec remember pose un cookie persistant (Max-Age)', async () => {
    const res = await login('marees', 'lecteurpass', true);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });

  it('force le flag Secure quand COOKIE_SECURE=true (même en HTTP)', async () => {
    process.env.COOKIE_SECURE = 'true';
    try {
      const res = await login('marees', 'lecteurpass');
      const cookie = (res.headers['set-cookie'] || [])[0] || '';
      expect(cookie).toMatch(/Secure/i);
    } finally {
      delete process.env.COOKIE_SECURE;
    }
  });

  it('le cookie lecteur ouvre les routes de lecture', async () => {
    const res = await request(app).get('/api/tides/meta').set('Cookie', viewerCookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/status renvoie le rôle et l’utilisateur avec le cookie', async () => {
    const rv = await request(app).get('/api/auth/status').set('Cookie', viewerCookie);
    expect(rv.body).toMatchObject({ authRequired: true, authenticated: true, role: 'viewer' });
    expect(rv.body.user).toMatchObject({ login: 'marees', mustChangePassword: false });

    const ra = await request(app).get('/api/auth/status').set('Cookie', adminCookie);
    expect(ra.body).toMatchObject({ authRequired: true, authenticated: true, role: 'admin' });
    expect(ra.body.user).toMatchObject({ login: 'admin' });
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
  it('PUT /api/settings : 403 en lecteur, 200 en admin', async () => {
    const rv = await request(app).put('/api/settings').set('Cookie', viewerCookie).send({ rangeDays: 12 });
    expect(rv.status).toBe(403);

    const ra = await request(app).put('/api/settings').set('Cookie', adminCookie).send({ rangeDays: 12 });
    expect(ra.status).toBe(200);
    expect(ra.body).toMatchObject({ rangeDays: 12 });
  });

  it('GET /api/stats : 403 en lecteur, 200 en admin', async () => {
    const rv = await request(app).get('/api/stats').set('Cookie', viewerCookie);
    expect(rv.status).toBe(403);

    const ra = await request(app).get('/api/stats').set('Cookie', adminCookie);
    expect(ra.status).toBe(200);
  });

  it('les visites sont attribuées à l’utilisateur de la session dans /api/stats', async () => {
    // La balise ne transmet aucun identifiant : le serveur le résout depuis le cookie de session.
    // C'est ce qui répond à « qui accède ? » — les connexions, elles, sont trop rares (cookie 30 j).
    expect((await request(app).post('/api/visit').set('Cookie', adminCookie)).status).toBe(204);
    expect((await request(app).post('/api/visit').set('Cookie', viewerCookie)).status).toBe(204);

    const res = await request(app).get('/api/stats').set('Cookie', adminCookie);
    const users = (res.body.users ?? []) as { name: string; count: number; lastTs: string }[];
    expect(users.map(u => u.name)).toEqual(expect.arrayContaining(['admin', 'marees']));
    expect(users.find(u => u.name === 'marees')?.lastTs).toBeTruthy();
  });

  it('la balise de visite exige une session (401 sans cookie)', async () => {
    expect((await request(app).post('/api/visit')).status).toBe(401);
  });
});
