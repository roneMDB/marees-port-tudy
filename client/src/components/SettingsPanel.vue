<script setup lang="ts">
import { useSettings } from '../composables/useSettings';
import { useNavihan } from '../composables/useNavihan';
import { formatOffset } from '../lib/navihan';
import { DEFAULT_WEATHER_LINKS } from '../types';
import type { NavihanOffsets, TidesMeta } from '../types';
import { MIN_AFLOT_SAMPLES, type AflotCalibration } from '../lib/aflotCalibration';

// Configuration **serveur** uniquement (rôle `admin`). Les filtres d'affichage, qui sont une
// préférence personnelle par navigateur, ont leur propre barre ouverte à tous (`TideFiltersBar`).
//
// `calibration` vient du `Dashboard` (`useTides`) plutôt que d'un appel local : `useTides` n'est pas
// un singleton, l'appeler ici relancerait tout un chargement de marées pour une ligne d'état.
defineProps<{
  meta: TidesMeta | null;
  calibration: AflotCalibration;
}>();

const { settings, saveError } = useSettings();
const { offsets, reset: resetNavihan } = useNavihan();

type OffsetKey = keyof NavihanOffsets;

// Décalages fixes (minutes) appliqués à l'heure Port-Tudy. « Remise à flot » = ajout d'une valeur
// fixe à la basse mer (ex. +2h50) ; l'« Estimation » (modèle seuil, issue #4) est réglée à part.
const rows: { key: OffsetKey; label: string }[] = [
  { key: 'basseMer', label: 'Basse mer' },
  { key: 'pleineMer', label: 'Pleine mer' },
  { key: 'aFlot', label: 'Remise à flot' }
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function setHours(key: OffsetKey, event: Event): void {
  const h = clamp(Number((event.target as HTMLInputElement).value), 0, 23);
  offsets[key] = h * 60 + (offsets[key] % 60);
}

function setMinutes(key: OffsetKey, event: Event): void {
  const m = clamp(Number((event.target as HTMLInputElement).value), 0, 59);
  offsets[key] = Math.floor(offsets[key] / 60) * 60 + m;
}

function setAFlotDays(event: Event): void {
  settings.aFlotDays = clamp(Number((event.target as HTMLInputElement).value), 1, 14);
}

function onAFlotRefHeight(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n)) settings.aFlotRefHeight = Math.min(10, Math.max(0, n));
}

function onRangeDays(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n)) {
    settings.rangeDays = Math.min(365, Math.max(1, Math.round(n)));
  }
}

function onCoefDays(event: Event): void {
  const n = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(n)) {
    settings.coefDays = Math.min(90, Math.max(1, Math.round(n)));
  }
}

function addWeatherLink(): void {
  settings.weatherLinks.push({ label: '', url: '' });
}
function removeWeatherLink(index: number): void {
  settings.weatherLinks.splice(index, 1);
}
function resetWeatherLinks(): void {
  settings.weatherLinks = DEFAULT_WEATHER_LINKS.map(l => ({ ...l }));
}
</script>

