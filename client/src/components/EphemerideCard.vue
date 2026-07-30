<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { formatDate, todayKey } from '../lib/format';
import {
  dayOfYear,
  daylightDelta,
  formatDuration,
  formatTimeInZone,
  isoWeek,
  moonPhase,
  nextSyzygy,
  sunTimes
} from '../lib/ephemeride';
import { saintOfDay } from '../lib/saints';
import { useEphemeride } from '../composables/useEphemeride';
import { useWeather } from '../composables/useWeather';

const { visible, hide, show } = useEphemeride();

// Météo partagée : la tuile « Mer » lit le même état que la carte Météo (un seul appel réseau).
const { weather, today: todayForecast, marine, load: loadWeather } = useWeather();
onMounted(loadWeather);

// Repli transitoire, non persisté — cf. ResourcesCard / MotDuJourCard.
const open = ref(true);

const date = computed(() => todayKey());

// Soleil : tout est calculé localement, donc renseigné même hors-ligne.
const sun = computed(() => sunTimes(date.value));
const sunLabel = computed(() => {
  const { sunrise, sunset } = sun.value;
  if (!sunrise || !sunset) return null;
  return { rise: formatTimeInZone(sunrise), set: formatTimeInZone(sunset) };
});
const delta = computed(() => daylightDelta(date.value));
/** « +2 min » / « −3 min » : le signe explicite dit dans quel sens le jour évolue. */
const deltaLabel = computed(() => {
  if (delta.value == null) return null;
  const minutes = Math.round(delta.value);
  if (minutes === 0) return '±0 min';
  return `${minutes > 0 ? '+' : '−'}${Math.abs(minutes)} min`;
});

const moon = computed(() => moonPhase(date.value));
const syzygy = computed(() => nextSyzygy(date.value));
const syzygyLabel = computed(() => {
  const { kind, daysAway } = syzygy.value;
  const name = kind === 'new' ? 'Nouvelle lune' : 'Pleine lune';
  if (daysAway === 0) return `${name} aujourd'hui`;
  if (daysAway === 1) return `${name} demain`;
  return `${name} dans ${daysAway} j`;
});
/**
 * Les vives-eaux suivent la syzygie d'environ 36 h : l'annonce n'a de sens qu'à ses abords.
 * L'afficher en permanence serait faux.
 */
const springTidesAhead = computed(() => syzygy.value.daysAway <= 2);

const quantieme = computed(() => dayOfYear(date.value));
/** « 1ᵉʳ jour » pour le 1er janvier, « 211ᵉ jour » ensuite. */
const quantiemeSuffix = computed(() => (quantieme.value.day === 1 ? 'ᵉʳ' : 'ᵉ'));
const week = computed(() => isoWeek(date.value));
const saint = computed(() => saintOfDay(date.value));

/** Température de l'eau : conditions marines du moment, indisponibles pour certains points côtiers. */
const seaTemperature = computed(() => marine.value?.seaTemperature ?? null);
const uvIndex = computed(() => todayForecast.value?.uvIndexMax ?? null);
const temperatureUnit = computed(() => weather.value?.units.temperature ?? '°C');
</script>

