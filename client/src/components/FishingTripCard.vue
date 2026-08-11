<script setup lang="ts">
import { computed } from 'vue';
import type { FishingRef, FishingTrip } from '../types';
import { summarizeCatches, type TripTideContext } from '../lib/fishing';
import { relativeDayLabel } from '../lib/format';
import { degToCompass, wmoIcon } from '../lib/weather';

const props = defineProps<{
  trip: FishingTrip;
  refs: FishingRef[];
  context: TripTideContext;
  today: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{ edit: [FishingTrip]; remove: [number] }>();

// Majuscule posée en JS : `text-capitalize` en mettrait une à chaque mot (« Lun. 10 Août »).
const dayLabel = computed(() => {
  const label = relativeDayLabel(props.trip.date, props.today);
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const slot = computed(() => {
  const { startTime, endTime } = props.trip;
  if (startTime && endTime) return `${startTime} → ${endTime}`;
  return startTime ?? endTime ?? null;
});

const summary = computed(() => summarizeCatches(props.trip.catches, props.refs));

/**
 * Engins employés, **dédoublonnés** : une ligne par prise répéterait « Casier à crabes » autant de
 * fois qu'il y a d'espèces, sans rien apprendre. Repli sur l'id si le référentiel a disparu.
 */
const gearsUsed = computed(() => {
  const labelOf = (id: string) => props.refs.find(r => r.id === id)?.label ?? id;
  return [...new Set(props.trip.catches.map(c => labelOf(c.gearId)))];
});

/** Températures avec la virgule décimale française. */
function num(value: number): string {
  return String(value).replace('.', ',');
}
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h2 class="h6 mb-0">{{ dayLabel }}</h2>
          <div class="text-muted small">
            <span v-if="slot"><i class="bi bi-clock me-1"></i>{{ slot }}</span>
            <span v-else class="fst-italic">horaire non précisé</span>
          </div>
        </div>
        <div v-if="canEdit" class="btn-group btn-group-sm">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-test="edit"
            title="Modifier"
            aria-label="Modifier la sortie"
            @click="emit('edit', trip)"
          >
            <i class="bi bi-pencil"></i>
          </button>
          <button
            type="button"
            class="btn btn-outline-danger"
            data-test="remove"
            title="Supprimer"
            aria-label="Supprimer la sortie"
            @click="emit('remove', trip.id)"
          >
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>

      <!-- Contexte marée : **recalculé** à l'affichage, jamais stocké avec la sortie. -->
      <div class="small text-muted mb-2 trip-tide">
        <span v-if="context.coefficient != null" class="me-2">
          <i class="bi bi-graph-up me-1"></i>coef {{ context.coefficient }}
        </span>
        <span v-if="context.lowTides.length" class="me-2">
          <i class="bi bi-arrow-down-short"></i>{{ context.lowTides.join(' · ') }}
        </span>
        <span v-if="context.aflot.length">
          <i class="bi bi-check2-circle me-1"></i>à flot {{ context.aflot.join(' · ') }}
        </span>
        <span v-if="context.coefficient == null && !context.aflot.length" class="fst-italic">
          marée inconnue pour ce jour
        </span>
      </div>

      <p class="mb-2 fw-semibold trip-summary">{{ summary }}</p>

      <p v-if="gearsUsed.length" class="small text-muted mb-2 trip-gears">
        <i class="bi bi-tools me-1"></i>{{ gearsUsed.join(' · ') }}
      </p>

      <p v-if="trip.notes" class="mb-2 small trip-notes">
        <i class="bi bi-journal-text me-1"></i>{{ trip.notes }}
      </p>

      <!-- Météo **figée à la création** : elle décrit ce jour-là, pas le jour de consultation. -->
      <div v-if="trip.weather" class="small text-muted trip-weather">
        <i :class="`bi ${wmoIcon(trip.weather.weatherCode ?? 0)} me-1`"></i>
        <span v-if="trip.weather.tempMin != null && trip.weather.tempMax != null" class="me-2">
          {{ num(trip.weather.tempMin) }} – {{ num(trip.weather.tempMax) }} °C
        </span>
        <span v-if="trip.weather.windMax != null" class="me-2">
          <i class="bi bi-wind me-1"></i>{{ num(trip.weather.windMax) }} km/h
          <template v-if="trip.weather.windDir != null">{{
            degToCompass(trip.weather.windDir)
          }}</template>
        </span>
        <span v-if="trip.weather.seaTemperature != null">
          <i class="bi bi-thermometer-half me-1"></i>eau {{ num(trip.weather.seaTemperature) }} °C
        </span>
      </div>
    </div>
  </div>
</template>
