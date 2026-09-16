import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FishingStatsPanel from './FishingStatsPanel.vue';
import type { FishingCatch, FishingRef, FishingTrip, FlatTide } from '../types';

const REFS: FishingRef[] = [
  {
    id: 'crevette-bouquet',
    kind: 'species',
    label: 'Crevette bouquet',
    labelPlural: 'Crevettes bouquet'
  },
  { id: 'etrille', kind: 'species', label: 'Étrille', labelPlural: 'Étrilles' },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes' },
  {
    id: 'casier-crevettes',
    kind: 'gear',
    label: 'Casier à crevettes',
    labelPlural: 'Casiers à crevettes'
  }
];

const cat = (over: Partial<FishingCatch> = {}): FishingCatch => ({
  speciesId: 'etrille',
  gearId: 'casier-crabes',
  quantity: 1,
  sizeCm: null,
  weightG: null,
  kept: true,
  ...over
});

const trip = (over: Partial<FishingTrip> = {}): FishingTrip => ({
  id: 1,
  date: '2026-08-11',
  startTime: null,
  endTime: null,
  notes: null,
  baited: false,
  weather: null,
  catches: [],
  createdAt: 'x',
  updatedAt: 'x',
  ...over
});

const TRIPS: FishingTrip[] = [
  trip({
    id: 1,
    date: '2026-08-11',
    baited: true,
    catches: [cat({ speciesId: 'crevette-bouquet', gearId: 'casier-crevettes', quantity: 15 })]
  }),
  trip({
    id: 2,
    date: '2026-08-22',
    baited: true,
    catches: [
      cat({ speciesId: 'crevette-bouquet', gearId: 'casier-crevettes', quantity: 5 }),
      cat({ quantity: 2 })
    ]
  }),
  trip({ id: 3, date: '2026-09-02', baited: false })
];

const TIDES: FlatTide[] = [
  { date: '2026-08-11', time: '12:00', height: 5, type: 'high', navihan: {}, coefficient: 96 },
  { date: '2026-08-22', time: '12:00', height: 4, type: 'high', navihan: {}, coefficient: 40 }
] as FlatTide[];

function factory(over: Record<string, unknown> = {}) {
  return mount(FishingStatsPanel, {
    props: { trips: TRIPS, refs: REFS, tides: TIDES, ...over }
  });
}

describe('FishingStatsPanel', () => {
  it('distingue les prises saisies des individus dans le bilan', () => {
    const w = factory();

    expect(w.get('[data-test="kpi-trips"]').text()).toBe('3');
    expect(w.get('[data-test="kpi-lines"]').text()).toBe('3');
    expect(w.get('[data-test="kpi-individuals"]').text()).toBe('22');
    expect(w.get('[data-test="kpi-blank"]').text()).toBe('1');
  });

  it('classe les espèces au pluriel du référentiel, la plus abondante en tête', () => {
    const rows = factory().findAll('[data-test="species-row"]');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Crevettes bouquet');
    expect(rows[0].text()).toContain('record 15');
    expect(rows[1].text()).toContain('Étrilles');
  });

  it('ne présente pas comme un record une espèce vue une seule fois, ou vue à l’unité', () => {
    const rows = factory({
      trips: [
        trip({ id: 1, catches: [cat({ quantity: 3 })] }),
        trip({ id: 2, date: '2026-08-12', catches: [cat({ speciesId: 'crevette-bouquet' })] })
      ]
    }).findAll('[data-test="species-row"]');

    // Une seule sortie pour l'étrille, et un seul individu pour la crevette.
    expect(rows[0].text()).not.toContain('record');
    expect(rows[1].text()).not.toContain('record');
  });

  it('liste les engins employés', () => {
    const rows = factory().findAll('[data-test="gear-row"]');

    expect(rows.map(r => r.text())).toEqual([
      expect.stringContaining('Casier à crevettes'),
      expect.stringContaining('Casier à crabes')
    ]);
  });

  it('affiche l’effectif de chaque groupe d’un croisement', () => {
    const table = factory().get('[data-test="compare-baited"]');
    const cells = table.findAll('tbody tr').map(tr => tr.findAll('td').map(td => td.text()));

    // Oui : 2 sorties, 10 crevettes et 1 étrille par sortie ; Non : 1 sortie bredouille.
    expect(cells[0][0]).toBe('Oui');
    expect(cells[0][1]).toBe('2');
    expect(cells[0][2]).toBe('10');
    expect(cells[0][3]).toBe('1');
    expect(cells[1][0]).toBe('Non');
    expect(cells[1][1]).toContain('1 bred.');
  });

  it('avertit que les écarts sont indicatifs, effectif à l’appui', () => {
    expect(factory().text()).toContain('Indicatif : 3 sorties');
  });

  it('dit combien de sorties sortent d’un croisement faute de météo', () => {
    expect(factory().get('[data-test="compare-sky"]').text()).toContain('3 sorties sans météo');
  });

  it('dit combien de sorties sortent du croisement de coefficient', () => {
    // La sortie du 02/09 n'a pas d'horaires : elle ne peut pas être classée en bande de coef.
    expect(factory().get('[data-test="compare-coef"]').text()).toContain(
      '1 sortie hors des horaires connus'
    );
  });

  it('ne rend que les bandes de coefficient réellement représentées, dans l’ordre', () => {
    const labels = factory()
      .get('[data-test="compare-coef"]')
      .findAll('tbody tr')
      .map(tr => tr.findAll('td')[0].text());

    expect(labels).toEqual(['Morte-eau', 'Grande vive-eau']);
  });

  it('écrit les mois en toutes lettres, chronologiquement', () => {
    const labels = factory()
      .get('[data-test="compare-month"]')
      .findAll('tbody tr')
      .map(tr => tr.findAll('td')[0].text());

    expect(labels).toEqual(['Août 2026', 'Septembre 2026']);
  });

  it('se contente d’une phrase sur un carnet vide', () => {
    const w = factory({ trips: [] });

    expect(w.text()).toContain('Aucune sortie enregistrée');
    expect(w.find('[data-test="species-row"]').exists()).toBe(false);
  });
});
