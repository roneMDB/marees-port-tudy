import { computed, ref } from 'vue';
import { getWeather } from '../api/weather';
import type { Weather } from '../types';

/**
 * Météo partagée (singleton), sur le patron de `useSettings` / `useSite` / `useLexicon`.
 *
 * Deux cartes en ont besoin — `WeatherCard` et la tuile « Mer » de `EphemerideCard` (issue #13) —
 * et chacune la chargeait pour son compte appellerait `/api/weather` deux fois. `load()` est donc
 * **idempotent** : le premier appel fait la requête, les suivants attendent la même promesse.
 * `reload()` force une nouvelle requête (bouton de rafraîchissement).
 */

/** Nombre de jours de prévision demandés (4 tuiles dans la carte météo). */
const FORECAST_DAYS = 4;

const weather = ref<Weather | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let loadPromise: Promise<void> | null = null;

async function fetchOnce(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    weather.value = await getWeather(undefined, undefined, FORECAST_DAYS);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function load(): Promise<void> {
  if (!loadPromise) loadPromise = fetchOnce();
  return loadPromise;
}

function reload(): Promise<void> {
  loadPromise = fetchOnce();
  return loadPromise;
}

export function useWeather() {
  return {
    weather,
    loading,
    error,
    /** Conditions marines du moment, `null` si l'API marine n'en fournit pas pour ce point. */
    marine: computed(() => weather.value?.marine?.current ?? null),
    /** Prévision du jour le plus proche disponible (la première renvoyée par le serveur). */
    today: computed(() => weather.value?.daily[0] ?? null),
    load,
    reload
  };
}

/** Remet l'état à zéro — réservé aux tests, les composants partageant un singleton. */
export function resetWeatherForTests(): void {
  weather.value = null;
  loading.value = false;
  error.value = null;
  loadPromise = null;
}
