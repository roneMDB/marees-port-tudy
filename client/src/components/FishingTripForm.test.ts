import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FishingTripForm from './FishingTripForm.vue';
import type { AflotChoice } from '../lib/fishing';
import type { FishingRef, FishingTrip } from '../types';

const SPECIES: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
  { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux' }
];
const GEARS: FishingRef[] = [
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes' }
];

const CHOICES: AflotChoice[] = [
  {
    key: '2026-08-10 07:10',
    date: '2026-08-10',
    time: '09:50',
    source: 'fixed',
    coefficient: 84,
    label: 'lun. 10 août · 09:50 · coef 84'
  },
  {
    key: '2026-08-10 19:42',
    date: '2026-08-10',
    time: '22:22',
    source: 'fixed',
    coefficient: 84,
    label: 'lun. 10 août · 22:22 · coef 84'
  }
];

function factory(over: Record<string, unknown> = {}) {
  return mount(FishingTripForm, {
    props: { species: SPECIES, gears: GEARS, choices: CHOICES, defaultChoice: CHOICES[1], ...over }
  });
}

const valueOf = (wrapper: ReturnType<typeof factory>, test: string) =>
  (wrapper.find(`[data-test="${test}"]`).element as HTMLInputElement).value;

describe('FishingTripForm', () => {
  it('pré-remplit date et heure de début depuis la remise à flot la plus proche', () => {
    const wrapper = factory();
    expect(valueOf(wrapper, 'date')).toBe('2026-08-10');
    expect(valueOf(wrapper, 'start')).toBe('22:22');
  });

  it('ne pré-remplit jamais l’heure de fin', () => {
    expect(valueOf(factory(), 'end')).toBe('');
  });

  it('réécrit date et heure quand on change d’à-flot dans le sélecteur', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="aflot"]').setValue('2026-08-10 07:10');
    expect(valueOf(wrapper, 'start')).toBe('09:50');
  });

  it('laisse modifier l’heure à la main sans que le sélecteur la remette', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="start"]').setValue('20:15');
    expect(valueOf(wrapper, 'start')).toBe('20:15');
  });

  it('ajoute et retire des lignes de prise', async () => {
    const wrapper = factory();
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(0);
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(2);
    await wrapper.findAll('[data-test="remove-catch"]')[0].trigger('click');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(1);
  });

  it('émet save avec la sortie saisie, prises comprises', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    await wrapper.find('[data-test="species"]').setValue('bar');
    await wrapper.find('[data-test="gear"]').setValue('ligne');
    await wrapper.find('[data-test="quantity"]').setValue('2');
    await wrapper.find('[data-test="notes"]').setValue('Belle soirée');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')![0][0]).toEqual({
      date: '2026-08-10',
      startTime: '22:22',
      endTime: null,
      notes: 'Belle soirée',
      baited: false,
      catches: [
        { speciesId: 'bar', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: null, kept: true }
      ]
    });
  });

  it('émet « casiers boëttés » quand la case est cochée', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="baited"]').setValue(true);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toMatchObject({ baited: true });
  });

  it('affiche la case « casiers boëttés » même sans prise au casier', () => {
    // La case est **toujours** visible : `fishing_refs` ne sait pas ce qu'est un casier, et une
    // sortie bredouille au casier ne porte aucune ligne de prise sur laquelle s'accrocher.
    const wrapper = factory();
    expect(wrapper.find('[data-test="baited"]').exists()).toBe(true);
  });

  it('permet d’enregistrer une sortie bredouille', async () => {
    const wrapper = factory();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toMatchObject({ catches: [] });
  });

  it('pré-remplit encore quand les marées arrivent après l’ouverture du formulaire', async () => {
    const wrapper = factory({ defaultChoice: null, choices: [] });
    expect(valueOf(wrapper, 'date')).toBe('');
    await wrapper.setProps({ choices: CHOICES, defaultChoice: CHOICES[1] });
    expect(valueOf(wrapper, 'date')).toBe('2026-08-10');
    expect(valueOf(wrapper, 'start')).toBe('22:22');
  });

  it('n’écrase pas une saisie déjà commencée à l’arrivée des marées', async () => {
    const wrapper = factory({ defaultChoice: null, choices: [] });
    await wrapper.find('[data-test="date"]').setValue('2026-07-04');
    await wrapper.setProps({ choices: CHOICES, defaultChoice: CHOICES[1] });
    expect(valueOf(wrapper, 'date')).toBe('2026-07-04');
  });

  it('reprend une sortie existante en édition', () => {
    const trip: FishingTrip = {
      id: 7,
      date: '2026-07-04',
      startTime: '06:30',
      endTime: '09:00',
      notes: 'Casiers',
      baited: true,
      weather: null,
      catches: [
        {
          speciesId: 'tourteau',
          gearId: 'casier-crabes',
          quantity: 3,
          sizeCm: null,
          weightG: null,
          kept: true
        }
      ],
      createdAt: 'x',
      updatedAt: 'x'
    };
    const wrapper = factory({ initial: trip });
    expect(valueOf(wrapper, 'date')).toBe('2026-07-04');
    expect(valueOf(wrapper, 'end')).toBe('09:00');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(1);
    const baited = wrapper.find('[data-test="baited"]').element as HTMLInputElement;
    expect(baited.checked).toBe(true);
  });

  it('émet cancel', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
