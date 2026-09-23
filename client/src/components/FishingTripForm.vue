<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { FishingCatch, FishingRef, FishingTrip, FishingTripInput } from '../types';
import type { AflotChoice } from '../lib/fishing';
import { defaultGearFor } from '../lib/fishing';

const props = withDefaults(
  defineProps<{
    species: FishingRef[];
    gears: FishingRef[];
    choices: AflotChoice[];
    initial?: FishingTrip | null;
    defaultChoice?: AflotChoice | null;
    saving?: boolean;
  }>(),
  { initial: null, defaultChoice: null, saving: false }
);

const emit = defineEmits<{ save: [FishingTripInput]; cancel: [] }>();

/** Ligne de prise en cours de saisie : les nombres transitent en chaîne (champs `<input>`). */
interface CatchDraft {
  speciesId: string;
  gearId: string;
  quantity: string;
  sizeCm: string;
  weightG: string;
  kept: boolean;
}

const form = reactive({
  date: '',
  startTime: '',
  endTime: '',
  notes: '',
  baited: false
});

/**
 * Clé de l'à-flot sélectionné. Vide = « aucun » : une sortie à la ligne ne découle pas forcément
 * d'une remise à flot. Rien de tout cela n'est enregistré — c'est une commodité de saisie.
 */
const selectedAflot = ref('');
const catches = ref<CatchDraft[]>([]);

function draftFromCatch(c: FishingCatch): CatchDraft {
  return {
    speciesId: c.speciesId,
    gearId: c.gearId,
    quantity: String(c.quantity),
    sizeCm: c.sizeCm == null ? '' : String(c.sizeCm),
    weightG: c.weightG == null ? '' : String(c.weightG),
    kept: c.kept
  };
}

/** (Ré)initialise le formulaire : édition d'une sortie, ou création pré-remplie par l'à-flot. */
function reset(): void {
  if (props.initial) {
    form.date = props.initial.date;
    form.startTime = props.initial.startTime ?? '';
    form.endTime = props.initial.endTime ?? '';
    form.notes = props.initial.notes ?? '';
    form.baited = props.initial.baited;
    selectedAflot.value = '';
    catches.value = props.initial.catches.map(draftFromCatch);
    return;
  }
  const choice = props.defaultChoice;
  form.date = choice?.date ?? '';
  form.startTime = choice?.time ?? '';
  // L'heure de fin reste vide : personne ne sait quand la sortie se terminera.
  form.endTime = '';
  form.notes = '';
  form.baited = false;
  selectedAflot.value = choice?.key ?? '';
  catches.value = [];
}

reset();

/**
 * Le formulaire est monté par un `v-if` : `reset()` au setup suffit dans le cas normal. Ce watch
 * ne couvre qu'un cas : le formulaire ouvert **avant** que les marées ne soient chargées, donc sans
 * pré-remplissage possible. Il ne s'applique que si la date est encore vide — sinon une saisie déjà
 * commencée serait écrasée à l'arrivée des horaires.
 */
watch(
  () => props.defaultChoice,
  choice => {
    if (props.initial || form.date || !choice) return;
    form.date = choice.date;
    form.startTime = choice.time;
    selectedAflot.value = choice.key;
  }
);

/**
 * Choisir un à-flot **réécrit** date et heure de début : c'est la raison d'être du sélecteur.
 * L'inverse n'est pas vrai — modifier les champs à la main ne touche pas au sélecteur.
 */
function onAflotChange(): void {
  const choice = props.choices.find(c => c.key === selectedAflot.value);
  if (!choice) return;
  form.date = choice.date;
  form.startTime = choice.time;
}

function addCatch(): void {
  const speciesId = props.species[0]?.id ?? '';
  catches.value = [
    ...catches.value,
    {
      speciesId,
      gearId: defaultGearFor(speciesId, props.species, props.gears) ?? props.gears[0]?.id ?? '',
      quantity: '1',
      sizeCm: '',
      weightG: '',
      kept: true
    }
  ];
}

/**
 * Choisir une espèce pré-sélectionne son engin habituel ; une espèce sans défaut laisse l'engin
 * tel quel. Branché sur `@change` et **pas** sur un `watch` de `speciesId` : un `watch` réagirait
 * aussi à une réaffectation **programmatique** des lignes (chargement d'une sortie existante via
 * `reset()`, ou avec `immediate`) et réécrirait l'engin saisi, alors que `@change` ne réagit qu'au
 * choix de l'utilisateur. La valeur est lue sur l'événement plutôt que sur `c.speciesId`, pour ne
 * pas dépendre de l'ordre d'exécution entre ce gestionnaire et celui du `v-model`.
 */
function onSpeciesChange(c: CatchDraft, speciesId: string): void {
  const gearId = defaultGearFor(speciesId, props.species, props.gears);
  if (gearId) c.gearId = gearId;
}

