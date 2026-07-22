<script setup lang="ts">
import { computed } from 'vue';
import type { FlatTide } from '../types';
import { NAVIHAN } from '../types';
import { groupByDay } from '../lib/tides';
import { formatDate, formatHeight, todayKey, coefBand } from '../lib/format';

const props = withDefaults(defineProps<{ tides: FlatTide[]; siteLabel?: string }>(), {
  siteLabel: 'Port-Tudy'
});

const today = todayKey();

// Une ligne par jour (la période à afficher est fournie déjà bornée par le parent).
const rows = computed(() => groupByDay(props.tides).map(day => ({ day, band: coefBand(day.coefficient) })));

/** Heures « à flot » Navihan du jour (dérivées des basses mers). */
function aflot(lows: FlatTide[]): string[] {
  return lows.map(l => l.navihan[NAVIHAN.aFlot]).filter((t): t is string => !!t);
}
</script>

<template>
  <div class="small text-muted px-3 pt-2">
    Chaque marée : <span class="fw-semibold text-body">heure</span>
    · <i class="bi bi-water text-primary"></i> <span class="text-body">hauteur d'eau (m)</span>
  </div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 tide-day-table">
      <thead class="table-dark">
        <tr>
          <th>Jour</th>
          <th>Coef</th>
          <th>Pleines mers <span class="fw-normal opacity-75">· {{ siteLabel }}</span></th>
          <th>Basses mers <span class="fw-normal opacity-75">· {{ siteLabel }}</span></th>
          <th class="fw-bold">
            Remise à flot
            <i
              class="bi bi-info-circle small text-muted"
              title="Heure à laquelle le bateau se remet à flotter après la basse mer (heure Navihan dérivée de Port-Tudy)"
            ></i>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td colspan="5" class="text-center text-muted py-4">Aucune marée pour ces filtres.</td>
        </tr>
        <tr
          v-for="{ day, band } in rows"
          :key="day.date"
          :class="{ 'is-today': day.date === today }"
        >
          <td data-label="Jour" class="text-capitalize text-nowrap" :class="{ 'fw-semibold': day.date === today }">
            <i
              v-if="day.date === today"
              class="bi bi-circle-fill text-primary me-1 today-marker"
              title="Aujourd'hui"
              aria-label="Aujourd'hui"
            ></i>
            {{ formatDate(day.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }}
          </td>
          <td data-label="Coef">
            <span
              v-if="day.coefficient != null"
              class="badge rounded-pill"
              :class="band.badgeClass"
              :title="band.label"
            >
              <i v-if="band.icon" :class="['bi', band.icon, 'me-1']"></i>{{ day.coefficient }}
            </span>
            <span v-else class="text-muted">—</span>
          </td>
          <td data-label="Pleines mers">
            <span v-if="!day.highs.length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="h in day.highs" :key="h.time" class="tide-cell text-nowrap">
                <span class="fw-semibold">{{ h.time }}</span>
                <span class="text-muted small ms-1" title="Hauteur d'eau">
                  <i class="bi bi-water"></i> {{ formatHeight(h.height) }}
                </span>
              </span>
            </span>
          </td>
          <td data-label="Basses mers">
            <span v-if="!day.lows.length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="l in day.lows" :key="l.time" class="tide-cell text-nowrap">
                <span class="fw-semibold">{{ l.time }}</span>
                <span class="text-muted small ms-1" title="Hauteur d'eau">
                  <i class="bi bi-water"></i> {{ formatHeight(l.height) }}
                </span>
              </span>
            </span>
          </td>
          <td data-label="Remise à flot">
            <span v-if="!aflot(day.lows).length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="t in aflot(day.lows)" :key="t" class="badge rounded-pill afloat-pill text-nowrap">
                <i class="bi bi-water me-1"></i>{{ t }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.today-marker {
  font-size: 0.55em;
  vertical-align: middle;
}

/* Pastille « Remise à flot » : teal doux, adaptée aux thèmes clair/sombre (Bootstrap 5.3). */
.afloat-pill {
  background-color: var(--bs-info-bg-subtle);
  color: var(--bs-info-text-emphasis);
  border: 1px solid var(--bs-info-border-subtle);
  font-weight: 600;
}

/* Regroupe les horaires d'une cellule (2 marées) ; sur mobile ils s'alignent à droite. */
.tide-values {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
}

@media (max-width: 767.98px) {
  .tide-values {
    justify-content: flex-end;
    text-align: right;
  }
}
</style>
