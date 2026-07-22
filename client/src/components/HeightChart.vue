<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import type { ChartData, ChartOptions } from 'chart.js';
import type { FlatTide } from '../types';
import { addDays, formatDate, todayKey } from '../lib/format';
import { clampDate } from '../lib/tides';
import { buildNavihanMaregram, navihanAflot, navihanExtremes, navihanHeightAtMinute } from '../lib/maregram';
import { useTheme } from '../composables/useTheme';
import { useNavihan } from '../composables/useNavihan';

const props = defineProps<{ allTides: FlatTide[] }>();
const { isDark } = useTheme();
const { offsets } = useNavihan();

// Jour affiché (navigable), borné aux dates disponibles dans les données.
const dates = computed(() => [...new Set(props.allTides.map(t => t.date))].sort());
const minDate = computed(() => dates.value[0] ?? '');
const maxDate = computed(() => dates.value[dates.value.length - 1] ?? '');

const day = ref(todayKey());
const isToday = computed(() => day.value === todayKey());
const canPrev = computed(() => !!minDate.value && day.value > minDate.value);
const canNext = computed(() => !!maxDate.value && day.value < maxDate.value);

function goPrev(): void {
  if (canPrev.value) day.value = clampDate(addDays(day.value, -1), minDate.value, maxDate.value);
}
function goNext(): void {
  if (canNext.value) day.value = clampDate(addDays(day.value, 1), minDate.value, maxDate.value);
}
function goToday(): void {
  day.value = clampDate(todayKey(), minDate.value, maxDate.value);
}

// Recale le jour dans la plage une fois les données chargées (ex. aujourd'hui hors plage).
watch(dates, d => {
  if (d.length) day.value = clampDate(day.value, d[0], d[d.length - 1]);
});

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
  if (!isToday.value) return null; // le repère « maintenant » n'a de sens que pour aujourd'hui
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
      label: 'Remise à flot',
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
            return ds === 'Remise à flot' ? `Remise à flot · ${h}` : h;
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
    <div class="card-header bg-body-tertiary d-flex flex-wrap justify-content-between align-items-center gap-2">
      <span class="fw-semibold">
        <i class="bi bi-graph-up text-primary me-1"></i> Marégramme Navihan
        <span class="text-muted fw-normal small text-capitalize">· {{ formatDate(day) }}</span>
        <span v-if="dayCoefs.length" class="text-muted fw-normal small">· coef {{ dayCoefs.join(' · ') }}</span>
      </span>
      <div class="d-flex align-items-center gap-2">
        <div class="btn-group btn-group-sm" role="group" aria-label="Jour du marégramme">
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="!canPrev"
            title="Jour précédent"
            aria-label="Jour précédent"
            @click="goPrev"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <button v-if="!isToday" type="button" class="btn btn-outline-secondary" title="Aujourd'hui" @click="goToday">
            Auj.
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="!canNext"
            title="Jour suivant"
            aria-label="Jour suivant"
            @click="goNext"
          >
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
        <input
          type="date"
          class="form-control form-control-sm w-auto"
          v-model="day"
          :min="minDate || undefined"
          :max="maxDate || undefined"
          aria-label="Choisir une date"
        />
      </div>
    </div>
    <div class="card-body">
      <div v-if="curve.length" style="height: 260px">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <p v-else class="text-muted small mb-0 py-5 text-center">Pas de données pour aujourd'hui.</p>
    </div>
  </div>
</template>
