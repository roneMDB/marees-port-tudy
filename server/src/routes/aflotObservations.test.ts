import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-aflotobs-test-${process.pid}`);
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

describe('API /api/aflot-observations', () => {
  it('GET returns an empty list on a fresh data dir', async () => {
    const res = await request(app).get('/api/aflot-observations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('PUT upserts an observation and persists it', async () => {
    const put = await request(app)
      .put('/api/aflot-observations')
      .send({ date: '2026-07-25', time: '08:22', observed: '11:07' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ date: '2026-07-25', time: '08:22', observed: '11:07' });

    const get = await request(app).get('/api/aflot-observations');
    expect(get.body).toEqual([{ date: '2026-07-25', time: '08:22', observed: '11:07' }]);
  });

  it('PUT overwrites the observed time for the same tide', async () => {
    await request(app).put('/api/aflot-observations').send({ date: '2026-07-25', time: '08:22', observed: '11:00' });
    const get = await request(app).get('/api/aflot-observations');
    expect(get.body).toEqual([{ date: '2026-07-25', time: '08:22', observed: '11:00' }]);
  });

  it('PUT returns 400 on invalid date/time/observed', async () => {
    for (const body of [
      { date: 'nope', time: '08:22', observed: '11:00' },
      { date: '2026-07-25', time: '8h22', observed: '11:00' },
      { date: '2026-07-25', time: '08:22', observed: '25:99' },
      { date: '2026-07-25', time: '08:22' }
    ]) {
      const res = await request(app).put('/api/aflot-observations').send(body);
      expect(res.status).toBe(400);
    }
  });

  it('DELETE removes an observation', async () => {
    await request(app).delete('/api/aflot-observations').send({ date: '2026-07-25', time: '08:22' });
    const get = await request(app).get('/api/aflot-observations');
    expect(get.body).toEqual([]);
  });
});
