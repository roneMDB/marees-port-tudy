<script setup lang="ts">
import { computed } from 'vue';

/**
 * Mini-répartition : une barre par case, hauteur proportionnelle au maximum de la série.
 *
 * Volontairement **pas un Chart.js** : ces strips sont rendus une fois par utilisateur déplié, et
 * instancier un graphe complet pour 7 ou 24 valeurs coûterait plus que ce qu'il apporterait. Une
 * seule série, donc **une seule teinte et aucune légende** — le titre au-dessus nomme la mesure.
 */
const props = defineProps<{
  /** Valeurs, dans l'ordre de l'axe. */
  values: number[];
  /** Libellé complet de chaque case, pour l'infobulle (« lundi », « 8 h »…). */
  labels: string[];
  /** Libellés d'axe à afficher sous le strip : quelques repères, pas une étiquette par barre. */
  ticks: { index: number; text: string }[];
  /** Description de la série, lue par les lecteurs d'écran. */
  caption: string;
}>();

const max = computed(() => Math.max(1, ...props.values));

/** Hauteur en % du maximum. Plancher à 6 % pour qu'une valeur de 1 reste visible. */
function height(value: number): string {
  return value === 0 ? '0%' : `${Math.max(6, (value / max.value) * 100)}%`;
}

function tooltip(index: number): string {
  const n = props.values[index] ?? 0;
  return `${props.labels[index]} — ${n} visite${n > 1 ? 's' : ''}`;
}
</script>

<template>
  <div>
    <div class="mini-bars" role="img" :aria-label="caption">
      <div v-for="(value, i) in values" :key="i" class="mini-bars__slot" :title="tooltip(i)">
        <div class="mini-bars__bar" :style="{ height: height(value) }"></div>
      </div>
    </div>
    <div class="mini-bars__axis">
      <span v-for="t in ticks" :key="t.index" :style="{ left: `${((t.index + 0.5) / values.length) * 100}%` }">
        {{ t.text }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.mini-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px; /* le fond passe entre les barres : elles ne se touchent jamais */
  height: 34px;
  /* Ligne de base discrète : l'axe se devine, il ne se lit pas. */
  border-bottom: 1px solid var(--bs-border-color);
}

.mini-bars__slot {
  flex: 1 1 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
  /* Piste sous la barre : une case vide reste une case, pas un trou. Jeton natif Bootstrap 5.3,
     qui bascule seul en thème sombre (`data-bs-theme`) — pas de `color-mix` à faire supporter. */
  background: var(--bs-tertiary-bg);
  border-radius: 2px 2px 0 0;
}

.mini-bars__bar {
  width: 100%;
  /* Teinte primaire du panneau : série unique, contraste validé en clair comme en sombre. */
  background: #0d6efd;
  border-radius: 2px 2px 0 0;
  min-height: 0;
}

.mini-bars__axis {
  position: relative;
  height: 1rem;
  font-size: 0.7rem;
  color: var(--bs-secondary-color);
}

.mini-bars__axis span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}
</style>
