import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

// Auth activée via ADMIN_* ; l'admin initial est amorcé par initStorage depuis ces variables.
const dataDir = path.join(os.tmpdir(), `marees-users-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'adm1n-pass';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;
let adminCookie: string;
let viewerCookie: string;
let viewerId: number;

async function login(user: string, password: string) {
  return request(app).post('/api/login').send({ user, password });
}

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  await initStorage();
  app = createApp(fakeLogger);
  adminCookie = (await login('admin', 'adm1n-pass')).headers['set-cookie'][0];

  // L'admin crée un lecteur, qui se connecte ensuite.
  const created = await request(app)
    .post('/api/users')
    .set('Cookie', adminCookie)
    .send({ login: 'lecteur1', password: 'lecteurpass' });
  viewerId = created.body.id;
  viewerCookie = (await login('lecteur1', 'lecteurpass')).headers['set-cookie'][0];
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe('routes users — CRUD (admin only)', () => {
  it('GET /api/users : liste des comptes pour l’admin (sans hash)', async () => {
    const res = await request(app).get('/api/users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const logins = res.body.map((u: any) => u.login);
    expect(logins).toContain('admin');
    expect(logins).toContain('lecteur1');
    expect(res.body[0]).not.toHaveProperty('passwordHash');
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });

  it('POST /api/users : crée un lecteur par défaut', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ login: 'lecteur2', password: 'lecteurpass' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ login: 'lecteur2', role: 'viewer' });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('POST /api/users : 409 si le login existe déjà', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ login: 'lecteur1', password: 'autrepass' });
    expect(res.status).toBe(409);
  });

  it('POST /api/users : 400 si mot de passe trop court', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ login: 'trop', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/users/:id : change le rôle', async () => {
    const res = await request(app)
      .put(`/api/users/${viewerId}`)
      .set('Cookie', adminCookie)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: viewerId, role: 'admin' });
    expect(res.body).not.toHaveProperty('passwordHash');
    // On le remet en lecteur pour la suite (il reste un autre admin : l'initial).
    await request(app).put(`/api/users/${viewerId}`).set('Cookie', adminCookie).send({ role: 'viewer' });
  });

  it('DELETE /api/users/:id : supprime un compte', async () => {
    const created = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie)
      .send({ login: 'ephemere', password: 'lecteurpass' });
    const res = await request(app).delete(`/api/users/${created.body.id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(204);
  });

  it('DELETE : refuse la suppression du dernier admin (409)', async () => {
    // À ce stade, "admin" (initial) est le seul admin (viewer remis en lecteur).
    const admins = (await request(app).get('/api/users').set('Cookie', adminCookie)).body
      .filter((u: any) => u.role === 'admin');
    expect(admins).toHaveLength(1);
    const res = await request(app).delete(`/api/users/${admins[0].id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(409);
  });
});

describe('routes users — verrou de rôle', () => {
  it('GET /api/users : 403 pour un lecteur', async () => {
    const res = await request(app).get('/api/users').set('Cookie', viewerCookie);
    expect(res.status).toBe(403);
  });

  it('POST /api/users : 403 pour un lecteur', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', viewerCookie)
      .send({ login: 'x', password: 'lecteurpass' });
    expect(res.status).toBe(403);
  });

  it('GET /api/users : 401 sans authentification', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('routes users — mot de passe propre', () => {
  it('PUT /api/users/me/password : un lecteur change son mot de passe', async () => {
    const res = await request(app)
      .put('/api/users/me/password')
      .set('Cookie', viewerCookie)
      .send({ currentPassword: 'lecteurpass', newPassword: 'nouveaupass' });
    expect(res.status).toBe(200);
    // La reconnexion fonctionne avec le nouveau mot de passe.
    const relog = await login('lecteur1', 'nouveaupass');
    expect(relog.status).toBe(200);
  });

  it('PUT /api/users/me/password : 403 si mot de passe actuel faux', async () => {
    const res = await request(app)
      .put('/api/users/me/password')
      .set('Cookie', viewerCookie)
      .send({ currentPassword: 'faux', newPassword: 'peuimporte' });
    expect(res.status).toBe(403);
  });
});
