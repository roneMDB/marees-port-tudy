import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Répertoire de données isolé + activation de l'auth AVANT de créer l'app.
// L'admin est amorcé depuis ADMIN_* ; un lecteur est créé via l'API.
const dataDir = path.join(os.tmpdir(), `marees-security-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'adm1n';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;

let app: Application;
let adminCookie: string;
let viewerCookie: string;

async function login(user: string, password: string) {
  return request(app).post('/api/login').send({ user, password });
}

beforeAll(async () => {
  const { initStorage } = await import('./db/bootstrap');
  const { createApp } = await import('./app');
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

describe('sécurité — authentification', () => {
  it('renvoie 401 SANS WWW-Authenticate (pas de popup natif) sans identifiants', async () => {
    const res = await request(app).get('/api/tides/meta');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('ne se laisse pas contourner par la casse du chemin (/API/… routé sans casse par Express)', async () => {
    // Régression : un garde testant `req.path.startsWith('/api')` (sensible à la casse) laissait
    // passer /API/… alors qu'Express route sans distinction de casse → fuite de données sans auth.
    for (const p of ['/API/tides/meta', '/Api/tides/meta', '/api/TIDES/meta']) {
      const res = await request(app).get(p);
      expect(res.status, `${p} devrait exiger l'authentification`).toBe(401);
    }
  });

  it('bloque une écriture réglages via variante de casse (PUT /API/settings)', async () => {
    const res = await request(app).put('/API/settings').send({ rangeDays: 10 });
    expect(res.status).toBe(401);
  });

  it('autorise la lecture avec un cookie de session valide (lecteur)', async () => {
    const res = await request(app).get('/api/tides/meta').set('Cookie', viewerCookie);
    expect(res.status).toBe(200);
  });

  it('renvoie 401 avec de mauvais identifiants', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('laisse /api/health public (sonde)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('sécurité — rôle admin pour les actions sensibles', () => {
  it('refuse PUT /api/settings au rôle lecteur (403)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', viewerCookie)
      .send({ rangeDays: 10 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrateur/i);
  });

  it('autorise PUT /api/settings au rôle admin (200)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ rangeDays: 10 });
    expect(res.status).toBe(200);
  });

  it('refuse GET /api/stats au rôle lecteur (403) et l’autorise à l’admin', async () => {
    const viewer = await request(app).get('/api/stats').set('Cookie', viewerCookie);
    expect(viewer.status).toBe(403);
    const admin = await request(app).get('/api/stats').set('Cookie', adminCookie);
    expect(admin.status).toBe(200);
  });

  it('refuse POST /api/tides/import au rôle lecteur (403) et l’autorise à l’admin', async () => {
    const body = { '2026-11-05': [{ maree: 'haute', heure: '09:00', hauteur: '5.20', coefficient: '88' }] };
    const viewer = await request(app)
      .post('/api/tides/import?site=port-tudy')
      .set('Cookie', viewerCookie)
      .send(body);
    expect(viewer.status).toBe(403);

    const admin = await request(app)
      .post('/api/tides/import?site=port-tudy')
      .set('Cookie', adminCookie)
      .send(body);
    expect(admin.status).toBe(200);
  });
});

describe('sécurité — en-têtes & rate-limit', () => {
  it('applique les en-têtes helmet et masque X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('expose les en-têtes de limitation de débit', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});
