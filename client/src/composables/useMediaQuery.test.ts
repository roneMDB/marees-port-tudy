import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { useMediaQuery } from './useMediaQuery';

// Faux `MediaQueryList` dont on peut **déclencher** l'écouteur `change` — contrairement au stub de
// `NavTabs.test.ts` (`addEventListener: vi.fn()`, jamais appelé) : sans ça, supprimer l'abonnement
// et le désabonnement du composable laisse les tests au vert.
function stubMatchMedia(initialMatches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | undefined;
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listener = cb;
    }),
    removeEventListener: vi.fn()
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    mql,
    trigger(matches: boolean) {
      listener?.({ matches } as MediaQueryListEvent);
    }
  };
}

// Le composable n'appelle `onBeforeUnmount` que dans un contexte de composant : un composant hôte
// minimal le rend observable (valeur courante exposée) et démontable, ce qu'un appel nu ne
// permettrait pas (Vue avertirait, et le désabonnement ne serait pas testable).
function mountHost(query: string, fallback?: boolean) {
  let current: { value: boolean } | undefined;
  const wrapper = mount({
    setup() {
      const matches = fallback === undefined ? useMediaQuery(query) : useMediaQuery(query, fallback);
      current = matches;
      return () => h('i', String(matches.value));
    }
  });
  return { wrapper, get value() { return current!.value; } };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lit la valeur initiale sur matches', () => {
    stubMatchMedia(true);
    const { value } = mountHost('(min-width: 576px)');
    expect(value).toBe(true);
  });

  it('se met à jour quand l’événement change est émis', async () => {
    const { trigger } = stubMatchMedia(true);
    // Ne pas déstructurer `value` : c'est un accesseur, le déstructurer fige la valeur au moment
    // de l'appel au lieu de suivre les changements ultérieurs.
    const host = mountHost('(min-width: 576px)');
    expect(host.value).toBe(true);
    trigger(false);
    await host.wrapper.vm.$nextTick();
    expect(host.value).toBe(false);
  });

  it('se désabonne au démontage', () => {
    const { mql } = stubMatchMedia(true);
    const { wrapper } = mountHost('(min-width: 576px)');
    wrapper.unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('retombe sur le fallback quand matchMedia est absent, sans lever', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => mountHost('(min-width: 576px)', false)).not.toThrow();
    const { value } = mountHost('(min-width: 576px)', false);
    expect(value).toBe(false);
  });
});