<template>
  <div v-if="visible" class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center">
      <button
        type="button"
        class="btn btn-link text-decoration-none p-0 fw-semibold"
        :aria-expanded="open"
        @click="open = !open"
      >
        <i class="bi bi-sunrise me-1"></i> Éphéméride du jour
        <span class="fw-normal text-muted small">· {{ formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
        <i :class="open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="small ms-1"></i>
      </button>
      <button
        type="button"
        class="btn btn-sm btn-link link-secondary text-decoration-none p-0"
        title="Masquer l'éphéméride"
        aria-label="Masquer l'éphéméride"
        @click="hide"
      >
        <i class="bi bi-eye-slash"></i>
      </button>
    </div>

    <div v-show="open" class="card-body py-3 px-3">
      <div class="row g-3">
        <!-- Soleil -->
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="ephemeride-tile h-100" data-tile="soleil">
            <span class="ephemeride-icon ephemeride-icon--sun"><i class="bi bi-sun"></i></span>
            <div class="ephemeride-body">
              <div class="text-uppercase small text-muted">Soleil</div>
              <div v-if="sunLabel" class="fs-5 fw-semibold">
                {{ sunLabel.rise }} <i class="bi bi-arrow-right small text-muted"></i> {{ sunLabel.set }}
              </div>
              <div v-else class="fs-5 fw-semibold">—</div>
              <div class="small text-body-secondary">
                {{ formatDuration(sun.daylightMinutes) }} de jour
                <span v-if="deltaLabel" class="text-muted">({{ deltaLabel }})</span>
              </div>
              <div class="small text-muted">midi solaire {{ formatTimeInZone(sun.solarNoon) }}</div>
            </div>
          </div>
        </div>

        <!-- Lune -->
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="ephemeride-tile h-100" data-tile="lune">
            <span class="ephemeride-icon ephemeride-icon--moon"><i :class="['bi', moon.icon]"></i></span>
            <div class="ephemeride-body">
              <div class="text-uppercase small text-muted">Lune</div>
              <div class="fs-5 fw-semibold">{{ moon.name }}</div>
              <div class="small text-body-secondary">{{ Math.round(moon.illumination * 100) }} % éclairée</div>
              <div class="small text-muted">
                {{ syzygyLabel }}
                <span v-if="springTidesAhead" class="d-block text-body-secondary">
                  <i class="bi bi-arrow-up-right me-1"></i>vives-eaux à suivre
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Calendrier -->
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="ephemeride-tile h-100" data-tile="calendrier">
            <span class="ephemeride-icon ephemeride-icon--calendar"><i class="bi bi-calendar-date"></i></span>
            <div class="ephemeride-body">
              <div class="text-uppercase small text-muted">Calendrier</div>
              <div class="fs-5 fw-semibold text-capitalize">
                {{ formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) }}
              </div>
              <div class="small text-body-secondary">
                {{ quantieme.day }}<sup>{{ quantiemeSuffix }}</sup> jour / {{ quantieme.total }}
                <span class="text-muted">· sem. {{ week }}</span>
              </div>
              <div v-if="saint" class="small text-muted">{{ saint }}</div>
            </div>
          </div>
        </div>

        <!-- Mer -->
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="ephemeride-tile h-100" data-tile="mer">
            <span class="ephemeride-icon ephemeride-icon--sea"><i class="bi bi-thermometer-half"></i></span>
            <div class="ephemeride-body">
              <div class="text-uppercase small text-muted">Mer</div>
              <div class="fs-5 fw-semibold">
                <template v-if="seaTemperature != null">
                  {{ seaTemperature.toFixed(1) }} {{ temperatureUnit }}
                </template>
                <template v-else>—</template>
              </div>
              <div class="small text-body-secondary">température de l'eau</div>
              <div class="small text-muted">
                indice UV
                <span class="fw-semibold">{{ uvIndex != null ? Math.round(uvIndex) : '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Masquée : un rappel discret permet de la rétablir. -->
  <div v-else class="text-end mb-3">
    <button type="button" class="btn btn-sm btn-link link-secondary text-decoration-none p-0" @click="show">
      <i class="bi bi-sunrise me-1"></i> Afficher l'éphéméride
    </button>
  </div>
</template>

<style scoped>
.ephemeride-tile {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.ephemeride-body {
  min-width: 0; /* autorise la troncature du texte long dans une colonne étroite */
}

/* Pastille d'icône thématique, adaptée au thème clair/sombre (cf. ResourcesCard / MotDuJourCard). */
.ephemeride-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  font-size: 1.15rem;
  background-color: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
}

.ephemeride-icon--sun {
  background-color: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
}

.ephemeride-icon--moon {
  background-color: var(--bs-secondary-bg-subtle);
  color: var(--bs-secondary-text-emphasis);
}

.ephemeride-icon--calendar {
  background-color: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
}

.ephemeride-icon--sea {
  background-color: var(--bs-info-bg-subtle);
  color: var(--bs-info-text-emphasis);
}
</style>
