import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  addRef,
  deleteRef,
  getRefs,
  refExists,
  backfillSeedPlurals,
  resetFishingRefs,
  seedFishingRefsIfEmpty,
  updateRef
} from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';

describe('fishingRefsRepository', () => {
  it('renvoie une liste vide sur une base neuve', () => {
    const db = openDb(':memory:');
    expect(getRefs(db)).toEqual([]);
    db.close();
  });

  it('amorce la graine une seule fois (idempotent)', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    expect(getRefs(db)).toHaveLength(FISHING_REFS_SEED.length);
    db.close();
  });

  it("ordonne les engins avant les espèces, dans l'ordre de la graine", () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    const refs = getRefs(db);
    expect(refs[0]).toEqual({
      id: 'casier-crabes',
      kind: 'gear',
      label: 'Casier à crabes',
      labelPlural: 'Casiers à crabes'
    });
    expect(refs.filter(r => r.kind === 'gear')).toHaveLength(3);
    db.close();
  });

  it('ajoute une entrée avec un id slug unique', () => {
    const db = openDb(':memory:');
    expect(addRef(db, 'species', 'Homard')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homard'
    });
    expect(addRef(db, 'species', 'Homard')).toEqual({
      id: 'homard-2',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homard'
    });
    db.close();
  });

  it("met à jour un libellé sans changer l'id", () => {
    const db = openDb(':memory:');
    addRef(db, 'species', 'Homard');
    expect(updateRef(db, 'homard', 'Homard bleu')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard bleu',
      labelPlural: 'Homard bleu'
    });
    expect(updateRef(db, 'inconnu', 'Rien')).toBeNull();
    db.close();
  });

  it('refuse de supprimer un référentiel utilisé par une prise', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'bar', 'ligne', 1)"
    ).run();
    expect(deleteRef(db, 'bar')).toBe('in-use');
    expect(deleteRef(db, 'ligne')).toBe('in-use');
    expect(deleteRef(db, 'congre')).toBe('deleted');
    expect(deleteRef(db, 'inconnu')).toBe('missing');
    db.close();
  });

  it("rétablit la graine en écrasant les ajouts non utilisés", () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    addRef(db, 'species', 'Homard');
    resetFishingRefs(db, FISHING_REFS_SEED);
    expect(getRefs(db)).toHaveLength(FISHING_REFS_SEED.length);
    expect(getRefs(db).some(r => r.id === 'homard')).toBe(false);
    db.close();
  });

  it('conserve au reset une entrée personnalisée encore utilisée par une prise', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    addRef(db, 'species', 'Homard');
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'homard', 'ligne', 1)"
    ).run();

    resetFishingRefs(db, FISHING_REFS_SEED);

    const refs = getRefs(db);
    expect(refs.some(r => r.id === 'homard')).toBe(true);
    // Rangée après la graine, pas au milieu.
    expect(refs.at(-1)!.id).toBe('homard');
    expect(refs).toHaveLength(FISHING_REFS_SEED.length + 1);
    db.close();
  });

  it('rétablit le libellé d\'une entrée de graine renommée', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    updateRef(db, 'bar', 'Bar moucheté');
    resetFishingRefs(db, FISHING_REFS_SEED);
    expect(getRefs(db).find(r => r.id === 'bar')!.label).toBe('Bar');
    db.close();
  });

  it('sait dire si un id existe avec le bon type', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    expect(refExists(db, 'bar', 'species')).toBe(true);
    expect(refExists(db, 'bar', 'gear')).toBe(false);
    expect(refExists(db, 'inconnu', 'species')).toBe(false);
    db.close();
  });

  it('amorce chaque référentiel avec son libellé au pluriel', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    const refs = getRefs(db);
    const plural = (id: string) => refs.find(r => r.id === id)!.labelPlural;
    // Les trois pièges du français que la règle automatique ne savait pas franchir.
    expect(plural('lieu-jaune')).toBe('Lieus jaunes');
    expect(plural('crevette-bouquet')).toBe('Crevettes bouquet');
    expect(plural('crevette-grise')).toBe('Crevettes grises');
    expect(plural('tourteau')).toBe('Tourteaux');
    expect(plural('bar')).toBe('Bars');
    db.close();
  });

  it('enregistre et met à jour le pluriel saisi', () => {
    const db = openDb(':memory:');
    expect(addRef(db, 'species', 'Homard', 'Homards')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homards'
    });
    expect(updateRef(db, 'homard', 'Homard bleu', 'Homards bleus')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard bleu',
      labelPlural: 'Homards bleus'
    });
    db.close();
  });

  it('retombe sur le singulier quand aucun pluriel n’est fourni', () => {
    const db = openDb(':memory:');
    expect(addRef(db, 'gear', 'Épuisette', '').labelPlural).toBe('Épuisette');
    db.close();
  });

  it('relit une ligne héritée sans pluriel comme valant son singulier', () => {
    const db = openDb(':memory:');
    // Ligne écrite avant la v8 : `label_plural` est NULL.
    db.prepare("INSERT INTO fishing_refs (id, kind, label, sort_order) VALUES ('ancien', 'species', 'Ancien', 0)").run();
    expect(getRefs(db).find(r => r.id === 'ancien')!.labelPlural).toBe('Ancien');
    db.close();
  });

  it('complète le pluriel des entrées de graine amorcées avant la v8', () => {
    const db = openDb(':memory:');
    // Table amorcée par une version antérieure : la colonne existe mais reste NULL.
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    db.prepare('UPDATE fishing_refs SET label_plural = NULL').run();

    backfillSeedPlurals(db, FISHING_REFS_SEED);
    const refs = getRefs(db);
    expect(refs.find(r => r.id === 'lieu-jaune')!.labelPlural).toBe('Lieus jaunes');
    expect(refs.find(r => r.id === 'casier-crabes')!.labelPlural).toBe('Casiers à crabes');
    db.close();
  });

  it('ne touche ni aux libellés renommés ni aux pluriels déjà saisis', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    // Un libellé renommé n'est plus celui de la graine : son pluriel ne s'en déduit pas.
    db.prepare("UPDATE fishing_refs SET label = 'Lieu', label_plural = NULL WHERE id = 'lieu-jaune'").run();
    db.prepare("UPDATE fishing_refs SET label_plural = 'Bars mouchetés' WHERE id = 'bar'").run();

    backfillSeedPlurals(db, FISHING_REFS_SEED);
    const refs = getRefs(db);
    expect(refs.find(r => r.id === 'lieu-jaune')!.labelPlural).toBe('Lieu'); // repli, pas la graine
    expect(refs.find(r => r.id === 'bar')!.labelPlural).toBe('Bars mouchetés');
    db.close();
  });
});
