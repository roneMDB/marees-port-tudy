<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import Dashboard from './views/Dashboard.vue';
import StatsPanel from './components/StatsPanel.vue';
import TidesImportPanel from './components/TidesImportPanel.vue';
import LoginScreen from './components/LoginScreen.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';
import { useSite } from './composables/useSite';
import { useAuth } from './composables/useAuth';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
const { sites, siteId, load: loadSites } = useSite();

// Authentification + rôle : la mire s'affiche tant qu'une connexion est requise et non satisfaite ;
// les fonctions Réglages et Stats sont réservées au rôle admin (verrou serveur réel).
const { authRequired, authenticated, isAdmin, checking, checkStatus, logout } = useAuth();
const showApp = computed(() => !authRequired.value || authenticated.value);

let appDataLoaded = false;
function ensureAppData() {
  if (appDataLoaded) return;
  appDataLoaded = true;
  loadSites();
}

onMounted(async () => {
  await checkStatus();
  if (showApp.value) ensureAppData();
});

// Après une connexion réussie, charger les données de l'app.
watch(showApp, (ok) => { if (ok) ensureAppData(); });
</script>

<template>
  <!-- Vérification du statut d'auth au démarrage -->
  <div v-if="checking" class="d-flex align-items-center justify-content-center min-vh-100">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Chargement…</span>
    </div>
  </div>

  <!-- Mire de connexion -->
  <LoginScreen v-else-if="!showApp" />

  <!-- Application -->
  <template v-else>
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
            v-if="isAdmin"
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
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm"
            data-bs-toggle="offcanvas"
            data-bs-target="#importOffcanvas"
            aria-controls="importOffcanvas"
            title="Import des horaires"
            aria-label="Import des horaires"
          >
            <i class="bi bi-upload"></i>
          </button>
          <button
            v-if="isAdmin"
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
          <button
            v-if="authRequired"
            type="button"
            class="btn btn-outline-light btn-sm"
            title="Se déconnecter"
            aria-label="Se déconnecter"
            @click="logout"
          >
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </div>
    </nav>

    <main class="bg-body-tertiary min-vh-100 overflow-x-hidden">
      <Dashboard />
    </main>

    <StatsPanel v-if="isAdmin" />
    <TidesImportPanel v-if="isAdmin" />
  </template>
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
