<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { FlatTide } from '../types';
import { aflotAgenda, shiftMoment } from '../lib/navihan';
import { coefBand, formatDate, relativeDayHint, todayKey } from '../lib/format';
import { useNavihan } from '../composables/useNavihan';
import { useNow } from '../composables/useNow';

const props = defineProps<{ allTides: FlatTide[] }>();

const { offsets } = useNavihan();

/**
 * `now` sert à estomper les heures déjà passées. Il est **partagé** avec la carte
 * « Prochaines remises à flot » (`useNow`), qui décrit les mêmes heures : deux instants distincts
 * finiraient par se contredire. L'ouverture du panneau le rafraîchit **en plus** du retour au
 * premier plan — l'app reste volontiers ouverte des heures, et un agenda figé afficherait comme
 * « à venir » des remises à flot dépassées depuis longtemps.
 */
const { now, refresh } = useNow();

let el: HTMLElement | null = null;
onMounted(() => {
  el = document.getElementById('aflotAgendaOffcanvas');
  el?.addEventListener('show.bs.offcanvas', refresh);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', refresh));

/**
 * Date longue, pour un panneau qui court sur plusieurs mois. Majuscule sur la **seule** première
 * lettre, posée en JS : `text-capitalize` en mettrait une à chaque mot (« Dimanche 26 Juillet »),
 * alors qu'en français les mois s'écrivent en minuscules. Quantième en `numeric` : « 01 juillet »
 * ne s'écrit pas en prose.
 */
function longDate(date: string): string {
  const text = formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Tout ce que le template affiche est préparé ici : rendu tel quel, il rappelait les mêmes
 * fonctions deux ou trois fois par créneau (dont `shiftMoment` et `coefBand`) à chaque re-rendu.
 */
const days = computed(() => {
  const today = todayKey();
  // Pas de `days` : toute la plage disponible, du jour courant à la fin des horaires.
  return aflotAgenda(props.allTides, offsets, now.value).map(day => ({
    date: day.date,
    longDate: longDate(day.date),
    /** « aujourd'hui » / « demain », sinon `null` : la date longue est déjà en tête de bloc. */
    hint: relativeDayHint(day.date, today),
    slots: day.times.map(t => {
      /*
       * Basse mer **Navihan** dont la remise à flot découle, datée de son **propre** jour : le
       * décalage `basseMer` franchit lui aussi minuit.
       */
      const low = shiftMoment(t.basse.date, t.basse.time, offsets.basseMer);
      return {
        time: t.time,
        past: t.past,
        coefficient: t.coefficient,
        band: coefBand(t.coefficient),
        lowTime: low.time,
        // Date de la basse mer écrite **seulement** si elle diffère du jour de la remise à flot.
        lowDate: low.date === day.date ? null : formatDate(low.date)
      };
    })
  }));
});
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
        <div class="agenda-date fw-semibold">
          {{ d.longDate }}
          <span v-if="d.hint" class="agenda-hint fw-normal text-muted small ms-1">
            · {{ d.hint }}
          </span>
        </div>

        <div
          v-for="t in d.slots"
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
            :class="t.band.badgeClass"
            :title="`Coefficient · ${t.band.label}`"
          >{{ t.coefficient ?? '—' }}</span>

          <span class="small text-muted">
            Basse mer Navihan · {{ t.lowTime }}
            <template v-if="t.lowDate">
              · <span class="text-capitalize">{{ t.lowDate }}</span>
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
