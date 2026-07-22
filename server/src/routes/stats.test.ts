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
    expect(Array.isArray(res.body.perDay)).toBe(true);
  });
});
