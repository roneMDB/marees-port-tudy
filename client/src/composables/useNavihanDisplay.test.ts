import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'marees-navihan-display';

/** Réimporte le composable avec un état singleton frais (module-level refs). */
async function freshUseNavihanDisplay() {
  vi.resetModules();
  return (await import('./useNavihanDisplay')).useNavihanDisplay;
}

describe('useNavihanDisplay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to all three types visible when nothing is stored', async () => {
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { visible } = useNavihanDisplay();
    expect(visible).toEqual({ bm: true, flot: true, pm: true });
  });

  it('reads a stored selection on init', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bm: false, flot: true, pm: false }));
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { visible } = useNavihanDisplay();
    expect(visible).toEqual({ bm: false, flot: true, pm: false });
  });

  it('toggle flips a single type', async () => {
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { visible, toggle } = useNavihanDisplay();
    toggle('pm');
    expect(visible.pm).toBe(false);
    toggle('pm');
    expect(visible.pm).toBe(true);
  });

  it('persists the selection to localStorage', async () => {
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { toggle } = useNavihanDisplay();
    toggle('bm');
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ bm: false, flot: true, pm: true });
  });

  it('completes a partial stored object with defaults (true)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bm: false }));
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { visible } = useNavihanDisplay();
    expect(visible).toEqual({ bm: false, flot: true, pm: true });
  });

  it('falls back to defaults on invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const useNavihanDisplay = await freshUseNavihanDisplay();
    const { visible } = useNavihanDisplay();
    expect(visible).toEqual({ bm: true, flot: true, pm: true });
  });
});
