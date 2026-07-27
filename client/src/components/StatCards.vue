<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FlatTide } from '../types';
import { formatDate, formatHeight, relativeDayLabel, todayKey, coefBand } from '../lib/format';
import { aflotAgenda, nextAflot, shiftMoment } from '../lib/navihan';
import { useNavihan } from '../composables/useNavihan';
import { useSettings } from '../composables/useSettings';

const props = defineProps<{ allTides: FlatTide[] }>();

const { offsets } = useNavihan();
const { settings } = useSettings();

// Marnage du jour : amplitude (plus haute pleine mer − plus basse basse mer) d'aujourd'hui.
const todayMarnage = computed(() => {
  const key = todayKey();
  const todays = props.allTides.filter(t => t.date === key && Number.isFinite(t.height));
  const highs = todays.filter(t => t.type === 'high').map(t => t.height);
  const lows = todays.filter(t => t.type === 'low').map(t => t.height);
  if (!highs.length || !lows.length) return null;
  return Math.max(...highs) - Math.min(...lows);
});

// Coefficient(s) du jour : pleines mers d'aujourd'hui (indépendant du filtre de dates).
const todayCoefs = computed(() => {
  const key = todayKey();
  return props.allTides
    .filter(t => t.date === key && t.type === 'high' && t.coefficient != null)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(t => t.coefficient as number);
});

// Bande (morte-eau → grande marée) du plus fort coefficient du jour, pour l'indicateur.
const todayBand = computed(() =>
  todayCoefs.value.length ? coefBand(Math.max(...todayCoefs.value)) : null
);

// Agenda des remises à flot (décalage fixe `aFlot`, pas l'estimation par seuil) sur les
// `aFlotDays` prochains jours, chacune rangée au jour où elle a **réellement** lieu. Les heures
// passées restent listées (estompées) : c'est un agenda, pas un compte à rebours.
const aflotDays = computed(() =>
  aflotAgenda(props.allTides, offsets, new Date(), settings.aFlotDays)
);

/**
 * Jours affichés au repos. Budget calé sur la hauteur des 3 autres cartes de la rangée (libellé +
 * valeur + sous-libellé = 3 lignes) : au-delà, la carte étirerait toute la rangée, puisque c'est
 * elle la plus haute. Le surplus est replié derrière « + N autres jours ».
 */
const COLLAPSED_DAYS = 3;

// Repli transitoire, non persisté — cf. ResourcesCard / MotDuJourCard.
const expanded = ref(false);
const shownAflotDays = computed(() =>
  expanded.value ? aflotDays.value : aflotDays.value.slice(0, COLLAPSED_DAYS)
);
const hiddenDays = computed(() => Math.max(0, aflotDays.value.length - COLLAPSED_DAYS));
const canExpand = computed(() => hiddenDays.value > 0);

// `aFlotDays` peut retomber sous le budget alors que la carte est dépliée : on la referme, sinon
// l'état resterait « déplié » sans bouton pour le défaire.
watch(canExpand, possible => {
  if (!possible) expanded.value = false;
});

/**
 * Carte « Prochaine remise à flot » : prochain à-flot à venir (heure **Remise à flot**, dérivée de
 * la prochaine basse mer dont l'instant ≥ maintenant, même si la toute prochaine marée est une
 * pleine mer ; sur `allTides`), prêt à afficher. Tout est en heures **Navihan**, et chaque heure
 * porte sa **date réelle** — les décalages franchissent minuit, si bien que l'à-flot et la basse
 * mer dont il découle peuvent tomber des jours différents.
 */
const nextAflotCard = computed(() => {
  const event = nextAflot(props.allTides, offsets, new Date());
  if (!event) return null;
  return {
    time: event.time,
    // Le jour de l'à-flot lui-même : sans lui, « 00:49 » se lirait comme déjà passé aujourd'hui.
    day: relativeDayLabel(event.date, todayKey()),
    // Basse mer **Navihan** (Port-Tudy + `basseMer`), pas l'heure Port-Tudy brute.
    low: shiftMoment(event.basse.date, event.basse.time, offsets.basseMer)
  };
});
</script>

