<script setup lang="ts">
import { ref } from 'vue';
import { useSite } from '../composables/useSite';
import { useDataRefresh } from '../composables/useDataRefresh';
import { importTides, type ImportMode, type ImportResult } from '../api/tidesAdmin';

const { siteId, current } = useSite();
const { bump } = useDataRefresh();

const jsonText = ref('');
const mode = ref<ImportMode>('merge');
const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<ImportResult | null>(null);

/** Charge un fichier JSON sélectionné dans la zone de texte. */
function onFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    jsonText.value = String(reader.result ?? '');
  };
  reader.readAsText(file);
}

async function submit(): Promise<void> {
  error.value = null;
  result.value = null;

  let data: unknown;
  try {
    data = JSON.parse(jsonText.value);
  } catch {
    error.value = 'JSON invalide : vérifiez le format.';
    return;
  }

  loading.value = true;
  try {
    result.value = await importTides(siteId.value, mode.value, data);
    bump(); // rafraîchit le dashboard avec les nouvelles données
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div id="importOffcanvas" class="offcanvas offcanvas-end" tabindex="-1" aria-labelledby="importOffcanvasLabel">
    <div class="offcanvas-header border-bottom">
      <h5 id="importOffcanvasLabel" class="offcanvas-title mb-0">
        <i class="bi bi-upload me-1"></i> Import des horaires
      </h5>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>

    <div class="offcanvas-body">
      <p class="text-muted small">
        Importe des horaires (format JSON de la graine) pour le port
        <span class="fw-semibold text-body">{{ current?.label ?? siteId }}</span>.
      </p>

      <div class="mb-3">
        <label class="form-label small fw-semibold">Mode</label>
        <div class="form-check">
          <input id="modeMerge" v-model="mode" class="form-check-input" type="radio" value="merge" />
          <label class="form-check-label small" for="modeMerge">
            Fusionner <span class="text-muted">— remplace seulement les jours fournis</span>
          </label>
        </div>
        <div class="form-check">
          <input id="modeReplace" v-model="mode" class="form-check-input" type="radio" value="replace" />
          <label class="form-check-label small" for="modeReplace">
            Remplacer <span class="text-muted">— écrase tous les horaires du port</span>
          </label>
        </div>
      </div>

      <div class="mb-3">
        <label for="importFile" class="form-label small fw-semibold">Fichier (optionnel)</label>
        <input id="importFile" class="form-control form-control-sm" type="file" accept="application/json,.json" @change="onFile" />
      </div>

      <div class="mb-3">
        <label for="importJson" class="form-label small fw-semibold">JSON</label>
        <textarea
          id="importJson"
          v-model="jsonText"
          class="form-control form-control-sm font-monospace"
          rows="10"
          spellcheck="false"
          placeholder='{ "2026-11-01": [ { "maree": "haute", "heure": "06:10", "hauteur": "4.70", "coefficient": "75" } ] }'
        ></textarea>
      </div>

      <button type="button" class="btn btn-primary btn-sm" :disabled="loading || !jsonText.trim()" @click="submit">
        <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
        <i v-else class="bi bi-upload me-1"></i> Importer
      </button>

      <div v-if="result" class="alert alert-success py-2 small mt-3 mb-0">
        <i class="bi bi-check-circle me-1"></i>
        Import réussi ({{ result.mode === 'replace' ? 'remplacement' : 'fusion' }}) :
        {{ result.dates }} jour(s), {{ result.entries }} marée(s).
      </div>
      <div v-if="error" class="alert alert-warning py-2 small mt-3 mb-0">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 768px) {
  #importOffcanvas {
    --bs-offcanvas-width: 460px;
  }
}
</style>
