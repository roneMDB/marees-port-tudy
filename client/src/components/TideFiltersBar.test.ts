import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TideFiltersBar from './TideFiltersBar.vue';
import { useTideFilters } from '../composables/useTideFilters';

const coefInputs = (w: ReturnType<typeof mount>) => w.findAll('input[type="number"]');
const timeInputs = (w: ReturnType<typeof mount>) => w.findAll('input[type="time"]');
const weekdayButtons = (w: ReturnType<typeof mount>) => w.findAll('.weekday-toggle');

describe('TideFiltersBar', () => {
  // Les filtres sont un singleton : on repart de « rien de posé » à chaque cas.
  beforeEach(() => {
    useTideFilters().reset();
    localStorage.clear();
  });

  it('renseigne les bornes de coefficient', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    await coefInputs(wrapper)[0].setValue('80');
    await coefInputs(wrapper)[1].setValue('100');

    expect(filters.minCoef).toBe(80);
    expect(filters.maxCoef).toBe(100);
  });

  it('borne la saisie en JS (les attributs HTML ne suffisent pas)', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    await coefInputs(wrapper)[0].setValue('999');
    expect(filters.minCoef).toBe(120);

    await coefInputs(wrapper)[0].setValue('-5');
    expect(filters.minCoef).toBe(0);
  });

  it('revient à « pas de borne » quand le champ est vidé', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    await coefInputs(wrapper)[0].setValue('80');
    await coefInputs(wrapper)[0].setValue('');

    expect(filters.minCoef).toBeNull();
  });

  it('affiche sept boutons de jour, éteints tant que rien n’est sélectionné', () => {
    const wrapper = mount(TideFiltersBar);
    const buttons = weekdayButtons(wrapper);

    expect(buttons).toHaveLength(7);
    expect(buttons.map(b => b.text())).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(buttons.every(b => b.attributes('aria-pressed') === 'false')).toBe(true);
  });

  it('sélectionne un jour au clic (lundi = 0)', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    await weekdayButtons(wrapper)[5].trigger('click'); // samedi
    await weekdayButtons(wrapper)[6].trigger('click'); // dimanche

    expect(filters.weekdays).toEqual([5, 6]);
    expect(weekdayButtons(wrapper)[5].attributes('aria-pressed')).toBe('true');
    expect(weekdayButtons(wrapper)[0].attributes('aria-pressed')).toBe('false');
  });

  it('désélectionner le dernier jour ramène à « tous les jours »', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters, activeCount } = useTideFilters();

    await weekdayButtons(wrapper)[5].trigger('click');
    await weekdayButtons(wrapper)[5].trigger('click');

    expect(filters.weekdays).toEqual([]);
    expect(activeCount.value).toBe(0);
  });

  it('renseigne la plage horaire de remise à flot', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    await timeInputs(wrapper)[0].setValue('09:00');
    await timeInputs(wrapper)[1].setValue('19:00');

    expect(filters.aflotFrom).toBe('09:00');
    expect(filters.aflotTo).toBe('19:00');
  });

  it('n’affiche le bouton Réinitialiser que si un filtre est actif, et il remet tout à zéro', async () => {
    const wrapper = mount(TideFiltersBar);
    const { filters } = useTideFilters();

    expect(wrapper.text()).not.toContain('Réinitialiser');

    await coefInputs(wrapper)[0].setValue('80');
    expect(wrapper.text()).toContain('Réinitialiser');

    await wrapper.find('button.btn-outline-secondary.ms-auto').trigger('click');
    expect(filters.minCoef).toBeNull();
    expect(wrapper.text()).not.toContain('Réinitialiser');
  });
});
