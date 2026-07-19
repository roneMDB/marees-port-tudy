<script setup lang="ts">
import { useTides } from '../composables/useTides';
import SettingsPanel from '../components/SettingsPanel.vue';
import StatCards from '../components/StatCards.vue';
import WeatherCard from '../components/WeatherCard.vue';
import TideTable from '../components/TideTable.vue';
import HeightChart from '../components/HeightChart.vue';
import CoefChart from '../components/CoefChart.vue';

const { loading, error, meta, filters, filteredTides, allTides, reload } = useTides();

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
        <span class="mx-1">·</span> {{ meta.timezone }}
      </div>

      <SettingsPanel :filters="filters" :meta="meta" @reset="resetFilters" />

      <StatCards :tides="filteredTides" :all-tides="allTides" />

      <WeatherCard />

      <div class="row g-3 mb-3">
        <div class="col-12 col-xl-6">
          <HeightChart :all-tides="allTides" />
        </div>
        <div class="col-12 col-xl-6">
          <CoefChart :tides="filteredTides" />
        </div>
      </div>

      <div class="card shadow-sm">
        <div class="card-header bg-body-tertiary fw-semibold">
          <i class="bi bi-table me-1"></i> Horaires détaillés
        </div>
        <TideTable :tides="filteredTides" />
      </div>
    </template>
  </div>
</template>
