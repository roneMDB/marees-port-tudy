<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import { getStats } from '../api/tides';
import { formatDate } from '../lib/format';
import { useTheme } from '../composables/useTheme';
import type { AccessStats } from '../types';

const { isDark } = useTheme();

const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<AccessStats | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await getStats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// Recharge à chaque ouverture du panneau (données fraîches).
let el: HTMLElement | null = null;
onMounted(() => {
  el = document.getElementById('statsOffcanvas');
  el?.addEventListener('show.bs.offcanvas', load);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', load));

const period = computed(() => {
  if (!stats.value?.firstTs || !stats.value?.lastTs) return '';
  const f = formatDate(stats.value.firstTs.slice(0, 10));
  const l = formatDate(stats.value.lastTs.slice(0, 10));
  return f === l ? f : `${f} → ${l}`;
});

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: (stats.value?.perDay ?? []).map(d => formatDate(d.date, { day: '2-digit', month: '2-digit' })),
  datasets: [
    {
      label: 'Visites',
      data: (stats.value?.perDay ?? []).map(d => d.count),
      backgroundColor: '#0d6efd'
    }
  ]
}));

const chartOptions = computed<ChartOptions<'bar'>>(() => {
  const tick = isDark.value ? '#adb5bd' : '#495057';
  const grid = isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } },
      x: { ticks: { maxRotation: 90, autoSkip: true, maxTicksLimit: 15, color: tick }, grid: { color: grid } }
    }
  };
});
</script>

<template>
  <div
    id="statsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="statsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <h5 id="statsOffcanvasLabel" class="offcanvas-title mb-0">
        <i class="bi bi-bar-chart-line me-1"></i> Statistiques d'accès
      </h5>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" title="Rafraîchir" @click="load">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
      </div>
    </div>

    <div class="offcanvas-body">
      <div v-if="loading" class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm me-2"></span> Chargement…
      </div>

      <div v-else-if="error" class="alert alert-warning py-2 small mb-0">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
      </div>

      <template v-else-if="stats">
        <p class="text-muted small mb-2">Réseau local uniquement · anonymisé (IP tronquée).</p>
        <p v-if="period" class="text-muted small mb-3">Période : {{ period }}</p>

        <!-- KPIs -->
        <div class="row g-2 text-center mb-4">
          <div class="col-4">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.total }}</div>
              <div class="small text-muted">Visites</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.lan }}</div>
              <div class="small text-muted">Réseau local</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.external }}</div>
              <div class="small text-muted">Externe</div>
            </div>
          </div>
        </div>

        <template v-if="stats.total > 0">
          <!-- Visites par jour -->
          <h6 class="text-uppercase text-muted small fw-bold mb-2">Visites par jour</h6>
          <div style="height: 200px" class="mb-4">
            <Bar :data="chartData" :options="chartOptions" />
          </div>

          <!-- Répartitions -->
          <div class="row g-3">
            <div class="col-12 col-sm-4">
              <h6 class="text-uppercase text-muted small fw-bold mb-2">Pays</h6>
              <ul class="list-unstyled small mb-0">
                <li v-for="c in stats.countries" :key="c.name" class="d-flex justify-content-between">
                  <span>{{ c.name }}</span><span class="text-muted">{{ c.count }}</span>
                </li>
                <li v-if="!stats.countries.length" class="text-muted fst-italic">—</li>
              </ul>
            </div>
            <div class="col-12 col-sm-4">
              <h6 class="text-uppercase text-muted small fw-bold mb-2">Navigateurs</h6>
              <ul class="list-unstyled small mb-0">
                <li v-for="b in stats.browsers" :key="b.name" class="d-flex justify-content-between">
                  <span>{{ b.name }}</span><span class="text-muted">{{ b.count }}</span>
                </li>
              </ul>
            </div>
            <div class="col-12 col-sm-4">
              <h6 class="text-uppercase text-muted small fw-bold mb-2">Appareils</h6>
              <ul class="list-unstyled small mb-0">
                <li v-for="d in stats.devices" :key="d.name" class="d-flex justify-content-between">
                  <span>{{ d.name }}</span><span class="text-muted">{{ d.count }}</span>
                </li>
              </ul>
            </div>
          </div>
        </template>
        <p v-else class="text-muted small fst-italic">Aucun accès enregistré pour l'instant.</p>
      </template>

      <p v-else class="text-muted small">Ouvre ce panneau pour charger les statistiques.</p>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 768px) {
  #statsOffcanvas {
    --bs-offcanvas-width: 460px;
  }
}
</style>
