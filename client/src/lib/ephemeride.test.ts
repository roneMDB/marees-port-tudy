import { describe, expect, it } from 'vitest';
import {
  EPHEMERIDE_LOCATION,
  dayOfYear,
  daylightDelta,
  formatDuration,
  formatTimeInZone,
  isoWeek,
  moonPhase,
  nextSyzygy,
  sunTimes
} from './ephemeride';

/** Minutes depuis minuit en heure de Paris — comparaison indépendante du fuseau de la machine. */
function minutesInParis(date: Date): number {
  const [h, m] = formatTimeInZone(date).split(':').map(Number);
  return h * 60 + m;
}

function hhmm(text: string): number {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

describe('sunTimes', () => {
  /**
   * Valeurs de référence relevées sur Open-Meteo pour les coordonnées de Belz (API forecast pour
   * juillet, archive pour les dates passées, ramenées en heure locale réelle). L'accord est de
   * l'ordre de la minute : c'est la précision attendue de la série NOAA tronquée, et Open-Meteo
   * tronque de son côté les secondes.
   */
  const REFERENCE = [
    { date: '2026-07-30', sunrise: '06:47', sunset: '21:50' },
    { date: '2025-12-21', sunrise: '08:58', sunset: '17:23' },
    { date: '2026-01-15', sunrise: '08:56', sunset: '17:47' },
    // Jour du passage à l'heure d'été : vérifie aussi le rendu du fuseau.
    { date: '2026-03-29', sunrise: '07:56', sunset: '20:37' }
  ];

  it.each(REFERENCE)('correspond à la référence Open-Meteo le $date', ({ date, sunrise, sunset }) => {
    const s = sunTimes(date);
    expect(Math.abs(minutesInParis(s.sunrise!) - hhmm(sunrise))).toBeLessThanOrEqual(2);
    expect(Math.abs(minutesInParis(s.sunset!) - hhmm(sunset))).toBeLessThanOrEqual(2);
  });

  it('place le midi solaire au milieu du jour et en déduit la durée', () => {
    const s = sunTimes('2026-07-30');
    const middle = (s.sunrise!.getTime() + s.sunset!.getTime()) / 2;
    expect(Math.abs(middle - s.solarNoon.getTime())).toBeLessThan(1000);
    expect(s.daylightMinutes).toBeCloseTo((s.sunset!.getTime() - s.sunrise!.getTime()) / 60_000, 3);
  });

  it('utilise Belz par défaut', () => {
    expect(sunTimes('2026-07-30')).toEqual(
      sunTimes('2026-07-30', EPHEMERIDE_LOCATION.latitude, EPHEMERIDE_LOCATION.longitude)
    );
  });

  it('donne un jour plus long au solstice d’été qu’au solstice d’hiver', () => {
    expect(sunTimes('2026-06-21').daylightMinutes).toBeGreaterThan(sunTimes('2026-12-21').daylightMinutes);
  });

  it('accepte une autre hauteur du soleil (crépuscule civil = −6°)', () => {
    const standard = sunTimes('2026-07-30');
    const civil = sunTimes('2026-07-30', EPHEMERIDE_LOCATION.latitude, EPHEMERIDE_LOCATION.longitude, -6);
    // L'aube civile précède le lever du soleil.
    expect(civil.sunrise!.getTime()).toBeLessThan(standard.sunrise!.getTime());
    expect(civil.daylightMinutes).toBeGreaterThan(standard.daylightMinutes);
  });

  it('signale la nuit et le jour polaires sans lever ni coucher', () => {
    const polarNight = sunTimes('2026-12-21', 78.2, 15.6); // Svalbard
    expect(polarNight.sunrise).toBeNull();
    expect(polarNight.sunset).toBeNull();
    expect(polarNight.daylightMinutes).toBe(0);

    const polarDay = sunTimes('2026-06-21', 78.2, 15.6);
    expect(polarDay.sunrise).toBeNull();
    expect(polarDay.daylightMinutes).toBe(1440);
  });
});

describe('formatTimeInZone', () => {
  it('formate en HH:MM dans le fuseau demandé', () => {
    const instant = new Date('2026-07-30T04:47:00Z');
    expect(formatTimeInZone(instant)).toBe('06:47'); // Europe/Paris, heure d'été
    expect(formatTimeInZone(instant, 'UTC')).toBe('04:47');
  });

  it('tient compte du changement d’heure', () => {
    const instant = new Date('2026-01-15T07:56:00Z');
    expect(formatTimeInZone(instant)).toBe('08:56'); // heure d'hiver : UTC+1
  });
});

describe('formatDuration', () => {
  it('formate une durée en heures et minutes', () => {
    expect(formatDuration(904)).toBe('15 h 04');
    expect(formatDuration(60)).toBe('1 h 00');
    expect(formatDuration(0)).toBe('0 h 00');
  });
});

describe('daylightDelta', () => {
  it('décroît après le solstice d’été et croît après celui d’hiver', () => {
    expect(daylightDelta('2026-07-30')).toBeLessThan(0);
    expect(daylightDelta('2026-01-15')).toBeGreaterThan(0);
  });

  it('est quasi nul au solstice', () => {
    expect(Math.abs(daylightDelta('2026-06-21')!)).toBeLessThan(1);
  });

  it('franchit le changement d’année', () => {
    expect(daylightDelta('2026-01-01')).not.toBeNull();
  });
});

describe('nextSyzygy', () => {
  /**
   * Ancres vérifiables : une éclipse coïncide nécessairement avec une syzygie. Instants publiés
   * (UTC) de quatre éclipses de 2026 — éclipse totale de Soleil du 12 août, éclipse annulaire du
   * 17 février, éclipses de Lune des 3 mars et 28 août.
   */
  const ECLIPSES = [
    { from: '2026-02-10', kind: 'new', at: '2026-02-17T12:01:00Z' },
    { from: '2026-02-25', kind: 'full', at: '2026-03-03T11:38:00Z' },
    { from: '2026-08-05', kind: 'new', at: '2026-08-12T17:37:00Z' },
    { from: '2026-08-20', kind: 'full', at: '2026-08-28T04:18:00Z' }
  ] as const;

  it.each(ECLIPSES)('trouve la syzygie du $at depuis le $from', ({ from, kind, at }) => {
    const s = nextSyzygy(from);
    expect(s.kind).toBe(kind);
    // Tolérance de 5 min : les termes de Meeus non retenus valent moins d'une minute.
    expect(Math.abs(s.at.getTime() - Date.parse(at))).toBeLessThan(5 * 60_000);
  });

  it('compte les jours restants en dates locales', () => {
    const s = nextSyzygy('2026-08-10');
    expect(s.date).toBe('2026-08-12');
    expect(s.daysAway).toBe(2);
  });

  it('retient la syzygie du jour même, même déjà passée', () => {
    const s = nextSyzygy('2026-08-12');
    expect(s.date).toBe('2026-08-12');
    expect(s.daysAway).toBe(0);
  });

  it('range une syzygie du soir UT au jour local suivant', () => {
    // Pleine lune le 2026-06-29 à 23:58 UTC, soit le 30 à 01:58 en heure de Paris.
    const s = nextSyzygy('2026-06-28');
    expect(s.date).toBe('2026-06-30');
    expect(s.daysAway).toBe(2);
  });

  it('alterne nouvelle et pleine lune', () => {
    // Lendemain de la nouvelle lune du 12 → pleine lune ; lendemain de celle-ci → nouvelle lune.
    const full = nextSyzygy('2026-08-13');
    expect(full.kind).toBe('full');
    expect(nextSyzygy('2026-08-29').kind).toBe('new');
  });
});

describe('moonPhase', () => {
  it('nomme le jour d’une syzygie d’après celle-ci', () => {
    // 2026-08-28 : pleine lune à 04:19 UTC. Rapportée au mois synodique moyen, la fraction vaut
    // 0,53 et tomberait en « gibbeuse décroissante » — un almanach dit « pleine lune ».
    expect(moonPhase('2026-08-28').name).toBe('Pleine lune');
    expect(moonPhase('2026-08-12').name).toBe('Nouvelle lune');
  });

  it('donne une illumination cohérente avec la phase', () => {
    expect(moonPhase('2026-08-28').illumination).toBeGreaterThan(0.97);
    expect(moonPhase('2026-08-12').illumination).toBeLessThan(0.03);
    expect(moonPhase('2026-08-20').illumination).toBeCloseTo(0.5, 1);
  });

  it('distingue croissance et décroissance', () => {
    expect(moonPhase('2026-08-20').name).toBe('Premier quartier');
    expect(moonPhase('2026-08-05').name).toBe('Dernier quartier');
    expect(moonPhase('2026-07-30').name).toBe('Gibbeuse décroissante');
    expect(moonPhase('2026-08-16').name).toBe('Premier croissant');
  });

  it('garde l’âge dans la lunaison', () => {
    const m = moonPhase('2026-08-20');
    expect(m.age).toBeGreaterThan(0);
    expect(m.age).toBeLessThan(30);
    expect(m.fraction).toBeGreaterThan(0);
    expect(m.fraction).toBeLessThan(1);
  });

  it('associe une icône à chaque phase', () => {
    expect(moonPhase('2026-08-12').icon).toBe('bi-circle');
    expect(moonPhase('2026-08-28').icon).toBe('bi-circle-fill');
    expect(moonPhase('2026-08-20').icon).toBe('bi-circle-half');
  });
});

describe('dayOfYear', () => {
  it('donne le quantième et la longueur de l’année', () => {
    expect(dayOfYear('2026-07-30')).toEqual({ day: 211, total: 365 });
    expect(dayOfYear('2026-01-01')).toEqual({ day: 1, total: 365 });
    expect(dayOfYear('2026-12-31')).toEqual({ day: 365, total: 365 });
  });

  it('compte 366 jours les années bissextiles', () => {
    expect(dayOfYear('2024-12-31')).toEqual({ day: 366, total: 366 });
    expect(dayOfYear('2024-02-29')).toEqual({ day: 60, total: 366 });
    // 1900 n'est pas bissextile (siècle non divisible par 400), 2000 l'est.
    expect(dayOfYear('1900-03-01').day).toBe(60);
    expect(dayOfYear('2000-03-01').day).toBe(61);
  });
});

describe('isoWeek', () => {
  it('numérote les semaines ISO', () => {
    expect(isoWeek('2026-07-30')).toBe(31);
    expect(isoWeek('2026-01-01')).toBe(1); // jeudi → semaine 1
  });

  it('rattache un 1er janvier tardif à la semaine 52 ou 53 de l’année précédente', () => {
    expect(isoWeek('2021-01-01')).toBe(53); // vendredi
    expect(isoWeek('2023-01-01')).toBe(52); // dimanche
  });

  it('rattache une fin décembre à la semaine 1 de l’année suivante', () => {
    expect(isoWeek('2024-12-30')).toBe(1); // lundi
  });
});
