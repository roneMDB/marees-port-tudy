import { describe, expect, it } from 'vitest';
import { fetchWeather } from './weather';

const forecastJson = {
  timezone: 'Europe/Paris',
  current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', precipitation: 'mm' },
  current: {
    time: '2026-07-19T11:30',
    temperature_2m: 23.6,
    apparent_temperature: 18.7,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 25.2,
    wind_gusts_10m: 46.8,
    wind_direction_10m: 58
  },
  daily_units: { temperature_2m_max: '°C' },
  daily: {
    time: ['2026-07-19', '2026-07-20'],
    weather_code: [3, 61],
    temperature_2m_max: [26.7, 25.1],
    temperature_2m_min: [17.2, 15.9],
    precipitation_sum: [0, 2.4],
    wind_speed_10m_max: [29.3, 30.1],
    wind_gusts_10m_max: [50, 52]
  }
};

const marineJson = {
  timezone: 'Europe/Paris',
  current: { time: '2026-07-19T11:30', wave_height: 0.66, wave_period: 4.15, wave_direction: 75 },
  daily: { time: ['2026-07-19', '2026-07-20'], wave_height_max: [0.8, 0.9], wave_period_max: [5, 5.2] }
};

function makeFetch(opts: { marineFails?: boolean } = {}): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('marine-api')) {
      if (opts.marineFails) {
        return { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => marineJson } as Response;
    }
    return { ok: true, status: 200, json: async () => forecastJson } as Response;
  }) as unknown as typeof fetch;
}

describe('fetchWeather', () => {
  it('normalises current + daily forecast and maps WMO codes', async () => {
    const w = await fetchWeather(47.64, -3.45, 2, makeFetch());

    expect(w.location).toEqual({ latitude: 47.64, longitude: -3.45, timezone: 'Europe/Paris' });
    expect(w.current.temperature).toBe(23.6);
    expect(w.current.weatherText).toBe('Ciel clair'); // code 0
    expect(w.units.temperature).toBe('°C');

    expect(w.daily).toHaveLength(2);
    expect(w.daily[0]).toMatchObject({ date: '2026-07-19', weatherText: 'Couvert', tempMax: 26.7 });
    expect(w.daily[1].weatherText).toBe('Pluie faible'); // code 61
  });

  it('includes marine data when available', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch());
    expect(w.marine?.current).toMatchObject({ waveHeight: 0.66, wavePeriod: 4.15, waveDirection: 75 });
    expect(w.marine?.daily).toHaveLength(2);
  });

  it('degrades gracefully to marine: null when the marine API fails', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch({ marineFails: true }));
    expect(w.marine).toBeNull();
    // Les prévisions restent disponibles.
    expect(w.current.temperature).toBe(23.6);
  });
});
