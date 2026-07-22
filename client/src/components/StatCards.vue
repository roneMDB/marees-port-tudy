<script setup lang="ts">
import { computed } from 'vue';
import type { FlatTide } from '../types';
import { formatDate, formatHeight, todayKey, coefBand } from '../lib/format';
import { nextAflot } from '../lib/navihan';
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

// Prochaines heures « à flot » : événements à venir (basse mer + décalage à flot),
// groupés par leur date réelle, sur les `aFlotDays` premiers jours à partir de maintenant.
const upcomingAflot = computed(() => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const byDate = new Map<string, string[]>();
  props.allTides
    .filter(t => t.type === 'low')
    .map(t => {
      const dt = new Date(`${t.date}T${t.time}:00`);
      dt.setMinutes(dt.getMinutes() + offsets.aFlot);
      return dt;
    })
    .filter(dt => dt >= now)
    .sort((a, b) => a.getTime() - b.getTime())
    .forEach(dt => {
      const date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      const times = byDate.get(date) ?? [];
      times.push(time);
      byDate.set(date, times);
    });
  return Array.from(byDate.entries())
    .slice(0, settings.aFlotDays)
    .map(([date, times]) => ({ date, times }));
});

// Prochain « à flot » à venir (dérivé de la prochaine basse mer dont l'heure à-flot ≥ maintenant),
// même si la toute prochaine marée chronologique est une pleine mer. Basé sur `allTides` (hors filtre).
const nextAflotEvent = computed(() => nextAflot(props.allTides, offsets.aFlot, new Date()));
</script>

<template>
  <div class="row g-3 mb-3">
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card shadow-sm h-100 border-0 app-brand-card">
        <div class="card-body py-2 px-3 d-flex flex-column justify-content-center">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="text-uppercase small opacity-75">Prochaine remise à flot</div>
              <template v-if="nextAflotEvent">
                <div class="fs-5 fw-bold">{{ nextAflotEvent.time }}</div>
                <div class="small opacity-75 text-capitalize">
                  Basse mer · {{ nextAflotEvent.basse.time }} · {{ formatDate(nextAflotEvent.basse.date) }}
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
              <div v-if="!upcomingAflot.length" class="small text-muted">—</div>
              <dl v-else class="aflot-list small mb-0">
                <template v-for="d in upcomingAflot" :key="d.date">
                  <dt class="text-muted text-capitalize">
                    {{ formatDate(d.date, { weekday: 'short', day: '2-digit', month: '2-digit' }) }}
                  </dt>
                  <dd>
                    <span
                      v-for="t in d.times"
                      :key="t"
                      class="badge rounded-pill bg-success-subtle text-success-emphasis fw-semibold"
                    >{{ t }}</span>
                  </dd>
                </template>
              </dl>
            </div>
            <i class="bi bi-life-preserver fs-3 text-success opacity-75 ms-2"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Grille alignée : dates en colonne 1, horaires (puces) en colonne 2. */
.aflot-list {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.5rem;
  row-gap: 0.25rem;
  align-items: baseline;
}

.aflot-list dt {
  font-weight: 400;
  white-space: nowrap;
}

.aflot-list dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.25rem;
}

/* Sur grand écran (cartes larges), on étale les horaires vers la droite. */
@media (min-width: 992px) {
  .aflot-list dd {
    justify-content: flex-end;
  }
}
</style>
