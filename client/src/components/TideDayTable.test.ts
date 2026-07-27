import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TideDayTable from './TideDayTable.vue';
import { useNavihanDisplay } from '../composables/useNavihanDisplay';
import type { FlatTide } from '../types';

// Contrôle de l'admin (saisie) et espions sur l'enregistrement des observations.
const authState = vi.hoisted(() => ({ admin: false }));
const obs = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));

vi.mock('../composables/useAuth', async () => {
  const { computed } = await import('vue');
  return { useAuth: () => ({ isAdmin: computed(() => authState.admin) }) };
});

vi.mock('../composables/useAflotObservations', () => ({
  useAflotObservations: () => ({
    save: obs.save,
    remove: obs.remove,
    load: vi.fn().mockResolvedValue(undefined),
    get: () => null,
    map: {}
  })
}));

const tides: FlatTide[] = [
  {
    date: '2026-07-22', time: '07:10', height: 4.44, type: 'high', coefficient: 71,
    navihan: { 'Pleine mer': '08:25' }
  },
  {
    date: '2026-07-22', time: '19:18', height: 4.64, type: 'high', coefficient: 69,
    navihan: { 'Pleine mer': '20:33' }
  },
  {
    date: '2026-07-22', time: '01:39', height: 1.75, type: 'low', coefficient: null,
    navihan: { 'Basse mer': '02:54', 'A flot': '04:19' }
  },
  {
    date: '2026-07-22', time: '13:47', height: 1.83, type: 'low', coefficient: null,
    navihan: { 'Basse mer': '15:02', 'A flot': '16:27' }
  },
  {
    date: '2026-07-23', time: '12:28', height: 3.82, type: 'high', coefficient: 35,
    navihan: { 'Pleine mer': '13:43' }
  },
  {
    date: '2026-07-23', time: '06:22', height: 1.93, type: 'low', coefficient: null,
    navihan: { 'Basse mer': '07:37', 'A flot': '09:02' }
  }
];

