<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import StatsPanel from './components/StatsPanel.vue';
import TidesImportPanel from './components/TidesImportPanel.vue';
import UsersPanel from './components/UsersPanel.vue';
import LexiconPanel from './components/LexiconPanel.vue';
import FishingRefsPanel from './components/FishingRefsPanel.vue';
import IconFish from './components/IconFish.vue';
import NavTabs from './components/NavTabs.vue';
import LoginScreen from './components/LoginScreen.vue';
import ForcePasswordChange from './components/ForcePasswordChange.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';
import { useSite } from './composables/useSite';
import { useAuth } from './composables/useAuth';
import { useVisitPing } from './composables/useVisitPing';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
const { sites, siteId, load: loadSites } = useSite();

// Version injectée au build (cf. vite.config.ts) : affichée hors-ligne, sans requête à /api/health.
// Sert à vérifier d'un coup d'œil quelle version tourne réellement après un déploiement (issue #12).
const appVersion = __APP_VERSION__;

// URL en dur, contrairement à la version : le dépôt ne change pas et le package.json racine n'a pas
// de champ « repository » — un second define Vite pour une valeur figée n'apporterait rien (#15).
const REPO_URL = 'https://github.com/roneMDB/marees-port-tudy';

// Authentification + rôle : la mire s'affiche tant qu'une connexion est requise et non satisfaite ;
// les fonctions Réglages et Stats sont réservées au rôle admin (verrou serveur réel).
const { authRequired, authenticated, isAdmin, user, mustChangePassword, checking, checkStatus, logout } = useAuth();
const showApp = computed(() => !authRequired.value || authenticated.value);
// Un compte marqué « doit changer son mot de passe » (ex. admin/admin amorcé) est bloqué sur
// l'écran dédié tant qu'il ne l'a pas fait.
const needsPasswordChange = computed(() => showApp.value && mustChangePassword.value);

// Balise d'ouverture pour les statistiques d'accès (issue #16). Conditionnée à un accès réellement
// ouvert : pendant un changement de mot de passe forcé, le garde renvoie 403 sur tout /api et la
// visite serait perdue — d'où une condition **observée**, qui balise dès que le mot de passe change.
const { start: startVisitPing } = useVisitPing();
const canCountVisit = computed(() => showApp.value && !needsPasswordChange.value);
watch(canCountVisit, ok => { if (ok) startVisitPing(); });

let appDataLoaded = false;
function ensureAppData() {
  if (appDataLoaded) return;
  appDataLoaded = true;
  loadSites();
}

