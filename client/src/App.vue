<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Dashboard from './views/Dashboard.vue';
import StatsPanel from './components/StatsPanel.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';
import { useSite } from './composables/useSite';
import { getContext } from './api/tides';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
const { sites, siteId, load: loadSites } = useSite();

// Le panneau Stats n'est proposé que sur le réseau local (verrou réel côté serveur).
const isLocal = ref(false);

onMounted(async () => {
  loadSites();
  try {
    isLocal.value = (await getContext()).local;
  } catch {
    /* contexte indisponible : on n'affiche pas le bouton Stats */
  }
});
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
        <div class="d-flex align-items-center">
          <label for="siteSelect" class="visually-hidden">Port</label>
          <i class="bi bi-geo-alt-fill text-white-50 me-1" aria-hidden="true"></i>
          <select
            id="siteSelect"
            class="form-select form-select-sm app-site-select"
            v-model="siteId"
            title="Port affiché"
            aria-label="Port affiché"
          >
            <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <button
          v-if="isLocal"
          type="button"
          class="btn btn-outline-light btn-sm"
          data-bs-toggle="offcanvas"
          data-bs-target="#statsOffcanvas"
          aria-controls="statsOffcanvas"
          title="Statistiques d'accès"
          aria-label="Statistiques d'accès"
        >
          <i class="bi bi-bar-chart-line"></i>
        </button>
        <button
          type="button"
          class="btn btn-outline-light btn-sm"
          data-bs-toggle="offcanvas"
          data-bs-target="#settingsOffcanvas"
          aria-controls="settingsOffcanvas"
          title="Réglages & filtres"
          aria-label="Réglages & filtres"
        >
          <i class="bi bi-sliders"></i>
        </button>
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

  <StatsPanel v-if="isLocal" />
</template>

<style scoped>
/* Chiffres à chasse fixe : l'horloge ne « saute » pas à chaque seconde. */
.app-clock {
  font-variant-numeric: tabular-nums;
}

/* Sélecteur de port compact dans la navbar. */
.app-site-select {
  width: auto;
  min-width: 7.5rem;
}
</style>
