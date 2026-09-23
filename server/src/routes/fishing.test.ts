import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-fishing-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

// La capture météo sort sur le réseau : neutralisée ici, elle a ses propres tests.
vi.mock('../service/fishingWeather', () => ({
  captureTripWeather: vi.fn(async () => null)
}));

// Rôle pilotable test par test. `vi.hoisted` est nécessaire : les factories `vi.mock` sont hissées
// au-dessus des déclarations du fichier. On ne remplace que `requestRole` — `basicAuth` et le reste
// du module doivent rester réels, `app.ts` les monte.
const roleState = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'viewer' }));
vi.mock('../middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../middleware/auth')>('../middleware/auth');
  return { ...actual, requestRole: () => roleState.role };
});

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

const validTrip = {
  date: '2026-08-10',
  startTime: '19:42',
  endTime: '21:10',
  notes: 'Vent d’ouest',
  baited: false,
  catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }]
};

describe('API /api/fishing/refs', () => {
  it('GET renvoie les référentiels amorcés', async () => {
    const res = await request(app).get('/api/fishing/refs');
    expect(res.status).toBe(200);
    expect(res.body.some((r: any) => r.id === 'casier-crevettes' && r.kind === 'gear')).toBe(true);
    expect(res.body.some((r: any) => r.id === 'bar' && r.kind === 'species')).toBe(true);
  });

  it('POST ajoute une espèce puis PUT la renomme', async () => {
    const post = await request(app).post('/api/fishing/refs').send({ kind: 'species', label: 'Langouste' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ id: 'langouste', kind: 'species', label: 'Langouste' });

    const put = await request(app).put('/api/fishing/refs/langouste').send({ label: 'Langouste rose' });
    expect(put.status).toBe(200);
    expect(put.body.label).toBe('Langouste rose');
  });

  it('POST refuse un type inconnu ou un libellé vide (400)', async () => {
    expect((await request(app).post('/api/fishing/refs').send({ kind: 'poisson', label: 'X' })).status).toBe(400);
    expect((await request(app).post('/api/fishing/refs').send({ kind: 'species', label: '  ' })).status).toBe(400);
  });

  it('POST accepte un pluriel explicite et PUT le met à jour', async () => {
    const post = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Homard bleu', labelPlural: 'Homards bleus' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ label: 'Homard bleu', labelPlural: 'Homards bleus' });

    const put = await request(app)
      .put(`/api/fishing/refs/${post.body.id}`)
      .send({ label: 'Homard', labelPlural: 'Homards' });
    expect(put.status).toBe(200);
    expect(put.body.labelPlural).toBe('Homards');

    expect((await request(app).delete(`/api/fishing/refs/${post.body.id}`)).status).toBe(204);
  });

  it('POST sans pluriel retombe sur le singulier', async () => {
    const post = await request(app).post('/api/fishing/refs').send({ kind: 'gear', label: 'Épuisette' });
    expect(post.status).toBe(201);
    expect(post.body.labelPlural).toBe('Épuisette');
    expect((await request(app).delete(`/api/fishing/refs/${post.body.id}`)).status).toBe(204);
  });

  it('POST refuse un pluriel trop long', async () => {
    const res = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Truite', labelPlural: 'x'.repeat(61) });
    expect(res.status).toBe(400);
  });

  it('DELETE renvoie 404 sur un id inconnu, 204 sinon', async () => {
    expect((await request(app).delete('/api/fishing/refs/inconnu')).status).toBe(404);
    expect((await request(app).delete('/api/fishing/refs/langouste')).status).toBe(204);
  });

  it('POST /reorder réordonne une section sans toucher à l’autre', async () => {
    const avant = (await request(app).get('/api/fishing/refs')).body as { id: string; kind: string }[];
    const especes = avant.filter(r => r.kind === 'species').map(r => r.id);
    const engins = avant.filter(r => r.kind === 'gear').map(r => r.id);
    const voulu = [...especes].reverse();

    const res = await request(app).post('/api/fishing/refs/reorder').send({ kind: 'species', ids: voulu });
    expect(res.status).toBe(200);
    const apres = res.body as { id: string; kind: string }[];
    expect(apres.filter(r => r.kind === 'species').map(r => r.id)).toEqual(voulu);
    expect(apres.filter(r => r.kind === 'gear').map(r => r.id)).toEqual(engins);

    // Remis en place pour ne pas déteindre sur les tests suivants.
    await request(app).post('/api/fishing/refs/reorder').send({ kind: 'species', ids: especes });
  });

  it('POST /reorder refuse un type inconnu ou un ensemble d’ids non conforme (400)', async () => {
    const refs = (await request(app).get('/api/fishing/refs')).body as { id: string; kind: string }[];
    const especes = refs.filter(r => r.kind === 'species').map(r => r.id);

    expect((await request(app).post('/api/fishing/refs/reorder').send({ kind: 'poisson', ids: especes })).status).toBe(400);
    expect((await request(app).post('/api/fishing/refs/reorder').send({ kind: 'species', ids: especes.slice(1) })).status).toBe(400);
    expect((await request(app).post('/api/fishing/refs/reorder').send({ kind: 'species', ids: 'nope' })).status).toBe(400);
  });

  it('GET expose l’engin par défaut de chaque espèce', async () => {
    const res = await request(app).get('/api/fishing/refs');
    const byId = (id: string) => res.body.find((r: any) => r.id === id);
    expect(byId('crevette-bouquet').defaultGearId).toBe('casier-crevettes');
    expect(byId('morgate').defaultGearId).toBe('casier-morgates');
    expect(byId('bar').defaultGearId).toBeNull();
  });

  it('POST et PUT enregistrent l’engin par défaut, vide = aucun', async () => {
    const post = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Bouquet géant', defaultGearId: 'casier-crevettes' });
    expect(post.status).toBe(201);
    expect(post.body.defaultGearId).toBe('casier-crevettes');

    const put = await request(app)
      .put(`/api/fishing/refs/${post.body.id}`)
      .send({ label: 'Bouquet géant', defaultGearId: '' });
    expect(put.status).toBe(200);
    expect(put.body.defaultGearId).toBeNull();

    expect((await request(app).delete(`/api/fishing/refs/${post.body.id}`)).status).toBe(204);
  });

  it('refuse un engin par défaut inconnu ou qui est une espèce (400)', async () => {
    const inconnu = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Truite', defaultGearId: 'filet' });
    expect(inconnu.status).toBe(400);
    const espece = await request(app).put('/api/fishing/refs/bar').send({ label: 'Bar', defaultGearId: 'tourteau' });
    expect(espece.status).toBe(400);
    const pasUneChaine = await request(app).put('/api/fishing/refs/bar').send({ label: 'Bar', defaultGearId: 3 });
    expect(pasUneChaine.status).toBe(400);
  });

  it('ignore l’engin par défaut d’un engin', async () => {
    const put = await request(app)
      .put('/api/fishing/refs/ligne')
      .send({ label: 'Ligne', labelPlural: 'Lignes', defaultGearId: 'casier-crabes' });
    expect(put.status).toBe(200);
    expect(put.body.defaultGearId).toBeNull();
  });
});

