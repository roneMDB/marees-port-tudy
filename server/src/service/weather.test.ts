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
    wind_gusts_10m_max: [50, 52],
    wind_direction_10m_dominant: [58, 240],
    uv_index_max: [6.95, 5.4]
  }
};

const marineJson = {
  timezone: 'Europe/Paris',
  current: {
    time: '2026-07-19T11:30',
    wave_height: 0.66,
    wave_period: 4.15,
    wave_direction: 75,
    sea_surface_temperature: 21.3
  },
  daily: {
    time: ['2026-07-19', '2026-07-20'],
    wave_height_max: [0.8, 0.9],
    wave_period_max: [5, 5.2],
    sea_surface_temperature_max: [21.6, 21.2]
  }
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
    // Direction dominante du vent par jour (null si absente de la réponse).
    expect(w.daily.map(d => d.windDirection)).toEqual([58, 240]);
    // Indice UV maximal du jour (tuile « Mer » de l'éphéméride).
    expect(w.daily.map(d => d.uvIndexMax)).toEqual([6.95, 5.4]);
  });

  it('sets daily windDirection to null when the field is absent', async () => {
    const noDir = (async () =>
      ({ ok: true, status: 200, json: async () => ({
        ...forecastJson,
        daily: { ...forecastJson.daily, wind_direction_10m_dominant: undefined }
      }) }) as Response) as unknown as typeof fetch;
    const w = await fetchWeather(47.6, -3.5, 2, noDir);
    expect(w.daily.every(d => d.windDirection === null)).toBe(true);
  });

  it('sets daily uvIndexMax to null when the field is absent', async () => {
    const noUv = (async () =>
      ({ ok: true, status: 200, json: async () => ({
        ...forecastJson,
        daily: { ...forecastJson.daily, uv_index_max: undefined }
      }) }) as Response) as unknown as typeof fetch;
    const w = await fetchWeather(47.6, -3.5, 2, noUv);
    expect(w.daily.every(d => d.uvIndexMax === null)).toBe(true);
  });

  it('includes marine data when available', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch());
    expect(w.marine?.current).toMatchObject({ waveHeight: 0.66, wavePeriod: 4.15, waveDirection: 75 });
    expect(w.marine?.daily).toHaveLength(2);
  });

  it('exposes the sea surface temperature (current + daily)', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch());
    expect(w.marine?.current?.seaTemperature).toBe(21.3);
    expect(w.marine?.daily.map(d => d.seaTemperatureMax)).toEqual([21.6, 21.2]);
  });

  it('leaves extra empty when no secondary point is requested', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch());
    expect(w.marine?.extra).toEqual([]);
  });

  it('sert les lieux secondaires en une seule requête marine', async () => {
    // Open-Meteo renvoie un **tableau** dès qu'on demande plusieurs points, le principal en tête.
    const marineUrls: string[] = [];
    const multi = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes('marine-api')) {
        marineUrls.push(u);
        return { ok: true, status: 200, json: async () => [
          marineJson,
          { ...marineJson, current: { ...marineJson.current, sea_surface_temperature: 20.2 } }
        ] } as Response;
      }
      return { ok: true, status: 200, json: async () => forecastJson } as Response;
    }) as unknown as typeof fetch;

    const w = await fetchWeather(47.677, -3.166, 2, multi, [
      { label: 'Étel', latitude: 47.657, longitude: -3.204 }
    ]);

    // Une seule requête marine, coordonnées jointes par des virgules.
    expect(marineUrls).toHaveLength(1);
    expect(marineUrls[0]).toContain('latitude=47.677%2C47.657');
    expect(marineUrls[0]).toContain('longitude=-3.166%2C-3.204');
    // Le point principal reste celui de la houle et du quotidien.
    expect(w.marine?.current?.seaTemperature).toBe(21.3);
    expect(w.marine?.current?.waveHeight).toBe(0.66);
    expect(w.marine?.daily).toHaveLength(2);
    expect(w.marine?.extra).toEqual([{ label: 'Étel', seaTemperature: 20.2 }]);
  });

  it('met un lieu secondaire à null si la réponse ne le contient pas', async () => {
    // Réponse tronquée à un seul point alors que deux étaient demandés.
    const short = (async (url: string | URL) => {
      if (String(url).includes('marine-api')) {
        return { ok: true, status: 200, json: async () => [marineJson] } as Response;
      }
      return { ok: true, status: 200, json: async () => forecastJson } as Response;
    }) as unknown as typeof fetch;
    const w = await fetchWeather(47.677, -3.166, 2, short, [
      { label: 'Étel', latitude: 47.657, longitude: -3.204 }
    ]);
    expect(w.marine?.extra).toEqual([{ label: 'Étel', seaTemperature: null }]);
  });

  it('sets sea temperatures to null when the marine API omits them', async () => {
    const noSea = (async (url: string | URL) => {
      if (String(url).includes('marine-api')) {
        return { ok: true, status: 200, json: async () => ({
          ...marineJson,
          current: { ...marineJson.current, sea_surface_temperature: undefined },
          daily: { ...marineJson.daily, sea_surface_temperature_max: undefined }
        }) } as Response;
      }
      return { ok: true, status: 200, json: async () => forecastJson } as Response;
    }) as unknown as typeof fetch;
    const w = await fetchWeather(47.6, -3.5, 2, noSea);
    // La houle reste servie : seule la température manque.
    expect(w.marine?.current?.waveHeight).toBe(0.66);
    expect(w.marine?.current?.seaTemperature).toBeNull();
    expect(w.marine?.daily.every(d => d.seaTemperatureMax === null)).toBe(true);
  });

  it('degrades gracefully to marine: null when the marine API fails', async () => {
    const w = await fetchWeather(47.6, -3.5, 2, makeFetch({ marineFails: true }));
    expect(w.marine).toBeNull();
    // Les prévisions restent disponibles.
    expect(w.current.temperature).toBe(23.6);
  });
});
