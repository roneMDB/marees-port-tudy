import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
const app = createApp(fakeLogger);

const forecastJson = {
  timezone: 'Europe/Paris',
  current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', precipitation: 'mm' },
  current: {
    time: '2026-07-19T11:30',
    temperature_2m: 20,
    apparent_temperature: 19,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 10,
    wind_gusts_10m: 20,
    wind_direction_10m: 200
  },
  daily_units: { temperature_2m_max: '°C' },
  daily: {
    time: ['2026-07-19'],
    weather_code: [1],
    temperature_2m_max: [24],
    temperature_2m_min: [15],
    precipitation_sum: [0],
    wind_speed_10m_max: [22],
    wind_gusts_10m_max: [30]
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/weather', () => {
  it('returns normalised weather (default location) 200', async () => {
    vi.stubGlobal('fetch', (async (url: string | URL) => {
      const u = String(url);
      // Pas de données marines pour ce test.
      if (u.includes('marine-api')) return { ok: false, status: 500, statusText: 'x', json: async () => ({}) } as Response;
      return { ok: true, status: 200, json: async () => forecastJson } as Response;
    }) as unknown as typeof fetch);

    const res = await request(app).get('/api/weather');
    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ temperature: 20, weatherText: 'Principalement clair' });
    expect(res.body.daily).toHaveLength(1);
    expect(res.body.marine).toBeNull();
  });

  it('returns 400 on invalid coordinates', async () => {
    const res = await request(app).get('/api/weather?lat=999');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lat/);
  });
});
