import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MotDuJourCard from './MotDuJourCard.vue';
import { LEXIQUE, noteOfTheDay } from '../lib/lexique';
import { useMotDuJour } from '../composables/useMotDuJour';
import type { FlatTide } from '../types';

// Lexique servi par la base : on garde le lexique embarqué (pas d'appel réseau dans les tests).
vi.mock('../composables/useLexicon', async () => {
  const { computed } = await import('vue');
  const { LEXIQUE } = await import('../lib/lexique');
  return {
    useLexicon: () => ({ entries: computed(() => LEXIQUE), load: vi.fn().mockResolvedValue(undefined) })
  };
});

// Marée moyenne stable → mot du jour issu de la rotation (pas de terme contextuel).
const tides: FlatTide[] = [
  { date: '2026-07-23', time: '08:00', height: 4.2, type: 'high', coefficient: 58, navihan: {} },
  { date: '2026-07-23', time: '14:00', height: 1.9, type: 'low', coefficient: null, navihan: {} }
];

describe('MotDuJourCard', () => {
  beforeEach(() => {
    useMotDuJour().show(); // le masquage est un singleton persisté : on repart visible
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche le mot du jour', () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    const note = noteOfTheDay({ dateKey: '2026-07-23', coef: 58, prevCoef: null }, LEXIQUE);
    expect(wrapper.text()).toContain(note.term);
  });

  it('charge un nouveau mot au clic sur « Nouveau mot »', async () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    const initial = noteOfTheDay({ dateKey: '2026-07-23', coef: 58, prevCoef: null }, LEXIQUE);
    const button = wrapper.get('button[aria-label="Charger un nouveau mot"]');

    await button.trigger('click');
    expect(wrapper.text()).not.toContain(initial.definition);
    const second = wrapper.get('.fs-5').text();

    await button.trigger('click');
    expect(wrapper.get('.fs-5').text()).not.toBe(second); // un autre terme à chaque clic
  });

  it('revient au mot du jour via le lien de retour', async () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    const initial = noteOfTheDay({ dateKey: '2026-07-23', coef: 58, prevCoef: null }, LEXIQUE);
    await wrapper.get('button[aria-label="Charger un nouveau mot"]').trigger('click');

    const back = wrapper.findAll('button').find(b => b.text().includes('Revenir au mot du jour'));
    expect(back).toBeTruthy();
    await back!.trigger('click');
    expect(wrapper.get('.fs-5').text()).toBe(initial.term);
    // Le lien de retour disparaît une fois revenu au mot du jour.
    expect(wrapper.findAll('button').some(b => b.text().includes('Revenir au mot du jour'))).toBe(false);
  });
});
