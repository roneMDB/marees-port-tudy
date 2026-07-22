<script setup lang="ts">
import { useTides } from '../composables/useTides';
import { useSite } from '../composables/useSite';
import { useAuth } from '../composables/useAuth';
import { formatDate } from '../lib/format';
import SettingsPanel from '../components/SettingsPanel.vue';
import StatCards from '../components/StatCards.vue';
import WeatherCard from '../components/WeatherCard.vue';
import ResourcesCard from '../components/ResourcesCard.vue';
import TideDayTable from '../components/TideDayTable.vue';
import HeightChart from '../components/HeightChart.vue';
import CoefChart from '../components/CoefChart.vue';

const {
  loading, error, meta, filters, coefTides, coefDaysView, setCoefDaysView, allTides, reload,
  tableTides, tablePeriod, prevPeriod, nextPeriod, resetPeriod, canPrevPeriod, canNextPeriod, periodOffset
} = useTides();
const { current, isReference } = useSite();
// Édition des réglages réservée au rôle admin.
const { isAdmin: canEditSettings } = useAuth();

function resetFilters(): void {
  filters.type = 'all';
  filters.minCoef = null;
}
</script>

<template>
  <div class="container-xxl py-3">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Chargement…</span>
      </div>
      <p class="text-muted mt-3 mb-0">Chargement des marées…</p>
    </div>

    <div v-else-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span><i class="bi bi-exclamation-triangle-fill me-2"></i>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-danger" @click="reload">Réessayer</button>
    </div>

    <template v-else>
      <div v-if="meta" class="text-muted small mb-2">
        <i class="bi bi-geo-alt-fill me-1"></i>Navihan · Belz
        <span class="mx-1">—</span> réf. marées de Port-Tudy (île de Groix)
        <template v-if="!isReference">
          <span class="mx-1">·</span> heures affichées : {{ current.label }}
        </template>
        <span class="mx-1">·</span> {{ meta.timezone }}
      </div>

      <ResourcesCard />

      <SettingsPanel v-if="canEditSettings" :filters="filters" :meta="meta" @reset="resetFilters" />

      <StatCards :all-tides="allTides" />

      <WeatherCard />

      <div class="row g-3 mb-3">
        <div class="col-12 col-xl-6">
          <HeightChart :all-tides="allTides" />
        </div>
        <div class="col-12 col-xl-6">
          <CoefChart :tides="coefTides" :days="coefDaysView" @update:days="setCoefDaysView" />
        </div>
      </div>

      <div class="card shadow-sm">
        <div class="card-header bg-body-tertiary d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="fw-semibold">
            <i class="bi bi-calendar-week me-1"></i> Horaires par jour
            <span class="text-muted fw-normal small">· {{ current.label }}</span>
          </span>
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted small text-nowrap">
              {{ formatDate(tablePeriod.from, { day: '2-digit', month: 'short' }) }}
              → {{ formatDate(tablePeriod.to, { day: '2-digit', month: 'short' }) }}
            </span>
            <div class="btn-group btn-group-sm" role="group" aria-label="Navigation par période">
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canPrevPeriod"
                title="Période précédente"
                aria-label="Période précédente"
                @click="prevPeriod"
              >
                <i class="bi bi-chevron-left"></i>
              </button>
              <button
                v-if="periodOffset !== 0"
                type="button"
                class="btn btn-outline-secondary"
                title="Revenir à la période configurée"
                @click="resetPeriod"
              >
                <i class="bi bi-house"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary"
                :disabled="!canNextPeriod"
                title="Période suivante"
                aria-label="Période suivante"
                @click="nextPeriod"
              >
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
        <TideDayTable :tides="tableTides" :site-label="current.label" />
      </div>
    </template>
  </div>
</template>
