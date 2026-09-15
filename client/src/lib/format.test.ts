import { describe, expect, it } from 'vitest';
import { relativeDayHint, relativeDayLabel, weekdayIndex } from './format';

describe('relativeDayLabel', () => {
  const today = '2026-07-26';

  it('names today and tomorrow in words', () => {
    expect(relativeDayLabel(today, today)).toBe("aujourd'hui");
    expect(relativeDayLabel('2026-07-27', today)).toBe('demain');
  });

  it('falls back to the formatted date beyond tomorrow', () => {
    expect(relativeDayLabel('2026-07-28', today)).toBe('mar. 28 juil.');
  });

  it('crosses month and year boundaries', () => {
    expect(relativeDayLabel('2026-08-01', '2026-07-31')).toBe('demain');
    expect(relativeDayLabel('2027-01-01', '2026-12-31')).toBe('demain');
  });

  it('falls back to the formatted date for a past day', () => {
    expect(relativeDayLabel('2026-07-25', today)).toBe('sam. 25 juil.');
  });
});

describe('relativeDayHint', () => {
  const today = '2026-07-26';

  it('nomme aujourd’hui et demain', () => {
    expect(relativeDayHint(today, today)).toBe("aujourd'hui");
    expect(relativeDayHint('2026-07-27', today)).toBe('demain');
  });

  // C'est tout l'intérêt du repère : il se tait quand la date est déjà écrite à côté.
  it('se tait au-delà de demain, plutôt que de formater la date', () => {
    expect(relativeDayHint('2026-07-28', today)).toBeNull();
    expect(relativeDayHint('2026-07-25', today)).toBeNull();
  });

  it('franchit les bornes de mois et d’année', () => {
    expect(relativeDayHint('2026-08-01', '2026-07-31')).toBe('demain');
    expect(relativeDayHint('2027-01-01', '2026-12-31')).toBe('demain');
  });
});

describe('weekdayIndex', () => {
  it('compte à partir du lundi (convention des statistiques serveur)', () => {
    // Semaine complète du lundi 27 juillet au dimanche 2 août 2026.
    expect(weekdayIndex('2026-07-27')).toBe(0); // lundi
    expect(weekdayIndex('2026-07-28')).toBe(1);
    expect(weekdayIndex('2026-07-29')).toBe(2);
    expect(weekdayIndex('2026-07-30')).toBe(3);
    expect(weekdayIndex('2026-07-31')).toBe(4);
    expect(weekdayIndex('2026-08-01')).toBe(5); // samedi
    expect(weekdayIndex('2026-08-02')).toBe(6); // dimanche
  });

  it('reste stable de part et d’autre du changement d’heure', () => {
    expect(weekdayIndex('2026-03-29')).toBe(6); // dimanche du passage à l'heure d'été
    expect(weekdayIndex('2026-10-25')).toBe(6); // dimanche du retour à l'heure d'hiver
  });
});
