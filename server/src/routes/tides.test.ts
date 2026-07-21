import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Répertoire de données isolé, initialisé (seed) avant d'importer l'app.
const dataDir = path.join(os.tmpdir(), `marees-tides-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;

let app: Application;

beforeAll(async () => {
  const { ensureDataDir } = await import('../config/dataDir');
  const { createApp } = await import('../app');
  ensureDataDir(); // copie les horaires depuis la graine dans dataDir
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('API /api', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/tides/meta returns available bounds and Navihan offsets', async () => {
    const res = await request(app).get('/api/tides/meta');
    expect(res.status).toBe(200);
    expect(res.body.minDate).toBe('2026-06-01');
    expect(res.body.maxDate).toBe('2026-10-31');
    expect(res.body.navihanOffsets).toEqual({ basseMer: '1h15', aFlot: '2h40' });
  });

  it('GET /api/tides filters by inclusive range and includes full extreme payload', async () => {
    const res = await request(app).get('/api/tides?from=2026-07-14&to=2026-07-15');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.days)).toEqual(['2026-07-14', '2026-07-15']);

    const extreme = res.body.days['2026-07-14'][0];
    expect(extreme).toHaveProperty('time');
    expect(extreme).toHaveProperty('height');
    expect(extreme).toHaveProperty('type');
    expect(extreme).toHaveProperty('coefficient');
    expect(extreme).toHaveProperty('navihan');
  });

  it('GET /api/tides without params returns the full available range', async () => {
    const res = await request(app).get('/api/tides');
    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-06-01');
    expect(res.body.to).toBe('2026-10-31');
  });

  it('GET /api/tides returns 400 on a malformed date', async () => {
    const res = await request(app).get('/api/tides?from=zzz');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from/);
  });

  it('GET /api/tides returns 400 when from > to', async () => {
    const res = await request(app).get('/api/tides?from=2026-08-01&to=2026-07-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Plage invalide/);
  });

  it('GET /api/sites lists the available ports', async () => {
    const res = await request(app).get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'port-tudy', label: 'Port-Tudy' },
      { id: 'etel', label: 'Étel' }
    ]);
  });

  it('GET /api/tides?site=etel returns the (empty) Étel dataset', async () => {
    const res = await request(app).get('/api/tides?site=etel');
    expect(res.status).toBe(200);
    expect(res.body.siteId).toBe('etel');
    expect(res.body.days).toEqual({});
  });

  it('GET /api/tides?site=port-tudy is equivalent to the default site', async () => {
    const res = await request(app).get('/api/tides?site=port-tudy&from=2026-07-14&to=2026-07-14');
    expect(res.status).toBe(200);
    expect(res.body.siteId).toBe('port-tudy');
    expect(Object.keys(res.body.days)).toEqual(['2026-07-14']);
  });

  it('GET /api/tides returns 400 on an unknown site', async () => {
    const res = await request(app).get('/api/tides?site=nowhere');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/site/);
  });

  it('GET /api/tides/meta returns 400 on an unknown site', async () => {
    const res = await request(app).get('/api/tides/meta?site=nowhere');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/site/);
  });
});
