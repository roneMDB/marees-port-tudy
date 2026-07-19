import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTides } from './readTides';

const tmpFiles: string[] = [];

function writeTmp(content: string): string {
  const file = path.join(os.tmpdir(), `readTides-${tmpFiles.length}-test.json`);
  fs.writeFileSync(file, content, 'utf-8');
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  while (tmpFiles.length) {
    const file = tmpFiles.pop()!;
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
});

describe('readTides', () => {
  it('flattens direct date keys and month-grouped sections', () => {
    const file = writeTmp(
      JSON.stringify({
        '2026-06-01': [{ maree: 'haute', heure: '05:59', hauteur: '4.59', coefficient: '71' }],
        septembre: {
          '2026-09-01': [{ maree: 'basse', heure: '00:02', hauteur: '1.50' }]
        }
      })
    );

    const data = readTides(file);

    expect(Object.keys(data).sort()).toEqual(['2026-06-01', '2026-09-01']);
    expect(data['2026-09-01'][0].maree).toBe('basse');
  });

  it('throws a clear error when the file is missing', () => {
    const missing = path.join(os.tmpdir(), 'does-not-exist-readTides.json');
    expect(() => readTides(missing)).toThrow(/Impossible de lire le fichier de marées/);
  });

  it('throws a clear error on invalid JSON', () => {
    const file = writeTmp('{ not valid json ');
    expect(() => readTides(file)).toThrow(/Fichier de marées invalide \(JSON non valide/);
  });

  it('throws when the JSON root is not an object', () => {
    const file = writeTmp('[]');
    expect(() => readTides(file)).toThrow(/objet JSON attendu/);
  });
});
