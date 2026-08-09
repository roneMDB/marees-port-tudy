import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';
import { resolveSince } from './stats';

const dataDir = path.join(os.tmpdir(), `marees-stats-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  await initStorage();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Sans mot de passe configuré, l'auth est désactivée → rôle `admin` → /stats accessible.
// Le contrôle de rôle (403 pour viewer) est couvert par security.test.ts.
describe('accès & statistiques', () => {
  it('journalise une ouverture de page puis l’expose via /api/stats', async () => {
    // Une requête de document HTML est journalisée par le middleware accessLog.
    await request(app).get('/').set('Accept', 'text/html');

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.lan).toBeGreaterThanOrEqual(1);
    expect(res.body.pageLoads).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.perDay)).toBe(true);
  });

  it('POST /api/visit enregistre une visite (204) comptée à part des chargements de page', async () => {
    const before = (await request(app).get('/api/stats')).body.visits ?? 0;

    const ping = await request(app).post('/api/visit');
    expect(ping.status).toBe(204);

    const res = await request(app).get('/api/stats');
    expect(res.body.visits).toBe(before + 1);
  });

  it('rejette un paramètre days invalide (400)', async () => {
    for (const days of ['abc', '0', '-1', '99999', '7.5']) {
      const res = await request(app).get('/api/stats').query({ days });
      expect(res.status, `days=${days} devrait être refusé`).toBe(400);
    }
  });

  it('accepte days=7 et days=all', async () => {
    expect((await request(app).get('/api/stats').query({ days: '7' })).status).toBe(200);
    expect((await request(app).get('/api/stats').query({ days: 'all' })).status).toBe(200);
  });
});

describe('resolveSince', () => {
  const now = Date.parse('2026-08-09T12:00:00.000Z');

  it('rend undefined (tout l’historique) sans paramètre ou pour « all »', () => {
    expect(resolveSince(undefined, now)).toBeUndefined();
    expect(resolveSince('', now)).toBeUndefined();
    expect(resolveSince('all', now)).toBeUndefined();
  });

  it('recule de N jours', () => {
    expect(resolveSince('7', now)).toBe('2026-08-02T12:00:00.000Z');
  });

  it('refuse les valeurs hors bornes ou non numériques', () => {
    for (const raw of ['abc', '0', '-3', '3651', '7.5', ['7'] as unknown]) {
      expect(resolveSince(raw, now), `${String(raw)} devrait être invalide`).toBe('invalid');
    }
  });
});
