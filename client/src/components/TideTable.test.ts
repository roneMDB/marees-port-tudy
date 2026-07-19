import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TideTable from './TideTable.vue';
import type { FlatTide } from '../types';

const tides: FlatTide[] = [
  { date: '2026-06-01', time: '03:00', height: 4.6, type: 'high', coefficient: 71, navihan: { 'Pleine mer': '04:15' } },
  { date: '2026-06-01', time: '09:00', height: 1.1, type: 'low', coefficient: null, navihan: { 'Basse mer': '10:15', 'A flot': '11:40' } }
];

describe('TideTable', () => {
  it('renders one row per tide with all available info', () => {
    const wrapper = mount(TideTable, { props: { tides } });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);

    const text = wrapper.text();
    expect(text).toContain('Pleine mer');
    expect(text).toContain('Basse mer');
    expect(text).toContain('03:00');
    expect(text).toContain('4.60 m');
    expect(text).toContain('71');
    // Navihan à flot présent pour la basse mer.
    expect(text).toContain('11:40');
  });

  it('shows an empty-state row when there are no tides', () => {
    const wrapper = mount(TideTable, { props: { tides: [] } });
    expect(wrapper.text()).toContain('Aucune marée');
  });
});
