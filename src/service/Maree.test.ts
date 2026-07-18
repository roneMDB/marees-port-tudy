import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Maree from './Maree';

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
};

describe('Maree service', () => {
  let maree: Maree;

  beforeEach(() => {
    vi.clearAllMocks();
    maree = new Maree(fakeLogger as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should format Navihan time with offset and wrap over midnight', () => {
    const formatted = (maree as any).formatNavihanTime('23:15', 2.5);
    expect(formatted).toBe('01:45');
  });

  it('should load tide extremes for the requested days from the resource file', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-06-10T12:00:00'));

    const tideData = await maree.getTides(3);

    expect(tideData.siteId).toBe('ile-de-groix-port-tudy');
    expect(tideData.timezone).toBe('Europe/Paris');
    expect(Object.keys(tideData.days)).toEqual(['2026-06-10', '2026-06-11', '2026-06-12']);

    const firstDay = tideData.days['2026-06-10'];
    expect(firstDay.length).toBeGreaterThan(0);

    // Les extrêmes sont triés par heure et typés haute/basse.
    const times = firstDay.map(e => e.time);
    expect([...times].sort()).toEqual(times);
    expect(firstDay.every(e => e.type === 'high' || e.type === 'low')).toBe(true);

    // Une pleine mer porte un coefficient et une heure Navihan "Pleine mer".
    const high = firstDay.find(e => e.type === 'high');
    expect(high?.coefficient).toBeTypeOf('number');
    expect(high?.navihan['Pleine mer']).toBeDefined();

    // Une basse mer porte les heures Navihan "Basse mer" et "A flot".
    const low = firstDay.find(e => e.type === 'low');
    expect(low?.navihan['Basse mer']).toBeDefined();
    expect(low?.navihan['A flot']).toBeDefined();
  });

  it('should format text output as a grouped table for tide data', () => {
    const tideData = {
      siteId: 'test-site',
      timezone: 'Europe/Paris',
      from: '2026-06-01',
      to: '2026-06-02',
      days: {
        '2026-06-01': [
          { time: '03:00', height: 1.23, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:20' } },
          { time: '09:00', height: 0.95, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:20', 'A flot': '11:50' } }
        ]
      }
    };

    const formatted = maree.formatTextOutput(tideData as any);
    const plain = formatted.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');

    expect(plain).toContain('✅ Marées test-site');
    expect(plain).toContain('Port Tudy');
    expect(plain).toContain('Navihan');
    expect(plain).toContain('Pleine Mer');
    expect(plain).toContain('03:00');
    expect(plain).toContain('1.23m');
    expect(plain).toContain('04:20');
    expect(plain).toContain('Basse Mer');
    expect(plain).toContain('10:20');
    expect(plain).toContain('11:50');
  });

  it('should format markdown output with headers and table rows', () => {
    const tideData = {
      siteId: 'test-site',
      timezone: 'Europe/Paris',
      from: '2026-06-01',
      to: '2026-06-02',
      days: {
        '2026-06-01': [
          { time: '03:00', height: 1.23, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:20' } },
          { time: '09:00', height: 0.95, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:20', 'A flot': '11:50' } }
        ]
      }
    };

    const formatted = maree.formatMarkdownOutput(tideData as any);

    expect(formatted).toContain('# Marées test-site');
    expect(formatted).toContain('**Période** : 2026-06-01 - 2026-06-02');
    expect(formatted).toContain('## lundi');
    expect(formatted).toContain('| Coef | Type | Hauteur | Port Tudy | Navihan | A flot |');
    expect(formatted).toContain('| 71 | Pleine Mer | 1.23m | 03:00 | 04:20 | — |');
    expect(formatted).toContain('| — | Basse Mer | 0.95m | 09:00 | 10:20 | 11:50 |');
  });

  const sampleTideData = {
    siteId: 'test-site',
    timezone: 'Europe/Paris',
    from: '2026-06-01',
    to: '2026-06-02',
    days: {
      '2026-06-01': [
        { time: '03:00', height: 1.23, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:20' } },
        { time: '09:00', height: 0.95, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:20', 'A flot': '11:50' } }
      ]
    }
  };

  it('should format print output as a plain table with default columns and no ANSI codes', () => {
    const formatted = maree.formatPrintOutput(sampleTideData as any);

    // Aucune séquence d'échappement ANSI (impression / copier-coller propre).
    expect(formatted).not.toMatch(/\x1B\[/);

    // Colonnes par défaut du format print.
    expect(formatted).toContain('Basse mer');
    expect(formatted).toContain('Pleine mer');
    expect(formatted).toContain('A flot');
    expect(formatted).toContain('Coef');
    // Colonnes hors défaut absentes.
    expect(formatted).not.toContain('Hauteur');
    expect(formatted).not.toContain('Port Tudy');

    // Valeurs Navihan : pleine mer (haute), basse mer + à flot (basse), coef sur la haute.
    expect(formatted).toContain('04:20');
    expect(formatted).toContain('10:20');
    expect(formatted).toContain('11:50');
    expect(formatted).toContain('71');
  });

  it('should honour a custom column selection in markdown output', () => {
    const formatted = maree.formatMarkdownOutput(sampleTideData as any, ['coef', 'a-flot']);

    expect(formatted).toContain('| Coef | A flot |');
    expect(formatted).toContain('| --- | --- |');
    expect(formatted).toContain('| 71 | — |');
    expect(formatted).toContain('| — | 11:50 |');
    // Les colonnes non demandées disparaissent.
    expect(formatted).not.toContain('Pleine Mer');
  });

  it('should throw a clear error on an unknown column key', () => {
    expect(() => maree.formatPrintOutput(sampleTideData as any, ['bidon']))
      .toThrow(/Colonne inconnue "bidon"/);
  });

  it('should format a self-contained, printable HTML document', () => {
    const html = maree.formatHtmlOutput(sampleTideData as any);

    // Document autonome (pas de ressource externe).
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/https?:\/\//); // aucune URL distante
    expect(html).toContain('@media print');

    // Contenu : titre, période, en-têtes de colonnes par défaut, un jour, données.
    expect(html).toContain('Marées test-site');
    expect(html).toContain('Du 2026-06-01 au 2026-06-02');
    expect(html).toContain('<th class="col-coef">Coef</th>');
    expect(html).toContain('<th class="col-a-flot">A flot</th>');
    expect(html).toContain('<h2>lundi'); // formatDayLabel
    expect(html).toContain('<tr class="tide-high">');
    expect(html).toContain('<tr class="tide-low">');
    expect(html).toContain('<td class="col-navihan">04:20</td>');
    expect(html).toContain('<td class="col-a-flot">11:50</td>');
  });

  it('should honour a custom column selection in HTML output', () => {
    const html = maree.formatHtmlOutput(sampleTideData as any, ['basse-mer', 'a-flot']);

    expect(html).toContain('<th class="col-basse-mer">Basse mer</th>');
    expect(html).toContain('<th class="col-a-flot">A flot</th>');
    // Colonnes non demandées : pas d'en-tête (les sélecteurs CSS `.col-*` restent, eux).
    expect(html).not.toContain('<th class="col-coef">');
    expect(html).not.toContain('<th class="col-hauteur">');
  });
});
