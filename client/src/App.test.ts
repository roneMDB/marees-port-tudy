import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

// Rôle pilotable pour vérifier le gating des fonctions admin.
const isAdmin = ref(false);

vi.mock('./composables/useAuth', () => ({
  useAuth: () => ({
    authRequired: ref(true),
    authenticated: ref(true),
    isAdmin,
    checking: ref(false),
    checkStatus: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn()
  })
}));

// Évite tout appel réseau (useSite.load).
vi.mock('./composables/useSite', () => ({
  useSite: () => ({ sites: ref([]), siteId: ref('port-tudy'), load: vi.fn().mockResolvedValue(undefined) })
}));

import App from './App.vue';

function mountApp() {
  return mount(App, {
    global: { stubs: { Dashboard: true, StatsPanel: true, LoginScreen: true } }
  });
}

const SETTINGS_BTN = '[aria-label="Réglages & filtres"]';
const STATS_BTN = '[aria-label="Statistiques d\'accès"]';

describe('App — gating des fonctions admin', () => {
  afterEach(() => {
    isAdmin.value = false;
  });

  it('masque Réglages & Stats pour un viewer', async () => {
    isAdmin.value = false;
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find(SETTINGS_BTN).exists()).toBe(false);
    expect(wrapper.find(STATS_BTN).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'StatsPanel' }).exists()).toBe(false);
  });

  it('affiche Réglages & Stats pour un admin', async () => {
    isAdmin.value = true;
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find(SETTINGS_BTN).exists()).toBe(true);
    expect(wrapper.find(STATS_BTN).exists()).toBe(true);
  });
});
