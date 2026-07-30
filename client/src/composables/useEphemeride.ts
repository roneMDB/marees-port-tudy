import { ref, watch } from 'vue';

const STORAGE_KEY = 'marees-ephemeride';

function getInitialVisible(): boolean {
  // Affichée par défaut ; on ne masque que si l'utilisateur l'a explicitement demandé.
  return localStorage.getItem(STORAGE_KEY) !== 'hidden';
}

// État partagé (singleton) : l'affichage de l'éphéméride vaut pour toute l'application,
// comme le mot du jour (cf. `useMotDuJour`).
const visible = ref<boolean>(getInitialVisible());

watch(visible, value => {
  localStorage.setItem(STORAGE_KEY, value ? 'shown' : 'hidden');
});

export function useEphemeride() {
  function hide(): void {
    visible.value = false;
  }
  function show(): void {
    visible.value = true;
  }
  return { visible, hide, show };
}
