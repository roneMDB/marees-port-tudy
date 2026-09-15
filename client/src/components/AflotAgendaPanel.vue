<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { FlatTide } from '../types';
import { aflotAgenda, shiftMoment } from '../lib/navihan';
import { addDays, coefBand, formatDate, todayKey } from '../lib/format';
import { useNavihan } from '../composables/useNavihan';

const props = defineProps<{ allTides: FlatTide[] }>();

const { offsets } = useNavihan();

/**
 * `now` sert à estomper les heures déjà passées. Il est rafraîchi **à chaque ouverture** du
 * panneau : l'app reste volontiers ouverte des heures, et un agenda figé sur l'instant du montage
 * du dashboard afficherait comme « à venir » des remises à flot dépassées depuis longtemps.
 */
const now = ref(new Date());
function refresh(): void {
  now.value = new Date();
}

let el: HTMLElement | null = null;
onMounted(() => {
  el = document.getElementById('aflotAgendaOffcanvas');
  el?.addEventListener('show.bs.offcanvas', refresh);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', refresh));

// Pas de `days` : toute la plage disponible, du jour courant à la fin des horaires.
const days = computed(() => aflotAgenda(props.allTides, offsets, now.value));

/** Date longue, pour un panneau qui court sur plusieurs mois (« lundi 27 juillet »). */
const longDate = (date: string): string =>
  formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' });

/**
 * « aujourd'hui » / « demain », sinon `null` : la date longue est déjà en tête de bloc, et
 * `relativeDayLabel` la répéterait pour tous les autres jours.
 */
function dayHint(date: string): string | null {
  const today = todayKey();
  if (date === today) return "aujourd'hui";
  if (date === addDays(today, 1)) return 'demain';
  return null;
}

/**
 * Basse mer **Navihan** dont une remise à flot découle, datée de son **propre** jour : le décalage
 * `basseMer` franchit lui aussi minuit.
 */
const lowMoment = (basse: FlatTide): { date: string; time: string } =>
  shiftMoment(basse.date, basse.time, offsets.basseMer);
</script>

<template>
  <div
    id="aflotAgendaOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="aflotAgendaOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <h5 id="aflotAgendaOffcanvasLabel" class="offcanvas-title mb-0">
        <i class="bi bi-life-preserver me-1"></i> Remises à flot
      </h5>
      <button
        type="button"
        class="btn-close ms-auto"
        data-bs-dismiss="offcanvas"
        aria-label="Fermer"
      ></button>
    </div>

    <div class="offcanvas-body">
      <p class="text-muted small">
        Heure « Remise à flot » (décalage fixe), dérivée des basses mers de Port-Tudy, sur tous les
        horaires disponibles.
      </p>

      <p v-if="!days.length" class="text-muted">
        Aucune remise à flot à venir sur les horaires disponibles.
      </p>

      <div v-for="d in days" :key="d.date" class="agenda-day border-bottom py-2">
        <div class="fw-semibold text-capitalize">
          {{ longDate(d.date) }}
          <span v-if="dayHint(d.date)" class="fw-normal text-muted small ms-1">
            · {{ dayHint(d.date) }}
          </span>
        </div>

        <div
          v-for="t in d.times"
          :key="t.time"
          class="agenda-slot d-flex flex-wrap align-items-baseline gap-2 mt-1"
        >
          <span
            class="agenda-time badge rounded-pill fw-semibold"
            :class="t.past
              ? 'aflot-past bg-body-secondary text-secondary-emphasis'
              : 'bg-success-subtle text-success-emphasis'"
            :title="t.past ? 'Déjà passée' : undefined"
          >{{ t.time }}</span>

          <span
            class="agenda-coef badge rounded-pill"
            :class="coefBand(t.coefficient).badgeClass"
            :title="`Coefficient · ${coefBand(t.coefficient).label}`"
          >{{ t.coefficient ?? '—' }}</span>

          <span class="small text-muted">
            Basse mer Navihan · {{ lowMoment(t.basse).time }}
            <template v-if="lowMoment(t.basse).date !== d.date">
              · <span class="text-capitalize">{{ formatDate(lowMoment(t.basse).date) }}</span>
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.offcanvas {
  --bs-offcanvas-width: 420px;
}

/* Le dernier jour ne porte pas de liseré : il n'y a rien après lui à séparer. */
.agenda-day:last-child {
  border-bottom: 0 !important;
}
</style>
