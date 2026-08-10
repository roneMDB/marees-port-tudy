import { describe, expect, it, vi } from 'vitest';
import { captureTripWeather } from './fishingWeather';

const NOW = new Date('2026-08-10T18:00:00');

/** Réponse Open-Meteo minimale : prévision quotidienne + marine, pour les dates demandées. */
function fakeFetch(dates: string[]) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes('marine-api')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          current: { wave_height: 0.6, wave_period: 5, wave_direction: 250, sea_surface_temperature: 19.4 },
          daily: {
            time: dates,
            wave_height_max: dates.map(() => 0.9),
            wave_period_max: dates.map(() => 6),
            sea_surface_temperature_max: dates.map((_, i) => 19 + i)
          }
        })
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        timezone: 'Europe/Paris',
        current: {},
        current_units: {},
        daily: {
          time: dates,
          weather_code: dates.map(() => 3),
          temperature_2m_max: dates.map((_, i) => 20 + i),
          temperature_2m_min: dates.map(() => 14),
          precipitation_sum: dates.map(() => 0),
          wind_speed_10m_max: dates.map(() => 18),
          wind_gusts_10m_max: dates.map(() => 32),
          wind_direction_10m_dominant: dates.map(() => 250),
          uv_index_max: dates.map(() => 6)
        }
      })
    } as unknown as Response;
  });
}

describe('captureTripWeather', () => {
  it('fige la météo du jour de la sortie, pas celle du jour de saisie', async () => {
    const fetchImpl = fakeFetch(['2026-08-08', '2026-08-09', '2026-08-10']);
    const snap = await captureTripWeather('2026-08-09', NOW, fetchImpl as unknown as typeof fetch);
    expect(snap).toEqual({
      tempMin: 14,
      tempMax: 21,
      windMax: 18,
      windDir: 250,
      weatherCode: 3,
      seaTemperature: 20
    });
  });

  it('demande des jours passés à Open-Meteo pour une sortie antérieure', async () => {
    const fetchImpl = fakeFetch(['2026-08-05', '2026-08-10']);
    await captureTripWeather('2026-08-05', NOW, fetchImpl as unknown as typeof fetch);
    const called = String(fetchImpl.mock.calls[0][0]);
    expect(called).toContain('past_days=5');
  });

  it('renvoie null au-delà de la fenêtre exploitable (plus de 92 jours en arrière)', async () => {
    const fetchImpl = fakeFetch([]);
    expect(await captureTripWeather('2026-01-01', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renvoie null au-delà de la fenêtre de prévision (plus de 7 jours à venir)', async () => {
    const fetchImpl = fakeFetch([]);
    expect(await captureTripWeather('2026-09-30', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renvoie null si la date demandée est absente de la réponse', async () => {
    const fetchImpl = fakeFetch(['2026-08-10']);
    expect(await captureTripWeather('2026-08-09', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('renvoie null sur échec réseau, sans propager l’erreur', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('réseau coupé');
    });
    await expect(
      captureTripWeather('2026-08-10', NOW, fetchImpl as unknown as typeof fetch)
    ).resolves.toBeNull();
  });
});
