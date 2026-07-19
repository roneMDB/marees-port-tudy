<script setup lang="ts">
import { ref } from 'vue';
import { useSettings } from '../composables/useSettings';
import { useNavihan } from '../composables/useNavihan';
import { formatOffset } from '../lib/navihan';
import type { NavihanOffsets, TideDisplayFilters, TidesMeta } from '../types';

const props = defineProps<{
  filters: TideDisplayFilters;
  meta: TidesMeta | null;
}>();

const emit = defineEmits<{ (e: 'reset'): void }>();

const { settings } = useSettings();
const { offsets, reset: resetNavihan } = useNavihan();
const open = ref(false);

type OffsetKey = keyof NavihanOffsets;

const rows: { key: OffsetKey; label: string }[] = [
  { key: 'basseMer', label: 'Basse mer' },
  { key: 'pleineMer', label: 'Pleine mer' },
  { key: 'aFlot', label: 'À flot' }
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function setHours(key: OffsetKey, event: Event): void {
  const h = clamp(Number((event.target as HTMLInputElement).value), 0, 23);
  offsets[key] = h * 60 + (offsets[key] % 60);
}

function setMinutes(key: OffsetKey, event: Event): void {
  const m = clamp(Number((event.target as HTMLInputElement).value), 0, 59);
  offsets[key] = Math.floor(offsets[key] / 60) * 60 + m;
}

function setAFlotDays(event: Event): void {
  settings.aFlotDays = clamp(Number((event.target as HTMLInputElement).value), 1, 14);
}

function onRangeDays(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n)) {
    settings.rangeDays = Math.min(365, Math.max(1, Math.round(n)));
  }
}

function onMinCoef(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  props.filters.minCoef = value === '' ? null : Number(value);
}
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center">
      <button
        type="button"
        class="btn btn-link text-decoration-none p-0 fw-semibold"
        :aria-expanded="open"
        @click="open = !open"
      >
        <i class="bi bi-sliders me-1"></i> Réglages &amp; filtres
        <i :class="open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="small ms-1"></i>
      </button>
      <span class="text-muted small d-none d-sm-inline">
        Navihan à flot +{{ formatOffset(offsets.aFlot) }} · {{ settings.aFlotDays }} j
      </span>
    </div>

    <div v-show="open" class="card-body">
      <!-- Période (configuration enregistrée) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Période</h6>
      <div class="row g-3 mb-4">
        <div class="col-6 col-md-3">
          <label class="form-label small text-muted mb-1">Début</label>
          <select class="form-select" v-model="settings.startMode">
            <option value="today">Aujourd'hui</option>
            <option value="date">Date fixe</option>
          </select>
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small text-muted mb-1">Date de début</label>
          <input
            type="date"
            class="form-control"
            :min="meta?.minDate ?? undefined"
            :max="meta?.maxDate ?? undefined"
            :disabled="settings.startMode !== 'date'"
            v-model="settings.startDate"
          />
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small text-muted mb-1">Durée (jours)</label>
          <input
            type="number"
            class="form-control"
            min="1"
            max="365"
            :value="settings.rangeDays"
            @input="onRangeDays"
          />
        </div>
      </div>

      <!-- Décalages Navihan (configuration enregistrée) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Décalages Navihan</h6>
      <p class="text-muted small mb-3">
        Appliqués aux heures de Port-Tudy pour obtenir les heures Navihan. Enregistrés côté serveur.
      </p>
      <div class="row g-3">
        <div v-for="row in rows" :key="row.key" class="col-12 col-md-4">
          <label class="form-label small text-muted mb-1">{{ row.label }}</label>
          <div class="input-group">
            <input
              type="number"
              class="form-control"
              min="0"
              max="23"
              :value="Math.floor(offsets[row.key] / 60)"
              @input="setHours(row.key, $event)"
            />
            <span class="input-group-text">h</span>
            <input
              type="number"
              class="form-control"
              min="0"
              max="59"
              :value="offsets[row.key] % 60"
              @input="setMinutes(row.key, $event)"
            />
            <span class="input-group-text">min</span>
          </div>
          <div class="form-text">= +{{ formatOffset(offsets[row.key]) }}</div>
        </div>
      </div>
      <div class="row g-3 mt-0">
        <div class="col-12 col-md-4">
          <label class="form-label small text-muted mb-1">Jours affichés (carte à flot)</label>
          <input
            type="number"
            class="form-control"
            min="1"
            max="14"
            :value="settings.aFlotDays"
            @input="setAFlotDays"
          />
          <div class="form-text">nombre de jours listés sur la carte « À flot »</div>
        </div>
      </div>
      <div class="mt-3 mb-4">
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="resetNavihan">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Décalages par défaut
        </button>
      </div>

      <!-- Filtres d'affichage (non enregistrés) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Filtres d'affichage</h6>
      <p class="text-muted small mb-3">
        N'affectent que ce qui est affiché (tableau, graphiques) — non enregistrés.
      </p>
      <div class="row g-3 align-items-end">
        <div class="col-6 col-md-3">
          <label class="form-label small text-muted mb-1">Type de marée</label>
          <select class="form-select" v-model="filters.type">
            <option value="all">Toutes</option>
            <option value="high">Pleine mer</option>
            <option value="low">Basse mer</option>
          </select>
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small text-muted mb-1">Coef. min</label>
          <input
            type="number"
            class="form-control"
            min="0"
            max="120"
            placeholder="—"
            :value="filters.minCoef ?? ''"
            @input="onMinCoef"
          />
        </div>
        <div class="col-12 col-md-3 d-grid">
          <button type="button" class="btn btn-outline-secondary" @click="emit('reset')">
            <i class="bi bi-arrow-counterclockwise me-1"></i> Réinitialiser les filtres
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
