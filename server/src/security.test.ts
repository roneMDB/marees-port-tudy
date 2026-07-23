import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Répertoire de données isolé + activation de l'auth AVANT de créer l'app.
// Deux jeux d'identifiants → deux rôles : viewer (APP_*) et admin (ADMIN_*).
const dataDir = path.join(os.tmpdir(), `marees-security-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_USER = 'marees';
process.env.APP_PASSWORD = 's3cret';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'adm1n';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
const viewerCreds = Buffer.from('marees:s3cret').toString('base64');
const adminCreds = Buffer.from('admin:adm1n').toString('base64');

let app: Application;

beforeAll(async () => {
  const { initStorage } = await import('./db/bootstrap');
  const { createApp } = await import('./app');
  initStorage();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.APP_USER;
  delete process.env.APP_PASSWORD;
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

  it('autorise la lecture avec un cookie de session valide (viewer)', async () => {
    const { signSession, SESSION_COOKIE } = await import('./lib/session');
    const token = signSession('viewer', 60_000, Date.now());
    const res = await request(app)
      .get('/api/tides/meta')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(200);
  });

  it('renvoie 401 avec de mauvais identifiants', async () => {
    const res = await request(app).get('/api/tides/meta').set('Authorization', `Basic ${Buffer.from('marees:x').toString('base64')}`);
    expect(res.status).toBe(401);
  });

  it('autorise la lecture avec les identifiants viewer', async () => {
    const res = await request(app).get('/api/tides/meta').set('Authorization', `Basic ${viewerCreds}`);
    expect(res.status).toBe(200);
  });

  it('laisse /api/health public (sonde)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('sécurité — rôle admin pour les actions sensibles', () => {
  it('refuse PUT /api/settings au rôle viewer (403)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Basic ${viewerCreds}`)
      .send({ rangeDays: 10 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrateur/i);
  });

  it('autorise PUT /api/settings au rôle admin (200)', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Basic ${adminCreds}`)
      .send({ rangeDays: 10 });
    expect(res.status).toBe(200);
  });

  it('refuse GET /api/stats au rôle viewer (403) et l’autorise à l’admin', async () => {
    const viewer = await request(app).get('/api/stats').set('Authorization', `Basic ${viewerCreds}`);
    expect(viewer.status).toBe(403);
    const admin = await request(app).get('/api/stats').set('Authorization', `Basic ${adminCreds}`);
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
