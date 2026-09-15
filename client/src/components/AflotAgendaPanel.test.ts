import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AflotAgendaPanel from './AflotAgendaPanel.vue';
import { useSettings } from '../composables/useSettings';
import { resetNowForTests } from '../composables/useNow';
import type { FlatTide } from '../types';

// `useSettings` persiste toute mutation via un `watch` débouncé : sans ce mock, piloter les
// réglages déclencherait un vrai `fetch` dans jsdom.
vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue(undefined)
}));

/**
 * Vraies marées Port-Tudy des 26 et 27/07/2026. Avec le décalage fixe de 2h40, les remises à flot
 * tombent le 26 à 12:24, puis le **27** à 00:49 (la basse mer de 22:09 franchit minuit) et 13:08.
 */
const tides: FlatTide[] = [
  { date: '2026-07-26', time: '03:39', height: 3.99, type: 'high', coefficient: 44, navihan: {} },
  { date: '2026-07-26', time: '09:44', height: 2.07, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-26', time: '15:54', height: 4.3, type: 'high', coefficient: 48, navihan: {} },
  { date: '2026-07-26', time: '22:09', height: 1.95, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-27', time: '04:20', height: 4.05, type: 'high', coefficient: 52, navihan: {} },
  { date: '2026-07-27', time: '10:28', height: 1.88, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-27', time: '16:38', height: 4.35, type: 'high', coefficient: 55, navihan: {} }
];

/**
 * Monte le panneau sur l'instant **simulé courant** : `useNow` est un singleton, et sans ce
 * réalignement un `setSystemTime` posé dans le corps d'un cas n'atteindrait pas le composant.
 */
const mountPanel = (allTides = tides) => {
  resetNowForTests();
  return mount(AflotAgendaPanel, { props: { allTides } });
};
const dayBlocks = (w: ReturnType<typeof mountPanel>) => w.findAll('.agenda-day');
const slots = (w: ReturnType<typeof mountPanel>) => w.findAll('.agenda-slot');
/** Le créneau dont la pastille d'heure porte `time`. */
const slotAt = (w: ReturnType<typeof mountPanel>, time: string) =>
  slots(w).find(s => s.text().includes(time))!;

describe('AflotAgendaPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T08:00:00'));
    useSettings().settings.navihan.aFlot = 160; // 2h40, valeur par défaut
    useSettings().settings.navihan.basseMer = 75; // 1h15
  });

  afterEach(() => {
    // Réglages = singleton partagé : on restaure les défauts pour ne pas contaminer les cas suivants.
    useSettings().settings.aFlotDays = 3;
    useSettings().settings.navihan.aFlot = 160;
    useSettings().settings.navihan.basseMer = 75;
    vi.useRealTimers();
  });

  // Le panneau existe précisément pour échapper au plafond de la carte.
  it('liste toute la plage, sans se laisser borner par le réglage de la carte', () => {
    useSettings().settings.aFlotDays = 1;
    const wrapper = mountPanel();
    expect(dayBlocks(wrapper)).toHaveLength(2);
    expect(slots(wrapper).map(s => s.get('.agenda-time').text())).toEqual([
      '12:24',
      '00:49',
      '13:08'
    ]);
  });

  it('affiche le coefficient de la pleine mer suivante', () => {
    const wrapper = mountPanel();
    expect(slotAt(wrapper, '12:24').get('.agenda-coef').text()).toBe('48');
    expect(slotAt(wrapper, '00:49').get('.agenda-coef').text()).toBe('52');
  });

  // La carte comme le panneau sont entièrement en heures Navihan : 22:09 + 1h15 = 23:24.
  it('cite la basse mer Navihan, pas celle de Port-Tudy', () => {
    const slot = slotAt(mountPanel(), '00:49');
    expect(slot.text()).toContain('23:24');
    expect(slot.text()).not.toContain('22:09');
  });

  // ~14 % des remises à flot ont lieu le lendemain de leur basse mer : sans la date, le « 23:24 »
  // se lirait comme une heure du 27.
  it('date la basse mer quand elle tombe la veille de la remise à flot', () => {
    expect(slotAt(mountPanel(), '00:49').text()).toContain('26 juil.');
  });

  it("n'encombre pas d'une date la basse mer du même jour", () => {
    expect(slotAt(mountPanel(), '12:24').text()).not.toContain('juil.');
  });

  it("repère aujourd'hui et demain", () => {
    const wrapper = mountPanel();
    expect(dayBlocks(wrapper)[0].text()).toContain("aujourd'hui");
    expect(dayBlocks(wrapper)[1].text()).toContain('demain');
  });

  // Un agenda ne se vide pas au fil de la journée : l'heure passée reste listée, estompée.
  it('estompe les heures déjà passées sans les retirer', () => {
    vi.setSystemTime(new Date('2026-07-26T16:00:00'));
    const wrapper = mountPanel();
    expect(slotAt(wrapper, '12:24').get('.agenda-time').classes()).toContain('aflot-past');
    expect(slotAt(wrapper, '13:08').get('.agenda-time').classes()).not.toContain('aflot-past');
  });

  it('annonce une plage vide plutôt qu’une liste blanche', () => {
    const wrapper = mountPanel([]);
    expect(dayBlocks(wrapper)).toHaveLength(0);
    expect(wrapper.text()).toContain('Aucune remise à flot');
  });
});
