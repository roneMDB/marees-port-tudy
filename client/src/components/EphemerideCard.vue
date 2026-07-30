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
/**
 * « 1er jour » pour le 1er janvier, « 211e jour » ensuite. Lettres ordinaires : le `<sup>` fait
 * l'exposant, et le doubler avec les caractères modificateurs (ᵉ) donnerait « 211˚ ».
 */
const quantiemeSuffix = computed(() => (quantieme.value.day === 1 ? 'er' : 'e'));
const week = computed(() => isoWeek(date.value));
const saint = computed(() => saintOfDay(date.value));

/**
 * Date en clair, majuscule sur la **seule** première lettre : `text-capitalize` de Bootstrap la
 * met à chaque mot et donnerait « Jeudi 30 Juillet », alors qu'en français les mois s'écrivent
 * en minuscules.
 */
const longDate = computed(() => {
  const text = formatDate(date.value, { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
});

/** Température de l'eau : conditions marines du moment, indisponibles pour certains points côtiers. */
const seaTemperature = computed(() => marine.value?.seaTemperature ?? null);
/**
 * Lieux secondaires (Étel). La grille marine d'Open-Meteo accroche la requête de Belz à ~4,6 km au
 * nord-est, soit en **haute ria** : eau peu profonde, donc plus chaude que la sortie de ria. Les
 * deux valeurs sont données pour ne pas faire passer l'une pour l'autre.
 */
const otherSeaTemperatures = computed(() =>
  (weather.value?.marine?.extra ?? []).filter(e => e.seaTemperature != null)
);
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
        <!-- Pas de date ici : la tuile Calendrier la porte, la répéter serait redondant. -->
        <i class="bi bi-sunrise me-1"></i> Éphéméride du jour
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
              <!-- Le lieu est explicite : les marées de la page sont celles de Port-Tudy, mais le
                   soleil est calculé pour Belz (l'écart avec Groix serait d'environ 1 minute). -->
              <div class="small text-body-secondary">à Belz</div>
              <div class="small text-muted">
                {{ formatDuration(sun.daylightMinutes) }} de jour
                <span v-if="deltaLabel">({{ deltaLabel }})</span>
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
              <div class="fs-5 fw-semibold">{{ longDate }}</div>
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
              <div class="small text-body-secondary">eau · Belz (haute ria)</div>
              <!-- Lieu secondaire, en plus petit : la haute ria chauffe plus que la sortie de ria. -->
              <div v-for="other in otherSeaTemperatures" :key="other.label" class="text-muted ephemeride-aside">
                {{ other.label }} {{ other.seaTemperature!.toFixed(1) }} {{ temperatureUnit }}
              </div>
              <div class="small text-muted mt-1">
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

/* Valeur d'appoint (température d'un lieu secondaire) : plus petite que le `small` de Bootstrap,
   pour rester lisible sans concurrencer la valeur principale de la tuile. */
.ephemeride-aside {
  font-size: 0.75rem;
  line-height: 1.3;
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
