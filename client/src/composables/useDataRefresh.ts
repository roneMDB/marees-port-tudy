import { ref } from 'vue';

/**
 * Signal de rechargement des données (singleton) : incrémenter `token` demande aux consommateurs
 * (ex. `useTides`) de recharger. Sert à rafraîchir le dashboard après un import d'horaires.
 */
const token = ref(0);

export function useDataRefresh() {
  function bump(): void {
    token.value += 1;
  }
  return { token, bump };
}
