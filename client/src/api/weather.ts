import type { Weather } from '../types';
import { fetchJson } from './tides';

/** GET /api/weather — météo Open-Meteo (défaut = zone de Belz si lat/lon omis). */
export function getWeather(lat?: number, lon?: number, days?: number): Promise<Weather> {
  const params = new URLSearchParams();
  if (lat != null) params.set('lat', String(lat));
  if (lon != null) params.set('lon', String(lon));
  if (days != null) params.set('days', String(days));
  const qs = params.toString();
  return fetchJson<Weather>(`/api/weather${qs ? `?${qs}` : ''}`);
}
