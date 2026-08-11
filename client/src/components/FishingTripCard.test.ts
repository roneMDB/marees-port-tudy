import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FishingTripCard from './FishingTripCard.vue';
import type { FishingRef, FishingTrip } from '../types';

const REFS: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' }
];

const TRIP: FishingTrip = {
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: '21:10',
  notes: 'Vent d’ouest',
  weather: {
    tempMin: 14,
    tempMax: 22,
    windMax: 18,
    windDir: 250,
    weatherCode: 3,
    seaTemperature: 19.5
  },
  catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }],
  createdAt: 'x',
  updatedAt: 'x'
};

const CONTEXT = { coefficient: 84, lowTides: ['07:10', '19:42'], aflot: ['09:50', '22:22'] };

function factory(over: Record<string, unknown> = {}) {
  return mount(FishingTripCard, {
    props: { trip: TRIP, refs: REFS, context: CONTEXT, today: '2026-08-10', canEdit: true, ...over }
  });
}

describe('FishingTripCard', () => {
  it('affiche le jour, le créneau et le résumé des prises', () => {
    const text = factory().text();
    expect(text).toContain("ujourd'hui"); // la majuscule est posée en JS
    expect(text).toContain('19:42');
    expect(text).toContain('21:10');
    expect(text).toContain('1 bar 42 cm');
  });

  it('affiche le contexte marée recalculé', () => {
    const text = factory().text();
    expect(text).toContain('coef 84');
    expect(text).toContain('22:22');
  });

  it('signale un jour dont les marées sont inconnues plutôt que de laisser un vide', () => {
    const wrapper = factory({ context: { coefficient: null, lowTides: [], aflot: [] } });
    expect(wrapper.find('.trip-tide').text()).toContain('marée inconnue');
  });

  it('affiche la météo figée quand elle existe', () => {
    const text = factory().find('.trip-weather').text();
    expect(text).toContain('22');
    expect(text).toContain('19,5'); // virgule décimale française
  });

  it('n’affiche pas de bloc météo quand elle est absente', () => {
    const wrapper = factory({ trip: { ...TRIP, weather: null } });
    expect(wrapper.find('.trip-weather').exists()).toBe(false);
  });

  it('dit « Bredouille » pour une sortie sans prise', () => {
    expect(factory({ trip: { ...TRIP, catches: [] } }).text()).toContain('Bredouille');
  });

  it('dédoublonne les engins employés', () => {
    const wrapper = factory({
      trip: {
        ...TRIP,
        catches: [
          { speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: null, weightG: null, kept: true },
          { speciesId: 'bar', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: null, kept: true }
        ]
      }
    });
    expect(wrapper.find('.trip-gears').text().match(/Ligne/g)).toHaveLength(1);
  });

  it('émet edit et remove pour un admin', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="edit"]').trigger('click');
    await wrapper.find('[data-test="remove"]').trigger('click');
    expect(wrapper.emitted('edit')![0]).toEqual([TRIP]);
    expect(wrapper.emitted('remove')![0]).toEqual([1]);
  });

  it('masque les actions hors admin', () => {
    const wrapper = factory({ canEdit: false });
    expect(wrapper.find('[data-test="edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="remove"]').exists()).toBe(false);
  });
});