describe('API /api/fishing/trips', () => {
  it('POST crée une sortie et GET la relit', async () => {
    const post = await request(app).post('/api/fishing/trips').send(validTrip);
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ date: '2026-08-10', startTime: '19:42', notes: 'Vent d’ouest' });
    expect(post.body.catches).toHaveLength(1);

    const get = await request(app).get('/api/fishing/trips');
    expect(get.status).toBe(200);
    expect(get.body.some((t: any) => t.id === post.body.id)).toBe(true);
  });

  it('GET filtre sur une plage inclusive et refuse des dates invalides', async () => {
    await request(app).post('/api/fishing/trips').send({ ...validTrip, date: '2026-07-01' });
    const inRange = await request(app).get('/api/fishing/trips?from=2026-08-01&to=2026-08-31');
    expect(inRange.body.every((t: any) => t.date >= '2026-08-01')).toBe(true);

    expect((await request(app).get('/api/fishing/trips?from=hier')).status).toBe(400);
    expect((await request(app).get('/api/fishing/trips?from=2026-08-31&to=2026-08-01')).status).toBe(400);
  });

  it('POST accepte une sortie bredouille', async () => {
    const res = await request(app).post('/api/fishing/trips').send({ ...validTrip, catches: [] });
    expect(res.status).toBe(201);
    expect(res.body.catches).toEqual([]);
  });

  it('POST refuse une date, une heure, une quantité ou un référentiel invalides (400)', async () => {
    const bad = (over: any) => request(app).post('/api/fishing/trips').send({ ...validTrip, ...over });
    expect((await bad({ date: '10/08/2026' })).status).toBe(400);
    expect((await bad({ startTime: '25:00' })).status).toBe(400);
    expect((await bad({ notes: 'x'.repeat(1001) })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], quantity: 0 }] })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], speciesId: 'licorne' }] })).status).toBe(400);
    // Un engin ne peut pas servir d'espèce, ni l'inverse.
    expect((await bad({ catches: [{ ...validTrip.catches[0], speciesId: 'ligne' }] })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], gearId: 'bar' }] })).status).toBe(400);
  });

  it('POST enregistre « casiers boëttés » et le PUT le réécrit', async () => {
    const post = await request(app).post('/api/fishing/trips').send({ ...validTrip, baited: true });
    expect(post.status).toBe(201);
    expect(post.body.baited).toBe(true);

    // Contrairement à la météo (figée à la création), la boëtte est une donnée saisie, corrigeable.
    const put = await request(app)
      .put(`/api/fishing/trips/${post.body.id}`)
      .send({ ...validTrip, baited: false });
    expect(put.status).toBe(200);
    expect(put.body.baited).toBe(false);

    await request(app).delete(`/api/fishing/trips/${post.body.id}`);
  });

  it('POST coerce « casiers boëttés » à faux plutôt que de renvoyer 400', async () => {
    // Booléen d'agrément, pas une clé : `kept` suit la même logique (avec un défaut inverse).
    const send = (over: any) => request(app).post('/api/fishing/trips').send({ ...validTrip, ...over });
    expect((await send({ baited: undefined })).body.baited).toBe(false); // champ absent
    expect((await send({ baited: 'oui' })).body.baited).toBe(false);
    expect((await send({ baited: 1 })).body.baited).toBe(false);
    expect((await send({ baited: 'oui' })).status).toBe(201);
  });

  it('PUT remplace les prises, DELETE supprime, 404 hors sortie existante', async () => {
    const post = await request(app).post('/api/fishing/trips').send(validTrip);
    const id = post.body.id;

    const put = await request(app)
      .put(`/api/fishing/trips/${id}`)
      .send({ ...validTrip, catches: [{ speciesId: 'seiche', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: 900, kept: false }] });
    expect(put.status).toBe(200);
    expect(put.body.catches).toHaveLength(1);
    expect(put.body.catches[0]).toMatchObject({ speciesId: 'seiche', kept: false });

    expect((await request(app).put('/api/fishing/trips/9999').send(validTrip)).status).toBe(404);
    expect((await request(app).delete(`/api/fishing/trips/${id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/fishing/trips/${id}`)).status).toBe(404);
  });

  it('refuse de supprimer un référentiel encore utilisé (409)', async () => {
    await request(app).post('/api/fishing/trips').send(validTrip);
    const res = await request(app).delete('/api/fishing/refs/bar');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/utilisé/i);
  });
});

