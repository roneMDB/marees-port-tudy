<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import IconFish from './IconFish.vue';
import { useFishingRefs } from '../composables/useFishingRefs';
import type { FishingRef, FishingRefKind } from '../types';

const { species, gears, load, add, update, remove, reorder, reset } = useFishingRefs();
onMounted(load);

const error = ref<string | null>(null);

/**
 * Le pluriel est **saisi**, pas calculé (« lieu jaune » → « lieus jaunes »). Il reste facultatif :
 * laissé vide, le serveur le fait valoir le singulier, ce qui convient à « Crevette bouquet » comme
 * à un engin qu'on ne comptera jamais.
 */
const draft = reactive<{ kind: FishingRefKind; label: string; labelPlural: string }>({
  kind: 'species',
  label: '',
  labelPlural: ''
});

const editingId = ref<string | null>(null);
const editLabel = ref('');
const editPlural = ref('');

function run(action: () => Promise<unknown>): void {
  error.value = null;
  action().catch(e => {
    error.value = e instanceof Error ? e.message : String(e);
  });
}

function onAdd(): void {
  const label = draft.label.trim();
  if (!label) return;
  run(async () => {
    await add(draft.kind, label, draft.labelPlural.trim());
    draft.label = '';
    draft.labelPlural = '';
  });
}

function startEdit(entry: FishingRef): void {
  editingId.value = entry.id;
  editLabel.value = entry.label;
  editPlural.value = entry.labelPlural;
}

function saveEdit(id: string): void {
  const label = editLabel.value.trim();
  if (!label) return;
  run(async () => {
    await update(id, label, editPlural.value.trim());
    editingId.value = null;
  });
}

/**
 * Déplace une entrée d'un cran **dans sa section** : le tri des espèces et celui des engins sont
 * deux listes séparées (elles ne sont jamais affichées ensemble — deux sections ici, deux `<select>`
 * dans le formulaire de saisie). Les bornes sont donc celles de la section, pas de `refs` entier.
 */
function move(entry: FishingRef, delta: -1 | 1): void {
  const section = (entry.kind === 'gear' ? gears : species).value;
  const from = section.findIndex(r => r.id === entry.id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= section.length) return;
  const ids = section.map(r => r.id);
  [ids[from], ids[to]] = [ids[to], ids[from]];
  run(() => reorder(entry.kind, ids));
}

/** Position dans sa section, pour désactiver les flèches aux extrémités. */
function positionIn(entry: FishingRef): { first: boolean; last: boolean } {
  const section = (entry.kind === 'gear' ? gears : species).value;
  const i = section.findIndex(r => r.id === entry.id);
  return { first: i <= 0, last: i === section.length - 1 };
}

function onRemove(entry: FishingRef): void {
  if (confirm(`Supprimer « ${entry.label} » ?`)) run(() => remove(entry.id));
}

function onReset(): void {
  if (confirm('Rétablir les référentiels par défaut ? Vos ajouts seront perdus.')) run(reset);
}

const sections = computed(() => [
  { title: 'Engins', items: gears.value },
  { title: 'Espèces', items: species.value }
]);
</script>

<template>
  <div
    id="fishingRefsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="fishingRefsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <div>
        <h5 id="fishingRefsOffcanvasLabel" class="offcanvas-title mb-0">
          <IconFish class="me-1" /> Espèces et engins
        </h5>
        <span class="text-muted small"
          >{{ gears.length }} engins · {{ species.length }} espèces</span
        >
      </div>
      <button
        type="button"
        class="btn-close"
        data-bs-dismiss="offcanvas"
        aria-label="Fermer"
      ></button>
    </div>

    <div class="offcanvas-body">
      <div v-if="error" class="alert alert-warning py-2 small" role="alert">{{ error }}</div>

      <h6 class="text-uppercase text-muted small fw-bold mb-2">Ajouter</h6>
      <form class="row g-2 mb-3" data-test="add-form" @submit.prevent="onAdd">
        <div class="col-7">
          <input
            v-model="draft.label"
            type="text"
            class="form-control form-control-sm"
            placeholder="Libellé"
            aria-label="Libellé au singulier"
            maxlength="60"
            data-test="new-label"
          />
        </div>
        <div class="col-5">
          <select
            v-model="draft.kind"
            class="form-select form-select-sm"
            aria-label="Type"
            data-test="new-kind"
          >
            <option value="species">Espèce</option>
            <option value="gear">Engin</option>
          </select>
        </div>
        <div class="col-12">
          <input
            v-model="draft.labelPlural"
            type="text"
            class="form-control form-control-sm"
            placeholder="Pluriel (facultatif — « lieus jaunes »)"
            aria-label="Libellé au pluriel"
            maxlength="60"
            data-test="new-plural"
          />
        </div>
        <div class="col-12 d-grid">
          <button
            type="submit"
            class="btn btn-sm btn-primary"
            :disabled="!draft.label.trim()"
            data-test="add"
          >
            <i class="bi bi-plus-lg me-1"></i> Ajouter
          </button>
        </div>
      </form>

      <hr />

      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="text-uppercase text-muted small fw-bold mb-0">Référentiels</h6>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="onReset">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Rétablir les défauts
        </button>
      </div>

      <template v-for="section in sections" :key="section.title">
        <h6 class="small fw-bold mt-3">{{ section.title }}</h6>
        <ul class="list-group list-group-flush">
          <li
            v-for="item in section.items"
            :key="item.id"
            class="list-group-item px-0"
            :data-test-ref="item.id"
          >
            <div v-if="editingId === item.id" class="d-flex flex-column gap-2">
              <input
                v-model="editLabel"
                type="text"
                class="form-control form-control-sm"
                aria-label="Libellé au singulier"
                maxlength="60"
                data-test="edit-label"
              />
              <div class="d-flex gap-2">
                <input
                  v-model="editPlural"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Pluriel"
                  aria-label="Libellé au pluriel"
                  maxlength="60"
                  data-test="edit-plural"
                />
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-test="edit-save"
                  aria-label="Enregistrer"
                  @click="saveEdit(item.id)"
                >
                  <i class="bi bi-check-lg"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  aria-label="Annuler"
                  @click="editingId = null"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
            </div>
            <div v-else class="d-flex justify-content-between align-items-center gap-2">
              <span>
                {{ item.label }}
                <!-- Le pluriel n'est répété que s'il diffère : « Ligne · Ligne » n'apprend rien. -->
                <span v-if="item.labelPlural !== item.label" class="text-muted small">
                  · {{ item.labelPlural }}
                </span>
              </span>
              <span class="btn-group btn-group-sm">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  data-test="up"
                  :disabled="positionIn(item).first"
                  :aria-label="`Monter ${item.label}`"
                  title="Monter"
                  @click="move(item, -1)"
                >
                  <i class="bi bi-arrow-up"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  data-test="down"
                  :disabled="positionIn(item).last"
                  :aria-label="`Descendre ${item.label}`"
                  title="Descendre"
                  @click="move(item, 1)"
                >
                  <i class="bi bi-arrow-down"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  data-test="edit"
                  :aria-label="`Renommer ${item.label}`"
                  @click="startEdit(item)"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-danger"
                  data-test="remove"
                  :aria-label="`Supprimer ${item.label}`"
                  @click="onRemove(item)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </span>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
