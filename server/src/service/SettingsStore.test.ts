import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_SETTINGS,
  ensureSettingsFile,
  readSettings,
  sanitizeSettings,
  writeSettings
} from './SettingsStore';

const tmpFiles: string[] = [];
function tmpFile(): string {
  const f = path.join(os.tmpdir(), `settings-test-${tmpFiles.length}-${process.pid}.json`);
  tmpFiles.push(f);
  return f;
}

afterEach(() => {
  while (tmpFiles.length) {
    try {
      fs.unlinkSync(tmpFiles.pop()!);
    } catch {
      /* ignore */
    }
  }
});

describe('sanitizeSettings', () => {
  it('falls back to defaults on an empty/invalid object', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range values', () => {
    const s = sanitizeSettings({
      rangeDays: 9999,
      aFlotDays: 0,
      navihan: { basseMer: -10, pleineMer: 5000, aFlot: 99 }
    });
    expect(s.rangeDays).toBe(365);
    expect(s.aFlotDays).toBe(1);
    expect(s.navihan).toEqual({ basseMer: 0, pleineMer: 1439, aFlot: 99 });
  });

  it('normalises the start fields', () => {
    expect(sanitizeSettings({ startMode: 'date', startDate: '2026-08-01' })).toMatchObject({
      startMode: 'date',
      startDate: '2026-08-01'
    });
    // startDate ignoré hors mode date, et format invalide → null
    expect(sanitizeSettings({ startMode: 'today', startDate: '2026-08-01' }).startDate).toBeNull();
    expect(sanitizeSettings({ startMode: 'date', startDate: 'nope' }).startDate).toBeNull();
    expect(sanitizeSettings({ startMode: 'bogus' }).startMode).toBe('today');
  });
});

describe('read/write/ensure', () => {
  it('reads defaults when the file is missing', () => {
    expect(readSettings(path.join(os.tmpdir(), 'does-not-exist-xyz.json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a written config', () => {
    const file = tmpFile();
    const saved = writeSettings({ startMode: 'date', startDate: '2026-09-10', rangeDays: 7 }, file);
    expect(saved.rangeDays).toBe(7);
    expect(readSettings(file)).toEqual(saved);
  });

  it('ensureSettingsFile creates the file with defaults only if missing', () => {
    const file = tmpFile();
    ensureSettingsFile(file);
    expect(fs.existsSync(file)).toBe(true);
    expect(readSettings(file)).toEqual(DEFAULT_SETTINGS);

    writeSettings({ rangeDays: 5 }, file);
    ensureSettingsFile(file); // ne doit pas écraser
    expect(readSettings(file).rangeDays).toBe(5);
  });
});
