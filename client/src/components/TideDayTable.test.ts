import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TideDayTable from './TideDayTable.vue';
import { useNavihanDisplay } from '../composables/useNavihanDisplay';
import type { FlatTide } from '../types';

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
    visible.pm = true;
  });

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

  it('renders the legend as three toggle buttons (aria-pressed)', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const buttons = wrapper.findAll('.navihan-legend button');
    expect(buttons).toHaveLength(3);
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
});
