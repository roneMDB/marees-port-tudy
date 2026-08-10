<script setup lang="ts">
import { computed } from 'vue';
import type { FlatTide } from '../types';
import type { DayTides } from '../lib/tides';
import { groupByDay, matchesAflotWindow, matchesDayFilters } from '../lib/tides';
import { addDays, formatDate, formatHeight, todayKey, coefBand, weekdayIndex } from '../lib/format';
import { shiftMoment } from '../lib/navihan';
import { useNavihan } from '../composables/useNavihan';
import { useNavihanDisplay, type NavihanKey } from '../composables/useNavihanDisplay';
import { useTideFilters } from '../composables/useTideFilters';
import { useAuth } from '../composables/useAuth';
import { useAflotObservations } from '../composables/useAflotObservations';

const props = withDefaults(
  defineProps<{
    tides: FlatTide[];
    siteLabel?: string;
    /**
     * Première date à afficher. Le parent passe **un jour de plus en amont** dans `tides` pour que
     * la première ligne hérite des heures Navihan issues de la veille (celles qui franchissent
     * minuit) ; ce jour d'amorce ne doit pas être rendu comme une ligne.
     */
    from?: string;
  }>(),
  { siteLabel: 'Port-Tudy', from: '' }
);

const { offsets } = useNavihan();

const today = todayKey();

// Choix d'affichage des types Navihan (persisté localStorage, préférence par navigateur).
const { visible, toggle } = useNavihanDisplay();
// Filtres d'affichage au grain du jour (persistés localStorage, ouverts à tous les rôles).
const { filters, reset: resetFilters } = useTideFilters();
// Saisie des remises à flot constatées : réservée à l'admin (le verrou réel est côté serveur).
const { isAdmin } = useAuth();
const { save, remove, load: reloadObservations } = useAflotObservations();

/**
 * Instant Navihan d'une marée : sa **date réelle** et son heure, décalage `offset` appliqué à la
 * marée Port-Tudy de référence. Le repli sur la marée elle-même sert au port de référence, où
 * `refDate`/`refTime` valent la date et l'heure propres.
 */
function moment(t: FlatTide, offset: number): { date: string; time: string } {
  return shiftMoment(t.refDate ?? t.date, t.refTime ?? t.time, offset);
}