describe('API /api/fishing — écritures réservées au rôle admin', () => {
  const REFUS = { error: 'Modification réservée au rôle administrateur.' };

  beforeAll(() => {
    roleState.role = 'viewer';
  });

  afterAll(() => {
    roleState.role = 'admin';
  });

  it('refuse les cinq écritures sur les référentiels', async () => {
    const post = await request(app).post('/api/fishing/refs').send({ kind: 'species', label: 'Congre royal' });
    expect(post.status).toBe(403);
    expect(post.body).toEqual(REFUS);

    expect((await request(app).put('/api/fishing/refs/bar').send({ label: 'Bar rayé' })).status).toBe(403);
    expect((await request(app).delete('/api/fishing/refs/bar')).status).toBe(403);
    expect((await request(app).post('/api/fishing/refs/reset')).status).toBe(403);
    expect(
      (await request(app).post('/api/fishing/refs/reorder').send({ kind: 'species', ids: [] })).status
    ).toBe(403);
  });

  it('refuse les trois écritures sur les sorties', async () => {
    const post = await request(app).post('/api/fishing/trips').send(validTrip);
    expect(post.status).toBe(403);
    expect(post.body).toEqual(REFUS);

    expect((await request(app).put('/api/fishing/trips/1').send(validTrip)).status).toBe(403);
    expect((await request(app).delete('/api/fishing/trips/1')).status).toBe(403);
  });

  it('laisse la lecture ouverte à un compte non administrateur', async () => {
    expect((await request(app).get('/api/fishing/trips')).status).toBe(200);
    expect((await request(app).get('/api/fishing/refs')).status).toBe(200);
  });

  it('ne laisse rien passer : le référentiel « bar » est toujours là', async () => {
    const refs = await request(app).get('/api/fishing/refs');
    expect(refs.body.some((r: any) => r.id === 'bar')).toBe(true);
  });
});
