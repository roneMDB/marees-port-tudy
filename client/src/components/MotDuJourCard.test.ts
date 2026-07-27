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

// « Nouveau mot » tire dans un sac mélangé : l'ordre change d'une session à l'autre, et aucun mot
// ne revient avant que tout le lexique soit passé.
describe('MotDuJourCard — tirage aléatoire du lexique', () => {
  beforeEach(() => {
    useMotDuJour().show();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const bouton = (w: ReturnType<typeof mount>) => w.get('button[aria-label="Charger un nouveau mot"]');
  const terme = (w: ReturnType<typeof mount>) => w.get('.fs-5').text();

  it('ne rend jamais deux fois le même mot avant d’avoir fait le tour', async () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    const vus = [terme(wrapper)];

    for (let i = 0; i < LEXIQUE.length - 1; i++) {
      await bouton(wrapper).trigger('click');
      vus.push(terme(wrapper));
    }

    expect(vus).toHaveLength(LEXIQUE.length);
    expect(new Set(vus).size).toBe(LEXIQUE.length); // tous distincts
  });

  it('repart pour un tour complet ensuite, sans se bloquer', async () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    for (let i = 0; i < LEXIQUE.length * 2; i++) await bouton(wrapper).trigger('click');
    expect(terme(wrapper).length).toBeGreaterThan(0); // toujours un mot affiché
  });

  it('tire un ordre différent d’un montage à l’autre', async () => {
    const suite = async () => {
      const w = mount(MotDuJourCard, { props: { allTides: tides } });
      const out: string[] = [];
      for (let i = 0; i < 8; i++) {
        await bouton(w).trigger('click');
        out.push(terme(w));
      }
      return out.join('|');
    };
    // Sur 8 tirages parmi 45 entrées, deux suites identiques sont hautement improbables ;
    // on tolère une collision en réessayant une fois pour rester non-flaky.
    const a = await suite();
    const differe = (await suite()) !== a || (await suite()) !== a;
    expect(differe).toBe(true);
  });

  it('« Revenir au mot du jour » ramène bien au mot canonique', async () => {
    const wrapper = mount(MotDuJourCard, { props: { allTides: tides } });
    const motDuJour = terme(wrapper);
    await bouton(wrapper).trigger('click');
    expect(terme(wrapper)).not.toBe(motDuJour);

    const retour = wrapper.findAll('button').find(b => b.text().includes('Revenir au mot du jour'))!;
    await retour.trigger('click');
    expect(terme(wrapper)).toBe(motDuJour);
  });
});
