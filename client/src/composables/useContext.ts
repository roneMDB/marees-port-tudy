import { ref } from 'vue';
import { getContext } from '../api/tides';

/**
 * Contexte d'accès (singleton) fourni par le serveur : `local` (réseau local) et
 * `canEditSettings` (droit d'édition des réglages = LAN et pas `READ_ONLY`). Sert à masquer
 * les panneaux réservés (Stats en LAN, Réglages si non éditables). Défauts prudents à `false`
 * tant que le serveur n'a pas répondu (on ne montre rien de réservé par erreur).
 */
const local = ref(false);
const canEditSettings = ref(false);

let loadPromise: Promise<void> | null = null;
function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = getContext()
      .then(c => {
        local.value = c.local;
        canEditSettings.value = c.canEditSettings;
      })
      .catch(() => {
        /* contexte indisponible : on garde les défauts (rien de réservé affiché) */
      });
  }
  return loadPromise;
}

export function useContext() {
  return { local, canEditSettings, load };
}
