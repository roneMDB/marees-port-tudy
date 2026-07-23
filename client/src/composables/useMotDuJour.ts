import { ref, watch } from 'vue';

const STORAGE_KEY = 'marees-mot-du-jour';

function getInitialVisible(): boolean {
  // Affiché par défaut ; on ne masque que si l'utilisateur l'a explicitement demandé.
  return localStorage.getItem(STORAGE_KEY) !== 'hidden';
}

// État partagé (singleton) : l'affichage du mot du jour vaut pour toute l'application.
const visible = ref<boolean>(getInitialVisible());

// Persiste le choix (comme le thème / le port). `immediate` non nécessaire : pas d'effet de bord DOM.
watch(visible, value => {
  localStorage.setItem(STORAGE_KEY, value ? 'shown' : 'hidden');
});

export function useMotDuJour() {
  function hide(): void {
    visible.value = false;
  }
  function show(): void {
    visible.value = true;
  }
  return { visible, hide, show };
}
