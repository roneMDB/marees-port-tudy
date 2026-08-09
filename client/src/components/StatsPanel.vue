<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import { getStats } from '../api/stats';
import { formatDate } from '../lib/format';
import { useTheme } from '../composables/useTheme';
import type { AccessStats, StatsPeriod } from '../types';

const { isDark } = useTheme();

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: '90 j' },
  { value: 'all', label: 'Tout' }
];
const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<AccessStats | null>(null);
// 30 jours par défaut : assez pour voir un rythme, assez court pour rester lisible.
const period = ref<StatsPeriod>(30);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await getStats(period.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function setPeriod(value: StatsPeriod): void {
  if (period.value === value) return;
  period.value = value;
  void load();
}

// Recharge à chaque ouverture du panneau (données fraîches).
let el: HTMLElement | null = null;
onMounted(() => {
  el = document.getElementById('statsOffcanvas');
  el?.addEventListener('show.bs.offcanvas', load);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', load));

const range = computed(() => {
  if (!stats.value?.firstTs || !stats.value?.lastTs) return '';
  const f = formatDate(stats.value.firstTs.slice(0, 10));
  const l = formatDate(stats.value.lastTs.slice(0, 10));
  return f === l ? f : `${f} → ${l}`;
});

/** « ven. 08 août, 14:32 » — la date seule ne dirait pas si quelqu'un est passé ce matin. */
function formatMoment(ts: string): string {
  const date = formatDate(ts.slice(0, 10));
  const time = new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

const axisColors = computed(() => ({
  tick: isDark.value ? '#adb5bd' : '#495057',
  grid: isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'
}));

/** Options communes aux trois histogrammes (mêmes conventions que `CoefChart`/`HeightChart`). */
function barOptions(maxTicks: number): ChartOptions<'bar'> {
  const { tick, grid } = axisColors.value;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } },
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: maxTicks, color: tick, font: { size: 10 } },
        grid: { color: grid }
      }
    }
  };
}

const perDayData = computed<ChartData<'bar'>>(() => ({
  labels: (stats.value?.perDay ?? []).map(d => formatDate(d.date, { day: '2-digit', month: '2-digit' })),
  datasets: [{ label: 'Visites', data: (stats.value?.perDay ?? []).map(d => d.count), backgroundColor: '#0d6efd' }]
}));

const perHourData = computed<ChartData<'bar'>>(() => ({
  labels: Array.from({ length: 24 }, (_, h) => `${h} h`),
  datasets: [{ label: 'Visites', data: stats.value?.perHour ?? [], backgroundColor: '#0dcaf0' }]
}));

const perWeekdayData = computed<ChartData<'bar'>>(() => ({
  labels: WEEKDAYS,
  datasets: [{ label: 'Visites', data: stats.value?.perWeekday ?? [], backgroundColor: '#20c997' }]
}));

const perDayOptions = computed(() => barOptions(15));
const perHourOptions = computed(() => barOptions(12));
const perWeekdayOptions = computed(() => barOptions(7));
</script>

<template>
  <div
    id="statsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="statsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <h5 id="statsOffcanvasLabel" class="offcanvas-title mb-0 me-3">
        <i class="bi bi-bar-chart-line me-1"></i> Statistiques d'accès
      </h5>
      <div class="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
        <button type="button" class="btn btn-sm btn-outline-secondary" title="Rafraîchir" @click="load">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
      </div>
    </div>

    <div class="offcanvas-body">
      <!-- Période d'analyse -->
      <div class="btn-group btn-group-sm w-100 mb-3" role="group" aria-label="Période d'analyse">
        <button
          v-for="p in PERIODS"
          :key="String(p.value)"
          type="button"
          class="btn"
          :class="period === p.value ? 'btn-primary' : 'btn-outline-primary'"
          @click="setPeriod(p.value)"
        >
          {{ p.label }}
        </button>
      </div>

      <div v-if="loading" class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm me-2"></span> Chargement…
      </div>

      <div v-else-if="error" class="alert alert-warning py-2 small mb-0">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
      </div>

      <template v-else-if="stats">
        <p class="text-muted small mb-2">
          Une visite = une ouverture de l'application. Visiteurs anonymisés (IP tronquée) ;
          les visites d'un compte connecté lui sont attribuées.
        </p>
        <p v-if="range" class="text-muted small mb-3">Période : {{ range }}</p>

        <!-- KPIs -->
        <div class="row g-2 text-center mb-2">
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.visits }}</div>
              <div class="small text-muted">Visites</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.uniqueVisitors }}</div>
              <div class="small text-muted">Visiteurs</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.lan }}</div>
              <div class="small text-muted">Local</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold">{{ stats.external }}</div>
              <div class="small text-muted">Externe</div>
            </div>
          </div>
        </div>
        <p class="text-muted small fst-italic mb-4">
          Aussi sur la période : {{ stats.pageLoads }} chargement<span v-if="stats.pageLoads > 1">s</span>
          de page (premières visites, sondes externes) et {{ stats.logins }}
          connexion<span v-if="stats.logins > 1">s</span>.
        </p>

        <template v-if="stats.visits > 0">
          <!-- Visites par jour -->
          <h6 class="text-uppercase text-muted small fw-bold mb-2">Visites par jour</h6>
          <div style="height: 180px" class="mb-4">
            <Bar :data="perDayData" :options="perDayOptions" />
          </div>

          <!-- Quand : heure et jour de semaine -->
          <h6 class="text-uppercase text-muted small fw-bold mb-2">Heure de la journée</h6>
          <div style="height: 160px" class="mb-4">
            <Bar :data="perHourData" :options="perHourOptions" />
          </div>

          <h6 class="text-uppercase text-muted small fw-bold mb-2">Jour de la semaine</h6>
          <div style="height: 160px" class="mb-4">
            <Bar :data="perWeekdayData" :options="perWeekdayOptions" />
          </div>

          <!-- Qui -->
          <h6 class="text-uppercase text-muted small fw-bold mb-2">Visites par utilisateur</h6>
          <ul class="list-unstyled small mb-4">
            <li v-for="u in stats.users" :key="u.name" class="d-flex justify-content-between border-bottom py-1">
              <span><i class="bi bi-person me-1"></i>{{ u.name }}</span>
              <span class="text-muted text-end">
                {{ u.count }}
                <span class="d-block" style="font-size: 0.75rem">dernière : {{ formatMoment(u.lastTs) }}</span>
              </span>
            </li>
            <li v-if="!stats.users.length" class="text-muted fst-italic">
              Aucune visite attribuée (authentification désactivée ou visiteurs anonymes).
            </li>
          </ul>

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
        <p v-else class="text-muted small fst-italic">Aucune visite enregistrée sur cette période.</p>
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
