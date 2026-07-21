<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FlatTide } from '../types';
import { NAVIHAN } from '../types';
import { formatDate, formatHeight, todayKey, coefBand } from '../lib/format';

const props = withDefaults(defineProps<{ tides: FlatTide[]; siteLabel?: string }>(), {
  siteLabel: 'Port-Tudy'
});

const today = todayKey();

type SortKey = 'date' | 'type' | 'time' | 'height' | 'coef';
const sortKey = ref<SortKey>('date');
const sortAsc = ref(true);

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function sortValue(t: FlatTide, key: SortKey): string | number {
  switch (key) {
    case 'date': return t.date + t.time;
    case 'type': return t.type;
    case 'time': return t.time;
    case 'height': return Number.isFinite(t.height) ? t.height : -Infinity;
    case 'coef': return t.coefficient ?? -Infinity;
  }
}

const sortedTides = computed(() => {
  const key = sortKey.value;
  const dir = sortAsc.value ? 1 : -1;
  return [...props.tides].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
});

// Pagination : 25 lignes par page.
const PAGE_SIZE = 25;
const page = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(props.tides.length / PAGE_SIZE)));
const pagedTides = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return sortedTides.value
    .slice(start, start + PAGE_SIZE)
    .map(tide => ({ tide, band: coefBand(tide.coefficient) }));
});

// Revient en page 1 quand les données changent ; borne la page si elle dépasse.
watch(() => props.tides, () => { page.value = 1; });
watch(totalPages, n => { if (page.value > n) page.value = n; });

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none';
  return sortAsc.value ? 'ascending' : 'descending';
}
</script>

<template>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 tide-table">
      <thead class="table-dark">
        <tr>
          <th role="button" :aria-sort="ariaSort('date')" @click="toggleSort('date')">
            Date <i class="bi bi-arrow-down-up small"></i>
          </th>
          <th role="button" :aria-sort="ariaSort('type')" @click="toggleSort('type')">Type</th>
          <th role="button" :aria-sort="ariaSort('time')" @click="toggleSort('time')">Heure {{ siteLabel }}</th>
          <th role="button" :aria-sort="ariaSort('height')" @click="toggleSort('height')">Hauteur</th>
          <th role="button" :aria-sort="ariaSort('coef')" @click="toggleSort('coef')">Coef</th>
          <th>Navihan basse mer</th>
          <th>Navihan pleine mer</th>
          <th class="fw-bold">Navihan à flot</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="pagedTides.length === 0">
          <td colspan="8" class="text-center text-muted py-4">
            Aucune marée pour ces filtres.
          </td>
        </tr>
        <tr
          v-for="{ tide: t, band } in pagedTides"
          :key="t.date + t.time + t.type"
          :class="[t.type === 'high' ? 'tide-high' : 'tide-low', { 'is-today': t.date === today }]"
        >
          <td data-label="Date" class="text-capitalize" :class="{ 'fw-semibold': t.date === today }">
            <i
              v-if="t.date === today"
              class="bi bi-circle-fill text-primary me-1 today-marker"
              title="Aujourd'hui"
              aria-label="Aujourd'hui"
            ></i>
            {{ formatDate(t.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }}
          </td>
          <td data-label="Type">
            <span :class="['badge', t.type === 'high' ? 'text-bg-primary' : 'text-bg-warning']">
              {{ t.type === 'high' ? 'Pleine mer' : 'Basse mer' }}
            </span>
          </td>
          <td :data-label="`Heure ${siteLabel}`" class="fw-semibold">{{ t.time }}</td>
          <td data-label="Hauteur">{{ formatHeight(t.height) }}</td>
          <td data-label="Coef">
            <span
              v-if="t.coefficient != null"
              class="badge rounded-pill"
              :class="band.badgeClass"
              :title="band.label"
            >
              <i v-if="band.icon" :class="['bi', band.icon, 'me-1']"></i>{{ t.coefficient }}
            </span>
            <span v-else class="text-muted">—</span>
          </td>
          <td data-label="Navihan basse mer">{{ t.navihan[NAVIHAN.basseMer] ?? '—' }}</td>
          <td data-label="Navihan pleine mer">{{ t.navihan[NAVIHAN.pleineMer] ?? '—' }}</td>
          <td data-label="Navihan à flot" class="fw-bold text-success">{{ t.navihan[NAVIHAN.aFlot] ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <nav
    v-if="totalPages > 1"
    class="d-flex justify-content-between align-items-center flex-wrap gap-2 px-3 py-2 border-top"
    aria-label="Pagination des marées"
  >
    <span class="text-muted small">
      {{ props.tides.length }} marées · page {{ page }}/{{ totalPages }}
    </span>
    <ul class="pagination pagination-sm mb-0">
      <li class="page-item" :class="{ disabled: page === 1 }">
        <button type="button" class="page-link" :disabled="page === 1" @click="page--">
          <i class="bi bi-chevron-left"></i> Précédent
        </button>
      </li>
      <li class="page-item" :class="{ disabled: page === totalPages }">
        <button type="button" class="page-link" :disabled="page === totalPages" @click="page++">
          Suivant <i class="bi bi-chevron-right"></i>
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* Repère « Aujourd'hui » : petite icône avant la date (remplace l'ancien badge). */
.today-marker {
  font-size: 0.55em;
  vertical-align: middle;
}
</style>

