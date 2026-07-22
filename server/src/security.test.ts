import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Répertoire de données isolé + activation de l'auth/lecture seule AVANT de créer l'app
// (basicAuth lit l'env à la construction ; READ_ONLY est lu à chaque requête).
const dataDir = path.join(os.tmpdir(), `marees-security-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_USER = 'marees';
process.env.APP_PASSWORD = 's3cret';
process.env.READ_ONLY = 'true';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
const creds = Buffer.from('marees:s3cret').toString('base64');

let app: Application;

beforeAll(async () => {
  const { ensureDataDir } = await import('./config/dataDir');
  const { createApp } = await import('./app');
  ensureDataDir();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.APP_USER;
  delete process.env.APP_PASSWORD;
  delete process.env.READ_ONLY;
});

describe('sécurité — authentification Basic', () => {
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

  it('autorise avec un cookie de session valide', async () => {
    const { signSession, SESSION_COOKIE } = await import('./lib/session');
    const token = signSession(60_000, Date.now());
    const res = await request(app)
      .get('/api/tides/meta')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(200);
  });

  it('renvoie 401 avec de mauvais identifiants', async () => {
    const res = await request(app).get('/api/tides/meta').set('Authorization', `Basic ${Buffer.from('marees:x').toString('base64')}`);
    expect(res.status).toBe(401);
  });

  it('autorise avec les bons identifiants', async () => {
    const res = await request(app).get('/api/tides/meta').set('Authorization', `Basic ${creds}`);
    expect(res.status).toBe(200);
  });

  it('laisse /api/health public (sonde)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('sécurité — lecture seule', () => {
  it('renvoie 403 sur PUT /api/settings quand READ_ONLY=true', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Basic ${creds}`)
      .send({ rangeDays: 10 });
    expect(res.status).toBe(403);
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