describe('TideDayTable', () => {
  // Le choix d'affichage Navihan est un singleton : on repart de « tout visible » à chaque cas.
  beforeEach(() => {
    const { visible } = useNavihanDisplay();
    visible.bm = true;
    visible.flot = true;
    visible.flotEst = true;
    visible.flotObs = true;
    visible.pm = true;
    authState.admin = false;
    obs.save.mockClear();
    obs.remove.mockClear();
  });

  // Une basse mer « éditable » : appariée à Port-Tudy (refDate/refTime) avec estimation.
  const editable: FlatTide[] = [
    {
      date: '2026-07-25', time: '08:22', height: 1.6, type: 'low', coefficient: null,
      navihan: { 'Basse mer': '09:37', 'A flot': '11:02' },
      refDate: '2026-07-25', refTime: '08:22', aflotEstimate: '11:13', aflotObserved: null
    },
    {
      date: '2026-07-25', time: '14:30', height: 4.9, type: 'high', coefficient: 60,
      navihan: { 'Pleine mer': '15:45' }
    }
  ];

  it('renders one row per day with inline height and coef', () => {
    const wrapper = mount(TideDayTable, { props: { tides, siteLabel: 'Port-Tudy' } });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2); // 2 jours (pas 6 marées)

    const text = wrapper.text();
    expect(text).toContain('07:10');
    expect(text).toContain('4.44 m'); // hauteur inline
    expect(text).toContain('71'); // coef du jour = max(71, 69)
    expect(wrapper.find('thead').text()).toContain('Port-Tudy');
  });

  it('shows the day coefficient as the max of the day highs', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const firstRow = wrapper.findAll('tbody tr')[0].text();
    expect(firstRow).toContain('71');
    expect(firstRow).not.toContain('69'); // seul le max est affiché
  });

  it('renders the Navihan column with basse mer, à flot and pleine mer times', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    expect(wrapper.find('thead').text()).toContain('Navihan');

    const firstRow = wrapper.findAll('tbody tr')[0].text();
    // Basse mer (BM)
    expect(firstRow).toContain('02:54');
    expect(firstRow).toContain('15:02');
    // À flot (Flot)
    expect(firstRow).toContain('04:19');
    expect(firstRow).toContain('16:27');
    // Pleine mer (PM)
    expect(firstRow).toContain('08:25');
    expect(firstRow).toContain('20:33');
  });

  it('orders all Navihan times chronologically (ascending)', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const firstRow = wrapper.findAll('tbody tr')[0].text();
    const order = ['02:54', '04:19', '08:25', '15:02', '16:27', '20:33'];
    const positions = order.map(t => firstRow.indexOf(t));
    expect(positions.every(p => p >= 0)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('marks each Navihan pill with a type icon', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    expect(wrapper.find('tbody .bi-arrow-down').exists()).toBe(true); // basse mer
    expect(wrapper.find('tbody .bi-check-circle').exists()).toBe(true); // remise à flot
    expect(wrapper.find('tbody .bi-arrow-up').exists()).toBe(true); // pleine mer
  });

  it('shows a legend defining BM / Flot / PM', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const text = wrapper.text();
    expect(text).toContain('Basse mer');
    expect(text).toContain('Pleine mer');
    // « à flot » / remise à flot expliqué dans la légende
    expect(text.toLowerCase()).toContain('flot');
  });

  it('renders a day that lacks tides of a kind (e.g. a single high)', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const day23 = wrapper.findAll('tbody tr')[1].text();
    expect(day23).toContain('12:28'); // sa pleine mer (site)
    expect(day23).toContain('09:02'); // à flot Navihan
    expect(day23).toContain('13:43'); // pleine mer Navihan
  });

  it('shows an empty state when there are no tides', () => {
    const wrapper = mount(TideDayTable, { props: { tides: [] } });
    expect(wrapper.text()).toContain('Aucune marée');
  });

  it('renders the legend as five toggle buttons (aria-pressed)', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const buttons = wrapper.findAll('.navihan-legend button');
    expect(buttons).toHaveLength(5); // bm, flot (fixe), estimation, constaté, pm
    expect(buttons.every(b => b.attributes('aria-pressed') === 'true')).toBe(true);
  });

  it('hides a Navihan type when it is toggled off', () => {
    useNavihanDisplay().visible.pm = false;
    const wrapper = mount(TideDayTable, { props: { tides } });
    const firstRow = wrapper.findAll('tbody tr')[0].text();
    expect(firstRow).not.toContain('08:25'); // pleine mer Navihan masquée
    expect(firstRow).not.toContain('20:33');
    expect(firstRow).toContain('02:54'); // basse mer toujours visible
    expect(firstRow).toContain('04:19'); // à flot toujours visible
  });

  it('toggles a type off when its legend button is clicked', async () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const pmButton = wrapper.findAll('.navihan-legend button').find(b => b.text().includes('Pleine mer'));
    expect(pmButton).toBeTruthy();
    await pmButton!.trigger('click');
    expect(wrapper.findAll('tbody tr')[0].text()).not.toContain('08:25');
    expect(useNavihanDisplay().visible.pm).toBe(false);
  });

  it('shows the estimation (seuil) time as a Navihan pill', () => {
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    expect(wrapper.findAll('tbody tr')[0].text()).toContain('11:13'); // aflotEstimate
  });

  it('recalls the Navihan remise à flot time (not the estimation, not the basse mer) in the Constaté cell', () => {
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    const cell = wrapper.find('td[data-label="Constaté"]');
    expect(cell.text()).toContain('11:02'); // heure « Remise à flot » (décalage fixe) rappelée
    expect(cell.text()).not.toContain('11:13'); // pas l'estimation par seuil
    expect(cell.text()).not.toContain('08:22'); // pas l'heure de basse mer
  });

  it('orders the Constaté column by remise à flot time (chronological)', () => {
    // Le tri suit la **remise à flot**, pas la basse mer d'origine. Cas discriminant : le 26 hérite
    // de l'à-flot de la basse mer tardive du 25 (23:00 → 01:40), qui doit passer AVANT le sien
    // (10:00 → 12:40) alors que sa basse mer est la plus tardive des deux.
    const spill: FlatTide[] = [
      {
        date: '2026-07-25', time: '23:00', height: 1.5, type: 'low', coefficient: null,
        navihan: {}, refDate: '2026-07-25', refTime: '23:00', aflotObserved: null
      },
      {
        date: '2026-07-26', time: '10:00', height: 1.6, type: 'low', coefficient: null,
        navihan: {}, refDate: '2026-07-26', refTime: '10:00', aflotObserved: null
      }
    ];
    const wrapper = mount(TideDayTable, { props: { tides: spill, from: '2026-07-26' } });
    const cell = wrapper.find('td[data-label="Constaté"]').text();
    expect(cell.indexOf('01:40')).toBeGreaterThanOrEqual(0);
    expect(cell.indexOf('01:40')).toBeLessThan(cell.indexOf('12:40')); // trié par remise à flot
  });

  it('shows/hides the Constaté column via its visibility toggle', async () => {
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    expect(wrapper.find('thead').text()).toContain('Constaté');
    useNavihanDisplay().visible.flotObs = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('thead').text()).not.toContain('Constaté');
  });

  it('renders an editable time input for admins and saves on change', async () => {
    authState.admin = true;
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    const input = wrapper.find('.constate-input');
    expect(input.exists()).toBe(true);
    await input.setValue('11:07');
    await input.trigger('change');
    expect(obs.save).toHaveBeenCalledWith('2026-07-25', '08:22', '11:07');
  });

  it('deletes the observation when the admin clears the input', async () => {
    authState.admin = true;
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    const input = wrapper.find('.constate-input');
    await input.setValue('');
    await input.trigger('change');
    expect(obs.remove).toHaveBeenCalledWith('2026-07-25', '08:22');
  });

  it('does not render an input for non-admins', () => {
    const wrapper = mount(TideDayTable, { props: { tides: editable } });
    expect(wrapper.find('.constate-input').exists()).toBe(false);
  });
});

