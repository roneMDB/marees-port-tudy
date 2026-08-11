import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const getTripsMock = vi.fn();
const createTripMock = vi.fn();
const deleteTripMock = vi.fn();
const getRefsMock = vi.fn();
const getTidesMock = vi.fn();
const getObservationsMock = vi.fn();

vi.mock('../api/fishing', () => ({
  getTrips: (...a: unknown[]) => getTripsMock(...a),
  createTrip: (...a: unknown[]) => createTripMock(...a),
  updateTrip: vi.fn(),
  deleteTrip: (...a: unknown[]) => deleteTripMock(...a),
  getRefs: (...a: unknown[]) => getRefsMock(...a),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
}));

vi.mock('../api/tides', () => ({
  getTides: (...a: unknown[]) => getTidesMock(...a),
  getMeta: vi.fn(),
  getSites: vi.fn(),
  fetchJson: vi.fn()
}));

vi.mock('../api/aflotObservations', () => ({
  getObservations: (...a: unknown[]) => getObservationsMock(...a),
  saveObservation: vi.fn(),
  deleteObservation: vi.fn()
}));

// Rôle pilotable test par test. La ref est créée **dans la factory** (les factories `vi.mock` sont
// hissées au-dessus des imports du fichier, `ref` n'y est pas encore disponible autrement) puis
// récupérée via `useAuth()` lui-même. Une simple `{ value: … }` ne suffirait pas : le template
// n'unwrappe que les vraies refs, et l'objet serait toujours truthy.
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue');
  const isAdmin = ref(true);
  return { useAuth: () => ({ isAdmin }) };
});

import type { Ref } from 'vue';
import FishingView from './FishingView.vue';
import { useAuth } from '../composables/useAuth';
import { resetFishingForTests } from '../composables/useFishing';
import { resetFishingRefsForTests } from '../composables/useFishingRefs';

/**
 * `isAdmin` est un `computed` (donc en lecture seule) dans le vrai composable, dont TypeScript
 * garde les types malgré le mock. Le cast est cantonné ici : c'est la ref pilotable de la factory
 * ci-dessus que l'on écrit, pas le composable de production.
 */
const isAdminRef = () => useAuth().isAdmin as unknown as Ref<boolean>;

const REFS = [
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' }
];

const TRIP = {
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: null,
  notes: null,
  weather: null,
  catches: [
    { speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }
  ],
  createdAt: 'x',
  updatedAt: 'x'
};

const TIDES = {
  siteId: 'port-tudy',
  timezone: 'Europe/Paris',
  from: '2026-08-03',
  to: '2026-08-17',
  days: {
    '2026-08-10': [
      { time: '07:10', height: 1.8, type: 'low', navihan: {}, coefficient: null },
      { time: '13:20', height: 5.1, type: 'high', navihan: {}, coefficient: 84 },
      { time: '19:42', height: 1.7, type: 'low', navihan: {}, coefficient: null }
    ]
  }
};

describe('FishingView', () => {
  beforeEach(() => {
    // Ne feindre que `Date` : feindre les timers ferait boucler `flushPromises`.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T18:00:00'));
    isAdminRef().value = true;
    [
      getTripsMock,
      createTripMock,
      deleteTripMock,
      getRefsMock,
      getTidesMock,
      getObservationsMock
    ].forEach(m => m.mockReset());
    getRefsMock.mockResolvedValue(REFS);
    getTidesMock.mockResolvedValue(TIDES);
    getObservationsMock.mockResolvedValue([]);
    resetFishingForTests();
    resetFishingRefsForTests();
  });

  it('affiche les sorties chargées', async () => {
    getTripsMock.mockResolvedValue([TRIP]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('1 bar 42 cm');
  });

  it('affiche un état vide explicite', async () => {
    getTripsMock.mockResolvedValue([]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('Aucune sortie');
  });

  it('affiche l’erreur de chargement', async () => {
    getTripsMock.mockRejectedValue(new Error('serveur muet'));
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('serveur muet');
  });

  it('ouvre le formulaire sur « Nouvelle sortie » et l’envoie', async () => {
    getTripsMock.mockResolvedValue([]);
    createTripMock.mockResolvedValue(TRIP);
    const wrapper = mount(FishingView);
    await flushPromises();

    await wrapper.find('[data-test="new-trip"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(createTripMock).toHaveBeenCalledOnce();
    // Le formulaire se referme sur un enregistrement réussi.
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('garde le formulaire ouvert et affiche l’erreur si l’enregistrement échoue', async () => {
    getTripsMock.mockResolvedValue([]);
    createTripMock.mockRejectedValue(new Error('403 interdit'));
    const wrapper = mount(FishingView);
    await flushPromises();

    await wrapper.find('[data-test="new-trip"]').trigger('click');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('403 interdit');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('masque « Nouvelle sortie » hors admin', async () => {
    isAdminRef().value = false;
    getTripsMock.mockResolvedValue([]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.find('[data-test="new-trip"]').exists()).toBe(false);
  });

  it('charge les marées Port-Tudy sur une plage couvrant sorties et fenêtre de saisie', async () => {
    getTripsMock.mockResolvedValue([TRIP]);
    mount(FishingView);
    await flushPromises();
    expect(getTidesMock).toHaveBeenCalledWith('2026-08-03', '2026-08-17', 'port-tudy');
  });

  it('étend la plage de marées à une sortie plus ancienne que la fenêtre', async () => {
    getTripsMock.mockResolvedValue([{ ...TRIP, date: '2026-06-15' }]);
    mount(FishingView);
    await flushPromises();
    expect(getTidesMock).toHaveBeenCalledWith('2026-06-15', '2026-08-17', 'port-tudy');
  });

  it('affiche les sorties même quand les horaires sont indisponibles', async () => {
    getTripsMock.mockResolvedValue([TRIP]);
    getTidesMock.mockRejectedValue(new Error('horaires hors ligne'));
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('1 bar 42 cm');
    expect(wrapper.text()).toContain('marée inconnue');
  });
});
