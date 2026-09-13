import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import NavTabs from './NavTabs.vue';

// ⚠️ jsdom n'implémente pas `matchMedia` : sans cette simulation, le composant retombe sur son
// fallback et la variante mobile n'est JAMAIS testée. C'est le coût du pilotage par JS.
function stubMatchMedia(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: { template: '<div/>' } },
    { path: '/peche', name: 'fishing', component: { template: '<div/>' } }
  ]
});

async function mountAt(path: string, wide: boolean) {
  stubMatchMedia(wide);
  await router.push(path);
  await router.isReady();
  return mount(NavTabs, { global: { plugins: [router] } });
}

describe('NavTabs — rendu piloté par JS', () => {
  // Corps en bloc, et non en expression : une fonction fléchée à corps d'expression renverrait le
  // `VitestUtils` de `unstubAllGlobals`, que Vitest prendrait pour une fonction de nettoyage.
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('≥ sm : rend le groupe segmenté, pas la barre du bas', async () => {
    const w = await mountAt('/', true);
    expect(w.find('.nav-tabs-inline').exists()).toBe(true);
    expect(w.find('.nav-tabs-bar').exists()).toBe(false);
  });

  it('< sm : rend la barre du bas, pas le groupe segmenté', async () => {
    const w = await mountAt('/', false);
    expect(w.find('.nav-tabs-bar').exists()).toBe(true);
    expect(w.find('.nav-tabs-inline').exists()).toBe(false);
  });

  it('affiche toujours les deux pages, libellées', async () => {
    for (const wide of [true, false]) {
      const w = await mountAt('/', wide);
      expect(w.text()).toContain('Marées');
      expect(w.text()).toContain('Pêche');
    }
  });

  it('marque la page courante avec aria-current, et elle seule', async () => {
    for (const wide of [true, false]) {
      const w = await mountAt('/peche', wide);
      const current = w.findAll('[aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0].text()).toContain('Pêche');
    }
  });

  it('pointe vers les bonnes destinations, dans les deux variantes', async () => {
    // Sans cette assertion, un `to` figé sur une seule page laisse les autres tests au vert :
    // ils ne regardent que les classes, le texte et `aria-current`, jamais le lien lui-même.
    for (const wide of [true, false]) {
      const w = await mountAt('/', wide);
      expect(w.findAll('a').map(a => a.attributes('href'))).toEqual(['/', '/peche']);
    }
  });
});