<template>
  <div class="row g-3 mb-3">
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card shadow-sm h-100 border-0 app-brand-card">
        <div class="card-body py-2 px-3 d-flex flex-column justify-content-center">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="text-uppercase small opacity-75">Prochaine remise à flot</div>
              <template v-if="nextAflotCard">
                <div class="fs-5 fw-bold">
                  {{ nextAflotCard.time }}
                  <span class="fs-6 fw-normal opacity-75">{{ nextAflotCard.day }}</span>
                </div>
                <div class="small opacity-75">
                  Basse mer Navihan · {{ nextAflotCard.low.time }} ·
                  <span class="text-capitalize">{{ formatDate(nextAflotCard.low.date) }}</span>
                </div>
              </template>
              <div v-else class="fs-6">—</div>
            </div>
            <i class="bi bi-water fs-3 opacity-75"></i>
          </div>
        </div>
      </div>
    </div>

    <div class="col-6 col-lg-3">
      <div class="card shadow-sm h-100">
        <div class="card-body py-2 px-3 d-flex flex-column justify-content-center">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="text-uppercase small text-muted">Marnage du jour</div>
              <div class="fs-3 fw-bold">{{ todayMarnage != null ? formatHeight(todayMarnage) : '—' }}</div>
              <div class="small text-muted">haute − basse mer</div>
            </div>
            <i class="bi bi-arrows-expand fs-3 text-primary opacity-75"></i>
          </div>
        </div>
      </div>
    </div>

    <div class="col-6 col-lg-3">
      <div class="card shadow-sm h-100">
        <div class="card-body py-2 px-3 d-flex flex-column justify-content-center">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="text-uppercase small text-muted">Coefficient du jour</div>
              <div class="fs-3 fw-bold text-info">{{ todayCoefs.length ? todayCoefs.join(' · ') : '—' }}</div>
              <div class="small text-muted text-capitalize">
                <span
                  v-if="todayBand"
                  class="badge rounded-pill me-1"
                  :class="todayBand.badgeClass"
                >
                  <i v-if="todayBand.icon" :class="['bi', todayBand.icon, 'me-1']"></i>{{ todayBand.label }}
                </span>
                {{ formatDate(todayKey()) }}
              </div>
            </div>
            <i class="bi bi-moon-stars fs-3 text-info opacity-75"></i>
          </div>
        </div>
      </div>
    </div>

    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card shadow-sm h-100">
        <div class="card-body py-2 px-3 d-flex flex-column justify-content-center">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1" style="min-width: 0">
              <div class="text-uppercase small text-muted mb-1">Prochaines remises à flot</div>
              <div v-if="!aflotDays.length" class="small text-muted">—</div>
              <template v-else>
                <div id="aflot-days-list" class="aflot-list small mb-0">
                  <div v-for="d in shownAflotDays" :key="d.date" class="aflot-day">
                    <span class="aflot-date text-muted text-capitalize">
                      {{ formatDate(d.date, { weekday: 'short', day: '2-digit', month: '2-digit' }) }}
                    </span>
                    <span class="aflot-times">
                      <span
                        v-for="t in d.times"
                        :key="t.time"
                        class="badge rounded-pill fw-semibold"
                        :class="t.past
                          ? 'aflot-past bg-body-secondary text-secondary-emphasis'
                          : 'bg-success-subtle text-success-emphasis'"
                        :title="t.past ? 'Déjà passée' : undefined"
                      >{{ t.time }}</span>
                    </span>
                  </div>
                </div>
                <button
                  v-if="canExpand"
                  type="button"
                  class="btn btn-link btn-sm p-0 mt-1 small text-decoration-none align-self-start"
                  :aria-expanded="expanded"
                  aria-controls="aflot-days-list"
                  @click="expanded = !expanded"
                >
                  <i :class="expanded ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="me-1"></i>
                  <template v-if="expanded">Voir moins</template>
                  <template v-else>
                    + {{ hiddenDays }} autre{{ hiddenDays > 1 ? 's' : '' }} jour{{ hiddenDays > 1 ? 's' : '' }}
                  </template>
                </button>
              </template>
            </div>
            <i class="bi bi-life-preserver fs-3 text-success opacity-75 ms-2"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Une ligne par jour, ce qui rend le repli à N jours net et lisible. */
.aflot-list {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

/*
 * Un jour = sa date à gauche, ses horaires à droite. `wrap` est nécessaire : une journée peut
 * porter **trois** remises à flot (quand le décalage fixe de la basse mer de la veille franchit
 * minuit), ce qui déborde de la carte en `col-lg-3` étroite (~230 px vers 992 px de viewport).
 * On passe alors à la ligne plutôt que de rogner un horaire. Le repli tronquant en **jours** et
 * non en pixels, une ligne plus haute est sans conséquence : elle ne décale aucun budget.
 */
.aflot-day {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.15rem 0.5rem;
}

.aflot-date {
  font-weight: 400;
  white-space: nowrap;
}

.aflot-times {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* Heure déjà passée : listée mais estompée, pour garder un agenda stable sur la journée. */
.aflot-past {
  opacity: 0.55;
}
</style>
