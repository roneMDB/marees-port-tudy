import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-lexicon-test-${process.pid}`);
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

describe('API /api/lexicon', () => {
  it('GET returns the seeded lexicon', async () => {
    const res = await request(app).get('/api/lexicon');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(40);
    expect(res.body.find((e: any) => e.id === 'coefficient')).toMatchObject({ type: 'maree' });
    expect(res.body.find((e: any) => e.id === 'casier')).toMatchObject({ type: 'peche' });
  });

  it('POST adds an entry (admin), returned by GET', async () => {
    const post = await request(app)
      .post('/api/lexicon')
      .send({ term: 'Ressac', definition: 'Le retour de la vague sur elle-même.', type: 'maree' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ id: 'ressac', term: 'Ressac', type: 'maree' });

    const get = await request(app).get('/api/lexicon');
    expect(get.body.some((e: any) => e.id === 'ressac')).toBe(true);
  });

  it('PUT updates an entry', async () => {
    const put = await request(app)
      .put('/api/lexicon/ressac')
      .send({ term: 'Ressac', definition: 'Vague qui reflue après avoir frappé la côte.', type: 'maree' });
    expect(put.status).toBe(200);
    expect(put.body.definition).toContain('reflue');
    expect((await request(app).put('/api/lexicon/inconnu').send({ term: 'X', definition: 'Y', type: 'maree' })).status).toBe(404);
  });

  it('POST/PUT reject invalid input with 400', async () => {
    expect((await request(app).post('/api/lexicon').send({ term: '', definition: 'x', type: 'maree' })).status).toBe(400);
    expect((await request(app).post('/api/lexicon').send({ term: 'X', definition: 'y', type: 'autre' })).status).toBe(400);
  });

  it('DELETE removes an entry', async () => {
    expect((await request(app).delete('/api/lexicon/ressac')).status).toBe(204);
    expect((await request(app).get('/api/lexicon')).body.some((e: any) => e.id === 'ressac')).toBe(false);
    expect((await request(app).delete('/api/lexicon/ressac')).status).toBe(404);
  });

  it('POST /reset restores the default lexicon', async () => {
    await request(app).post('/api/lexicon').send({ term: 'Éphémère', definition: '…', type: 'peche' });
    const res = await request(app).post('/api/lexicon/reset');
    expect(res.status).toBe(200);
    expect(res.body.some((e: any) => e.id === 'ephemere')).toBe(false); // ajout effacé
    expect(res.body.some((e: any) => e.id === 'coefficient')).toBe(true); // défaut présent
  });
});
