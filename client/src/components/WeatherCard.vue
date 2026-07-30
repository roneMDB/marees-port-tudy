<script setup lang="ts">
import { onMounted } from 'vue';
import { beaufort, degToCompass, resolveLinkUrl, wmoIcon } from '../lib/weather';
import { formatDate } from '../lib/format';
import { useSettings } from '../composables/useSettings';
import { useWeather } from '../composables/useWeather';

// État partagé : la tuile « Mer » de l'éphéméride lit la même météo (un seul appel réseau).
const { weather, loading, error, load, reload } = useWeather();

// Liens météo configurables (réglages) ; {lat}/{lon} résolus sur le lieu courant.
const { settings } = useSettings();
function linkHref(url: string): string {
  const loc = weather.value?.location;
  return resolveLinkUrl(url, loc?.latitude, loc?.longitude);
}

onMounted(load);
</script>

<template>
  <div class="card shadow-sm h-100">
    <div class="card-header bg-body-tertiary fw-semibold d-flex justify-content-between align-items-center">
      <span>
        <i class="bi bi-cloud-sun me-1"></i> Météo · Belz
        <span class="fw-normal text-muted small">· données Open-Meteo</span>
      </span>
      <button
        v-if="!loading"
        type="button"
        class="btn btn-sm btn-link text-decoration-none p-0"
        title="Rafraîchir"
        @click="reload"
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
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="reload">Réessayer</button>
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
            <!-- Force Beaufort, avec son libellé : le chiffre seul ne dit rien à qui ne connaît
                 pas l'échelle. -->
            <div>
              <i class="bi bi-speedometer2 me-1"></i>
              <span class="fw-semibold">{{ beaufort(weather.current.windSpeed).force }} Bft</span>
              <span class="text-muted"> · {{ beaufort(weather.current.windSpeed).label }}</span>
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
              <!-- Ici la force seule : l'espace est compté dans une tuile. -->
              <div class="small text-muted">{{ beaufort(d.windMax).force }} Bft</div>
            </div>
          </div>
        </div>

        <!-- Liens météo configurables (réglages) -->
        <div v-if="settings.weatherLinks.length" class="mt-2 pt-2 border-top small text-muted text-center">
          <i class="bi bi-box-arrow-up-right me-1"></i>Plus de météo :
          <template v-for="(link, i) in settings.weatherLinks" :key="i">
            <span v-if="i > 0" class="mx-1">·</span>
            <a :href="linkHref(link.url)" target="_blank" rel="noopener noreferrer" class="link-secondary">{{ link.label }}</a>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
