import { describe, expect, it } from 'vitest';
import {
  buildDimensions,
  compare,
  gearRanking,
  speciesRanking,
  summarizeLog
} from './fishingStats';
import type { Dimension } from './fishingStats';
import type { FishingCatch, FishingRef, FishingTrip, FlatTide, TripWeather } from '../types';

const REFS: FishingRef[] = [
  {
    id: 'crevette-bouquet',
    kind: 'species',
    label: 'Crevette bouquet',
    labelPlural: 'Crevettes bouquet'
  },
  { id: 'etrille', kind: 'species', label: 'Étrille', labelPlural: 'Étrilles' },
  { id: 'homard', kind: 'species', label: 'Homard', labelPlural: 'Homard' },
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
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
  ...over
});

const weather = (over: Partial<TripWeather> = {}): TripWeather => ({
  tempMin: 15,
  tempMax: 25,
  windMax: 12,
  windDir: 180,
  weatherCode: 0,
  seaTemperature: 19,
  ...over
});

const tide = (over: Partial<FlatTide>): FlatTide =>
  ({
    date: '2026-08-11',
    time: '12:00',
    height: 5,
    type: 'high',
    navihan: {},
    coefficient: 80,
    ...over
  }) as FlatTide;

describe('summarizeLog', () => {
  it('ne confond jamais les prises saisies et les individus', () => {
    const summary = summarizeLog([
      trip({ catches: [cat({ speciesId: 'crevette-bouquet', quantity: 25 }), cat()] })
    ]);

    expect(summary.catchLines).toBe(2);
    expect(summary.individuals).toBe(26);
  });

  it('compte une sortie sans prise comme une bredouille', () => {
    const summary = summarizeLog([trip(), trip({ catches: [cat()] })]);

    expect(summary.trips).toBe(2);
    expect(summary.blankTrips).toBe(1);
  });

  it('sépare les individus gardés des relâchés', () => {
    const summary = summarizeLog([
      trip({ catches: [cat({ quantity: 3 }), cat({ quantity: 2, kept: false })] })
    ]);

    expect(summary.kept).toBe(3);
    expect(summary.released).toBe(2);
  });

  it('borne la période couverte quel que soit l’ordre des sorties', () => {
    const summary = summarizeLog([
      trip({ date: '2026-09-12' }),
      trip({ date: '2026-08-11' }),
      trip({ date: '2026-08-30' })
    ]);

    expect(summary.firstDate).toBe('2026-08-11');
    expect(summary.lastDate).toBe('2026-09-12');
  });

  it('rend un bilan vide sans date sur un carnet vide', () => {
    const summary = summarizeLog([]);

    expect(summary.trips).toBe(0);
    expect(summary.firstDate).toBeNull();
    expect(summary.lastDate).toBeNull();
  });
});

describe('speciesRanking', () => {
  const TRIPS = [
    trip({
      date: '2026-08-11',
      catches: [cat({ speciesId: 'crevette-bouquet', quantity: 15 }), cat({ quantity: 2 })]
    }),
    trip({
      date: '2026-08-22',
      catches: [cat({ speciesId: 'crevette-bouquet', quantity: 10 }), cat({ quantity: 1 })]
    }),
    trip({ date: '2026-09-02', catches: [cat({ speciesId: 'homard', quantity: 1 })] })
  ];

  it('classe les espèces par individus décroissants', () => {
    expect(speciesRanking(TRIPS, REFS).map(s => s.id)).toEqual([
      'crevette-bouquet',
      'etrille',
      'homard'
    ]);
  });

  it('prend le libellé et son pluriel dans le référentiel, sans jamais les calculer', () => {
    const shrimp = speciesRanking(TRIPS, REFS)[0];

    expect(shrimp.label).toBe('Crevette bouquet');
    expect(shrimp.labelPlural).toBe('Crevettes bouquet');
  });

  it('affiche brut un identifiant disparu du référentiel', () => {
    const [only] = speciesRanking([trip({ catches: [cat({ speciesId: 'licorne' })] })], REFS);

    expect(only.label).toBe('licorne');
    expect(only.labelPlural).toBe('licorne');
  });

  it('compte les sorties où l’espèce apparaît, pas les lignes saisies', () => {
    const [only] = speciesRanking(
      [trip({ catches: [cat({ quantity: 2 }), cat({ quantity: 3 })] })],
      REFS
    );

    expect(only.lines).toBe(2);
    expect(only.trips).toBe(1);
    expect(only.individuals).toBe(5);
  });

  it('retient la meilleure sortie de chaque espèce, prises du jour cumulées', () => {
    const shrimp = speciesRanking(TRIPS, REFS)[0];

    expect(shrimp.best).toEqual({ date: '2026-08-11', quantity: 15 });
  });

  it('ventile gardés et relâchés par espèce', () => {
    const [only] = speciesRanking(
      [trip({ catches: [cat({ quantity: 4 }), cat({ quantity: 1, kept: false })] })],
      REFS
    );

    expect(only.kept).toBe(4);
    expect(only.released).toBe(1);
  });
});

describe('gearRanking', () => {
  it('compte les individus et les sorties de chaque engin', () => {
    const ranking = gearRanking(
      [
        trip({
          catches: [
            cat({ gearId: 'casier-crevettes', speciesId: 'crevette-bouquet', quantity: 15 }),
            cat({ quantity: 2 })
          ]
        }),
        trip({ catches: [cat({ quantity: 3 })] })
      ],
      REFS
    );

    expect(ranking.map(g => [g.id, g.individuals, g.trips])).toEqual([
      ['casier-crevettes', 15, 1],
      ['casier-crabes', 5, 2]
    ]);
  });
});