/** Instant de la **remise à flot** (décalage fixe) d'une basse mer. */
function flotMoment(low: FlatTide): { date: string; time: string } {
  return moment(low, offsets.aFlot);
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

// Une ligne par jour. Le jour d'amorce (cf. prop `from`) est écarté : il n'est là que pour fournir
// à la première ligne les heures Navihan de la veille qui franchissent minuit.
const allRows = computed(() =>
  groupByDay(props.tides).filter(day => !props.from || day.date >= props.from)
);

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
 * Heures Navihan indexées par le jour où elles ont **réellement lieu**, filtrées selon le choix
 * d'affichage et triées par heure croissante. Une heure dont le décalage franchit minuit est donc
 * rangée au lendemain, et non en tête de la ligne de la marée d'origine — où elle se lirait comme
 * une heure du petit matin de ce jour-là. Chaque type porte son icône : basse mer (↓), remise à
 * flot (✓, « feu vert » pour sortir), estimation (↗), pleine mer (↑).
 */
const navihanByDate = computed(() => {
  const byDate = new Map<string, NavihanEntry[]>();
  const push = (
    key: NavihanKey,
    at: { date: string; time: string } | null,
    pillClass: string,
    icon: string,
    title: string
  ) => {
    if (!at || !visible[key]) return;
    const list = byDate.get(at.date) ?? [];
    list.push({ key, time: at.time, pillClass, icon, title });
    byDate.set(at.date, list);
  };

  for (const t of props.tides) {
    if (t.type === 'high') {
      push('pm', moment(t, offsets.pleineMer), 'navihan-pill--pm', 'bi-arrow-up', 'Pleine mer');
      continue;
    }
    const bm = moment(t, offsets.basseMer);
    push('bm', bm, 'navihan-pill--bm', 'bi-arrow-down', 'Basse mer');
    // Plage horaire : elle masque la remise à flot elle-même, **pas** la ligne du jour. Estimation
    // et « Constaté » décrivent le même à-flot et suivent donc son sort.
    const flot = flotMoment(t);
    const shown = matchesAflotWindow(flot.time, filters);
    push('flot', shown ? flot : null, 'navihan-pill--flot', 'bi-check-circle', 'Remise à flot (décalage fixe)');
    // L'estimation n'a pas de date propre : elle suit la basse mer Navihan dont elle découle, et
    // bascule au lendemain si son heure d'horloge est passée avant celle-ci (franchissement).
    const est = t.aflotEstimate && shown
      ? { date: t.aflotEstimate >= bm.time ? bm.date : addDays(bm.date, 1), time: t.aflotEstimate }
      : null;
    push('flotEst', est, 'navihan-pill--flot-est', 'bi-graph-up-arrow', 'Estimation remise à flot (seuil de hauteur)');
  }

  byDate.forEach(list => list.sort((a, b) => a.time.localeCompare(b.time)));
  return byDate;
});

function navihanEntries(day: DayTides): NavihanEntry[] {
  return navihanByDate.value.get(day.date) ?? [];
}

/**
 * Saisies « Constaté » indexées par le jour de la **remise à flot** : l'observation suit l'à-flot
 * qu'elle mesure, donc elle passe au lendemain avec lui. La clé d'enregistrement reste la basse
 * mer Port-Tudy (`refDate`/`refTime`), seule la ligne d'affichage change.
 */
const constateByDate = computed(() => {
  const byDate = new Map<string, { low: FlatTide; flot: string }[]>();
  for (const t of props.tides) {
    if (t.type !== 'low') continue;
    const { date, time } = flotMoment(t);
    // Même plage horaire que les pastilles : l'observation mesure cet à-flot, elle disparaît avec lui.
    if (!matchesAflotWindow(time, filters)) continue;
    const list = byDate.get(date) ?? [];
    list.push({ low: t, flot: time });
    byDate.set(date, list);
  }
  byDate.forEach(list => list.sort((a, b) => a.flot.localeCompare(b.flot)));
  return byDate;
});

function constateRows(day: DayTides): { low: FlatTide; flot: string }[] {
  return constateByDate.value.get(day.date) ?? [];
}

/**
 * Lignes réellement affichées : coefficient et jour de la semaine sélectionnent des **lignes**
 * (issue #10) ; la plage horaire de remise à flot, elle, masque des **heures** dans la ligne (cf.
 * `navihanByDate` / `constateByDate`) et n'en supprime aucune.
 * La liste plate `props.tides` n'est volontairement **pas** filtrée en amont — `navihanByDate` et
 * `constateByDate` s'y construisent, donc les heures d'un jour masqué (ou du jour d'amorce) qui
 * franchissent minuit restent rendues sur le jour visible suivant.
 */
const rows = computed(() =>
  allRows.value
    .filter(day => matchesDayFilters({ coefficient: day.coefficient, weekday: weekdayIndex(day.date) }, filters))
    .map(day => ({ day, band: coefBand(day.coefficient) }))
);

// Un filtre est **persisté** : sans ce compteur, on reviendrait sur un tableau tronqué sans savoir
// pourquoi. Il n'apparaît que lorsque des jours de la période sont effectivement masqués.
const hiddenCount = computed(() => allRows.value.length - rows.value.length);
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
            <span v-if="!constateRows(day).length" class="text-muted">—</span>
            <div v-else class="constate-cell">
              <div v-for="{ low: l, flot } in constateRows(day)" :key="l.date + l.time" class="constate-row">
                <span class="text-muted small constate-est" title="Remise à flot Navihan (rappel)">
                  <i class="bi bi-check-circle"></i> {{ flot }}
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
        <tr v-if="hiddenCount > 0" class="hidden-days-row">
          <td :colspan="visible.flotObs ? 6 : 5" class="text-center text-muted small py-2">
            <i class="bi bi-funnel me-1"></i>
            {{ hiddenCount }} jour{{ hiddenCount > 1 ? 's' : '' }} masqué{{ hiddenCount > 1 ? 's' : '' }}
            par les filtres
            <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" @click="resetFilters">
              Réinitialiser
            </button>
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
