import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNowForTests, useNow } from './useNow';

/** Force l'état de visibilité que jsdom rapporte (`visible` par défaut). */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T08:00:00'));
    setVisibility('visible');
    resetNowForTests();
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('part de l’instant courant', () => {
    expect(useNow().now.value.getTime()).toBe(new Date('2026-07-26T08:00:00').getTime());
  });

  // C'est tout l'intérêt du partage : la carte et le panneau doivent lire le **même** instant.
  it('est un singleton : deux appelants partagent la même référence', () => {
    const a = useNow();
    const b = useNow();
    expect(a.now).toBe(b.now);

    vi.setSystemTime(new Date('2026-07-26T16:00:00'));
    a.refresh();
    expect(b.now.value.getTime()).toBe(new Date('2026-07-26T16:00:00').getTime());
  });

  it('se rafraîchit au retour au premier plan', () => {
    const { now } = useNow();
    vi.setSystemTime(new Date('2026-07-26T16:00:00'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(now.value.getTime()).toBe(new Date('2026-07-26T16:00:00').getTime());
  });

  // Passer en arrière-plan n'est pas un retour : rafraîchir là n'apporterait rien, et le ferait
  // sur un onglet que personne ne regarde.
  it('ignore le passage en arrière-plan', () => {
    const { now } = useNow();
    setVisibility('hidden');
    vi.setSystemTime(new Date('2026-07-26T16:00:00'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(now.value.getTime()).toBe(new Date('2026-07-26T08:00:00').getTime());
  });

  it('ne pose qu’un seul écouteur, quel que soit le nombre d’appelants', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    useNow();
    useNow();
    useNow();
    expect(spy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1);
    spy.mockRestore();
  });
});
