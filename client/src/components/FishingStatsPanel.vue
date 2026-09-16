<script setup lang="ts">
/**
 * Panneau « Bilan de pêche » (offcanvas) — agrégats du carnet.
 *
 * ⚠️ **Ouvert à tous les rôles**, comme `AflotAgendaPanel` et contrairement aux panneaux
 * d'administration : lire un bilan de ses propres sorties n'est pas de l'administration.
 *
 * Sans état : tout arrive en props (`useFishing` a déjà chargé **toutes** les sorties et la vue
 * les marées Port-Tudy), donc ni chargement, ni écouteur `show.bs.offcanvas` — ce qui le distingue
 * de `StatsPanel`, qui doit interroger `/api/stats` à l'ouverture.
 *
 * Deux règles de lecture, posées par `lib/fishingStats.ts` : « prises » et « individus » ne se
 * confondent pas, et les croisements donnent des moyennes **par espèce** — un total mêlé ferait
 * de chaque moyenne un compteur de crevettes.
 */
import { computed } from 'vue';
import type { FishingRef, FishingTrip, FlatTide } from '../types';
import {
  buildDimensions,
  compare,
  gearRanking,
  speciesRanking,
  summarizeLog
} from '../lib/fishingStats';
import { formatDate } from '../lib/format';

const props = defineProps<{
  trips: FishingTrip[];
  refs: FishingRef[];
  tides: FlatTide[];
}>();

/** Nombre d'espèces mises en colonnes des croisements : au-delà, la table devient illisible. */
const TOP_SPECIES = 3;

const summary = computed(() => summarizeLog(props.trips));
const species = computed(() => speciesRanking(props.trips, props.refs));
const gears = computed(() => gearRanking(props.trips, props.refs));
const topSpecies = computed(() => species.value.slice(0, TOP_SPECIES));

const comparisons = computed(() => {
  const ids = topSpecies.value.map(s => s.id);
  return buildDimensions(props.tides).map(dim => compare(props.trips, ids, dim));
});

const period = computed(() => {
  const { firstDate, lastDate } = summary.value;
  if (!firstDate || !lastDate) return null;
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  return firstDate === lastDate
    ? formatDate(firstDate, opts)
    : `${formatDate(firstDate, opts)} → ${formatDate(lastDate, opts)}`;
});

const maxIndividuals = computed(() => Math.max(1, ...species.value.map(s => s.individuals)));

/** Largeur de barre en %, avec un plancher pour qu'un 1 face à un 96 reste visible (cf. MiniBars). */
function barWidth(individuals: number): string {
  return `${Math.max(4, (individuals / maxIndividuals.value) * 100)}%`;
}

const num = (value: number): string => value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

const plural = (count: number, one: string, many: string): string => (count > 1 ? many : one);
</script>

