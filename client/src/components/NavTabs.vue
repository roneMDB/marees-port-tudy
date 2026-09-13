<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useMediaQuery } from '../composables/useMediaQuery';

/**
 * Navigation entre les pages de l'app. Remplace le bouton unique qui alternait entre les deux
 * pages : son icône montrait la **destination**, donc rien ne disait où l'on se trouvait ni qu'il
 * existait une seconde page.
 *
 * `PAGES` est la **source de vérité unique** : les deux variantes en dérivent, ajouter une page
 * est une ligne. C'est ce qui les empêche de diverger — le piège des variantes responsives
 * dupliquées, déjà rencontré sur la navbar.
 *
 * Une **seule** variante est rendue, choisie par `matchMedia` et non par les utilitaires `d-none`
 * de Bootstrap : voir `useMediaQuery` pour la raison (jsdom n'évalue pas les media queries CSS,
 * donc le pilotage par CSS rendrait les deux variantes non testables).
 */
const PAGES = [
  { name: 'dashboard', label: 'Marées', icon: 'bi-water' },
  { name: 'fishing', label: 'Pêche', icon: 'bi-bucket' }
] as const;

// `sm` de Bootstrap. Le fallback `true` (desktop) s'applique quand `matchMedia` manque — jsdom.
const isWide = useMediaQuery('(min-width: 576px)', true);

const route = useRoute();
// Comparaison explicite sur le nom : `router-link-active` s'allumerait pour tout sur la route `/`.
const isActive = (name: string) => route.name === name;
</script>

<template>
  <!-- ≥ sm : groupe segmenté dans la navbar. -->
  <div v-if="isWide" class="btn-group btn-group-sm nav-tabs-inline" role="group" aria-label="Page affichée">
    <RouterLink
      v-for="p in PAGES"
      :key="p.name"
      class="btn d-inline-flex align-items-center gap-1"
      :class="isActive(p.name) ? 'btn-light' : 'btn-outline-light'"
      :to="{ name: p.name }"
      :aria-current="isActive(p.name) ? 'page' : undefined"
    >
      <i class="bi" :class="p.icon" aria-hidden="true"></i>{{ p.label }}
    </RouterLink>
  </div>

  <!-- < sm : barre d'onglets fixe en bas de fenêtre. -->
  <nav v-else class="nav-tabs-bar" aria-label="Page affichée">
    <RouterLink
      v-for="p in PAGES"
      :key="p.name"
      class="nav-tabs-bar__tab"
      :class="{ 'nav-tabs-bar__tab--active': isActive(p.name) }"
      :to="{ name: p.name }"
      :aria-current="isActive(p.name) ? 'page' : undefined"
    >
      <i class="bi" :class="p.icon" aria-hidden="true"></i>
      <span>{{ p.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.nav-tabs-bar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 1030;
  display: flex;
  height: calc(var(--app-navtabs-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--bs-body-bg);
  border-top: 1px solid var(--bs-border-color);
}
.nav-tabs-bar__tab {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  text-decoration: none;
  color: var(--bs-secondary-color);
  border-top: 3px solid transparent;
  font-size: 0.75rem;
}
.nav-tabs-bar__tab .bi {
  font-size: 1.25rem;
  line-height: 1;
}
.nav-tabs-bar__tab--active {
  color: var(--bs-primary);
  border-top-color: var(--bs-primary);
  font-weight: 600;
}
</style>
