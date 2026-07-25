<script setup lang="ts">
import { computed } from 'vue';
import type { FlatTide } from '../types';
import type { DayTides } from '../lib/tides';
import { NAVIHAN } from '../types';
import { groupByDay } from '../lib/tides';
import { formatDate, formatHeight, todayKey, coefBand } from '../lib/format';
import { useNavihanDisplay, type NavihanKey } from '../composables/useNavihanDisplay';
import { useAuth } from '../composables/useAuth';
import { useAflotObservations } from '../composables/useAflotObservations';

const props = withDefaults(defineProps<{ tides: FlatTide[]; siteLabel?: string }>(), {
  siteLabel: 'Port-Tudy'
});

const today = todayKey();

// Choix d'affichage des types Navihan (persisté localStorage, préférence par navigateur).
const { visible, toggle } = useNavihanDisplay();
// Saisie des remises à flot constatées : réservée à l'admin (le verrou réel est côté serveur).
const { isAdmin } = useAuth();
const { save, remove, load: reloadObservations } = useAflotObservations();

/** Basses mers d'un jour, triées par heure **estimée** de remise à flot (colonne Constaté). */
function constateLows(day: DayTides): FlatTide[] {
  return [...day.lows].sort((a, b) => (a.aflotEstimate ?? a.time).localeCompare(b.aflotEstimate ?? b.time));
}

/** Saisie/effacement de l'heure constatée d'une basse mer (clé = basse mer Port-Tudy). */
async function onObserved(low: FlatTide, event: Event): Promise<void> {
  if (!low.refDate || !low.refTime) return;
  const value = (event.target as HTMLInputElement).value; // '' (effacé) ou 'HH:MM'
  try {
    if (value) await save(low.refDate, low.refTime, value);
    else await remove(low.refDate, low.refTime);
  } catch {
    await reloadObservations(); // échec (réseau / 403) → resynchronise l'affichage avec le serveur
  }
}

// Une ligne par jour (la période à afficher est fournie déjà bornée par le parent).
const rows = computed(() => groupByDay(props.tides).map(day => ({ day, band: coefBand(day.coefficient) })));

/** Une pastille Navihan : heure + type (clé, icône, couleur, libellé). */
interface NavihanEntry {
  key: NavihanKey; // type (bm / flot / pm)
  time: string; // heure Navihan `HH:MM`
  pillClass: string; // couleur (par type)
  icon: string; // classe bootstrap-icons rappelant le type
  title: string; // libellé complet (infobulle / accessibilité)
}

/** Métadonnées d'un type Navihan (légende cliquable + construction des pastilles). */
const NAVIHAN_TYPES: { key: NavihanKey; pillClass: string; icon: string; label: string }[] = [
  { key: 'bm', pillClass: 'navihan-pill--bm', icon: 'bi-arrow-down', label: 'Basse mer' },
  { key: 'flot', pillClass: 'navihan-pill--flot', icon: 'bi-check-circle', label: 'Remise à flot' },
  { key: 'flotEst', pillClass: 'navihan-pill--flot-est', icon: 'bi-graph-up-arrow', label: 'Estimation' },
  { key: 'flotObs', pillClass: 'navihan-pill--obs', icon: 'bi-clipboard-check', label: 'Constaté' },
  { key: 'pm', pillClass: 'navihan-pill--pm', icon: 'bi-arrow-up', label: 'Pleine mer' }
];

/**
 * Heures Navihan du jour, aplaties, **filtrées** selon le choix d'affichage et **triées par heure
 * croissante**. Chaque type porte son icône : basse mer (↓), remise à flot (✓, « feu vert » pour
 * sortir), pleine mer (↑). Les heures viennent des marées du port sélectionné mais sont dérivées
 * de Port-Tudy en amont ; les valeurs absentes ou de type masqué sont ignorées.
 */
function navihanEntries(day: DayTides): NavihanEntry[] {
  const entries: NavihanEntry[] = [];
  const push = (key: NavihanKey, time: string | undefined, pillClass: string, icon: string, title: string) => {
    if (time && visible[key]) entries.push({ key, time, pillClass, icon, title });
  };
  for (const l of day.lows) {
    push('bm', l.navihan[NAVIHAN.basseMer], 'navihan-pill--bm', 'bi-arrow-down', 'Basse mer');
    push('flot', l.navihan[NAVIHAN.aFlot], 'navihan-pill--flot', 'bi-check-circle', 'Remise à flot (décalage fixe)');
    push('flotEst', l.aflotEstimate ?? undefined, 'navihan-pill--flot-est', 'bi-graph-up-arrow', 'Estimation remise à flot (seuil de hauteur)');
  }
  for (const h of day.highs) {
    push('pm', h.navihan[NAVIHAN.pleineMer], 'navihan-pill--pm', 'bi-arrow-up', 'Pleine mer');
  }
  return entries.sort((a, b) => a.time.localeCompare(b.time));
}
</script>

