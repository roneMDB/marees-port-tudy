<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import FishingTripCard from '../components/FishingTripCard.vue';
import FishingTripForm from '../components/FishingTripForm.vue';
import { useFishing } from '../composables/useFishing';
import { useFishingRefs } from '../composables/useFishingRefs';
import { useSettings } from '../composables/useSettings';
import { useAflotObservations } from '../composables/useAflotObservations';
import { useAuth } from '../composables/useAuth';
import { getTides } from '../api/tides';
import { flatten } from '../lib/tides';
import { aflotChoices, nearestAflot, tripTideContext } from '../lib/fishing';
import { addDays, todayKey } from '../lib/format';
import type { FishingTrip, FishingTripInput, FlatTide } from '../types';

/** Fenêtre de pré-remplissage autour d'aujourd'hui (jours), de part et d'autre. */
const AFLOT_WINDOW_DAYS = 7;

const { trips, loading, error, load, save, remove } = useFishing();
const { species, gears, refs, load: loadRefs } = useFishingRefs();
const { settings, load: loadSettings } = useSettings();
const { map: observations, load: loadObservations } = useAflotObservations();
const { isAdmin } = useAuth();

const today = ref(todayKey());
const tides = ref<FlatTide[]>([]);
const editing = ref<FishingTrip | null>(null);
const formOpen = ref(false);
const saving = ref(false);
const actionError = ref<string | null>(null);

/**
 * Marées **Port-Tudy** couvrant les sorties existantes **et** la fenêtre de pré-remplissage :
 * le contexte marée est recalculé à l'affichage, il faut donc les horaires de chaque jour listé.
 */
async function loadTides(): Promise<void> {
  const dates = trips.value.map(t => t.date);
  const from = [addDays(today.value, -AFLOT_WINDOW_DAYS), ...dates].sort()[0];
  const to = [addDays(today.value, AFLOT_WINDOW_DAYS), ...dates].sort().at(-1)!;
  try {
    tides.value = flatten(await getTides(from, to, 'port-tudy'));
  } catch {
    tides.value = []; // horaires indisponibles : les cartes afficheront « marée inconnue »
  }
}

onMounted(async () => {
  await Promise.all([load(), loadRefs(), loadSettings(), loadObservations().catch(() => undefined)]);
  await loadTides();
});

// Une sortie ajoutée hors de la plage déjà chargée doit voir son contexte marée apparaître.
watch(() => trips.value.map(t => t.date).join(','), loadTides);

const choices = computed(() =>
  aflotChoices(
    tides.value,
    settings.navihan,
    observations,
    new Date(),
    AFLOT_WINDOW_DAYS,
    AFLOT_WINDOW_DAYS
  )
);
const defaultChoice = computed(() => nearestAflot(choices.value, new Date()));

function contextOf(trip: FishingTrip) {
  return tripTideContext(trip.date, tides.value, settings.navihan);
}

function openNew(): void {
  editing.value = null;
  formOpen.value = true;
  actionError.value = null;
}

function openEdit(trip: FishingTrip): void {
  editing.value = trip;
  formOpen.value = true;
  actionError.value = null;
}

function closeForm(): void {
  formOpen.value = false;
  editing.value = null;
}

async function onSave(input: FishingTripInput): Promise<void> {
  saving.value = true;
  actionError.value = null;
  try {
    await save(input, editing.value?.id);
    closeForm();
  } catch (e) {
    // Le formulaire reste ouvert : une saisie refusée ne doit pas être perdue.
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function onRemove(id: number): Promise<void> {
  const trip = trips.value.find(t => t.id === id);
  if (!confirm(`Supprimer la sortie du ${trip?.date ?? ''} ?`)) return;
  actionError.value = null;
  try {
    await remove(id);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="container-xxl py-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h4 mb-0"><i class="bi bi-bucket me-2"></i>Carnet de pêche</h1>
      <button
        v-if="isAdmin"
        type="button"
        class="btn btn-primary btn-sm"
        data-test="new-trip"
        @click="openNew"
      >
        <i class="bi bi-plus-lg me-1"></i>Nouvelle sortie
      </button>
    </div>

    <div v-if="actionError" class="alert alert-warning py-2 small" role="alert">
      {{ actionError }}
    </div>

    <FishingTripForm
      v-if="formOpen"
      :species="species"
      :gears="gears"
      :choices="choices"
      :initial="editing"
      :default-choice="defaultChoice"
      :saving="saving"
      @save="onSave"
      @cancel="closeForm"
    />

    <div v-if="loading" class="d-flex justify-content-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Chargement…</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <p v-else-if="!trips.length" class="text-muted fst-italic py-4 text-center">
      Aucune sortie enregistrée pour l'instant.
    </p>

    <FishingTripCard
      v-for="trip in trips"
      v-else
      :key="trip.id"
      :trip="trip"
      :refs="refs"
      :context="contextOf(trip)"
      :today="today"
      :can-edit="isAdmin"
      @edit="openEdit"
      @remove="onRemove"
    />
  </div>
</template>
