import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import {
  DEFAULT_SETTINGS,
  ensureSettings,
  readSettings,
  sanitizeSettings,
  writeSettings
} from './SettingsStore';

describe('sanitizeSettings', () => {
  it('falls back to defaults on an empty/invalid object', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range values', () => {
    const s = sanitizeSettings({
      rangeDays: 9999,
      aFlotDays: 0,
      coefDays: 999,
      navihan: { basseMer: -10, pleineMer: 5000, aFlot: 99 }
    });
    expect(s.rangeDays).toBe(365);
    expect(s.aFlotDays).toBe(1);
    expect(s.coefDays).toBe(90);
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

  it('defaults weatherLinks when absent, keeps an explicit empty list', () => {
    expect(sanitizeSettings({}).weatherLinks).toEqual(DEFAULT_SETTINGS.weatherLinks);
    expect(sanitizeSettings({ weatherLinks: [] }).weatherLinks).toEqual([]);
  });

  it('keeps valid weather links and drops invalid ones', () => {
    const s = sanitizeSettings({
      weatherLinks: [
        { label: 'Windy', url: 'https://www.windy.com/?{lat},{lon},9' },
        { label: '', url: 'https://valid.example' }, // libellé vide → écarté
        { label: 'Pas http', url: 'ftp://nope' }, // URL non http(s) → écartée
        { label: 'Sans url' }, // url absente → écartée
        { label: 'Ok', url: 'http://example.org' }
      ]
    });
    expect(s.weatherLinks).toEqual([
      { label: 'Windy', url: 'https://www.windy.com/?{lat},{lon},9' },
      { label: 'Ok', url: 'http://example.org' }
    ]);
  });

  it('caps the number of weather links at 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, url: `https://e${i}.example` }));
    expect(sanitizeSettings({ weatherLinks: many }).weatherLinks).toHaveLength(12);
  });
});

describe('read/write/ensure (base)', () => {
  it('reads defaults when no settings row exists', () => {
    const db = openDb(':memory:');
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);
    db.close();
  });

  it('round-trips a written config', () => {
    const db = openDb(':memory:');
    const saved = writeSettings({ startMode: 'date', startDate: '2026-09-10', rangeDays: 7 }, db);
    expect(saved.rangeDays).toBe(7);
    expect(readSettings(db)).toEqual(saved);
    db.close();
  });

  it('ensureSettings creates the row with defaults only if missing', () => {
    const db = openDb(':memory:');
    ensureSettings(db);
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS);

    writeSettings({ rangeDays: 5 }, db);
    ensureSettings(db); // ne doit pas écraser
    expect(readSettings(db).rangeDays).toBe(5);
    db.close();
  });
});
