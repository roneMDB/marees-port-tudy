import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Auth active via APP_PASSWORD seul (sans ADMIN_PASSWORD) → admin/admin amorcé avec must_change.
const dataDir = path.join(os.tmpdir(), `marees-pwdchange-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_PASSWORD = 'active';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;
let cookie: string;

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  await initStorage();
  app = createApp(fakeLogger);
  const res = await request(app).post('/api/login').send({ user: 'admin', password: 'admin' });
  expect(res.body.mustChangePassword).toBe(true);
  cookie = res.headers['set-cookie'][0];
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.APP_PASSWORD;
});

describe('changement de mot de passe forcé — verrou serveur', () => {
  it('bloque les routes /api tant que le mot de passe n’est pas changé (403 + code)', async () => {
    const meta = await request(app).get('/api/tides/meta').set('Cookie', cookie);
    expect(meta.status).toBe(403);
    expect(meta.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const users = await request(app).get('/api/users').set('Cookie', cookie);
    expect(users.status).toBe(403);
  });

  it('autorise uniquement le changement de son propre mot de passe, puis débloque', async () => {
    const chg = await request(app)
      .put('/api/users/me/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'admin', newPassword: 'nouveaupass' });
    expect(chg.status).toBe(200);

    // Le drapeau est effacé → les routes redeviennent accessibles avec le même cookie.
    const meta = await request(app).get('/api/tides/meta').set('Cookie', cookie);
    expect(meta.status).toBe(200);
  });
});