<template>
  <div
    id="fishingStatsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="fishingStatsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <h5 id="fishingStatsOffcanvasLabel" class="offcanvas-title mb-0 me-3">
        <i class="bi bi-bar-chart-line me-1"></i> Bilan de pêche
      </h5>
      <button
        type="button"
        class="btn-close ms-auto"
        data-bs-dismiss="offcanvas"
        aria-label="Fermer"
      ></button>
    </div>

    <div class="offcanvas-body">
      <p v-if="!summary.trips" class="text-muted small mb-0">Aucune sortie enregistrée.</p>

      <template v-else>
        <p v-if="period" class="text-muted small mb-2">Période : {{ period }}</p>

        <!-- Bilan -->
        <div class="row g-2 text-center mb-2">
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold" data-test="kpi-trips">{{ summary.trips }}</div>
              <div class="small text-muted">{{ plural(summary.trips, 'Sortie', 'Sorties') }}</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold" data-test="kpi-lines">{{ summary.catchLines }}</div>
              <div class="small text-muted">{{ plural(summary.catchLines, 'Prise', 'Prises') }}</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold" data-test="kpi-individuals">{{ summary.individuals }}</div>
              <div class="small text-muted">Individus</div>
            </div>
          </div>
          <div class="col-3">
            <div class="border rounded py-2">
              <div class="fs-4 fw-bold" data-test="kpi-blank">{{ summary.blankTrips }}</div>
              <div class="small text-muted">
                {{ plural(summary.blankTrips, 'Bredouille', 'Bredouilles') }}
              </div>
            </div>
          </div>
        </div>
        <p class="text-muted small fst-italic mb-4">
          {{ summary.kept }} gardé{{ summary.kept > 1 ? 's' : '' }} ·
          {{ summary.released }} relâché{{ summary.released > 1 ? 's' : '' }}. Une « prise » est une
          ligne saisie, un « individu » une unité : 25 crevettes font 1 prise et 25 individus.
        </p>

        <!-- Par espèce -->
        <h6 class="text-uppercase text-muted small fw-bold">Par espèce</h6>
        <ul class="list-unstyled mb-4">
          <li v-for="s in species" :key="s.id" class="species-row" data-test="species-row">
            <div class="d-flex justify-content-between small">
              <span class="text-truncate me-2">{{ s.labelPlural }}</span>
              <span class="fw-semibold flex-shrink-0">{{ s.individuals }}</span>
            </div>
            <div class="species-track" aria-hidden="true">
              <div class="species-bar" :style="{ width: barWidth(s.individuals) }"></div>
            </div>
            <div class="text-muted small">
              {{ s.trips }} {{ plural(s.trips, 'sortie', 'sorties') }} ·
              {{ s.lines }} {{ plural(s.lines, 'prise', 'prises') }}
              <template v-if="s.released">
                · {{ s.released }} relâché{{ s.released > 1 ? 's' : '' }}
              </template>
              <!-- Un « record » de 1, ou tiré d'une sortie unique, n'en est pas un. -->
              <template v-if="s.best && s.trips > 1 && s.best.quantity > 1">
                · record {{ s.best.quantity }} le {{ formatDate(s.best.date) }}
              </template>
            </div>
          </li>
        </ul>

        <!-- Par engin -->
        <h6 class="text-uppercase text-muted small fw-bold">Par engin</h6>
        <ul class="list-unstyled small mb-4">
          <li
            v-for="g in gears"
            :key="g.id"
            class="d-flex justify-content-between"
            data-test="gear-row"
          >
            <span class="text-truncate me-2">{{ g.label }}</span>
            <span class="text-muted flex-shrink-0">
              {{ g.individuals }} ind. · {{ g.trips }} {{ plural(g.trips, 'sortie', 'sorties') }}
            </span>
          </li>
        </ul>

        <!-- Tendances -->
        <h6 class="text-uppercase text-muted small fw-bold">Tendances</h6>
        <div class="alert alert-secondary py-2 small" role="note">
          <i class="bi bi-exclamation-circle me-1"></i>
          Indicatif : {{ summary.trips }} {{ plural(summary.trips, 'sortie', 'sorties') }}. Ces
          écarts ne prouvent rien — l'effectif de chaque groupe est écrit à côté, et ces tableaux se
          liront quand le carnet aura grossi.
        </div>

        <section v-for="c in comparisons" :key="c.id" class="mb-4" :data-test="`compare-${c.id}`">
          <div class="fw-semibold small mb-1">{{ c.title }}</div>
          <div v-if="!c.rows.length" class="text-muted small">Aucune sortie classable.</div>
          <div v-else class="table-responsive">
            <table class="table table-sm small align-middle mb-1">
              <thead>
                <tr>
                  <th scope="col">Groupe</th>
                  <th scope="col" class="text-end" title="Nombre de sorties">n</th>
                  <th v-for="s in topSpecies" :key="s.id" scope="col" class="text-end">
                    {{ s.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in c.rows" :key="row.label">
                  <td>{{ row.label }}</td>
                  <td class="text-end">
                    {{ row.trips }}
                    <span v-if="row.blankTrips" class="text-muted">({{ row.blankTrips }} bred.)</span>
                  </td>
                  <td v-for="(value, i) in row.perSpecies" :key="i" class="text-end">
                    {{ num(value) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="c.excluded" class="text-muted small fst-italic">
            {{ c.excluded }} {{ plural(c.excluded, 'sortie', 'sorties') }} {{ c.excludedLabel }}.
          </div>
        </section>
        <p class="text-muted small fst-italic mb-0">
          Les colonnes d'espèce donnent des individus <strong>par sortie</strong> du groupe.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.species-row + .species-row {
  margin-top: 0.6rem;
}

.species-track {
  height: 6px;
  border-radius: 3px;
  background: var(--bs-tertiary-bg);
  overflow: hidden;
}

.species-bar {
  height: 100%;
  border-radius: 3px;
  background: #0d6efd;
}
</style>
