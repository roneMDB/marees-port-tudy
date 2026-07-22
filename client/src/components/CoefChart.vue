<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { FlatTide } from '../types';
import { formatDate } from '../lib/format';
import { useTheme } from '../composables/useTheme';

const props = withDefaults(defineProps<{ tides: FlatTide[]; days?: number }>(), { days: 20 });
const emit = defineEmits<{ (e: 'update:days', value: number): void }>();
const { isDark } = useTheme();

const dayCount = computed(() => new Set(props.tides.map(t => t.date)).size);

// Durée du graphe modifiable depuis le titre — **éphémère** (session), ne modifie pas les réglages.
function onCoefDays(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n)) emit('update:days', Math.min(90, Math.max(1, Math.round(n))));
}

const chartData = computed<ChartData<'bar'>>(() => {
  const highs = props.tides
    .filter(t => t.type === 'high' && t.coefficient != null)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return {
    // Libellé sur deux lignes : date puis heure (plus lisible qu'une longue chaîne inclinée).
    labels: highs.map(t => [formatDate(t.date, { day: '2-digit', month: '2-digit' }), t.time]),
    datasets: [
      {
        label: 'Coefficient',
        data: highs.map(t => t.coefficient as number),
        backgroundColor: highs.map(t =>
          (t.coefficient as number) >= 95
            ? '#dc3545'
            : (t.coefficient as number) >= 70
              ? '#fd7e14'
              : '#0dcaf0'
        )
      }
    ]
  };
});

const chartOptions = computed<ChartOptions<'bar'>>(() => {
  const tick = isDark.value ? '#adb5bd' : '#495057';
  const grid = isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        suggestedMax: 120,
        title: { display: true, text: 'Coefficient', color: tick },
        ticks: { color: tick },
        grid: { color: grid }
      },
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: tick, font: { size: 10 } },
        grid: { color: grid }
      }
    }
  };
});
</script>

<template>
  <div class="card shadow-sm h-100">
    <div class="card-header bg-body-tertiary d-flex flex-wrap justify-content-between align-items-center gap-2">
      <span class="fw-semibold">
        <i class="bi bi-bar-chart-fill text-info me-1"></i> Coefficients (pleines mers)
        <span class="text-muted fw-normal small">· {{ dayCount }} jour(s)</span>
      </span>
      <div class="d-flex align-items-center gap-1">
        <label for="coefDaysInput" class="form-label small text-muted mb-0">jours</label>
        <input
          id="coefDaysInput"
          type="number"
          min="1"
          max="90"
          class="form-control form-control-sm w-auto"
          style="max-width: 5rem"
          :value="days"
          @input="onCoefDays"
          title="Durée d'affichage (jours) — pour cette session"
        />
      </div>
    </div>
    <div class="card-body">
      <div style="height: 260px">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </div>
</template>