// Une heure Navihan qui franchit minuit appartient au lendemain : elle doit être rendue sur la
// ligne de ce lendemain, et non en tête de la ligne de la basse mer d'origine.
describe('TideDayTable — heures Navihan reportées au jour où elles ont lieu', () => {
  // Basse mer tardive le 27 (22:52) → basse mer Navihan 00:07 et remise à flot 01:32, le **28**.
  const acrossMidnight: FlatTide[] = [
    {
      date: '2026-07-27', time: '10:28', height: 1.88, type: 'low', coefficient: null,
      refDate: '2026-07-27', refTime: '10:28', navihan: {}
    },
    {
      date: '2026-07-27', time: '22:52', height: 1.74, type: 'low', coefficient: null,
      refDate: '2026-07-27', refTime: '22:52', navihan: {}
    },
    {
      date: '2026-07-28', time: '11:07', height: 1.68, type: 'low', coefficient: null,
      refDate: '2026-07-28', refTime: '11:07', navihan: {}
    }
  ];

  const rowFor = (wrapper: ReturnType<typeof mount>, label: string) =>
    wrapper.findAll('tbody tr').find(r => r.text().includes(label))!;

  beforeEach(() => {
    const { visible } = useNavihanDisplay();
    visible.bm = true; visible.flot = true; visible.flotEst = false;
    visible.flotObs = true; visible.pm = true;
  });

  it('rend la remise à flot d’après minuit sur la ligne du lendemain', () => {
    const wrapper = mount(TideDayTable, { props: { tides: acrossMidnight } });

    const row27 = rowFor(wrapper, '27 juil.');
    const row28 = rowFor(wrapper, '28 juil.');

    // Le 27 ne garde que les heures qui ont lieu le 27 (issues de la basse mer de 10:28).
    expect(row27.text()).toContain('11:43'); // basse mer Navihan 10:28 + 1h15
    expect(row27.text()).toContain('13:08'); // remise à flot 10:28 + 2h40
    expect(row27.text()).not.toContain('00:07');
    expect(row27.text()).not.toContain('01:32');

    // Elles apparaissent sur le 28, où elles se produisent réellement.
    expect(row28.text()).toContain('00:07');
    expect(row28.text()).toContain('01:32');
  });

  it('déplace aussi le rappel de la colonne Constaté sur la ligne du lendemain', () => {
    const wrapper = mount(TideDayTable, { props: { tides: acrossMidnight } });

    const cell27 = rowFor(wrapper, '27 juil.').find('td[data-label="Constaté"]');
    const cell28 = rowFor(wrapper, '28 juil.').find('td[data-label="Constaté"]');

    expect(cell27.text()).toContain('13:08');
    expect(cell27.text()).not.toContain('01:32');
    expect(cell28.text()).toContain('01:32');
  });

  it('n’affiche pas les lignes antérieures à `from` (jour d’amorce de la fenêtre)', () => {
    const wrapper = mount(TideDayTable, { props: { tides: acrossMidnight, from: '2026-07-28' } });
    const days = wrapper.findAll('tbody tr').map(r => r.text());
    expect(days.some(t => t.includes('27 juil.'))).toBe(false);
    // …mais le 28 hérite bien des heures issues de la basse mer du 27, hors fenêtre.
    expect(days.join(' ')).toContain('01:32');
  });
});
