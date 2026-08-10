import { describe, expect, it } from 'vitest';
import { aflotChoices, nearestAflot, summarizeCatches, tripTideContext } from './fishing';
import type { FishingCatch, FishingRef, FlatTide, NavihanOffsets } from '../types';

const REFS: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'tourteau', kind: 'species', label: 'Tourteau' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' }
];

const OFFSETS: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };

function tide(over: Partial<FlatTide>): FlatTide {
  return {
    date: '2026-08-10',
    time: '12:00',
    height: 3,
    type: 'low',
    navihan: {},
    coefficient: null,
    ...over
  } as FlatTide;
}

const cat = (over: Partial<FishingCatch> = {}): FishingCatch => ({
  speciesId: 'bar',
  gearId: 'ligne',
  quantity: 1,
  sizeCm: null,
  weightG: null,
  kept: true,
  ...over
});

describe('summarizeCatches', () => {
  it('résume les prises en « quantité espèce », séparées par des points médians', () => {
    const text = summarizeCatches(
      [cat({ speciesId: 'crevette-bouquet', quantity: 12 }), cat({ speciesId: 'tourteau', quantity: 3 })],
      REFS
    );
    expect(text).toBe('12 crevettes bouquet · 3 tourteaux');
  });

  it('précise la taille ou le poids quand ils sont renseignés', () => {
    expect(summarizeCatches([cat({ quantity: 1, sizeCm: 42 })], REFS)).toBe('1 bar 42 cm');
    expect(summarizeCatches([cat({ quantity: 1, weightG: 900 })], REFS)).toBe('1 bar 900 g');
  });

  it('signale les prises relâchées', () => {
    expect(summarizeCatches([cat({ quantity: 2, kept: false })], REFS)).toBe('2 bars (relâchés)');
  });

  it('dit « bredouille » plutôt que de rendre une chaîne vide', () => {
    expect(summarizeCatches([], REFS)).toBe('Bredouille');
  });

  it('retombe sur l’id quand l’espèce a disparu du référentiel', () => {
    expect(summarizeCatches([cat({ speciesId: 'licorne', quantity: 1 })], REFS)).toBe('1 licorne');
  });
});

describe('aflotChoices', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }),
    tide({ date: '2026-08-10', time: '13:20', type: 'high', coefficient: 84, height: 5 }),
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }),
    tide({ date: '2026-08-11', time: '01:50', type: 'high', coefficient: 88, height: 5 })
  ];

  it('date la remise à flot du jour où elle a lieu, minuit franchi', () => {
    // 19:42 + 2h40 = 22:22 le 10 ; une basse à 23:30 basculerait au lendemain.
    const tardive = [...tides, tide({ date: '2026-08-10', time: '23:30', type: 'low' })];
    const choices = aflotChoices(tardive, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const wrapped = choices.find(c => c.time === '02:10');
    expect(wrapped?.date).toBe('2026-08-11');
  });

  it('préfère l’heure constatée au décalage fixe, et le signale', () => {
    const observations = { '2026-08-10 19:42': '22:05' };
    const choices = aflotChoices(tides, OFFSETS, observations, new Date('2026-08-10T12:00:00'));
    const fromEvening = choices.find(c => c.key === '2026-08-10 19:42')!;
    expect(fromEvening.time).toBe('22:05');
    expect(fromEvening.source).toBe('observed');

    const fromMorning = choices.find(c => c.key === '2026-08-10 07:10')!;
    expect(fromMorning.time).toBe('09:50');
    expect(fromMorning.source).toBe('fixed');
  });

  it('porte le coefficient du jour de la basse mer et un libellé lisible', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const evening = choices.find(c => c.key === '2026-08-10 19:42')!;
    expect(evening.coefficient).toBe(84);
    expect(evening.label).toContain('22:22');
    expect(evening.label).toContain('coef 84');
  });

  it('borne la liste à la fenêtre demandée autour d’aujourd’hui', () => {
    const large: FlatTide[] = [
      tide({ date: '2026-07-01', time: '10:00', type: 'low' }),
      tide({ date: '2026-08-09', time: '10:00', type: 'low' }),
      tide({ date: '2026-08-10', time: '10:00', type: 'low' }),
      tide({ date: '2026-09-30', time: '10:00', type: 'low' })
    ];
    const choices = aflotChoices(large, OFFSETS, {}, new Date('2026-08-10T12:00:00'), 7, 7);
    expect(choices.map(c => c.date)).toEqual(['2026-08-09', '2026-08-10']);
  });

  it('renvoie les choix par ordre chronologique', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const times = choices.map(c => `${c.date} ${c.time}`);
    expect([...times].sort()).toEqual(times);
  });
});

describe('nearestAflot', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }), // à-flot 09:50
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }) // à-flot 22:22
  ];

  it('choisit l’à-flot passé quand il est le plus proche (saisie au retour)', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T11:00:00'));
    expect(nearestAflot(choices, new Date('2026-08-10T11:00:00'))!.time).toBe('09:50');
  });

  it('choisit l’à-flot à venir quand il est le plus proche (saisie avant de partir)', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T18:00:00'));
    expect(nearestAflot(choices, new Date('2026-08-10T18:00:00'))!.time).toBe('22:22');
  });

  it('renvoie null quand aucune marée n’est disponible', () => {
    expect(nearestAflot([], new Date('2026-08-10T12:00:00'))).toBeNull();
  });
});

describe('tripTideContext', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }),
    tide({ date: '2026-08-10', time: '13:20', type: 'high', coefficient: 84, height: 5 }),
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }),
    tide({ date: '2026-08-10', time: '01:05', type: 'high', coefficient: 80, height: 5 })
  ];

  it('donne le coefficient du jour (le plus fort des pleines mers) et ses basses mers', () => {
    const ctx = tripTideContext('2026-08-10', tides, OFFSETS);
    expect(ctx.coefficient).toBe(84);
    expect(ctx.lowTides).toEqual(['07:10', '19:42']);
  });

  it('liste les remises à flot qui ont lieu ce jour-là, pas celles de ses basses mers', () => {
    const tardive = [...tides, tide({ date: '2026-08-09', time: '23:30', type: 'low' })];
    const ctx = tripTideContext('2026-08-10', tardive, OFFSETS);
    expect(ctx.aflot).toEqual(['02:10', '09:50', '22:22']);
  });

  it('renvoie un contexte vide pour un jour non couvert par les horaires', () => {
    expect(tripTideContext('2027-01-01', tides, OFFSETS)).toEqual({
      coefficient: null,
      lowTides: [],
      aflot: []
    });
  });
});
