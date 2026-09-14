import { describe, expect, it } from 'vitest';
import { calibrateAflot, MIN_AFLOT_SAMPLES } from './aflotCalibration';
import { aflotTimeByThreshold } from './navihan';
import type { FlatTide } from '../types';

/**
 * Relevés **réels** de remise à flot constatée (base de production, 2026-07-25 → 2026-09-13), avec
 * la basse mer Port-Tudy et la pleine mer suivante de chaque jour.
 *
 * C'est la fixture de référence de l'étalonnage : un test qui figerait des valeurs calculées ne
 * dirait rien de la **justesse** du modèle. Coefficients 32 à 101, basses mers 0,73 → 2,25 m.
 */
const RELEVES = [
  { date: '2026-07-25', low: '08:23', hLow: 2.17, high: '15:06', hHigh: 4.11, coef: 40, observed: '11:07' },
  { date: '2026-07-27', low: '10:28', hLow: 1.88, high: '16:35', hHigh: 4.5, coef: 57, observed: '13:09' },
  { date: '2026-07-28', low: '11:07', hLow: 1.68, high: '17:11', hHigh: 4.68, coef: 65, observed: '13:50' },
  { date: '2026-07-29', low: '11:42', hLow: 1.52, high: '17:44', hHigh: 4.83, coef: 72, observed: '14:32' },
  { date: '2026-07-30', low: '12:16', hLow: 1.39, high: '18:16', hHigh: 4.95, coef: 78, observed: '15:10' },
  { date: '2026-07-31', low: '12:50', hLow: 1.3, high: '18:48', hHigh: 5.02, coef: 82, observed: '15:42' },
  { date: '2026-08-04', low: '15:09', hLow: 1.51, high: '21:13', hHigh: 4.71, coef: 70, observed: '18:07' },
  { date: '2026-08-05', low: '15:56', hLow: 1.69, high: '22:00', hHigh: 4.48, coef: 61, observed: '18:56' },
  { date: '2026-08-08', low: '06:25', hLow: 1.97, high: '13:23', hHigh: 4.15, coef: 53, observed: '09:31' },
  { date: '2026-08-10', low: '09:16', hLow: 1.71, high: '15:59', hHigh: 4.71, coef: 66, observed: '12:22' },
  { date: '2026-08-11', low: '10:17', hLow: 1.38, high: '16:41', hHigh: 5.03, coef: 81, observed: '13:22' },
  { date: '2026-08-13', low: '11:55', hLow: 0.85, high: '18:10', hHigh: 5.45, coef: 100, observed: '15:00' },
  { date: '2026-08-23', low: '08:15', hLow: 2.25, high: '14:47', hHigh: 4.03, coef: 32, observed: '10:43' },
  { date: '2026-08-24', low: '09:22', hLow: 2.22, high: '15:36', hHigh: 4.27, coef: 44, observed: '12:07' },
  { date: '2026-08-29', low: '12:23', hLow: 1.09, high: '18:22', hHigh: 5.27, coef: 91, observed: '15:08' },
  { date: '2026-09-02', low: '14:48', hLow: 1.38, high: '20:42', hHigh: 4.78, coef: 75, observed: '17:47' },
  { date: '2026-09-12', low: '12:16', hLow: 0.73, high: '18:19', hHigh: 5.44, coef: 101, observed: '15:20' },
  { date: '2026-09-13', low: '12:54', hLow: 0.86, high: '18:49', hHigh: 5.32, coef: 97, observed: '15:56' }
];

type Releve = (typeof RELEVES)[number];

function tides(releves: Releve[]): FlatTide[] {
  return releves.flatMap(r => [
    { date: r.date, time: r.low, type: 'low' as const, height: r.hLow, coefficient: null, navihan: {} },
    { date: r.date, time: r.high, type: 'high' as const, height: r.hHigh, coefficient: r.coef, navihan: {} }
  ]);
}