function removeCatch(index: number): void {
  catches.value = catches.value.filter((_, i) => i !== index);
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function onSubmit(): void {
  emit('save', {
    date: form.date,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    notes: form.notes.trim() || null,
    baited: form.baited,
    catches: catches.value.map(d => ({
      speciesId: d.speciesId,
      gearId: d.gearId,
      quantity: Number(d.quantity) || 1,
      sizeCm: optionalNumber(d.sizeCm),
      weightG: optionalNumber(d.weightG),
      kept: d.kept
    }))
  });
}
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary">
      <h2 class="h6 mb-0">
        <i class="bi bi-pencil-square me-2"></i
        >{{ initial ? 'Modifier la sortie' : 'Nouvelle sortie' }}
      </h2>
    </div>
    <div class="card-body">
      <form @submit.prevent="onSubmit">
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <label for="tripAflot" class="form-label small mb-1">Remise à flot</label>
            <select
              id="tripAflot"
              v-model="selectedAflot"
              class="form-select form-select-sm"
              data-test="aflot"
              @change="onAflotChange"
            >
              <option value="">Aucune (sortie à la ligne)</option>
              <option v-for="c in choices" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
            <div class="form-text">
              Pré-remplit la date et l'heure de début ; rien n'est enregistré.
            </div>
          </div>
          <div class="col-6 col-md-2">
            <label for="tripDate" class="form-label small mb-1">Date</label>
            <input
              id="tripDate"
              v-model="form.date"
              type="date"
              class="form-control form-control-sm"
              data-test="date"
              required
            />
          </div>
          <div class="col-3 col-md-2">
            <label for="tripStart" class="form-label small mb-1">Début</label>
            <input
              id="tripStart"
              v-model="form.startTime"
              type="time"
              class="form-control form-control-sm"
              data-test="start"
            />
          </div>
          <div class="col-3 col-md-2">
            <label for="tripEnd" class="form-label small mb-1">Fin</label>
            <input
              id="tripEnd"
              v-model="form.endTime"
              type="time"
              class="form-control form-control-sm"
              data-test="end"
            />
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3 class="h6 mb-0 text-uppercase text-muted small fw-bold">Prises</h3>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-test="add-catch"
            @click="addCatch"
          >
            <i class="bi bi-plus-lg me-1"></i>Ajouter une prise
          </button>
        </div>

        <p v-if="!catches.length" class="text-muted small fst-italic">
          Aucune prise : la sortie sera enregistrée comme bredouille.
        </p>

        <div
          v-for="(c, i) in catches"
          :key="i"
          class="row g-2 align-items-end mb-2"
          data-test="catch-row"
        >
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" :for="`species-${i}`">Espèce</label>
            <select
              :id="`species-${i}`"
              v-model="c.speciesId"
              class="form-select form-select-sm"
              data-test="species"
              @change="onSpeciesChange(c, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="s in species" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" :for="`gear-${i}`">Engin</label>
            <select
              :id="`gear-${i}`"
              v-model="c.gearId"
              class="form-select form-select-sm"
              data-test="gear"
            >
              <option v-for="g in gears" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>
          </div>
          <div class="col-3 col-md-1">
            <label class="form-label small mb-1" :for="`qty-${i}`">Nb</label>
            <input
              :id="`qty-${i}`"
              v-model="c.quantity"
              type="number"
              min="1"
              max="9999"
              class="form-control form-control-sm"
              data-test="quantity"
            />
          </div>
          <div class="col-3 col-md-2">
            <label class="form-label small mb-1" :for="`size-${i}`">Taille (cm)</label>
            <input
              :id="`size-${i}`"
              v-model="c.sizeCm"
              type="number"
              min="0"
              max="300"
              class="form-control form-control-sm"
              data-test="size"
            />
          </div>
          <div class="col-3 col-md-2">
            <label class="form-label small mb-1" :for="`weight-${i}`">Poids (g)</label>
            <input
              :id="`weight-${i}`"
              v-model="c.weightG"
              type="number"
              min="0"
              max="100000"
              class="form-control form-control-sm"
              data-test="weight"
            />
          </div>
          <div class="col-3 col-md-1 d-flex align-items-center gap-2">
            <div class="form-check mb-0">
              <input
                :id="`kept-${i}`"
                v-model="c.kept"
                class="form-check-input"
                type="checkbox"
                data-test="kept"
              />
              <label class="form-check-label small" :for="`kept-${i}`">Gardé</label>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              data-test="remove-catch"
              :aria-label="`Retirer la prise ${i + 1}`"
              @click="removeCatch(i)"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div class="mb-3">
          <label for="tripNotes" class="form-label small mb-1">Notes</label>
          <textarea
            id="tripNotes"
            v-model="form.notes"
            class="form-control form-control-sm"
            rows="2"
            maxlength="1000"
            placeholder="Appât, état de la mer, ce qui s'est mal passé…"
            data-test="notes"
          ></textarea>
        </div>

        <!--
          Oui / non : on note **si** on a boëtté, pas avec quoi (la matière peut aller dans les
          notes). La case reste visible même sur une sortie à la ligne — le référentiel ne sait pas
          ce qu'est un casier, et une sortie bredouille au casier n'a aucune ligne de prise à
          laquelle l'accrocher.
        -->
        <div class="form-check mb-3">
          <input
            id="tripBaited"
            v-model="form.baited"
            class="form-check-input"
            type="checkbox"
            data-test="baited"
          />
          <label class="form-check-label small" for="tripBaited">Casiers boëttés</label>
        </div>

        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">
            <i class="bi bi-check-lg me-1"></i>Enregistrer
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            data-test="cancel"
            @click="emit('cancel')"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
