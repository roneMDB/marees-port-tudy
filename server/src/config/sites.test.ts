import { describe, expect, it } from 'vitest';
import { SITES, DEFAULT_SITE_ID, getSite } from './sites';

describe('sites registry', () => {
  it('contains Port-Tudy and Étel with distinct files', () => {
    const ids = SITES.map(s => s.id);
    expect(ids).toContain('port-tudy');
    expect(ids).toContain('etel');
    const files = SITES.map(s => s.filename);
    expect(new Set(files).size).toBe(files.length);
  });

  it('default site is Port-Tudy and resolvable', () => {
    expect(DEFAULT_SITE_ID).toBe('port-tudy');
    expect(getSite(DEFAULT_SITE_ID)).toBeDefined();
  });

  it('getSite resolves known ids and rejects unknown ones', () => {
    expect(getSite('etel')?.label).toBe('Étel');
    expect(getSite('nowhere')).toBeUndefined();
    expect(getSite(undefined)).toBeUndefined();
  });
});
