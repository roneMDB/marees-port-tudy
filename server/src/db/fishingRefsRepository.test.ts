import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  addRef,
  deleteRef,
  getRefs,
  refExists,
  backfillSeedPlurals,
  reorderRefs,
  resetFishingRefs,
  seedFishingRefsIfEmpty,
  updateRef,
  upgradeFishingRefsToV10
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
      labelPlural: 'Casiers à crabes',
      defaultGearId: null
    });
    expect(refs.filter(r => r.kind === 'gear')).toHaveLength(4);
    db.close();
  });

  it('ajoute une entrée avec un id slug unique', () => {
    const db = openDb(':memory:');
    expect(addRef(db, 'species', 'Homard')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homard',
      defaultGearId: null
    });
    expect(addRef(db, 'species', 'Homard')).toEqual({
      id: 'homard-2',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homard',
      defaultGearId: null
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
      labelPlural: 'Homard bleu',
      defaultGearId: null
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
    addRef(db, 'species', 'Langouste');
    resetFishingRefs(db, FISHING_REFS_SEED);
    expect(getRefs(db)).toHaveLength(FISHING_REFS_SEED.length);
    expect(getRefs(db).some(r => r.id === 'langouste')).toBe(false);
    db.close();
  });

  it('conserve au reset une entrée personnalisée encore utilisée par une prise', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    addRef(db, 'species', 'Langouste');
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'langouste', 'ligne', 1)"
    ).run();

    resetFishingRefs(db, FISHING_REFS_SEED);

    const refs = getRefs(db);
    expect(refs.some(r => r.id === 'langouste')).toBe(true);
    // Rangée après la graine, pas au milieu.
    expect(refs.at(-1)!.id).toBe('langouste');
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
      labelPlural: 'Homards',
      defaultGearId: null
    });
    expect(updateRef(db, 'homard', 'Homard bleu', 'Homards bleus')).toEqual({
      id: 'homard',
      kind: 'species',
      label: 'Homard bleu',
      labelPlural: 'Homards bleus',
      defaultGearId: null
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

  describe('reorderRefs', () => {
    const ids = (db: ReturnType<typeof openDb>, kind: 'species' | 'gear') =>
      getRefs(db)
        .filter(r => r.kind === kind)
        .map(r => r.id);

    it('réordonne une section et renvoie la liste complète', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const avant = ids(db, 'species');
      const voulu = [...avant].reverse();

      const res = reorderRefs(db, 'species', voulu)!;
      expect(res.filter(r => r.kind === 'species').map(r => r.id)).toEqual(voulu);
      expect(ids(db, 'species')).toEqual(voulu); // persisté
      db.close();
    });

    it('ne touche pas à l’autre section', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const gearsAvant = ids(db, 'gear');
      reorderRefs(db, 'species', [...ids(db, 'species')].reverse());
      expect(ids(db, 'gear')).toEqual(gearsAvant);
      db.close();
    });

    it('réaffecte les rangs déjà occupés, sans renuméroter globalement', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const rangs = () =>
        (db.prepare('SELECT sort_order AS s FROM fishing_refs ORDER BY s').all() as { s: number }[])
          .map(r => r.s);
      const avant = rangs();
      reorderRefs(db, 'species', [...ids(db, 'species')].reverse());
      // L'ensemble des rangs est invariant : seule leur attribution change.
      expect(rangs()).toEqual(avant);
      db.close();
    });

    it('refuse une liste incomplète, un id étranger ou un id d’un autre type', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const especes = ids(db, 'species');

      expect(reorderRefs(db, 'species', especes.slice(1))).toBeNull();
      expect(reorderRefs(db, 'species', [...especes.slice(1), 'inconnu'])).toBeNull();
      // « ligne » est un engin : il n'a rien à faire dans le tri des espèces.
      expect(reorderRefs(db, 'species', [...especes.slice(1), 'ligne'])).toBeNull();
      // Un doublon a le bon cardinal mais pas le bon ensemble.
      expect(reorderRefs(db, 'species', [especes[0], ...especes.slice(0, -1)])).toBeNull();

      expect(ids(db, 'species')).toEqual(especes); // rien n'a bougé
      db.close();
    });
  });

  describe('engin par défaut', () => {
    it('amorce les engins par défaut de la graine', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const gearOf = (id: string) => getRefs(db).find(r => r.id === id)!.defaultGearId;
      expect(gearOf('etrille')).toBe('casier-crabes');
      expect(gearOf('moussette')).toBe('casier-crabes');
      expect(gearOf('homard')).toBe('casier-crabes');
      expect(gearOf('crevette-bouquet')).toBe('casier-crevettes');
      expect(gearOf('crevette-grise')).toBe('casier-crevettes');
      expect(gearOf('morgate')).toBe('casier-morgates');
      expect(gearOf('bar')).toBeNull();
      expect(gearOf('ligne')).toBeNull();
      db.close();
    });

    it('enregistre et modifie l’engin par défaut d’une espèce', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(addRef(db, 'species', 'Langouste', '', 'casier-crabes').defaultGearId).toBe('casier-crabes');
      expect(updateRef(db, 'langouste', 'Langouste', '', 'ligne')!.defaultGearId).toBe('ligne');
      expect(updateRef(db, 'langouste', 'Langouste', '', null)!.defaultGearId).toBeNull();
      db.close();
    });

    it('ne donne jamais d’engin par défaut à un engin', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(addRef(db, 'gear', 'Épuisette', '', 'ligne').defaultGearId).toBeNull();
      expect(updateRef(db, 'ligne', 'Ligne', 'Lignes', 'casier-crabes')!.defaultGearId).toBeNull();
      db.close();
    });

    it('efface le défaut des espèces quand on supprime leur engin', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(deleteRef(db, 'casier-morgates')).toBe('deleted');
      expect(getRefs(db).find(r => r.id === 'morgate')!.defaultGearId).toBeNull();
      db.close();
    });

    it('rétablit les défauts de la graine au reset, et garde celui d’une entrée conservée', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      updateRef(db, 'etrille', 'Étrille', 'Étrilles', null);
      addRef(db, 'species', 'Langouste', '', 'casier-crabes');
      db.prepare(
        "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
      ).run();
      db.prepare(
        "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'langouste', 'casier-crabes', 1)"
      ).run();

      resetFishingRefs(db, FISHING_REFS_SEED);

      const refs = getRefs(db);
      expect(refs.find(r => r.id === 'etrille')!.defaultGearId).toBe('casier-crabes');
      expect(refs.find(r => r.id === 'langouste')!.defaultGearId).toBe('casier-crabes');
      db.close();
    });

    it('au reset, efface le défaut d’une entrée conservée si son engin a disparu', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      addRef(db, 'gear', 'Épuisette');
      addRef(db, 'species', 'Langouste', '', 'epuisette');
      db.prepare(
        "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
      ).run();
      db.prepare(
        "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'langouste', 'ligne', 1)"
      ).run();

      resetFishingRefs(db, FISHING_REFS_SEED); // l'épuisette n'est pas utilisée : elle disparaît

      expect(getRefs(db).find(r => r.id === 'langouste')!.defaultGearId).toBeNull();
      db.close();
    });
  });

  describe('upgradeFishingRefsToV10', () => {
    /** Les 19 entrées de la prod au 2026-09-23 (Moussette et Homard ajoutées par le panneau). */
    const PROD_V9: [string, string, string][] = [
      ['casier-crabes', 'gear', 'Casier à crabes'],
      ['casier-crevettes', 'gear', 'Casier à crevettes'],
      ['ligne', 'gear', 'Ligne'],
      ['etrille', 'species', 'Étrille'],
      ['crevette-bouquet', 'species', 'Crevette bouquet'],
      ['tourteau', 'species', 'Tourteau'],
      ['moussette', 'species', 'Moussette'],
      ['araignee', 'species', 'Araignée'],
      ['crevette-grise', 'species', 'Crevette grise'],
      ['bar', 'species', 'Bar'],
      ['dorade-grise', 'species', 'Dorade grise'],
      ['dorade-royale', 'species', 'Dorade royale'],
      ['vieille', 'species', 'Vieille'],
      ['lieu-jaune', 'species', 'Lieu jaune'],
      ['maquereau', 'species', 'Maquereau'],
      ['congre', 'species', 'Congre'],
      ['seiche', 'species', 'Seiche'],
      ['mulet', 'species', 'Mulet'],
      ['homard', 'species', 'Homard']
    ];

    function prodDb() {
      const db = openDb(':memory:');
      const ins = db.prepare(
        'INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      PROD_V9.forEach(([id, kind, label], i) => ins.run(id, kind, label, label, i));
      return db;
    }

    it('ajoute le casier à morgates et la morgate, après les entrées existantes', () => {
      const db = prodDb();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      const refs = getRefs(db);
      expect(refs).toHaveLength(21);
      expect(refs.slice(-2).map(r => r.id)).toEqual(['casier-morgates', 'morgate']);
      expect(refs.find(r => r.id === 'casier-morgates')!.kind).toBe('gear');
      db.close();
    });

    it('pose les défauts sur les espèces de la graine', () => {
      const db = prodDb();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      const gearOf = (id: string) => getRefs(db).find(r => r.id === id)!.defaultGearId;
      expect(gearOf('moussette')).toBe('casier-crabes');
      expect(gearOf('homard')).toBe('casier-crabes');
      expect(gearOf('crevette-bouquet')).toBe('casier-crevettes');
      expect(gearOf('morgate')).toBe('casier-morgates');
      expect(gearOf('congre')).toBeNull();
      db.close();
    });

    it('ne pose pas de défaut sur une espèce de la graine renommée', () => {
      const db = prodDb();
      db.prepare("UPDATE fishing_refs SET label = 'Étrille à pattes bleues' WHERE id = 'etrille'").run();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      expect(getRefs(db).find(r => r.id === 'etrille')!.defaultGearId).toBeNull();
      db.close();
    });

    it('réinsère un engin de la graine manquant avant de poser les défauts', () => {
      const db = prodDb();
      db.prepare("DELETE FROM fishing_refs WHERE id = 'casier-crevettes'").run();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      // Réinséré par l'étape 1, puisque son id manquait : le défaut est donc posé.
      expect(getRefs(db).find(r => r.id === 'crevette-bouquet')!.defaultGearId).toBe('casier-crevettes');
      db.close();
    });

    it('ne fait rien sur une table vide (base neuve : l’amorçage s’en charge)', () => {
      const db = openDb(':memory:');
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      expect(getRefs(db)).toEqual([]);
      db.close();
    });
  });
});
