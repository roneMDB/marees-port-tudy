<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getWeather } from '../api/weather';
import { degToCompass, wmoIcon } from '../lib/weather';
import { formatDate } from '../lib/format';
import type { Weather } from '../types';

const loading = ref(true);
const error = ref<string | null>(null);
const weather = ref<Weather | null>(null);

// Lien Windy centré sur les coordonnées courantes (repli sur la page d'accueil).
const windyUrl = computed(() => {
  const loc = weather.value?.location;
  return loc ? `https://www.windy.com/?${loc.latitude},${loc.longitude},9` : 'https://www.windy.com';
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    weather.value = await getWeather(undefined, undefined, 4);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary fw-semibold d-flex justify-content-between align-items-center">
      <span><i class="bi bi-cloud-sun me-1"></i> Météo · Belz</span>
      <button
        v-if="!loading"
        type="button"
        class="btn btn-sm btn-link text-decoration-none p-0"
        title="Rafraîchir"
        @click="load"
      >
        <i class="bi bi-arrow-clockwise"></i>
      </button>
    </div>

    <div class="card-body py-2 px-3">
      <div v-if="loading" class="text-center text-muted py-3">
        <span class="spinner-border spinner-border-sm me-2"></span> Chargement météo…
      </div>

      <div v-else-if="error" class="alert alert-warning d-flex justify-content-between align-items-center mb-0 py-2">
        <span class="small"><i class="bi bi-exclamation-triangle me-1"></i>{{ error }}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="load">Réessayer</button>
      </div>

      <template v-else-if="weather">
        <!-- Conditions actuelles -->
        <div class="d-flex align-items-center flex-wrap gap-3 mb-2">
          <i :class="['bi', wmoIcon(weather.current.weatherCode)]" class="display-5 text-primary"></i>
          <div>
            <div class="fs-3 fw-bold">
              {{ Math.round(weather.current.temperature) }}{{ weather.units.temperature }}
            </div>
            <div class="text-muted small">
              {{ weather.current.weatherText }} · ressenti
              {{ Math.round(weather.current.apparentTemperature) }}{{ weather.units.temperature }}
            </div>
          </div>
          <div class="vr d-none d-sm-block"></div>
          <div class="small">
            <div>
              <i class="bi bi-wind me-1"></i>Vent {{ Math.round(weather.current.windSpeed) }}
              {{ weather.units.wind }} {{ degToCompass(weather.current.windDirection) }}
              <span class="text-muted">(rafales {{ Math.round(weather.current.windGusts) }})</span>
            </div>
            <div v-if="weather.marine?.current">
              <i class="bi bi-water me-1"></i>Houle {{ weather.marine.current.waveHeight }} {{ weather.units.wave }}
              · {{ weather.marine.current.wavePeriod }} {{ weather.units.wavePeriod }}
              {{ degToCompass(weather.marine.current.waveDirection) }}
            </div>
          </div>
        </div>

        <!-- Prévisions quotidiennes -->
        <div class="row g-2 text-center">
          <div v-for="d in weather.daily" :key="d.date" class="col">
            <div class="border rounded py-2 h-100">
              <div class="small text-muted text-capitalize">{{ formatDate(d.date, { weekday: 'short' }) }}</div>
              <i :class="['bi', wmoIcon(d.weatherCode)]" class="fs-5 text-primary"></i>
              <div class="small">
                <span class="fw-semibold">{{ Math.round(d.tempMax) }}°</span>
                <span class="text-muted"> / {{ Math.round(d.tempMin) }}°</span>
              </div>
              <div class="small text-muted">
                <i class="bi bi-wind"></i> {{ Math.round(d.windMax) }}
                <span v-if="d.windDirection != null">{{ degToCompass(d.windDirection) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Liens vers des sites météo (le lieu pour Windy) -->
        <div class="mt-2 pt-2 border-top small text-muted text-center">
          <i class="bi bi-box-arrow-up-right me-1"></i>Plus de météo :
          <a :href="windyUrl" target="_blank" rel="noopener noreferrer" class="link-secondary">Windy</a>
          <span class="mx-1">·</span>
          <a
            href="https://meteofrance.com/previsions-meteo-france/belz/56550"
            target="_blank"
            rel="noopener noreferrer"
            class="link-secondary"
          >Météo-France</a>
          <span class="mx-1">·</span>
          <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" class="link-secondary">Open-Meteo</a>
        </div>
      </template>
    </div>
  </div>
</template>
