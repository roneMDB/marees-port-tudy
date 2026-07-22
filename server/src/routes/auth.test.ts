import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-auth-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_USER = 'marees';
process.env.APP_PASSWORD = 's3cret';

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
  delete process.env.APP_USER;
  delete process.env.APP_PASSWORD;
});

describe('routes auth', () => {
  it('GET /api/auth/status reflète authRequired sans cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authRequired: true, authenticated: false });
  });

  it('POST /api/login refuse de mauvais identifiants (401, pas de cookie)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /api/login pose un cookie de session sur bons identifiants', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret', remember: false });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/marees_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i); // pas de « se souvenir » → cookie de session
  });

  it('POST /api/login avec remember pose un cookie persistant (Max-Age)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret', remember: true });
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });

  it('force le flag Secure quand COOKIE_SECURE=true (même en HTTP)', async () => {
    process.env.COOKIE_SECURE = 'true';
    try {
      const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
      const cookie = (res.headers['set-cookie'] || [])[0] || '';
      expect(cookie).toMatch(/Secure/i);
    } finally {
      delete process.env.COOKIE_SECURE;
    }
  });

  it('n\'ajoute pas Secure en HTTP sans COOKIE_SECURE', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('le cookie posé ouvre les routes protégées', async () => {
    const login = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
    const cookie = (login.headers['set-cookie'] || [])[0];
    const res = await request(app).get('/api/tides/meta').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/status voit authenticated=true avec le cookie', async () => {
    const login = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
    const cookie = (login.headers['set-cookie'] || [])[0];
    const res = await request(app).get('/api/auth/status').set('Cookie', cookie);
    expect(res.body).toEqual({ authRequired: true, authenticated: true });
  });

  it('POST /api/logout efface le cookie', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/marees_session=;?/);
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
