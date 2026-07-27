import { describe, expect, it } from 'vitest';
import { parseCheckArgs } from './checkTidesArgs';

const SITES = ['port-tudy', 'etel'];

describe('parseCheckArgs', () => {
  it('sans argument, audite les graines de tous les ports en texte', () => {
    expect(parseCheckArgs([], SITES)).toEqual({
      markdown: false, fromDb: false, sites: [], files: [], errors: []
    });
  });

  it('reconnaît --markdown et son raccourci --md', () => {
    expect(parseCheckArgs(['--markdown'], SITES).markdown).toBe(true);
    expect(parseCheckArgs(['--md'], SITES).markdown).toBe(true);
  });

  it('cible un port, sous les deux écritures', () => {
    expect(parseCheckArgs(['--site', 'etel'], SITES).sites).toEqual(['etel']);
    expect(parseCheckArgs(['--site=etel'], SITES).sites).toEqual(['etel']);
  });

  it('accepte plusieurs ports', () => {
    expect(parseCheckArgs(['--site', 'etel', '--site', 'port-tudy'], SITES).sites)
      .toEqual(['etel', 'port-tudy']);
  });

  // Une faute de frappe ne doit pas produire un rapport vide qu'on lirait comme « tout va bien ».
  it('refuse un port inconnu au lieu de filtrer dans le vide', () => {
    const o = parseCheckArgs(['--site', 'groix'], SITES);
    expect(o.sites).toEqual([]);
    expect(o.errors[0]).toContain('groix');
    expect(o.errors[0]).toContain('port-tudy, etel');
  });

  it('refuse --site sans valeur', () => {
    expect(parseCheckArgs(['--site'], SITES).errors).toHaveLength(1);
    expect(parseCheckArgs(['--site', '--markdown'], SITES).errors).toHaveLength(1);
  });

  it('reconnaît --db et le combine avec --site', () => {
    const o = parseCheckArgs(['--db', '--site', 'etel'], SITES);
    expect(o.fromDb).toBe(true);
    expect(o.sites).toEqual(['etel']);
    expect(o.errors).toEqual([]);
  });

  it('collecte les fichiers explicites', () => {
    expect(parseCheckArgs(['a.json', 'b.json'], SITES).files).toEqual(['a.json', 'b.json']);
  });

  it('refuse --db combiné à un fichier explicite', () => {
    expect(parseCheckArgs(['--db', 'a.json'], SITES).errors[0]).toContain('exclusifs');
  });

  it('signale une option inconnue', () => {
    expect(parseCheckArgs(['--json'], SITES).errors[0]).toContain('--json');
  });
});
