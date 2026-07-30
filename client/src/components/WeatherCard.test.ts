import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import WeatherCard from './WeatherCard.vue';
import { resetWeatherForTests } from '../composables/useWeather';
import { getWeather } from '../api/weather';
import type { Weather } from '../types';

vi.mock('../api/weather', () => ({ getWeather: vi.fn() }));
// `useSettings` persiste toute mutation via un watch débouncé : sans ce mock, le montage
// déclencherait un vrai fetch dans jsdom.
vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue(undefined)
}));

/** Vent de 16 km/h (force 3, petite brise) et rafales de 46 km/h (force 6, vent frais). */
const weather = {
  location: { latitude: 47.677, longitude: -3.166, timezone: 'Europe/Paris' },
  units: { temperature: '°C', wind: 'km/h', precipitation: 'mm', wave: 'm', wavePeriod: 's' },
  current: {
    time: '2026-07-30T12:00',
    temperature: 24,
    apparentTemperature: 22,
    weatherCode: 0,
    weatherText: 'Ciel clair',
    windSpeed: 16,
    windGusts: 46,
    windDirection: 270,
    precipitation: 0
  },
  daily: [
    {
      date: '2026-07-30',
      weatherCode: 0,
      weatherText: 'Ciel clair',
      tempMin: 16,
      tempMax: 24,
      precipitation: 0,
      windMax: 24,
      gustMax: 40,
      windDirection: 270,
      uvIndexMax: 6.95
    }
  ],
  marine: null
} satisfies Weather;

async function mountCard() {
  const wrapper = mount(WeatherCard);
  await flushPromises();
  return wrapper;
}

describe('WeatherCard — vent', () => {
  beforeEach(() => {
    resetWeatherForTests();
    vi.mocked(getWeather).mockResolvedValue(weather);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exprime le vent du moment en km/h et en Beaufort, sur la même ligne', async () => {
    const line = (await mountCard()).get('.bi-wind').element.parentElement!.textContent!;
    expect(line).toContain('16 km/h');
    // Force et libellé séparés : Vue élague les blancs de tête d'un nœud texte, ce qui avait
    // donné « 3 Bftpetite brise ».
    expect(line).toContain('3 Bft, petite brise');
  });

  it('donne aussi les rafales dans les deux unités', async () => {
    const line = (await mountCard()).get('.bi-wind').element.parentElement!.textContent!;
    expect(line).toContain('rafales 46 km/h');
    expect(line).toContain('6 Bft'); // 46 km/h → force 6
  });

  it('donne les deux unités dans les tuiles de prévision, sans libellé', async () => {
    const tile = (await mountCard()).findAll('.border.rounded')[0].text();
    expect(tile).toContain('24 km/h');
    expect(tile).toContain('4 Bft');
    expect(tile).not.toContain('jolie brise'); // l'espace est compté dans une tuile
  });
});
