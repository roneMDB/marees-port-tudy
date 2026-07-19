<script setup lang="ts">
import { ref } from 'vue';

interface ResourceLink {
  label: string;
  url: string;
}

interface ResourceGroup {
  title: string;
  icon: string; // classe bootstrap-icons
  links: ResourceLink[];
}

// Liens statiques d'aide à la pêche dans la Ria d'Étel, groupés par type de pêche.
const GROUPS: ResourceGroup[] = [
  {
    title: 'Pêche à pied',
    icon: 'bi-bucket',
    links: [
      { label: 'Guide pratique « Cap sur la Ria d\'Étel » (Navix)', url: 'https://www.navix.fr/wp-content/uploads/2023/03/guide_pratique_Etel.pdf' },
      { label: 'Mairie d\'Étel – pêche à pied locale', url: 'https://www.mairie-etel.fr/pratiquer-la-peche-pied' },
      { label: 'CDPMEM 56 – réglementation Morbihan', url: 'https://www.cdpmem56.fr/la-peche-a-pied/' },
      { label: 'Carte sanitaire interactive (état des zones)', url: 'http://www.pecheapied-responsable.fr' }
    ]
  },
  {
    title: 'Pêche au casier',
    icon: 'bi-box-seam',
    links: [
      { label: 'Synthèse réglementaire DIRM Nord Atlantique-Manche Ouest (2025)', url: 'https://www.dirm.nord-atlantique-manche-ouest.developpement-durable.gouv.fr/IMG/pdf/reglementation_peche_loisir_bretagne_2025_01_cle51df32.pdf' },
      { label: 'Bretagne Pêche (CRPMEM) – réglementation et licences', url: 'https://www.bretagne-peches.org/reglementation/' }
    ]
  },
  {
    title: 'Pêche à la ligne (bar, mulet, dorade)',
    icon: 'bi-bullseye',
    links: [
      { label: 'Article spots bars/dorades Ria d\'Étel', url: 'https://www.despoissonssigrands.com/lescarnetsdepeche/la-ria-detel-un-paradis-accessible-du-bord-pour-pecher-bars-et-dorades/' },
      { label: 'Gobages.com – comptes-rendus pêche à la mouche', url: 'https://gobages.com/riviere/ria-detel/' },
      { label: 'ComptoirDesPêcheurs – 475 spots référencés + carte', url: 'https://comptoirdespecheurs.com/France/coin-de-peche/472-peche-Etel' },
      { label: 'Blog Labrax56 – retours d\'expérience dorade/bar', url: 'https://labrax56.blogspot.com/2012/09/une-journee-sur-la-ria-avec-jp.html' }
    ]
  }
];

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

    <div v-show="open" class="card-body py-2 px-3">
      <div class="row g-3">
        <div v-for="group in GROUPS" :key="group.title" class="col-12 col-lg-4">
          <h6 class="text-uppercase text-muted small fw-bold mb-2">
            <i :class="['bi', group.icon, 'me-1']"></i>{{ group.title }}
          </h6>
          <ul class="list-group list-group-flush">
            <li v-for="link in group.links" :key="link.url" class="list-group-item px-0 py-1 bg-transparent border-0">
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="link-body-emphasis text-decoration-none d-inline-flex align-items-baseline"
              >
                <i class="bi bi-box-arrow-up-right small me-2 flex-shrink-0"></i>
                <span>{{ link.label }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
