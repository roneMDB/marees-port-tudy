<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FlatTide } from '../types';
import { addDays, todayKey } from '../lib/format';
import { groupByDay } from '../lib/tides';
import { noteOfTheDay } from '../lib/lexique';
import { useMotDuJour } from '../composables/useMotDuJour';
import { useLexicon } from '../composables/useLexicon';

const props = defineProps<{ allTides: FlatTide[] }>();

const { visible, hide, show } = useMotDuJour();
const { entries: lexicon, load: loadLexicon } = useLexicon();
onMounted(loadLexicon);

// Repli (transitoire, non persisté) — cf. ResourcesCard.
const open = ref(true);

// Contexte du jour, dérivé de la référence Port-Tudy (comme StatCards) :
// coefficient d'aujourd'hui et de la veille, via groupByDay (pur/testé).
const note = computed(() => {
  const days = groupByDay(props.allTides);
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const coef = days.find(d => d.date === today)?.coefficient ?? null;
  const prevCoef = days.find(d => d.date === yesterday)?.coefficient ?? null;
  return noteOfTheDay({ dateKey: today, coef, prevCoef }, lexicon.value);
});
</script>

<template>
  <div v-if="visible" class="card shadow-sm h-100">
    <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center">
      <button
        type="button"
        class="btn btn-link text-decoration-none p-0 fw-semibold"
        :aria-expanded="open"
        @click="open = !open"
      >
        <i class="bi bi-book me-1"></i> Le mot du jour
        <i :class="open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="small ms-1"></i>
      </button>
      <button
        type="button"
        class="btn btn-sm btn-link link-secondary text-decoration-none p-0"
        title="Masquer le mot du jour"
        aria-label="Masquer le mot du jour"
        @click="hide"
      >
        <i class="bi bi-eye-slash"></i>
      </button>
    </div>

    <div v-show="open" class="card-body py-3 px-3">
      <div class="d-flex align-items-start">
        <span class="motdujour-icon flex-shrink-0 me-3" :class="`motdujour-icon--${note.type}`">
          <i :class="note.type === 'peche' ? 'bi bi-bucket' : 'bi bi-water'"></i>
        </span>
        <div>
          <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
            <span class="fw-semibold fs-5">{{ note.term }}</span>
            <span
              class="badge rounded-pill"
              :class="note.type === 'peche' ? 'text-bg-success' : 'text-bg-info'"
            >{{ note.type === 'peche' ? 'Pêche' : 'Marée' }}</span>
          </div>
          <p class="text-body-secondary mb-0">{{ note.definition }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Masqué : un rappel discret permet de le rétablir. -->
  <div v-else class="text-end mb-3">
    <button type="button" class="btn btn-sm btn-link link-secondary text-decoration-none p-0" @click="show">
      <i class="bi bi-book me-1"></i> Afficher le mot du jour
    </button>
  </div>
</template>

<style scoped>
/* Pastille d'icône thématique, adaptée au thème clair/sombre (cf. ResourcesCard). */
.motdujour-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background-color: var(--bs-info-bg-subtle);
  color: var(--bs-info-text-emphasis);
  font-size: 1.15rem;
}

/* Pêche : pastille verte pour distinguer d'un coup d'œil des termes de marée (bleu). */
.motdujour-icon--peche {
  background-color: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
}
</style>
