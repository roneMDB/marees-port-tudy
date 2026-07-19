<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Line } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { FlatTide } from '../types';
import { formatDate, todayKey } from '../lib/format';
import { buildNavihanMaregram, navihanAflot, navihanExtremes, navihanHeightAtMinute } from '../lib/maregram';
import { useTheme } from '../composables/useTheme';
import { useNavihan } from '../composables/useNavihan';

const props = defineProps<{ allTides: FlatTide[] }>();
const { isDark } = useTheme();
const { offsets } = useNavihan();

const day = computed(() => todayKey());

// Minute courante, rafraîchie chaque minute pour déplacer le repère « maintenant ».
function currentMinute(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
const nowMinute = ref(currentMinute());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nowMinute.value = currentMinute();
  timer = setInterval(() => {
    nowMinute.value = currentMinute();
  }, 60_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const dayCoefs = computed(() =>
  props.allTides
    .filter(e => e.date === day.value && e.type === 'high' && e.coefficient != null)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(e => e.coefficient as number)
);

function formatMinutes(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

const curve = computed(() => buildNavihanMaregram(props.allTides, day.value, offsets));
const extremes = computed(() => navihanExtremes(props.allTides, day.value, offsets));
const aflot = computed(() => navihanAflot(props.allTides, day.value, offsets));
const nowMarker = computed(() => {
  const height = navihanHeightAtMinute(props.allTides, day.value, offsets, nowMinute.value);
  return height == null ? null : { x: nowMinute.value, y: Number(height.toFixed(3)) };
});

const chartData = computed<ChartData<'line'>>(() => ({
  datasets: [
    {
      label: 'Hauteur (m)',
      data: curve.value.map(p => ({ x: p.minutes, y: Number(p.height.toFixed(3)) })),
      borderColor: '#0d6efd',
      backgroundColor: 'rgba(13, 110, 253, 0.15)',
      fill: true,
      pointRadius: 0,
      tension: 0
    },
    {
      label: 'Extrêmes',
      data: extremes.value.map(e => ({ x: e.minutes, y: e.height })),
      showLine: false,
      pointRadius: 5,
      pointHoverRadius: 6,
      pointBackgroundColor: extremes.value.map(e => (e.type === 'high' ? '#0d6efd' : '#fd7e14')),
      pointBorderColor: extremes.value.map(e => (e.type === 'high' ? '#0d6efd' : '#fd7e14'))
    },
    {
      label: 'À flot',
      data: aflot.value.map(p => ({ x: p.minutes, y: Number(p.height.toFixed(3)) })),
      showLine: false,
      pointStyle: 'triangle',
      pointRadius: 7,
      pointHoverRadius: 8,
      pointBackgroundColor: '#198754',
      pointBorderColor: '#198754'
    },
    {
      label: 'Maintenant',
      data: nowMarker.value ? [nowMarker.value] : [],
      showLine: false,
      pointRadius: 6,
      pointHoverRadius: 7,
      pointBackgroundColor: '#dc3545',
      pointBorderColor: '#fff',
      pointBorderWidth: 2
    }
  ]
}));

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const tick = isDark.value ? '#adb5bd' : '#495057';
  const grid = isDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => (items.length ? formatMinutes(Number(items[0].parsed.x)) : ''),
          label: item => {
            const ds = item.dataset.label;
            const h = `${Number(item.parsed.y).toFixed(2)} m`;
            return ds === 'À flot' ? `À flot · ${h}` : h;
          }
        }
      }
    },
    scales: {
      y: {
        title: { display: true, text: 'Hauteur (m)', color: tick },
        ticks: { color: tick },
        grid: { color: grid }
      },
      x: {
        type: 'linear',
        min: 0,
        max: 1440,
        ticks: { stepSize: 120, color: tick, callback: value => formatMinutes(Number(value)) },
        grid: { color: grid }
      }
    }
  };
});
</script>

<template>
  <div class="card shadow-sm h-100">
    <div class="card-header bg-body-tertiary fw-semibold">
      <i class="bi bi-graph-up text-primary me-1"></i> Marégramme Navihan
      <span class="text-muted fw-normal small text-capitalize">· {{ formatDate(day) }}</span>
      <span v-if="dayCoefs.length" class="text-muted fw-normal small">· coef {{ dayCoefs.join(' · ') }}</span>
    </div>
    <div class="card-body">
      <div v-if="curve.length" style="height: 260px">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <p v-else class="text-muted small mb-0 py-5 text-center">Pas de données pour aujourd'hui.</p>
    </div>
  </div>
</template>
