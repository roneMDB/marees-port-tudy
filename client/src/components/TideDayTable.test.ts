import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TideDayTable from './TideDayTable.vue';
import type { FlatTide } from '../types';

const tides: FlatTide[] = [
  { date: '2026-07-22', time: '07:10', height: 4.44, type: 'high', coefficient: 71, navihan: {} },
  { date: '2026-07-22', time: '19:18', height: 4.64, type: 'high', coefficient: 69, navihan: {} },
  { date: '2026-07-22', time: '01:39', height: 1.75, type: 'low', coefficient: null, navihan: { 'A flot': '04:19' } },
  { date: '2026-07-22', time: '13:47', height: 1.83, type: 'low', coefficient: null, navihan: { 'A flot': '16:27' } },
  { date: '2026-07-23', time: '12:28', height: 3.82, type: 'high', coefficient: 35, navihan: {} },
  { date: '2026-07-23', time: '06:22', height: 1.93, type: 'low', coefficient: null, navihan: { 'A flot': '09:02' } }
];

describe('TideDayTable', () => {
  it('renders one row per day with inline height, coef and à-flot', () => {
    const wrapper = mount(TideDayTable, { props: { tides, siteLabel: 'Port-Tudy' } });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2); // 2 jours (pas 6 marées)

    const text = wrapper.text();
    expect(text).toContain('07:10');
    expect(text).toContain('4.44 m'); // hauteur inline
    expect(text).toContain('71'); // coef du jour = max(71, 69)
    expect(text).toContain('04:19'); // à flot Navihan
    expect(wrapper.find('thead').text()).toContain('Port-Tudy');
  });

  it('shows the day coefficient as the max of the day highs', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const firstRow = wrapper.findAll('tbody tr')[0].text();
    expect(firstRow).toContain('71');
    expect(firstRow).not.toContain('69'); // seul le max est affiché
  });

  it('renders — where a day lacks tides of a kind (e.g. a single high)', () => {
    const wrapper = mount(TideDayTable, { props: { tides } });
    const day23 = wrapper.findAll('tbody tr')[1].text();
    expect(day23).toContain('12:28'); // sa pleine mer
    expect(day23).toContain('09:02'); // à flot
  });

  it('shows an empty state when there are no tides', () => {
    const wrapper = mount(TideDayTable, { props: { tides: [] } });
    expect(wrapper.text()).toContain('Aucune marée');
  });
});