<template>
  <div class="small text-muted px-3 pt-2">
    Chaque marée : <span class="fw-semibold text-body">heure</span>
    · <i class="bi bi-water text-primary"></i> <span class="text-body">hauteur d'eau (m)</span>
  </div>
  <div class="small text-muted px-3 pb-1 navihan-legend d-flex flex-wrap align-items-center gap-2">
    <span>Navihan (dérivé de Port-Tudy) :</span>
    <button
      v-for="t in NAVIHAN_TYPES"
      :key="t.key"
      type="button"
      class="btn btn-sm p-0 navihan-toggle"
      :class="{ 'navihan-toggle--off': !visible[t.key] }"
      :aria-pressed="visible[t.key] ? 'true' : 'false'"
      :title="(visible[t.key] ? 'Masquer' : 'Afficher') + ' : ' + t.label"
      @click="toggle(t.key)"
    >
      <span class="badge rounded-pill navihan-pill" :class="t.pillClass"><i class="bi" :class="t.icon"></i></span>
      <span class="navihan-toggle-label">{{ t.label }}</span>
    </button>
  </div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 tide-day-table">
      <thead class="table-dark">
        <tr>
          <th>Jour</th>
          <th>Coef</th>
          <th>Pleines mers <span class="fw-normal opacity-75">· {{ siteLabel }}</span></th>
          <th>Basses mers <span class="fw-normal opacity-75">· {{ siteLabel }}</span></th>
          <th class="fw-bold">
            Navihan
            <i
              class="bi bi-info-circle small text-muted"
              title="Heures Navihan dérivées de Port-Tudy, par ordre croissant : basse mer (↓), remise à flot fixe (✓), estimation par seuil (↗) et pleine mer (↑)"
            ></i>
          </th>
          <th v-if="visible.flotObs" class="fw-bold">
            Constaté
            <i
              class="bi bi-info-circle small text-muted"
              title="Heure de remise à flot réellement constatée, par basse mer (saisie réservée à l'admin)"
            ></i>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="rows.length === 0">
          <td :colspan="visible.flotObs ? 6 : 5" class="text-center text-muted py-4">Aucune marée pour ces filtres.</td>
        </tr>
        <tr
          v-for="{ day, band } in rows"
          :key="day.date"
          :class="{ 'is-today': day.date === today }"
        >
          <td data-label="Jour" class="text-capitalize text-nowrap" :class="{ 'fw-semibold': day.date === today }">
            <i
              v-if="day.date === today"
              class="bi bi-circle-fill text-primary me-1 today-marker"
              title="Aujourd'hui"
              aria-label="Aujourd'hui"
            ></i>
            {{ formatDate(day.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }}
          </td>
          <td data-label="Coef">
            <span
              v-if="day.coefficient != null"
              class="badge rounded-pill"
              :class="band.badgeClass"
              :title="band.label"
            >
              <i v-if="band.icon" :class="['bi', band.icon, 'me-1']"></i>{{ day.coefficient }}
            </span>
            <span v-else class="text-muted">—</span>
          </td>
          <td data-label="Pleines mers">
            <span v-if="!day.highs.length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="h in day.highs" :key="h.time" class="tide-cell text-nowrap">
                <span class="fw-semibold">{{ h.time }}</span>
                <span class="text-muted small ms-1" title="Hauteur d'eau">
                  <i class="bi bi-water"></i> {{ formatHeight(h.height) }}
                </span>
              </span>
            </span>
          </td>
          <td data-label="Basses mers">
            <span v-if="!day.lows.length" class="text-muted">—</span>
            <span v-else class="tide-values">
              <span v-for="l in day.lows" :key="l.time" class="tide-cell text-nowrap">
                <span class="fw-semibold">{{ l.time }}</span>
                <span class="text-muted small ms-1" title="Hauteur d'eau">
                  <i class="bi bi-water"></i> {{ formatHeight(l.height) }}
                </span>
              </span>
            </span>
          </td>
          <td data-label="Navihan">
            <span v-if="!navihanEntries(day).length" class="text-muted">—</span>
            <span v-else class="navihan-pills">
              <span
                v-for="(e, i) in navihanEntries(day)"
                :key="e.title + e.time + i"
                class="badge rounded-pill navihan-pill text-nowrap"
                :class="e.pillClass"
                :title="e.title"
              ><i class="bi" :class="e.icon"></i> {{ e.time }}</span>
            </span>
          </td>
          <td v-if="visible.flotObs" data-label="Constaté">
            <span v-if="!day.lows.length" class="text-muted">—</span>
            <div v-else class="constate-cell">
              <div v-for="l in constateLows(day)" :key="l.time" class="constate-row">
                <span class="text-muted small constate-est" title="Estimation (rappel)">
                  <i class="bi bi-graph-up-arrow"></i> {{ l.aflotEstimate ?? '—' }}
                </span>
                <template v-if="l.refTime">
                  <input
                    v-if="isAdmin"
                    type="time"
                    class="form-control form-control-sm constate-input"
                    :value="l.aflotObserved ?? ''"
                    :title="`Remise à flot constatée (basse mer ${l.time})`"
                    @change="onObserved(l, $event)"
                  />
                  <span
                    v-else-if="l.aflotObserved"
                    class="badge rounded-pill navihan-pill navihan-pill--obs text-nowrap"
                  ><i class="bi bi-clipboard-check"></i> {{ l.aflotObserved }}</span>
                  <span v-else class="text-muted small">—</span>
                </template>
                <span v-else class="text-muted small">—</span>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.today-marker {
  font-size: 0.55em;
  vertical-align: middle;
}

/* Pastilles Navihan : palette « niveau d'eau », adaptée aux thèmes clair/sombre (Bootstrap 5.3). */
.navihan-pill {
  font-weight: 600;
  font-size: 0.78rem;
}

/* Basse mer : ambre (peu d'eau). */
.navihan-pill--bm {
  background-color: var(--bs-warning-bg-subtle);
  color: var(--bs-warning-text-emphasis);
  border: 1px solid var(--bs-warning-border-subtle);
}

/* Remise à flot : vert (feu vert pour sortir). */
.navihan-pill--flot {
  background-color: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
  border: 1px solid var(--bs-success-border-subtle);
}

/* Pleine mer : bleu (pleine eau). */
.navihan-pill--pm {
  background-color: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  border: 1px solid var(--bs-primary-border-subtle);
}

/* Estimation (modèle seuil, issue #4) : cyan/info, proche du « flot » mais distinct. */
.navihan-pill--flot-est {
  background-color: var(--bs-info-bg-subtle);
  color: var(--bs-info-text-emphasis);
  border: 1px solid var(--bs-info-border-subtle);
}

/* Constaté (heure réelle saisie) : violet, se démarque comme donnée « autorité ». */
.navihan-pill--obs {
  background-color: color-mix(in srgb, var(--bs-purple, #6f42c1) 16%, transparent);
  color: var(--bs-purple, #6f42c1);
  border: 1px solid color-mix(in srgb, var(--bs-purple, #6f42c1) 38%, transparent);
}

:root[data-bs-theme='dark'] .navihan-pill--obs {
  color: #c9a3ff;
  background-color: color-mix(in srgb, #c9a3ff 16%, transparent);
  border-color: color-mix(in srgb, #c9a3ff 45%, transparent);
}

/* Colonne « Constaté » : une entrée par basse mer (heure de la basse + saisie / valeur). */
.constate-cell {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.constate-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.constate-est {
  min-width: 3.2rem;
  white-space: nowrap;
}

.constate-input {
  max-width: 7.5rem;
}

/* Colonne Navihan : une seule ligne de pastilles triées par heure (icône + couleur = type,
   cf. légende), repli à l'étroit. Compact pour ne pas gonfler la hauteur de ligne. */
.navihan-pills {
  display: inline-flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 0.25rem 0.4rem;
}

.navihan-legend .navihan-pill {
  font-size: 0.7rem;
}

/* Légende cliquable : chaque type est un bouton bascule (affiché / masqué). */
.navihan-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  color: var(--bs-secondary-color);
  text-decoration: none;
  line-height: 1.2;
}

.navihan-toggle:hover .navihan-toggle-label {
  text-decoration: underline;
}

/* Type masqué : atténué + libellé barré (l'icône/couleur restent pour se repérer). */
.navihan-toggle--off {
  opacity: 0.5;
}

.navihan-toggle--off .navihan-toggle-label {
  text-decoration: line-through;
}

/* Regroupe les horaires d'une cellule (2 marées) ; sur mobile ils s'alignent à droite. */
.tide-values {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.9rem;
}

@media (max-width: 767.98px) {
  .tide-values {
    justify-content: flex-end;
    text-align: right;
  }

  /* Sur mobile (cartes empilées), les pastilles s'alignent à droite comme les autres valeurs. */
  .navihan-pills {
    justify-content: flex-end;
  }
}
</style>
