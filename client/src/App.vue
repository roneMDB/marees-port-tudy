<script setup lang="ts">
import Dashboard from './views/Dashboard.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
</script>

<template>
  <nav class="navbar navbar-dark app-navbar shadow-sm">
    <div class="container-xxl">
      <span class="navbar-brand mb-0 h1">
        <i class="bi bi-water me-2"></i>Marées Navihan
        <small class="fw-normal opacity-75">· Belz</small>
      </span>
      <div class="d-flex align-items-center gap-3">
        <span class="navbar-text app-clock text-capitalize d-none d-sm-inline">
          <i class="bi bi-clock me-1"></i>{{ clock }}
        </span>
        <button
          type="button"
          class="btn btn-outline-light btn-sm"
          :title="isDark ? 'Passer en thème clair' : 'Passer en thème sombre'"
          :aria-label="isDark ? 'Passer en thème clair' : 'Passer en thème sombre'"
          @click="toggle"
        >
          <i :class="isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill'"></i>
        </button>
      </div>
    </div>
  </nav>

  <main class="bg-body-tertiary min-vh-100 overflow-x-hidden">
    <Dashboard />
  </main>
</template>

<style scoped>
/* Chiffres à chasse fixe : l'horloge ne « saute » pas à chaque seconde. */
.app-clock {
  font-variant-numeric: tabular-nums;
}
</style>
