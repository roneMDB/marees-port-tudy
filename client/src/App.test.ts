import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

// Rôle pilotable pour vérifier le gating des fonctions admin.
const isAdmin = ref(false);
const mustChangePassword = ref(false);

vi.mock('./composables/useAuth', () => ({
  useAuth: () => ({
    authRequired: ref(true),
    authenticated: ref(true),
    isAdmin,
    user: ref({ id: 1, login: 'admin', mustChangePassword: false }),
    mustChangePassword,
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
    global: { stubs: { Dashboard: true, StatsPanel: true, TidesImportPanel: true, UsersPanel: true, LoginScreen: true, ForcePasswordChange: true } }
  });
}

const SETTINGS_BTN = '[aria-label="Réglages"]';
const STATS_BTN = '[aria-label="Statistiques d\'accès"]';
const USERS_BTN = '[aria-label="Utilisateurs"]';

describe('App — gating des fonctions admin', () => {
  afterEach(() => {
    isAdmin.value = false;
    mustChangePassword.value = false;
  });

  it('masque Réglages, Stats & Utilisateurs pour un lecteur', async () => {
    isAdmin.value = false;
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find(SETTINGS_BTN).exists()).toBe(false);
    expect(wrapper.find(STATS_BTN).exists()).toBe(false);
    expect(wrapper.find(USERS_BTN).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'StatsPanel' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'UsersPanel' }).exists()).toBe(false);
  });

  it('affiche Réglages, Stats & Utilisateurs pour un admin', async () => {
    isAdmin.value = true;
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find(SETTINGS_BTN).exists()).toBe(true);
    expect(wrapper.find(STATS_BTN).exists()).toBe(true);
    expect(wrapper.find(USERS_BTN).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'UsersPanel' }).exists()).toBe(true);
  });

  it('affiche la version en pied de page, sans requête réseau', async () => {
    // Injectée au build (define Vite) et non lue depuis /api/health : elle doit donc rester
    // visible hors-ligne. On vérifie le format, la valeur changeant à chaque release (issue #12).
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('footer').text()).toMatch(/Marées Navihan\s+v\d+\.\d+\.\d+/);
  });

  it('affiche un lien vers le dépôt GitHub en pied de page (#15)', async () => {
    const wrapper = mountApp();
    await flushPromises();
    const link = wrapper.find('footer a');
    expect(link.attributes('href')).toBe('https://github.com/roneMDB/marees-port-tudy');
    // Ouverture externe depuis une PWA : nouvel onglet, et pas d'accès à window.opener.
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener');
    expect(link.text()).toContain('GitHub');
  });

  it('affiche l’écran de changement de mot de passe forcé', async () => {
    mustChangePassword.value = true;
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.findComponent({ name: 'ForcePasswordChange' }).exists()).toBe(true);
    // Le dashboard n'est pas monté tant que le changement n'est pas fait.
    expect(wrapper.findComponent({ name: 'Dashboard' }).exists()).toBe(false);
  });
});