onMounted(async () => {
  await checkStatus();
  if (showApp.value) ensureAppData();
  if (canCountVisit.value) startVisitPing();
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
        <!--
          Le login est un **enfant direct** de la barre, et non un élément de la rangée d'actions.
          `.navbar > .container-xxl` est un flex `wrap` + `space-between` : sous `sm`, la rangée
          d'actions passe à la ligne suivante et le login reste donc sur celle du titre, collé à
          droite (`ms-auto`). Au-dessus de `sm` tout tient sur une ligne et `ms-auto` le pousse
          contre la rangée d'actions, qu'il précède désormais — sur grand écran il ne jouxte donc
          plus le bouton de déconnexion, mais suit le titre. C'est le prix d'un **élément unique**
          plutôt que de deux variantes responsives qui finiraient par diverger.

          Ce n'est pas cosmétique : la rangée d'actions a gagné un bouton avec le carnet de pêche, et
          le menu ⋮ sortait de l'écran (bord droit à 427 px sur 360). Un seul élément plutôt que deux
          variantes responsives, pour qu'elles ne divergent pas.

          ⚠️ La marge droite est `me-sm-3` et non `me-3` : sous `sm`, rien ne suit le login sur sa
          ligne, et ces 16 px suffisaient à faire déborder le titre (243 px + les 16 px de marge de
          `.navbar-brand` + 67 px de login = 342 pour 336 disponibles) — le login basculait alors sur
          une troisième ligne au lieu de rejoindre le titre.
        -->
        <span
          v-if="authRequired && user"
          class="navbar-text text-white-50 small d-inline-flex align-items-center app-username ms-auto me-sm-3"
          :title="user.login"
        >
          <i class="bi bi-person-circle me-1"></i><span class="text-truncate">{{ user.login }}</span>
        </span>
        <!--
          Espacement resserré sous `sm` : le carnet de pêche a ajouté un bouton à cette rangée, et
          sur un écran de 320 px elle ne tenait plus (332 px pour 296 disponibles).
        -->
        <div class="d-flex align-items-center gap-2 gap-sm-3">
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
          <!-- Navigation entre les pages (lecture ouverte : visible de tous). Sous `sm`, se rend
               en barre d'onglets fixe en bas de fenêtre et ne prend donc pas de place ici. -->
          <NavTabs />
          <!--
            ≥ lg : actions admin en ligne dans la navbar. Le seuil était `sm` ; il est passé à `lg`
            quand la navigation est devenue deux onglets libellés (179 px, contre 40 px pour
            l'ancien bouton icône).

            Deux mesures l'imposent, sur un compte admin. (1) Débordement horizontal : la rangée
            demandait 755 px quelle que soit la fenêtre, donc elle débordait dès 640 px — et déjà
            avant ce changement entre 577 et 624 px. (2) Hauteur : à `md`, la rangée passait à la
            ligne et la navbar montait à 162 px à 768 px, 138 à 820, 114 à 900 (contre 114 px à
            768 px avant les onglets). À `lg` elle tient sur **une seule ligne, 90 px**, de 768 à
            991 px — mieux qu'avant.

            Le prix assumé : entre 768 et 991 px, un admin passe par le menu ⋮ au lieu des six
            boutons directs. C'est un clic contre 72 px de navbar. Ne pas redescendre le seuil sans
            re-mesurer : le débordement revient à 640 px.
          -->
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
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
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
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
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
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
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
            data-bs-toggle="offcanvas"
            data-bs-target="#lexiconOffcanvas"
            aria-controls="lexiconOffcanvas"
            title="Lexique du mot du jour"
            aria-label="Lexique du mot du jour"
          >
            <i class="bi bi-book"></i>
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
            data-bs-toggle="offcanvas"
            data-bs-target="#fishingRefsOffcanvas"
            aria-controls="fishingRefsOffcanvas"
            title="Espèces et engins"
            aria-label="Espèces et engins"
          >
            <IconFish />
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-lg-inline-flex align-items-center"
            data-bs-toggle="offcanvas"
            data-bs-target="#settingsOffcanvas"
            aria-controls="settingsOffcanvas"
            title="Réglages"
            aria-label="Réglages"
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
          <!-- < lg : actions admin regroupées dans un menu ⋮ (placé à droite → déroulé aligné). -->
          <div v-if="isAdmin" class="dropdown d-lg-none">
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
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#lexiconOffcanvas">
                  <i class="bi bi-book me-2"></i>Lexique du mot du jour
                </button>
              </li>
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#fishingRefsOffcanvas">
                  <IconFish class="me-2" />Espèces et engins
                </button>
              </li>
              <li>
                <button class="dropdown-item" type="button" data-bs-toggle="offcanvas" data-bs-target="#settingsOffcanvas">
                  <i class="bi bi-sliders me-2"></i>Réglages
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </nav>

    <main class="bg-body-tertiary min-vh-100 overflow-x-hidden">
      <RouterView />
    </main>

    <footer class="bg-body-tertiary border-top py-3 text-center app-footer">
      <small class="text-body-secondary">
        Marées Navihan
        <span class="app-version">v{{ appVersion }}</span>
        <span class="mx-1" aria-hidden="true">·</span>
        <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" class="link-secondary text-decoration-none">
          <i class="bi bi-github me-1" aria-hidden="true"></i>GitHub
        </a>
      </small>
    </footer>

    <StatsPanel v-if="isAdmin" />
    <TidesImportPanel v-if="isAdmin" />
    <UsersPanel v-if="isAdmin" />
    <LexiconPanel v-if="isAdmin" />
    <FishingRefsPanel v-if="isAdmin" />
  </template>
</template>

<style scoped>
/* Sous `sm`, la barre d'onglets est `position: fixed` et flotte au-dessus du document : le pied
   de page, dernier élément, doit dégager sa hauteur sinon version et lien GitHub restent dessous.
   Hauteur partagée via `--app-navtabs-h` (assets/app.css) pour qu'elles ne se désaccordent pas. */
@media (max-width: 575.98px) {
  .app-footer {
    padding-bottom: calc(var(--app-navtabs-h) + env(safe-area-inset-bottom) + 1rem) !important;
  }
}

/* Chiffres à chasse fixe : l'horloge ne « saute » pas à chaque seconde. */
.app-clock {
  font-variant-numeric: tabular-nums;
}

/* Version : chasse fixe et un cran plus discrète que le nom de l'app. */
.app-version {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
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
