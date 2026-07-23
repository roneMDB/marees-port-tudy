import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// DATA_DIR isolé, fixé avant tout import de la couche data (const lue à l'import).
const dataDir = path.join(os.tmpdir(), `marees-bootstrap-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

describe('initStorage', () => {
  it('seeds tides for every site and default settings on an empty store', async () => {
    const { openDb } = await import('./index');
    const { initStorage } = await import('./bootstrap');
    const { countTides } = await import('./tidesRepository');
    const { readSettings, DEFAULT_SETTINGS } = await import('../service/SettingsStore');

    const db = openDb(':memory:');
    initStorage(undefined, db);
    expect(countTides(db, 'port-tudy')).toBeGreaterThan(0);
    expect(countTides(db, 'etel')).toBeGreaterThan(0);
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);
    db.close();
  });

  it('imports a legacy settings.json once', async () => {
    const { openDb } = await import('./index');
    const { initStorage } = await import('./bootstrap');
    const { readSettings } = await import('../service/SettingsStore');

    fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ rangeDays: 12 }));
    const db = openDb(':memory:');
    initStorage(undefined, db);
    expect(readSettings(db).rangeDays).toBe(12);
    db.close();
  });

  it('is idempotent (does not re-seed when data already exists)', async () => {
    const { openDb } = await import('./index');
    const { initStorage } = await import('./bootstrap');
    const { countTides } = await import('./tidesRepository');

    const db = openDb(':memory:');
    initStorage(undefined, db);
    const before = countTides(db);
    initStorage(undefined, db);
    expect(countTides(db)).toBe(before);
    db.close();
  });
});
