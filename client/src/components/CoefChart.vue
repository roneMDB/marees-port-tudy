<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { FlatTide } from '../types';
import { formatDate } from '../lib/format';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{ tides: FlatTide[] }>();
const { isDark } = useTheme();

const dayCount = computed(() => new Set(props.tides.map(t => t.date)).size);

const chartData = computed<ChartData<'bar'>>(() => {
  const highs = props.tides
    .filter(t => t.type === 'high' && t.coefficient != null)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return {
    labels: highs.map(t => `${formatDate(t.date, { day: '2-digit', month: '2-digit' })} ${t.time}`),
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
        ticks: { maxRotation: 90, autoSkip: true, maxTicksLimit: 16, color: tick },
        grid: { color: grid }
      }
    }
  };
});
</script>

<template>
  <div class="card shadow-sm h-100">
    <div class="card-header bg-body-tertiary fw-semibold">
      <i class="bi bi-bar-chart-fill text-info me-1"></i> Coefficients (pleines mers)
      <span class="text-muted fw-normal small">· {{ dayCount }} jour(s)</span>
    </div>
    <div class="card-body">
      <div style="height: 260px">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </div>
  </div>
</template>
