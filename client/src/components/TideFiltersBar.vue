<script setup lang="ts">
import { useTideFilters } from '../composables/useTideFilters';

/**
 * Filtres d'affichage du tableau (issue #10) — **ouverts à tous les rôles**, contrairement aux
 * réglages serveur : ce sont des préférences personnelles, persistées par navigateur
 * (`useTideFilters`). Composant purement présentationnel, adossé au singleton : ni prop, ni emit.
 */
const { filters, activeCount, reset } = useTideFilters();

// Lundi = 0, comme `weekdayIndex` et les statistiques serveur.
const WEEKDAYS = [
  { index: 0, short: 'L', label: 'lundi' },
  { index: 1, short: 'M', label: 'mardi' },
  { index: 2, short: 'M', label: 'mercredi' },
  { index: 3, short: 'J', label: 'jeudi' },
  { index: 4, short: 'V', label: 'vendredi' },
  { index: 5, short: 'S', label: 'samedi' },
  { index: 6, short: 'D', label: 'dimanche' }
];

/** Borne la saisie **en JS** : les attributs `min`/`max` HTML n'empêchent pas de taper 999. */
function onCoef(key: 'minCoef' | 'maxCoef', event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  if (raw === '') {
    filters[key] = null;
    return;
  }
  const n = Number(raw);
  filters[key] = Number.isFinite(n) ? Math.min(120, Math.max(0, Math.round(n))) : null;
}

function onTime(key: 'aflotFrom' | 'aflotTo', event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  filters[key] = raw === '' ? null : raw;
}

/**
 * Modèle « chips » : **aucun jour sélectionné = tous les jours**. Désélectionner le dernier ramène
 * donc à la semaine entière plutôt qu'à un tableau vide.
 */
function toggleWeekday(index: number): void {
  filters.weekdays = filters.weekdays.includes(index)
    ? filters.weekdays.filter(d => d !== index)
    : [...filters.weekdays, index].sort((a, b) => a - b);
}

function isOn(index: number): boolean {
  return filters.weekdays.includes(index);
}
</script>

<template>
  <div class="card-body bg-body-tertiary border-bottom py-2 tide-filters">
    <div class="d-flex flex-wrap align-items-end gap-3">
      <div>
        <label class="form-label small text-muted mb-1 d-block">Coefficient</label>
        <div class="d-flex align-items-center gap-1">
          <input
            type="number"
            class="form-control form-control-sm coef-input"
            min="0"
            max="120"
            placeholder="min"
            aria-label="Coefficient minimum"
            :value="filters.minCoef ?? ''"
            @change="onCoef('minCoef', $event)"
          />
          <span class="text-muted small">–</span>
          <input
            type="number"
            class="form-control form-control-sm coef-input"
            min="0"
            max="120"
            placeholder="max"
            aria-label="Coefficient maximum"
            :value="filters.maxCoef ?? ''"
            @change="onCoef('maxCoef', $event)"
          />
        </div>
      </div>

      <div>
        <label class="form-label small text-muted mb-1 d-block">
          Jours
          <i class="bi bi-info-circle" title="Aucun jour sélectionné = tous les jours"></i>
        </label>
        <div class="btn-group btn-group-sm" role="group" aria-label="Jours de la semaine affichés">
          <button
            v-for="d in WEEKDAYS"
            :key="d.index"
            type="button"
            class="btn btn-outline-secondary weekday-toggle"
            :class="{ active: isOn(d.index) }"
            :aria-label="d.label"
            :aria-pressed="isOn(d.index) ? 'true' : 'false'"
            :title="(isOn(d.index) ? 'Ne plus limiter à' : 'Limiter à') + ' : ' + d.label"
            @click="toggleWeekday(d.index)"
          >{{ d.short }}</button>
        </div>
      </div>

      <div>
        <label class="form-label small text-muted mb-1 d-block">
          Remise à flot entre
          <i
            class="bi bi-info-circle"
            title="Masque les remises à flot hors de la plage — estimation et « Constaté » suivent. Les jours restent affichés."
          ></i>
        </label>
        <div class="d-flex align-items-center gap-1">
          <input
            type="time"
            class="form-control form-control-sm time-input"
            aria-label="Remise à flot à partir de"
            :value="filters.aflotFrom ?? ''"
            @change="onTime('aflotFrom', $event)"
          />
          <span class="text-muted small">→</span>
          <input
            type="time"
            class="form-control form-control-sm time-input"
            aria-label="Remise à flot jusqu'à"
            :value="filters.aflotTo ?? ''"
            @change="onTime('aflotTo', $event)"
          />
        </div>
      </div>

      <button
        v-if="activeCount > 0"
        type="button"
        class="btn btn-sm btn-outline-secondary ms-auto"
        @click="reset"
      >
        <i class="bi bi-arrow-counterclockwise me-1"></i> Réinitialiser
      </button>
    </div>
  </div>
</template>

<style scoped>
.coef-input {
  max-width: 5rem;
}

.time-input {
  max-width: 7.5rem;
}

/* Pastilles de jour : assez larges pour rester cliquables au pouce malgré une lettre unique. */
.weekday-toggle {
  min-width: 2.1rem;
}
</style>
