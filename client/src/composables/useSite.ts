import { computed, ref, watch } from 'vue';
import { getSites } from '../api/tides';
import type { Site } from '../types';

/**
 * Port de **référence** : les heures Navihan en sont toujours dérivées, quel que soit le
 * port sélectionné à l'affichage.
 */
export const REFERENCE_SITE_ID = 'port-tudy';

const STORAGE_KEY = 'marees-site';

/** Liste minimale tant que `/api/sites` n'a pas répondu (évite une navbar vide). */
const FALLBACK: Site[] = [{ id: REFERENCE_SITE_ID, label: 'Port-Tudy' }];

// État partagé (singleton) : le port sélectionné vaut pour toute l'application.
const sites = ref<Site[]>(FALLBACK);
const siteId = ref<string>(localStorage.getItem(STORAGE_KEY) || REFERENCE_SITE_ID);

// Persiste la sélection (comme le thème).
watch(siteId, id => localStorage.setItem(STORAGE_KEY, id));

// Hydratation unique de la liste des ports (partagée entre tous les appelants).
let loadPromise: Promise<void> | null = null;
function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = getSites()
      .then(list => {
        if (list.length) sites.value = list;
        // Un id stocké devenu inconnu retombe sur la référence.
        if (!sites.value.some(s => s.id === siteId.value)) {
          siteId.value = REFERENCE_SITE_ID;
        }
      })
      .catch(() => {
        /* réseau indisponible : on garde le fallback */
      });
  }
  return loadPromise;
}

export function useSite() {
  const current = computed(() => sites.value.find(s => s.id === siteId.value) ?? sites.value[0]);
  const isReference = computed(() => siteId.value === REFERENCE_SITE_ID);

  function setSite(id: string): void {
    siteId.value = id;
  }

  return { sites, siteId, current, isReference, setSite, load };
}
