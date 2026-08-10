import { DEFAULT_LAT, DEFAULT_LON, fetchWeather } from './weather';
import type { TripWeather } from '../db/fishingRepository';

/** Fenêtre exploitable d'Open-Meteo : 92 jours d'archive glissante, 7 jours de prévision. */
const MAX_PAST_DAYS = 92;
const MAX_FUTURE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date locale `YYYY-MM-DD` d'un instant. */
function localDate(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Écart en jours entre deux dates `YYYY-MM-DD` (midi local : insensible au changement d'heure). */
function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / DAY_MS);
}

/**
 * Instantané météo d'une sortie de pêche (issue #3), **figé à la création**.
 *
 * Best-effort par construction : hors de la fenêtre Open-Meteo, sur échec réseau ou si la date
 * demandée manque à la réponse, renvoie `null` — jamais une exception. La sortie est la donnée ;
 * la météo n'est qu'un agrément et ne doit pas faire échouer un enregistrement.
 */
export async function captureTripWeather(
  date: string,
  now: Date,
  fetchImpl: typeof fetch = fetch
): Promise<TripWeather | null> {
  const today = localDate(now);
  const offset = dayDiff(today, date); // négatif = passé, positif = à venir
  if (offset < -MAX_PAST_DAYS || offset > MAX_FUTURE_DAYS) return null;

  const pastDays = Math.max(0, -offset);
  const days = Math.max(1, offset + 1);

  try {
    const weather = await fetchWeather(DEFAULT_LAT, DEFAULT_LON, days, fetchImpl, [], pastDays);
    const daily = weather.daily.find(d => d.date === date);
    if (!daily) return null;
    const marine = weather.marine?.daily.find(d => d.date === date) ?? null;
    return {
      tempMin: daily.tempMin ?? null,
      tempMax: daily.tempMax ?? null,
      windMax: daily.windMax ?? null,
      windDir: daily.windDirection ?? null,
      weatherCode: daily.weatherCode ?? null,
      seaTemperature: marine?.seaTemperatureMax ?? null
    };
  } catch {
    return null; // réseau indisponible : on enregistre la sortie sans météo
  }
}
