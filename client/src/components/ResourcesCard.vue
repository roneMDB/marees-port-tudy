<script setup lang="ts">
import { ref } from 'vue';

interface ResourceLink {
  label: string;
  url: string;
  icon?: string; // classe bootstrap-icons de la tuile
  children?: ResourceLink[];
}

// Liens statiques d'aide à la pêche à pied dans la Ria d'Étel.
const LINKS: ResourceLink[] = [
  {
    label: 'Guide pratique « Cap sur la Ria d\'Étel »',
    url: 'https://www.navix.fr/wp-content/uploads/2023/03/guide_pratique_Etel.pdf',
    icon: 'bi-book'
  },
  {
    label: 'Tailles, quotas et outils de pêche',
    url: 'https://www.pecheapied-responsable.fr/fr/les-tailles-quotas-et-outils-de-peche',
    icon: 'bi-rulers',
    children: [
      { label: 'Réglementation pêche à pied de loisir – Morbihan', url: 'https://www.pecheapied-loisir.fr/reglementation/morbihan/' },
      { label: 'Tableau récapitulatif des tailles et quotas', url: 'https://www.pecheapied-responsable.fr/sites/default/files/2023-06/tableau_recap.pdf' },
      { label: 'Engins de pêche autorisés', url: 'https://www.pecheapied-responsable.fr/sites/default/files/2023-06/engins_de_peche_0.pdf' }
    ]
  },
  {
    label: 'Situation sanitaire des coquillages du Morbihan',
    url: 'https://www.morbihan.gouv.fr/Actions-de-l-Etat/Mer-littoral-et-securite-maritime/Alertes-sanitaires-sur-les-coquillages/Situation-sanitaire-des-coquillages-du-Morbihan',
    icon: 'bi-shield-check'
  }
];

function isPdf(url: string): boolean {
  return url.toLowerCase().endsWith('.pdf');
}

const open = ref(false);
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center">
      <button
        type="button"
        class="btn btn-link text-decoration-none p-0 fw-semibold"
        :aria-expanded="open"
        @click="open = !open"
      >
        <i class="bi bi-compass me-1"></i> Ressources · Pêche Ria d'Étel
        <i :class="open ? 'bi bi-chevron-up' : 'bi bi-chevron-down'" class="small ms-1"></i>
      </button>
    </div>

    <div v-show="open" class="card-body py-3 px-3">
      <div class="row g-3">
        <div v-for="link in LINKS" :key="link.url" class="col-12 col-sm-6 col-lg-4">
          <div class="resource-tile card h-100 border-0 shadow-sm">
            <div class="card-body d-flex flex-column">
              <div class="d-flex align-items-start">
                <span class="resource-icon flex-shrink-0 me-3">
                  <i :class="['bi', link.icon ?? 'bi-link-45deg']"></i>
                </span>
                <a
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="fw-semibold link-body-emphasis text-decoration-none stretch-title"
                  :class="{ 'stretched-link': !link.children }"
                >
                  {{ link.label }}
                  <span v-if="isPdf(link.url)" class="badge rounded-pill bg-body-secondary text-body-secondary border ms-1 align-middle">PDF</span>
                  <i class="bi bi-box-arrow-up-right small ms-1 text-muted"></i>
                </a>
              </div>

              <ul v-if="link.children" class="list-unstyled small mb-0 mt-3 pt-3 border-top">
                <li v-for="child in link.children" :key="child.url" class="mb-2 last-mb-0">
                  <a
                    :href="child.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="link-secondary text-decoration-none d-inline-flex align-items-baseline"
                  >
                    <i class="bi bi-arrow-return-right me-2 flex-shrink-0"></i>
                    <span>
                      {{ child.label }}
                      <span v-if="isPdf(child.url)" class="badge rounded-pill bg-body-secondary text-body-secondary border ms-1">PDF</span>
                    </span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-tile {
  background-color: var(--bs-body-bg);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

/* La tuile se soulève au survol (ou focus clavier d'un lien à l'intérieur). */
.resource-tile:hover,
.resource-tile:focus-within {
  transform: translateY(-3px);
  box-shadow: var(--bs-box-shadow) !important;
}

/* Pastille d'icône thématique, adaptée au thème clair/sombre. */
.resource-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background-color: var(--bs-primary-bg-subtle);
  color: var(--bs-primary);
  font-size: 1.15rem;
}

.stretch-title {
  line-height: 1.3;
}

.last-mb-0:last-child {
  margin-bottom: 0 !important;
}
</style>
