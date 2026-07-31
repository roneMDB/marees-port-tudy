import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { appVersion, resetVersionCache } from './version';

describe('appVersion', () => {
  beforeEach(() => {
    resetVersionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetVersionCache();
  });

  it('lit la version du package.json racine', () => {
    // Source de vérité du versionnement (cf. issue #12) : la valeur doit être celle du manifest,
    // pas une constante recopiée qui divergerait au prochain `npm version`.
    const manifest = path.resolve(__dirname, '../../../package.json');
    const attendue = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;

    expect(appVersion()).toBe(attendue);
  });

  it('renvoie une version sémantique', () => {
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('ne relit pas le manifest à chaque appel', () => {
    const espion = vi.spyOn(fs, 'readFileSync');
    appVersion();
    appVersion();
    appVersion();
    expect(espion).toHaveBeenCalledTimes(1);
  });

  it('retombe sur 0.0.0 si le manifest est illisible', () => {
    // Le boot ne doit pas échouer pour une version manquante : la sonde de vie doit rester servie.
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(appVersion()).toBe('0.0.0');
  });

  it('retombe sur 0.0.0 si le manifest ne porte pas de version', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ name: 'sans-version' }));
    expect(appVersion()).toBe('0.0.0');
  });
});
