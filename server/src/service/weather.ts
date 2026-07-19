/** Libellés WMO (codes météo Open-Meteo) en français. */
const WMO: Record<number, string> = {
  0: 'Ciel clair',
  1: 'Principalement clair',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine modérée',
  55: 'Bruine dense',
  56: 'Bruine verglaçante légère',
  57: 'Bruine verglaçante dense',
  61: 'Pluie faible',
  63: 'Pluie modérée',
  65: 'Pluie forte',
  66: 'Pluie verglaçante faible',
  67: 'Pluie verglaçante forte',
  71: 'Neige faible',
  73: 'Neige modérée',
  75: 'Neige forte',
  77: 'Grains de neige',
  80: 'Averses faibles',
  81: 'Averses modérées',
  82: 'Averses violentes',
  85: 'Averses de neige faibles',
  86: 'Averses de neige fortes',
  95: 'Orage',
  96: 'Orage avec grêle légère',
  99: 'Orage avec grêle forte'
};

export function weatherText(code: number | null | undefined): string {
  return code == null ? '—' : (WMO[code] ?? `code ${code}`);
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  weatherText: string;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  precipitation: number;
}

export interface DailyWeather {
  date: string;
  weatherCode: number;
  weatherText: string;
  tempMin: number;
  tempMax: number;
  precipitation: number;
  windMax: number;
  gustMax: number;
}

export interface MarineWeather {
  current: { time: string; waveHeight: number; wavePeriod: number; waveDirection: number } | null;
  daily: { date: string; waveHeightMax: number; wavePeriodMax: number }[];
}

export interface WeatherResult {
  location: { latitude: number; longitude: number; timezone: string };
  units: { temperature: string; wind: string; precipitation: string; wave: string; wavePeriod: string };
  current: CurrentWeather;
  daily: DailyWeather[];
  marine: MarineWeather | null;
}

type FetchLike = typeof fetch;

async function getJson(url: string, fetchImpl: FetchLike): Promise<any> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo a répondu ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Récupère la météo (Open-Meteo, sans clé) pour des coordonnées : conditions actuelles,
 * prévisions quotidiennes, et conditions marines (vagues) si disponibles. `fetchImpl`
 * est injectable pour les tests.
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  days = 3,
  fetchImpl: FetchLike = fetch
): Promise<WeatherResult> {
  const forecastParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
    timezone: 'auto',
    forecast_days: String(days)
  });
  const f = await getJson(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`, fetchImpl);

  const c = f.current ?? {};
  const cu = f.current_units ?? {};
  const d = f.daily ?? {};
  const du = f.daily_units ?? {};

  const daily: DailyWeather[] = (d.time ?? []).map((date: string, i: number) => ({
    date,
    weatherCode: d.weather_code[i],
    weatherText: weatherText(d.weather_code[i]),
    tempMin: d.temperature_2m_min[i],
    tempMax: d.temperature_2m_max[i],
    precipitation: d.precipitation_sum[i],
    windMax: d.wind_speed_10m_max[i],
    gustMax: d.wind_gusts_10m_max[i]
  }));

  // Conditions marines : optionnelles (peuvent manquer près des côtes → marine = null).
  let marine: MarineWeather | null = null;
  try {
    const marineParams = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'wave_height,wave_period,wave_direction',
      daily: 'wave_height_max,wave_period_max',
      timezone: 'auto',
      forecast_days: String(days)
    });
    const m = await getJson(`https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`, fetchImpl);
    const mc = m.current ?? {};
    const md = m.daily ?? {};
    marine = {
      current:
        mc.wave_height == null
          ? null
          : {
              time: mc.time,
              waveHeight: mc.wave_height,
              wavePeriod: mc.wave_period,
              waveDirection: mc.wave_direction
            },
      daily: (md.time ?? []).map((date: string, i: number) => ({
        date,
        waveHeightMax: md.wave_height_max[i],
        wavePeriodMax: md.wave_period_max[i]
      }))
    };
  } catch {
    marine = null;
  }

  return {
    location: { latitude, longitude, timezone: f.timezone },
    units: {
      temperature: cu.temperature_2m ?? '°C',
      wind: cu.wind_speed_10m ?? 'km/h',
      precipitation: cu.precipitation ?? 'mm',
      wave: 'm',
      wavePeriod: 's'
    },
    current: {
      time: c.time,
      temperature: c.temperature_2m,
      apparentTemperature: c.apparent_temperature,
      weatherCode: c.weather_code,
      weatherText: weatherText(c.weather_code),
      windSpeed: c.wind_speed_10m,
      windGusts: c.wind_gusts_10m,
      windDirection: c.wind_direction_10m,
      precipitation: c.precipitation
    },
    daily,
    marine
  };
}
