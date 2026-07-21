import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-stats-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;

beforeAll(async () => {
  const { ensureDataDir } = await import('../config/dataDir');
  const { createApp } = await import('../app');
  ensureDataDir();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('accès & statistiques', () => {
  it('GET /api/context indique le réseau local et le droit d’édition', async () => {
    const local = await request(app).get('/api/context');
    expect(local.body).toEqual({ local: true, canEditSettings: true });

    const external = await request(app).get('/api/context').set('X-Forwarded-For', '203.0.113.9');
    expect(external.body).toEqual({ local: false, canEditSettings: false });
  });

  it('journalise une ouverture de page puis l’expose via /api/stats (LAN)', async () => {
    // Une requête de document HTML est journalisée par le middleware accessLog.
    await request(app).get('/').set('Accept', 'text/html');

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.lan).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.perDay)).toBe(true);
  });

  it('refuse /api/stats depuis l’extérieur (403)', async () => {
    const res = await request(app).get('/api/stats').set('X-Forwarded-For', '203.0.113.9');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/réseau local/i);
  });
});
