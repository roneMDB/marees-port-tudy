<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import Dashboard from './views/Dashboard.vue';
import StatsPanel from './components/StatsPanel.vue';
import TidesImportPanel from './components/TidesImportPanel.vue';
import UsersPanel from './components/UsersPanel.vue';
import LoginScreen from './components/LoginScreen.vue';
import ForcePasswordChange from './components/ForcePasswordChange.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';
import { useSite } from './composables/useSite';
import { useAuth } from './composables/useAuth';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
const { sites, siteId, load: loadSites } = useSite();

// Authentification + rôle : la mire s'affiche tant qu'une connexion est requise et non satisfaite ;
// les fonctions Réglages et Stats sont réservées au rôle admin (verrou serveur réel).
const { authRequired, authenticated, isAdmin, user, mustChangePassword, checking, checkStatus, logout } = useAuth();
const showApp = computed(() => !authRequired.value || authenticated.value);
// Un compte marqué « doit changer son mot de passe » (ex. admin/admin amorcé) est bloqué sur
// l'écran dédié tant qu'il ne l'a pas fait.
const needsPasswordChange = computed(() => showApp.value && mustChangePassword.value);

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

  <!-- Changement de mot de passe obligatoire (ex. compte admin/admin amorcé) -->
  <ForcePasswordChange v-else-if="needsPasswordChange" />

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
          <!-- Mobile (< sm) : les actions admin regroupées dans un menu ⋮ pour désencombrer. -->
          <div v-if="isAdmin" class="dropdown d-sm-none">
            <button
              type="button"
              class="btn btn-outline-light btn-sm"
              data-bs-toggle="dropdown"
              aria-expanded="false"
              title="Actions"
              aria-label="Actions"
            >
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#statsOffcanvas">
                  <i class="bi bi-bar-chart-line me-2"></i>Statistiques d'accès
                </button>
              </li>
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#importOffcanvas">
                  <i class="bi bi-upload me-2"></i>Import des horaires
                </button>
              </li>
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#usersOffcanvas">
                  <i class="bi bi-people me-2"></i>Utilisateurs
                </button>
              </li>
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#settingsOffcanvas">
                  <i class="bi bi-sliders me-2"></i>Réglages &amp; filtres
                </button>
              </li>
            </ul>
          </div>
          <!-- ≥ sm : actions admin en ligne dans la navbar. -->
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-sm-inline-flex align-items-center"
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
            class="btn btn-outline-light btn-sm d-none d-sm-inline-flex align-items-center"
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
            class="btn btn-outline-light btn-sm d-none d-sm-inline-flex align-items-center"
            data-bs-toggle="offcanvas"
            data-bs-target="#usersOffcanvas"
            aria-controls="usersOffcanvas"
            title="Utilisateurs"
            aria-label="Utilisateurs"
          >
            <i class="bi bi-people"></i>
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-sm-inline-flex align-items-center"
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
          <span
            v-if="authRequired && user"
            class="navbar-text text-white-50 small d-inline-flex align-items-center app-username"
            :title="user.login"
          >
            <i class="bi bi-person-circle me-1"></i><span class="text-truncate">{{ user.login }}</span>
          </span>
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
    <UsersPanel v-if="isAdmin" />
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

/* Nom d'utilisateur : visible sur toutes tailles, tronqué si trop long (évite de casser la navbar). */
.app-username .text-truncate {
  max-width: 7rem;
}
@media (min-width: 768px) {
  .app-username .text-truncate {
    max-width: 14rem;
  }
}
</style>
