import { describe, expect, it } from 'vitest';
import { auditTides } from './tidesAudit';

/** Journée saine : deux pleines mers, deux basses mers, alternées. */
const cleanDay = [
  { maree: 'haute', heure: '05:36', hauteur: '4.52', coefficient: '69' },
  { maree: 'basse', heure: '11:42', hauteur: '1.52' },
  { maree: 'haute', heure: '17:44', hauteur: '4.83', coefficient: '72' },
  { maree: 'basse', heure: '23:52', hauteur: '1.74' }
];

describe('auditTides', () => {
  it('ne signale rien sur des données saines', () => {
    expect(auditTides({ '2026-07-29': cleanDay })).toEqual([]);
  });

  it('accepte les sections groupées par mois comme les clés date directes', () => {
    expect(auditTides({ juillet: { '2026-07-29': cleanDay } })).toEqual([]);
  });

  it('signale une heure manquante ou mal formée', () => {
    const found = auditTides({
      '2026-08-13': [
        { maree: 'haute', heure: '05:58', hauteur: '5.13' },
        { maree: 'basse', hauteur: '0.76' }, // pas d'heure
        { maree: 'basse', heure: '25:99', hauteur: '0.85' } // heure impossible
      ]
    });
    const times = found.filter(a => a.kind === 'heure-invalide');
    expect(times).toHaveLength(2);
    expect(times[0].date).toBe('2026-08-13');
  });

  it('signale une hauteur non numérique', () => {
    const found = auditTides({
      '2026-08-13': [{ maree: 'basse', heure: '11:55', hauteur: 'n/a' }]
    });
    expect(found.filter(a => a.kind === 'hauteur-invalide')).toHaveLength(1);
  });

  it('signale un type de marée inconnu', () => {
    const found = auditTides({
      '2026-08-13': [{ maree: 'moyenne', heure: '11:55', hauteur: '1.00' }]
    });
    expect(found.filter(a => a.kind === 'type-invalide')).toHaveLength(1);
  });

  // Deux extrêmes de même type qui se suivent : soit un doublon, soit un extrême manquant.
  it('signale une rupture d’alternance, y compris par-dessus minuit', () => {
    const found = auditTides({
      '2026-07-29': [
        { maree: 'haute', heure: '17:44', hauteur: '4.83' },
        { maree: 'basse', heure: '23:52', hauteur: '1.74' }
      ],
      '2026-07-30': [
        { maree: 'basse', heure: '00:04', hauteur: '1.37' },
        { maree: 'haute', heure: '06:06', hauteur: '4.64' }
      ]
    });
    const breaks = found.filter(a => a.kind === 'alternance');
    expect(breaks).toHaveLength(1);
    expect(breaks[0].message).toContain('23:52');
    expect(breaks[0].message).toContain('00:04');
  });

  it('signale deux extrêmes anormalement rapprochés', () => {
    const found = auditTides({
      '2026-07-29': [
        { maree: 'basse', heure: '23:52', hauteur: '1.74' },
        { maree: 'haute', heure: '23:58', hauteur: '4.00' } // 6 min plus tard
      ]
    });
    expect(found.filter(a => a.kind === 'rapprochees')).toHaveLength(1);
  });

  it('trie les anomalies par date', () => {
    const found = auditTides({
      '2026-09-02': [{ maree: 'basse', hauteur: '1.00' }],
      '2026-08-01': [{ maree: 'basse', hauteur: '1.00' }]
    });
    expect(found.map(a => a.date)).toEqual(['2026-08-01', '2026-09-02']);
  });

  it('ne jette pas sur une entrée absurde', () => {
    expect(() => auditTides(null)).not.toThrow();
    expect(auditTides(null)).toEqual([]);
    expect(auditTides({ '2026-08-01': 'pas un tableau' })).toEqual([]);
  });
});
