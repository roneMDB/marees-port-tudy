import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings, Site, TideOutput, TidesMeta } from '../types';

// --- Fixtures ---------------------------------------------------------------

const META: TidesMeta = {
  siteId: 'port-tudy',
  timezone: 'Europe/Paris',
  minDate: '2026-07-01',
  maxDate: '2026-07-31',
  navihanOffsets: { basseMer: '+1h15', aFlot: '+2h40' }
};

const SETTINGS: Settings = {
  startMode: 'date',
  startDate: '2026-07-05', // fenêtre déterministe (indépendante de « aujourd'hui »)
  rangeDays: 3,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3,
  coefDays: 5,
  weatherLinks: []
};

/** Un jour = 2 basses + 2 pleines mers. `hOffset` décale les heures (pour simuler un autre port). */
function day(_date: string, hOffset = 0, lowHeight = 1.5): TideOutput['days'][string] {
  const shift = (hh: number) => String(hh + hOffset).padStart(2, '0');
  return [
    { time: `${shift(3)}:00`, height: lowHeight, type: 'low', coefficient: null, navihan: {} },
    { time: `${shift(9)}:00`, height: 5.0, type: 'high', coefficient: 80, navihan: {} },
    { time: `${shift(15)}:00`, height: 1.6, type: 'low', coefficient: null, navihan: {} },
    { time: `${shift(21)}:00`, height: 5.1, type: 'high', coefficient: 78, navihan: {} }
  ];
}

const DATES = ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09'];

function tideOutput(siteId: string, hOffset = 0, lowHeight = 1.5): TideOutput {
  const days: TideOutput['days'] = {};
  for (const d of DATES) days[d] = day(d, hOffset, lowHeight);
  return { siteId, timezone: 'Europe/Paris', from: DATES[0], to: DATES[DATES.length - 1], days };
}

const SITES: Site[] = [
  { id: 'port-tudy', label: 'Port-Tudy' },
  { id: 'etel', label: 'Étel' }
];

const getMetaMock = vi.fn<[], Promise<TidesMeta>>();
const getTidesMock = vi.fn();
const getSitesMock = vi.fn<[], Promise<Site[]>>();
const getSettingsMock = vi.fn<[], Promise<Settings>>();
const saveSettingsMock = vi.fn();

vi.mock('../api/tides', () => ({
  getMeta: () => getMetaMock(),
  getTides: (from?: string, to?: string, site?: string) => getTidesMock(from, to, site),
  getSites: () => getSitesMock()
}));

vi.mock('../api/settings', () => ({
  getSettings: () => getSettingsMock(),
  saveSettings: (s: Settings) => saveSettingsMock(s)
}));

/** Réimporte useTides avec un état singleton frais (useSettings/useSite/useTides). */
async function freshUseTides() {
  vi.resetModules();
  return (await import('./useTides')).useTides;
}

beforeEach(() => {
  localStorage.clear();
  getMetaMock.mockReset().mockResolvedValue(META);
  getSitesMock.mockReset().mockResolvedValue(SITES);
  getSettingsMock.mockReset().mockResolvedValue({ ...SETTINGS, navihan: { ...SETTINGS.navihan } });
  saveSettingsMock.mockReset().mockResolvedValue(undefined);
  getTidesMock.mockReset().mockImplementation((_from?: string, _to?: string, site?: string) =>
    // Étel : heures décalées de +1 h et basses mers à 2.22 (marqueur détectable).
    Promise.resolve(site === 'etel' ? tideOutput('etel', 1, 2.22) : tideOutput('port-tudy'))
  );
});

afterEach(() => {
  localStorage.clear();
});

describe('useTides — port de référence (Port-Tudy)', () => {
  it('calcule la fenêtre de période configurée et navigue', async () => {
    const useTides = await freshUseTides();
    const t = useTides();
    await t.reload();

    expect(t.tablePeriod.value).toEqual({ from: '2026-07-05', to: '2026-07-08' });
    expect(t.tableTides.value.length).toBeGreaterThan(0);
    expect(t.tableTides.value.every(x => x.date >= '2026-07-05' && x.date <= '2026-07-08')).toBe(true);
    expect(t.canPrevPeriod.value).toBe(true); // 2026-07-05 > minDate
    expect(t.canNextPeriod.value).toBe(true); // 2026-07-08 < maxDate

    t.prevPeriod();
    expect(t.tablePeriod.value.from).toBe('2026-07-02');
    t.resetPeriod();
    expect(t.tablePeriod.value.from).toBe('2026-07-05');
  });

  it('dérive les heures Navihan (refTime = heure Port-Tudy pour la référence)', async () => {
    const useTides = await freshUseTides();
    const t = useTides();
    await t.reload();
    const low = t.tableTides.value.find(x => x.type === 'low');
    expect(low).toBeDefined();
    expect(low!.refTime).toBe(low!.time); // référence → refTime = sa propre heure
    expect(low!.navihan['A flot']).toBeTruthy(); // remise à flot calculée
  });

  it('borne la durée éphémère du graphe des coefficients (1–90)', async () => {
    const useTides = await freshUseTides();
    const t = useTides();
    await t.reload();
    expect(t.coefDaysView.value).toBe(5); // suit le réglage
    t.setCoefDaysView(500);
    expect(t.coefDaysView.value).toBe(90);
    t.setCoefDaysView(0);
    expect(t.coefDaysView.value).toBe(1);
    expect(t.coefTides.value.length).toBeGreaterThan(0);
  });
});

describe('useTides — port secondaire (Étel)', () => {
  it('charge les marées du port et les rattache à une heure de référence Port-Tudy', async () => {
    localStorage.setItem('marees-site', 'etel');
    const useTides = await freshUseTides();
    const t = useTides();
    await t.reload();

    // Les lignes proviennent bien du jeu Étel (basse mer marqueur 2.22).
    const etelLow = t.tableTides.value.find(x => x.type === 'low' && x.height === 2.22);
    expect(etelLow).toBeDefined();
    // Appariée à une marée Port-Tudy (décalage +1 h < tolérance 3 h) → Navihan calculé.
    expect(etelLow!.refTime).toBeTruthy();
    expect(etelLow!.navihan['A flot']).toBeTruthy();
    // getTides appelé pour le site sélectionné.
    expect(getTidesMock).toHaveBeenCalledWith(undefined, undefined, 'etel');
  });
});
