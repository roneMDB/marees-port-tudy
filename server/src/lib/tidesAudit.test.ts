import { describe, expect, it } from 'vitest';
import { auditTides, formatAuditMarkdown } from './tidesAudit';

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

describe('formatAuditMarkdown', () => {
  const clean = { label: 'Étel', file: 'horaires_marees_etel.json', anomalies: [] };
  const dirty = {
    label: 'Port-Tudy',
    file: 'horaires_marees_port-tudy.json',
    anomalies: [
      { date: '2026-08-15', kind: 'rapprochees' as const, message: '01:09 et 01:12 : 3 min' },
      { date: '2026-08-21', kind: 'alternance' as const, message: 'deux marées basses de suite' }
    ]
  };

  it('titre le rapport et résume chaque site dans un tableau', () => {
    const md = formatAuditMarkdown([dirty, clean]);
    expect(md).toContain('# Rapport de cohérence des horaires de marées');
    expect(md).toContain('| Port-Tudy | `horaires_marees_port-tudy.json` | 2 |');
    expect(md).toContain('| Étel | `horaires_marees_etel.json` | 0 |');
  });

  it('détaille les anomalies en tableau markdown', () => {
    const md = formatAuditMarkdown([dirty]);
    expect(md).toContain('## Port-Tudy');
    expect(md).toContain('| 2026-08-15 | `rapprochees` | 01:09 et 01:12 : 3 min |');
    expect(md).toContain('| 2026-08-21 | `alternance` | deux marées basses de suite |');
  });

  it('signale explicitement un site sans anomalie', () => {
    const md = formatAuditMarkdown([clean]);
    expect(md).toContain('Aucune anomalie');
    expect(md).not.toContain('| Date |'); // pas de tableau de détail inutile
  });

  it('conclut sur le total et rappelle que rien n’est modifié', () => {
    expect(formatAuditMarkdown([dirty, clean])).toMatch(/2 anomalies/);
    expect(formatAuditMarkdown([clean])).toMatch(/Aucune anomalie détectée/);
    expect(formatAuditMarkdown([dirty])).toContain('Aucune donnée n’a été modifiée');
  });

  it('n’ajoute une date que si on la lui fournit (sortie déterministe sinon)', () => {
    expect(formatAuditMarkdown([clean])).not.toMatch(/Généré le/);
    expect(formatAuditMarkdown([clean], '2026-07-26')).toContain('Généré le 2026-07-26');
  });

  it('échappe les barres verticales pour ne pas casser les tableaux', () => {
    const md = formatAuditMarkdown([
      { label: 'X', file: 'x.json', anomalies: [{ date: '2026-01-01', kind: 'alternance', message: 'a | b' }] }
    ]);
    expect(md).toContain('a \\| b');
  });
});
