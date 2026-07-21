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

  it('labels the time column with the selected site and shows the row own hours', () => {
    const wrapper = mount(TideTable, { props: { tides } });
    expect(wrapper.find('thead').text()).toContain('Heure Port-Tudy');
    expect(wrapper.text()).toContain('03:00');

    const etel: FlatTide[] = [
      { date: '2026-07-23', time: '13:05', height: 3.89, type: 'high', coefficient: 37, navihan: { 'Pleine mer': '13:43' } }
    ];
    const w2 = mount(TideTable, { props: { tides: etel, siteLabel: 'Étel' } });
    expect(w2.find('thead').text()).toContain('Heure Étel');
    const text = w2.text();
    expect(text).toContain('13:05'); // heure propre d'Étel
    expect(text).toContain('3.89 m'); // hauteur propre d'Étel
    expect(text).toContain('37'); // coef propre d'Étel
    expect(text).toContain('13:43'); // Navihan (dérivé de Port-Tudy) présent
  });

  it('renders — in the Navihan columns when a tide has no reference match', () => {
    const unmatched: FlatTide[] = [
      { date: '2026-07-23', time: '00:14', height: 3.93, type: 'high', coefficient: 40, navihan: {} }
    ];
    const wrapper = mount(TideTable, { props: { tides: unmatched, siteLabel: 'Étel' } });
    const rowText = wrapper.find('tbody tr').text();
    expect(rowText).toContain('00:14'); // l'heure d'Étel reste affichée
    expect(rowText).toContain('—'); // colonnes Navihan vides → tiret
  });
});
