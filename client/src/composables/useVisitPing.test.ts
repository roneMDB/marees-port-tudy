import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetVisitPingForTests, useVisitPing } from './useVisitPing';

const pingVisit = vi.fn(() => Promise.resolve());
vi.mock('../api/stats', () => ({ pingVisit: () => pingVisit() }));

const HALF_HOUR = 30 * 60 * 1000;

beforeEach(() => {
  pingVisit.mockClear();
  resetVisitPingForTests();
});

describe('useVisitPing', () => {
  it('émet une seule balise par démarrage, même appelé depuis plusieurs endroits', () => {
    useVisitPing().start();
    useVisitPing().start();
    expect(pingVisit).toHaveBeenCalledTimes(1);
  });

  it('ne compte pas une reprise immédiate comme une nouvelle visite', () => {
    const { ping } = useVisitPing();
    ping(1_000_000);
    ping(1_000_000 + HALF_HOUR - 1);
    expect(pingVisit).toHaveBeenCalledTimes(1);
  });

  it('compte une reprise après 30 min comme une nouvelle visite', () => {
    const { ping } = useVisitPing();
    ping(1_000_000);
    ping(1_000_000 + HALF_HOUR);
    expect(pingVisit).toHaveBeenCalledTimes(2);
  });

  it('rebalise quand l’onglet redevient visible après une longue pause', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T10:00:00Z'));
    useVisitPing().start();
    expect(pingVisit).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-08-09T11:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    // jsdom rapporte `visible` par défaut.
    expect(pingVisit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('reste silencieux si la balise échoue (hors-ligne)', () => {
    pingVisit.mockRejectedValueOnce(new Error('offline'));
    expect(() => useVisitPing().start()).not.toThrow();
  });
});
