<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useLexicon } from '../composables/useLexicon';
import type { LexiconInput } from '../api/lexicon';
import type { LexiconEntry, LexiconType } from '../lib/lexique';

const { entries, load, add, update, remove, reset } = useLexicon();
onMounted(load);

const error = ref<string | null>(null);

// Formulaire d'ajout.
const draft = reactive<LexiconInput>({ term: '', definition: '', type: 'maree' });

// Édition en ligne d'une entrée existante.
const editingId = ref<string | null>(null);
const editDraft = reactive<LexiconInput>({ term: '', definition: '', type: 'maree' });

function run(action: () => Promise<unknown>): void {
  error.value = null;
  action().catch(e => {
    error.value = e instanceof Error ? e.message : String(e);
  });
}

function onAdd(): void {
  if (!draft.term.trim() || !draft.definition.trim()) return;
  run(async () => {
    await add({ term: draft.term.trim(), definition: draft.definition.trim(), type: draft.type });
    draft.term = '';
    draft.definition = '';
    draft.type = 'maree';
  });
}

function startEdit(e: LexiconEntry): void {
  editingId.value = e.id;
  editDraft.term = e.term;
  editDraft.definition = e.definition;
  editDraft.type = e.type;
}

function cancelEdit(): void {
  editingId.value = null;
}

function saveEdit(id: string): void {
  if (!editDraft.term.trim() || !editDraft.definition.trim()) return;
  run(async () => {
    await update(id, { term: editDraft.term.trim(), definition: editDraft.definition.trim(), type: editDraft.type });
    editingId.value = null;
  });
}

function onRemove(e: LexiconEntry): void {
  if (confirm(`Supprimer « ${e.term} » du lexique ?`)) run(() => remove(e.id));
}

function onReset(): void {
  if (confirm('Rétablir les termes par défaut ? Vos ajouts et modifications seront perdus.')) run(reset);
}

const TYPE_LABEL: Record<LexiconType, string> = { maree: 'Marée', peche: 'Pêche' };
</script>

<template>
  <div id="lexiconOffcanvas" class="offcanvas offcanvas-end" tabindex="-1" aria-labelledby="lexiconOffcanvasLabel">
    <div class="offcanvas-header border-bottom">
      <div>
        <h5 id="lexiconOffcanvasLabel" class="offcanvas-title mb-0">
          <i class="bi bi-book me-1"></i> Lexique du mot du jour
        </h5>
        <span class="text-muted small">{{ entries.length }} termes · marée / pêche</span>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>

    <div class="offcanvas-body">
      <div v-if="error" class="alert alert-warning py-2 small" role="alert">{{ error }}</div>

      <!-- Ajout -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Ajouter un terme</h6>
      <form class="row g-2 mb-2" @submit.prevent="onAdd">
        <div class="col-8">
          <input v-model="draft.term" type="text" class="form-control form-control-sm" placeholder="Terme" maxlength="60" />
        </div>
        <div class="col-4">
          <select v-model="draft.type" class="form-select form-select-sm" aria-label="Type">
            <option value="maree">Marée</option>
            <option value="peche">Pêche</option>
          </select>
        </div>
        <div class="col-12">
          <textarea
            v-model="draft.definition"
            class="form-control form-control-sm"
            rows="2"
            maxlength="400"
            placeholder="Définition courte"
          ></textarea>
        </div>
        <div class="col-12 d-grid">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="!draft.term.trim() || !draft.definition.trim()">
            <i class="bi bi-plus-lg me-1"></i> Ajouter
          </button>
        </div>
      </form>

      <hr />

      <!-- Liste -->
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="text-uppercase text-muted small fw-bold mb-0">Termes</h6>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="onReset">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Rétablir les défauts
        </button>
      </div>

      <ul class="list-group list-group-flush lexicon-list">
        <li v-for="e in entries" :key="e.id" class="list-group-item px-0">
          <template v-if="editingId === e.id">
            <div class="row g-2">
              <div class="col-8">
                <input v-model="editDraft.term" type="text" class="form-control form-control-sm" maxlength="60" />
              </div>
              <div class="col-4">
                <select v-model="editDraft.type" class="form-select form-select-sm">
                  <option value="maree">Marée</option>
                  <option value="peche">Pêche</option>
                </select>
              </div>
              <div class="col-12">
                <textarea v-model="editDraft.definition" class="form-control form-control-sm" rows="2" maxlength="400"></textarea>
              </div>
              <div class="col-12 d-flex gap-2 justify-content-end">
                <button type="button" class="btn btn-sm btn-link link-secondary p-0" @click="cancelEdit">Annuler</button>
                <button type="button" class="btn btn-sm btn-primary" @click="saveEdit(e.id)">Enregistrer</button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div class="flex-grow-1" style="min-width: 0">
                <div class="d-flex align-items-center gap-2">
                  <span class="fw-semibold">{{ e.term }}</span>
                  <span class="badge rounded-pill" :class="e.type === 'peche' ? 'text-bg-success' : 'text-bg-info'">
                    {{ TYPE_LABEL[e.type] }}
                  </span>
                </div>
                <div class="small text-body-secondary">{{ e.definition }}</div>
              </div>
              <div class="flex-shrink-0 btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-secondary" :title="`Modifier ${e.term}`" @click="startEdit(e)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-outline-danger" :title="`Supprimer ${e.term}`" @click="onRemove(e)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>
