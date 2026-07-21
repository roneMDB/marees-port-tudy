import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Site } from '../types';

const getSitesMock = vi.fn<[], Promise<Site[]>>();

vi.mock('../api/tides', () => ({
  getSites: () => getSitesMock()
}));

/** Réimporte le composable avec un état singleton frais (module-level refs). */
async function freshUseSite() {
  vi.resetModules();
  return (await import('./useSite')).useSite;
}

describe('useSite', () => {
  beforeEach(() => {
    localStorage.clear();
    getSitesMock.mockReset();
    getSitesMock.mockResolvedValue([
      { id: 'port-tudy', label: 'Port-Tudy' },
      { id: 'etel', label: 'Étel' }
    ]);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to the reference site when nothing is stored', async () => {
    const useSite = await freshUseSite();
    const { siteId, isReference } = useSite();
    expect(siteId.value).toBe('port-tudy');
    expect(isReference.value).toBe(true);
  });

  it('reads the stored site on init', async () => {
    localStorage.setItem('marees-site', 'etel');
    const useSite = await freshUseSite();
    const { siteId, isReference } = useSite();
    expect(siteId.value).toBe('etel');
    expect(isReference.value).toBe(false);
  });

  it('hydrates the sites list and exposes the current site', async () => {
    localStorage.setItem('marees-site', 'etel');
    const useSite = await freshUseSite();
    const { load, sites, current } = useSite();
    await load();
    expect(sites.value).toHaveLength(2);
    expect(current.value).toEqual({ id: 'etel', label: 'Étel' });
  });

  it('falls back to the reference when the stored site becomes unknown', async () => {
    localStorage.setItem('marees-site', 'obsolete');
    const useSite = await freshUseSite();
    const { load, siteId } = useSite();
    await load();
    expect(siteId.value).toBe('port-tudy');
  });

  it('persists the selection to localStorage', async () => {
    const useSite = await freshUseSite();
    const { setSite } = useSite();
    setSite('etel');
    await Promise.resolve();
    expect(localStorage.getItem('marees-site')).toBe('etel');
  });

  it('keeps the fallback list when the network fails', async () => {
    getSitesMock.mockRejectedValue(new Error('offline'));
    const useSite = await freshUseSite();
    const { load, sites } = useSite();
    await load();
    expect(sites.value).toEqual([{ id: 'port-tudy', label: 'Port-Tudy' }]);
  });
});
