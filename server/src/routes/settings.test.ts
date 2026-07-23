import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-settings-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;

let app: Application;

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  initStorage();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('API /api/settings', () => {
  it('GET returns defaults on a fresh data dir', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ startMode: 'today', rangeDays: 30, aFlotDays: 3 });
    expect(res.body.navihan).toEqual({ basseMer: 75, pleineMer: 75, aFlot: 160 });
  });

  it('PUT merges, clamps and persists', async () => {
    const put = await request(app)
      .put('/api/settings')
      .send({ startMode: 'date', startDate: '2026-08-01', rangeDays: 9999, navihan: { aFlot: 200 }, aFlotDays: 5 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ startMode: 'date', startDate: '2026-08-01', rangeDays: 365, aFlotDays: 5 });
    // navihan fusionné : aFlot changé, les autres conservés.
    expect(put.body.navihan).toEqual({ basseMer: 75, pleineMer: 75, aFlot: 200 });

    // Persisté : un nouveau GET renvoie la même chose.
    const get = await request(app).get('/api/settings');
    expect(get.body).toEqual(put.body);
  });

  it('PUT returns 400 on an invalid JSON body', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(res.status).toBe(400);
  });
});
