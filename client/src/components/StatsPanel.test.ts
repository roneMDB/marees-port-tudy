import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import StatsPanel from './StatsPanel.vue';
import type { AccessStats } from '../types';

const getStatsMock = vi.fn();
vi.mock('../api/stats', () => ({
  getStats: (...args: unknown[]) => getStatsMock(...args)
}));

// Chart.js ne s'initialise pas dans jsdom (pas de contexte canvas) : le rendu du graphe lui-même
// n'est pas l'objet du test, seule compte la présence des blocs et le rechargement.
vi.mock('vue-chartjs', () => ({ Bar: { name: 'Bar', props: ['data', 'options'], template: '<div class="bar-chart" />' } }));

function statsFixture(overrides: Partial<AccessStats> = {}): AccessStats {
  return {
    total: 12,
    visits: 9,
    pageLoads: 2,
    logins: 1,
    uniqueVisitors: 3,
    lan: 7,
    external: 5,
    firstTs: '2026-08-01T08:00:00.000Z',
    lastTs: '2026-08-09T18:30:00.000Z',
    perDay: [{ date: '2026-08-09', count: 9 }],
    perHour: Array.from({ length: 24 }, (_, h) => (h === 8 ? 9 : 0)),
    perWeekday: [9, 0, 0, 0, 0, 0, 0],
    countries: [{ name: 'FR', count: 5 }],
    browsers: [{ name: 'Chrome', count: 9 }],
    devices: [{ name: 'Mobile', count: 9 }],
    users: [{ name: 'erwan', count: 9, lastTs: '2026-08-09T18:30:00.000Z' }],
    ...overrides
  };
}

/** Ouvre le panneau comme le fait Bootstrap (le composant écoute `show.bs.offcanvas`). */
async function open(wrapper: ReturnType<typeof mount>) {
  document.getElementById('statsOffcanvas')?.dispatchEvent(new Event('show.bs.offcanvas'));
  await flushPromises();
  return wrapper;
}

describe('StatsPanel', () => {
  beforeEach(() => {
    getStatsMock.mockReset();
    getStatsMock.mockResolvedValue(statsFixture());
  });

  it('charge 30 jours par défaut à l’ouverture', async () => {
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    expect(getStatsMock).toHaveBeenCalledWith(30);
    wrapper.unmount();
  });

  it('affiche visites, visiteurs uniques et le détail secondaire', async () => {
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    const text = wrapper.text();
    expect(text).toContain('Visites');
    expect(text).toContain('Visiteurs');
    // Chargements de page et connexions restent visibles, mais comme diagnostic.
    expect(text).toContain('2 chargements de page');
    expect(text).toContain('1 connexion');
    wrapper.unmount();
  });

  it('affiche les visites par utilisateur avec la dernière visite', async () => {
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    expect(wrapper.text()).toContain('erwan');
    expect(wrapper.text()).toContain('dernière :');
    wrapper.unmount();
  });

  it('rend les trois histogrammes quand il y a des visites', async () => {
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    expect(wrapper.text()).toContain('Heure de la journée');
    expect(wrapper.text()).toContain('Jour de la semaine');
    expect(wrapper.findAll('.bar-chart')).toHaveLength(3);
    wrapper.unmount();
  });

  it('recharge avec la nouvelle période au clic', async () => {
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);
    getStatsMock.mockClear();

    const seven = wrapper.findAll('.btn-group button').find(b => b.text() === '7 j');
    await seven!.trigger('click');
    await flushPromises();

    expect(getStatsMock).toHaveBeenCalledWith(7);
    wrapper.unmount();
  });

  it('n’affiche pas les graphes sans visite sur la période', async () => {
    getStatsMock.mockResolvedValue(statsFixture({ visits: 0, perDay: [], users: [] }));
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    expect(wrapper.text()).toContain('Aucune visite enregistrée sur cette période.');
    expect(wrapper.findAll('.bar-chart')).toHaveLength(0);
    wrapper.unmount();
  });

  it('affiche l’erreur de l’API sans casser le panneau', async () => {
    getStatsMock.mockRejectedValue(new Error('Statistiques réservées au rôle administrateur.'));
    const wrapper = mount(StatsPanel, { attachTo: document.body });
    await open(wrapper);

    expect(wrapper.text()).toContain('Statistiques réservées au rôle administrateur.');
    wrapper.unmount();
  });
});