describe('compare', () => {
  const dim: Dimension = {
    id: 'baited',
    title: 'Casiers boëttés',
    keyOf: t => (t.baited ? 'Oui' : 'Non'),
    order: ['Oui', 'Non']
  };

  it('moyenne les individus par sortie, espèce par espèce', () => {
    const result = compare(
      [
        trip({ baited: true, catches: [cat({ speciesId: 'crevette-bouquet', quantity: 20 })] }),
        trip({ baited: true, catches: [cat({ speciesId: 'crevette-bouquet', quantity: 10 })] }),
        trip({ baited: false, catches: [cat({ speciesId: 'homard', quantity: 1 })] })
      ],
      ['crevette-bouquet', 'homard'],
      dim
    );

    expect(result.rows[0]).toMatchObject({ label: 'Oui', trips: 2, perSpecies: [15, 0] });
    expect(result.rows[1]).toMatchObject({ label: 'Non', trips: 1, perSpecies: [0, 1] });
  });

  it('ne laisse pas une espèce abondante écraser une autre colonne', () => {
    const result = compare(
      [
        trip({ baited: true, catches: [cat({ speciesId: 'crevette-bouquet', quantity: 25 })] }),
        trip({ baited: false, catches: [cat({ speciesId: 'homard', quantity: 1 })] })
      ],
      ['homard'],
      dim
    );

    // Le groupe « Oui », pourtant riche de 25 individus, reste à zéro homard.
    expect(result.rows[0].perSpecies[0]).toBe(0);
    expect(result.rows[1].perSpecies[0]).toBe(1);
  });

  it('respecte l’ordre imposé et n’invente pas les groupes sans sortie', () => {
    const result = compare([trip({ baited: false })], ['etrille'], dim);

    expect(result.rows.map(r => r.label)).toEqual(['Non']);
  });

  it('compte à part les sorties que la dimension ne sait pas classer', () => {
    const result = compare(
      [trip({ baited: true }), trip()],
      [],
      { id: 'x', title: 'X', keyOf: t => (t.baited ? 'Oui' : null) }
    );

    expect(result.excluded).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('compte les bredouilles de chaque groupe', () => {
    const result = compare(
      [trip({ baited: true }), trip({ baited: true, catches: [cat()] })],
      ['etrille'],
      dim
    );

    expect(result.rows[0]).toMatchObject({ trips: 2, blankTrips: 1 });
  });
});

describe('buildDimensions', () => {
  const TIDES = [
    tide({ date: '2026-08-11', coefficient: 95 }),
    tide({ date: '2026-08-11', time: '23:00', coefficient: 98 }),
    tide({ date: '2026-08-12', coefficient: 40 })
  ];
  const dims = buildDimensions(TIDES);
  const find = (id: string): Dimension => dims.find(d => d.id === id) as Dimension;

  it('propose les six croisements', () => {
    expect(dims.map(d => d.id)).toEqual(['baited', 'coef', 'month', 'wind', 'sea', 'sky']);
  });

  it('classe une sortie dans la bande du plus fort coefficient du jour', () => {
    expect(find('coef').keyOf(trip({ date: '2026-08-11' }))).toBe('Grande vive-eau');
    expect(find('coef').keyOf(trip({ date: '2026-08-12' }))).toBe('Morte-eau');
  });

  it('exclut une sortie dont le jour n’a pas de coefficient connu', () => {
    expect(find('coef').keyOf(trip({ date: '2026-12-25' }))).toBeNull();
  });

  it('range les mois chronologiquement et les écrit en toutes lettres', () => {
    const month = find('month');

    expect(month.keyOf(trip({ date: '2026-09-02' }))).toBe('2026-09');
    expect(month.labelOf?.('2026-09')).toBe('Septembre 2026');
  });

  it('regroupe le vent en trois tranches de Beaufort', () => {
    const wind = find('wind');

    expect(wind.keyOf(trip({ weather: weather({ windMax: 12 }) }))).toBe('0–3 Bft');
    expect(wind.keyOf(trip({ weather: weather({ windMax: 24 }) }))).toBe('4 Bft');
    expect(wind.keyOf(trip({ weather: weather({ windMax: 45 }) }))).toBe('5 Bft et plus');
  });

  it('regroupe la température de l’eau en trois bandes', () => {
    const sea = find('sea');

    expect(sea.keyOf(trip({ weather: weather({ seaTemperature: 17.2 }) }))).toBe('< 18 °C');
    expect(sea.keyOf(trip({ weather: weather({ seaTemperature: 19 }) }))).toBe('18–20 °C');
    expect(sea.keyOf(trip({ weather: weather({ seaTemperature: 20.8 }) }))).toBe('≥ 20 °C');
  });

  it('regroupe les codes WMO en quatre ciels', () => {
    const sky = find('sky');

    expect(sky.keyOf(trip({ weather: weather({ weatherCode: 0 }) }))).toBe('Clair');
    expect(sky.keyOf(trip({ weather: weather({ weatherCode: 45 }) }))).toBe('Couvert');
    expect(sky.keyOf(trip({ weather: weather({ weatherCode: 51 }) }))).toBe('Pluie');
    expect(sky.keyOf(trip({ weather: weather({ weatherCode: 95 }) }))).toBe('Orage');
  });

  it('exclut des croisements météo une sortie dont la capture a échoué', () => {
    for (const id of ['wind', 'sea', 'sky']) {
      expect(find(id).keyOf(trip({ weather: null }))).toBeNull();
    }
    expect(find('sea').keyOf(trip({ weather: weather({ seaTemperature: null }) }))).toBeNull();
  });
});
