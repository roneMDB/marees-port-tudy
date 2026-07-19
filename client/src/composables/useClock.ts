import { computed, onScopeDispose, ref } from 'vue';
import { formatClock } from '../lib/clock';

/**
 * Horloge réactive : `now` se met à jour chaque seconde, `clock` en donne le libellé
 * français formaté. L'intervalle est nettoyé quand le scope (composant) est détruit.
 */
export function useClock() {
  const now = ref(new Date());
  const id = setInterval(() => {
    now.value = new Date();
  }, 1000);
  onScopeDispose(() => clearInterval(id));

  const clock = computed(() => formatClock(now.value));
  return { now, clock };
}
