import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import StatCards from './StatCards.vue';
import { useSettings } from '../composables/useSettings';
import type { FlatTide } from '../types';

// `useSettings` persiste toute mutation via un `watch` débouncé : sans ce mock, piloter
// `aFlotDays` déclencherait un vrai `fetch` dans jsdom.
vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue(undefined)
}));

/** Une basse mer à 03:00 par jour sur 7 jours → 7 journées de remise à flot (05:40). */
const tides: FlatTide[] = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-07-${String(19 + i).padStart(2, '0')}`,
  time: '03:00',
  height: 1.2,
  type: 'low' as const,
  coefficient: null,
  navihan: {}
}));

const toggle = (w: ReturnType<typeof mount>) => w.find('[aria-controls="aflot-days-list"]');
const rows = (w: ReturnType<typeof mount>) => w.findAll('.aflot-day');
/** Carte « Prochaine remise à flot » (la première, aux couleurs de marque). */
const nextCard = (w: ReturnType<typeof mount>) => w.get('.app-brand-card');

// Vraies marées Port-Tudy du 26/07/2026 : basses mers 09:44 et 22:09 → remises à flot
// (décalage fixe 2h40) à 12:24 le 26 et 00:49 le **27**.
const realDay: FlatTide[] = [
  { date: '2026-07-26', time: '03:39', height: 3.99, type: 'high', coefficient: 44, navihan: {} },
  { date: '2026-07-26', time: '09:44', height: 2.07, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-26', time: '15:54', height: 4.3, type: 'high', coefficient: 48, navihan: {} },
  { date: '2026-07-26', time: '22:09', height: 1.95, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-27', time: '10:28', height: 1.88, type: 'low', coefficient: null, navihan: {} }
];

describe('StatCards — repli de la carte « Prochaines remises à flot »', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T00:00:00'));
    useSettings().settings.aFlotDays = 7; // singleton : on repart d'une valeur connue
  });

  afterEach(() => {
    // Réglages = singleton partagé : on restaure les défauts pour ne pas contaminer les cas suivants.
    useSettings().settings.aFlotDays = 3;
    useSettings().settings.navihan.aFlot = 160;
    vi.useRealTimers();
  });

  it('n’affiche que 3 jours au repos', () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(rows(wrapper)).toHaveLength(3);
  });

  it('annonce le nombre de jours masqués', () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(toggle(wrapper).text()).toContain('+ 4 autres jours');
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('false');
  });

  it('déplie tous les jours au clic, puis replie', async () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });

    await toggle(wrapper).trigger('click');
    expect(rows(wrapper)).toHaveLength(7);
    expect(toggle(wrapper).text()).toContain('Voir moins');
    expect(toggle(wrapper).attributes('aria-expanded')).toBe('true');

    await toggle(wrapper).trigger('click');
    expect(rows(wrapper)).toHaveLength(3);
    expect(toggle(wrapper).text()).toContain('+ 4 autres jours');
  });

  it('n’affiche aucun bouton quand tous les jours tiennent', () => {
    useSettings().settings.aFlotDays = 3;
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(rows(wrapper)).toHaveLength(3);
    expect(toggle(wrapper).exists()).toBe(false);
  });

  it('accorde le libellé au singulier pour un seul jour masqué', () => {
    useSettings().settings.aFlotDays = 4;
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(toggle(wrapper).text()).toContain('+ 1 autre jour');
    expect(toggle(wrapper).text()).not.toContain('autres');
  });

  it('referme la carte si le réglage retombe sous le budget pendant qu’elle est dépliée', async () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    await toggle(wrapper).trigger('click');
    expect(rows(wrapper)).toHaveLength(7);

    useSettings().settings.aFlotDays = 2;
    await wrapper.vm.$nextTick();

    expect(toggle(wrapper).exists()).toBe(false);
    expect(rows(wrapper)).toHaveLength(2);
  });

  // La carte affichait l'heure de l'à-flot (00:49, demain) accolée à la date de la **basse mer**
  // (dim. 26) : ça se lisait comme une heure déjà passée aujourd'hui.
  it('situe la prochaine remise à flot sur son propre jour, pas sur celui de la basse mer', () => {
    vi.setSystemTime(new Date('2026-07-26T16:16:00'));
    const card = nextCard(mount(StatCards, { props: { allTides: realDay } }));

    expect(card.text()).toContain('00:49');
    expect(card.text()).toContain('demain'); // l'à-flot tombe le 27, pas le 26
    expect(card.text()).toContain('26 juil.');
  });

  // La carte est entièrement en heures Navihan : la basse mer citée doit l'être aussi
  // (Port-Tudy 22:09 + décalage `basseMer` 1h15 = 23:24), pas l'heure Port-Tudy brute.
  it('cite la basse mer Navihan, pas celle de Port-Tudy', () => {
    vi.setSystemTime(new Date('2026-07-26T16:16:00'));
    const card = nextCard(mount(StatCards, { props: { allTides: realDay } }));

    expect(card.text()).toContain('23:24');
    expect(card.text()).not.toContain('22:09');
  });

  // Le décalage `basseMer` peut lui aussi franchir minuit : la date citée doit suivre la basse
  // mer Navihan, pas celle de Port-Tudy.
  it('date la basse mer Navihan sur son propre jour quand le décalage franchit minuit', () => {
    const lateLow: FlatTide[] = [
      { date: '2026-07-26', time: '23:30', height: 1.9, type: 'low', coefficient: null, navihan: {} }
    ];
    vi.setSystemTime(new Date('2026-07-26T20:00:00'));
    const card = nextCard(mount(StatCards, { props: { allTides: lateLow } }));

    expect(card.text()).toContain('02:10'); // à-flot : 23:30 + 2h40, le 27
    expect(card.text()).toContain('00:45'); // basse mer Navihan : 23:30 + 1h15, le 27 aussi
    expect(card.text()).toContain('27 juil.');
    expect(card.text()).not.toContain('26 juil.');
  });

  it("dit « aujourd'hui » quand la remise à flot tombe le jour même", () => {
    vi.setSystemTime(new Date('2026-07-26T08:00:00'));
    const card = nextCard(mount(StatCards, { props: { allTides: realDay } }));

    expect(card.text()).toContain('12:24'); // 09:44 + 2h40, le 26
    expect(card.text()).toContain("aujourd'hui");
    expect(card.text()).not.toContain('demain');
  });

  // Chaque remise à flot est rangée au jour où elle a lieu : la basse mer de 22:09 du 26 donne
  // 00:59, qui appartient au 27 — pas au 26.
  it('range chaque remise à flot au jour où elle a lieu et estompe les heures passées', () => {
    useSettings().settings.navihan.aFlot = 170; // 2h50, comme le réglage utilisé
    vi.setSystemTime(new Date('2026-07-26T16:16:00'));
    const wrapper = mount(StatCards, { props: { allTides: realDay } });

    const [day26, day27] = rows(wrapper);
    expect(day26.text()).toContain('26/07');
    expect(day26.findAll('.badge').map(b => b.text())).toEqual(['12:34']);
    expect(day26.findAll('.badge')[0].classes()).toContain('aflot-past'); // passée à 16:16

    expect(day27.text()).toContain('27/07');
    const times27 = day27.findAll('.badge');
    expect(times27.map(b => b.text())).toEqual(['00:59', '13:18']);
    expect(times27[0].classes()).not.toContain('aflot-past'); // le 27 à 00:59 est à venir
  });

  it('n’affiche ni ligne ni bouton quand aucune remise à flot n’est à venir', () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'));
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(rows(wrapper)).toHaveLength(0);
    expect(toggle(wrapper).exists()).toBe(false);
  });
});