function observations(releves: Releve[]): Record<string, string> {
  return Object.fromEntries(releves.map(r => [`${r.date} ${r.low}`, r.observed]));
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Écarts (min) entre l'estimation du modèle étalonné et l'heure réellement constatée. */
function errors(refHeight: number, releves: Releve[] = RELEVES): number[] {
  const all = tides(RELEVES);
  return releves.map(r => {
    const low = all.find(t => t.date === r.date && t.time === r.low && t.type === 'low')!;
    const est = aflotTimeByThreshold(all, low, refHeight)!;
    expect(est.date).toBe(r.date);
    return Math.abs(minutes(est.time) - minutes(r.observed));
  });
}

describe('calibrateAflot — relevés réels', () => {
  it('étalonne le niveau sur les 18 relevés', () => {
    const c = calibrateAflot(tides(RELEVES), observations(RELEVES), 2.5);
    expect(c.calibrated).toBe(true);
    expect(c.samples).toBe(18);
    expect(c.refHeight).toBeCloseTo(3.016, 2);
  });

  it("prédit les heures constatées à moins de 6 min d'écart moyen et 20 min au pire", () => {
    const { refHeight, mae } = calibrateAflot(tides(RELEVES), observations(RELEVES), 2.5);
    const e = errors(refHeight);
    const mean = e.reduce((s, x) => s + x, 0) / e.length;
    expect(mean).toBeLessThan(6);
    expect(Math.max(...e)).toBeLessThan(20);
    // `mae` doit dire la même chose que le modèle rejoué de bout en bout.
    expect(mae!).toBeCloseTo(mean, 0);
  });

  it("fait mieux que le décalage fixe de 2h50, qu'il est censé raffiner", () => {
    const { refHeight } = calibrateAflot(tides(RELEVES), observations(RELEVES), 2.5);
    const model = errors(refHeight).reduce((s, x) => s + x, 0) / RELEVES.length;
    const fixed =
      RELEVES.map(r => Math.abs(minutes(r.observed) - (minutes(r.low) + 170))).reduce((s, x) => s + x, 0) /
      RELEVES.length;
    expect(model).toBeLessThan(fixed);
  });

  it('converge dès les 4 premiers relevés', () => {
    // Calé sur 4 relevés seulement, le modèle doit déjà tenir sur les 14 suivants : c'est ce qui
    // justifie `MIN_AFLOT_SAMPLES = 4` plutôt qu'un seuil prudent qui ne servirait jamais.
    const head = RELEVES.slice(0, MIN_AFLOT_SAMPLES);
    const { refHeight } = calibrateAflot(tides(RELEVES), observations(head), 2.5);
    const e = errors(refHeight, RELEVES.slice(MIN_AFLOT_SAMPLES));
    expect(e.reduce((s, x) => s + x, 0) / e.length).toBeLessThan(8);
  });

  it('encaisse une saisie fautive sans se déplacer (médiane, pas moyenne)', () => {
    const sane = calibrateAflot(tides(RELEVES), observations(RELEVES), 2.5);
    const faulty = { ...observations(RELEVES) };
    faulty['2026-07-25 08:23'] = '11:37'; // +30 min
    const shifted = calibrateAflot(tides(RELEVES), faulty, 2.5);
    expect(Math.abs(shifted.refHeight - sane.refHeight)).toBeLessThan(0.05);
    // Et l'erreur sur les relevés restés sains ne bouge pas.
    const rest = RELEVES.slice(1);
    const before = errors(sane.refHeight, rest).reduce((s, x) => s + x, 0) / rest.length;
    const after = errors(shifted.refHeight, rest).reduce((s, x) => s + x, 0) / rest.length;
    expect(after).toBeLessThan(before + 1);
  });
});

describe('calibrateAflot — repli et rejets', () => {
  const three = RELEVES.slice(0, 3);

  it('retombe sur le réglage sous le minimum de relevés', () => {
    const c = calibrateAflot(tides(three), observations(three), 2.5);
    expect(c).toEqual({ refHeight: 2.5, samples: 3, mae: null, calibrated: false });
  });

  it('ignore une observation dont la basse mer est inconnue', () => {
    const c = calibrateAflot(tides(RELEVES), { ...observations(RELEVES), '2026-01-01 03:00': '05:00' }, 2.5);
    expect(c.samples).toBe(18);
  });

  it("ignore une basse mer sans pleine mer suivante", () => {
    const last = RELEVES[RELEVES.length - 1];
    const orphan: FlatTide = {
      date: '2026-09-20', time: '10:00', type: 'low', height: 1.5, coefficient: null, navihan: {}
    };
    const c = calibrateAflot(
      [...tides(RELEVES), orphan],
      { ...observations(RELEVES), '2026-09-20 10:00': '13:00' },
      2.5
    );
    expect(c.samples).toBe(18);
    expect(last.date).toBe('2026-09-13'); // l'orphelin est bien après tout le jeu
  });

  it('ignore une heure constatée hors de la montante', () => {
    const after = { ...observations(RELEVES) };
    after['2026-07-25 08:23'] = '16:00'; // après la pleine mer de 15:06
    expect(calibrateAflot(tides(RELEVES), after, 2.5).samples).toBe(17);
  });

  it('rattache au lendemain une heure constatée qui franchit minuit', () => {
    const night: FlatTide[] = [
      { date: '2026-10-01', time: '22:30', type: 'low', height: 1, coefficient: null, navihan: {} },
      { date: '2026-10-02', time: '04:30', type: 'high', height: 5, coefficient: 80, navihan: {} }
    ];
    // 01:15 se lit « avant » 22:30 : sans report au lendemain le relevé serait rejeté.
    const c = calibrateAflot(night, { '2026-10-01 22:30': '01:15' }, 2.5, 1);
    expect(c.calibrated).toBe(true);
    expect(c.samples).toBe(1);
  });
});