<template>
  <div
    id="settingsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="settingsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <div>
        <h5 id="settingsOffcanvasLabel" class="offcanvas-title mb-0">
          <i class="bi bi-sliders me-1"></i> Réglages
        </h5>
        <span class="text-muted small">
          Remise à flot +{{ formatOffset(offsets.aFlot) }} ·
          estim. ≥ {{ calibration.refHeight.toFixed(2).replace('.', ',') }} m ·
          {{ settings.aFlotDays }} j
        </span>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>

    <div class="offcanvas-body">
      <div v-if="saveError" class="alert alert-warning py-2 small d-flex align-items-start gap-2" role="alert">
        <i class="bi bi-exclamation-triangle-fill mt-1"></i>
        <span>
          <strong>Modification non enregistrée.</strong><br />
          {{ saveError }}
        </span>
      </div>

      <!-- Période (configuration enregistrée) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Période</h6>
      <div class="row g-3 mb-4">
        <div class="col-6">
          <label class="form-label small text-muted mb-1">Début</label>
          <select class="form-select" v-model="settings.startMode">
            <option value="today">Aujourd'hui</option>
            <option value="date">Date fixe</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label small text-muted mb-1">Date de début</label>
          <input
            type="date"
            class="form-control"
            :min="meta?.minDate ?? undefined"
            :max="meta?.maxDate ?? undefined"
            :disabled="settings.startMode !== 'date'"
            v-model="settings.startDate"
          />
        </div>
        <div class="col-6">
          <label class="form-label small text-muted mb-1">Durée (jours)</label>
          <input
            type="number"
            class="form-control"
            min="1"
            max="365"
            :value="settings.rangeDays"
            @input="onRangeDays"
          />
        </div>
        <div class="col-6">
          <label class="form-label small text-muted mb-1">Graphe coef. (jours)</label>
          <input
            type="number"
            class="form-control"
            min="1"
            max="90"
            :value="settings.coefDays"
            @input="onCoefDays"
          />
          <div class="form-text">durée du graphe des coefficients</div>
        </div>
      </div>

      <!-- Décalages Navihan (configuration enregistrée) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Décalages Navihan</h6>
      <p class="text-muted small mb-3">
        Appliqués aux heures de Port-Tudy pour obtenir les heures Navihan. Enregistrés côté serveur.
      </p>
      <div class="row g-3">
        <div v-for="row in rows" :key="row.key" class="col-12">
          <label class="form-label small text-muted mb-1">{{ row.label }}</label>
          <div class="input-group">
            <input
              type="number"
              class="form-control"
              min="0"
              max="23"
              :value="Math.floor(offsets[row.key] / 60)"
              @input="setHours(row.key, $event)"
            />
            <span class="input-group-text">h</span>
            <input
              type="number"
              class="form-control"
              min="0"
              max="59"
              :value="offsets[row.key] % 60"
              @input="setMinutes(row.key, $event)"
            />
            <span class="input-group-text">min</span>
          </div>
          <div class="form-text">= +{{ formatOffset(offsets[row.key]) }}</div>
        </div>
      </div>
      <div class="row g-3 mt-0">
        <div class="col-12">
          <label class="form-label small text-muted mb-1">
            Hauteur de flottaison de référence (Port-Tudy, coef 70)
          </label>
          <div class="input-group">
            <input
              type="number"
              class="form-control"
              min="0"
              max="10"
              step="0.05"
              :value="settings.aFlotRefHeight"
              @input="onAFlotRefHeight"
            />
            <span class="input-group-text">m</span>
          </div>
          <div class="form-text" data-test="aflot-calibration">
            <template v-if="calibration.calibrated">
              <i class="bi bi-check-circle text-success me-1" aria-hidden="true"></i>
              Étalonné sur {{ calibration.samples }} heure{{ calibration.samples > 1 ? 's' : '' }}
              constatée{{ calibration.samples > 1 ? 's' : '' }} :
              <strong>{{ calibration.refHeight.toFixed(2).replace('.', ',') }} m</strong><template
                v-if="calibration.mae != null"
              >, écart moyen {{ Math.round(calibration.mae) }} min</template>. La valeur ci-dessus
              n'est plus utilisée.
            </template>
            <template v-else>
              Moins de {{ MIN_AFLOT_SAMPLES }} heures constatées ({{ calibration.samples }}) : c'est
              la valeur ci-dessus qui sert. Saisissez des heures dans la colonne « Constaté » du
              tableau pour que l'estimation s'étalonne toute seule.
            </template>
          </div>
          <div class="form-text">
            pour l'<strong>estimation</strong> (pastille ↗ du tableau uniquement) : hauteur d'eau
            <strong>Port-Tudy</strong> à laquelle le bateau flotte, au coefficient 70 ; le seuil
            réel suit le coefficient et le délai après la basse mer varie donc avec lui (issue #4).
            Cartes, marégramme et colonne « Constaté » utilisent l'heure de
            <strong>remise à flot</strong> (décalage fixe ci-dessus).
          </div>
        </div>
        <div class="col-12">
          <label class="form-label small text-muted mb-1">Jours affichés (carte remise à flot)</label>
          <input
            type="number"
            class="form-control"
            min="1"
            max="14"
            :value="settings.aFlotDays"
            @input="setAFlotDays"
          />
          <div class="form-text">nombre de jours listés sur la carte « Remise à flot »</div>
        </div>
      </div>
      <div class="mt-3 mb-4">
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="resetNavihan">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Décalages par défaut
        </button>
      </div>

      <!-- Liens météo (configuration enregistrée) -->
      <h6 class="text-uppercase text-muted small fw-bold mb-2">Liens météo</h6>
      <p class="text-muted small mb-3">
        Liens affichés sous la météo. <code>{lat}</code>/<code>{lon}</code> sont remplacés par les
        coordonnées du lieu. Enregistrés côté serveur.
      </p>
      <div
        v-for="(link, i) in settings.weatherLinks"
        :key="i"
        class="row g-2 mb-2 align-items-center"
      >
        <div class="col-4">
          <label class="visually-hidden">Nom du lien {{ i + 1 }}</label>
          <input type="text" class="form-control form-control-sm" placeholder="Nom" v-model="link.label" />
        </div>
        <div class="col-7">
          <label class="visually-hidden">URL du lien {{ i + 1 }}</label>
          <input type="url" class="form-control form-control-sm" placeholder="https://…" v-model="link.url" />
        </div>
        <div class="col-1 d-grid">
          <button
            type="button"
            class="btn btn-sm btn-outline-danger"
            :title="`Supprimer ${link.label || 'ce lien'}`"
            :aria-label="`Supprimer ${link.label || 'ce lien'}`"
            @click="removeWeatherLink(i)"
          >
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <p v-if="!settings.weatherLinks.length" class="text-muted small fst-italic">Aucun lien.</p>
      <div class="d-flex gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="addWeatherLink">
          <i class="bi bi-plus-lg me-1"></i> Ajouter un lien
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="resetWeatherLinks">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Liens par défaut
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Panneau un peu plus large sur grand écran pour aérer les champs (400px par défaut). */
@media (min-width: 768px) {
  #settingsOffcanvas {
    --bs-offcanvas-width: 460px;
  }
}
</style>
