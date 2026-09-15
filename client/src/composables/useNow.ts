import { ref } from 'vue';

/**
 * Instant courant **partagé** (singleton). Sert à tout ce qui se périme au fil de la journée :
 * l'agenda des remises à flot estompe les heures passées, la carte « Prochaine remise à flot »
 * annonce la suivante. Figé sur l'instant du montage, il annonçait comme à venir des heures
 * dépassées depuis longtemps — l'app reste volontiers ouverte des heures, en onglet ou en PWA.
 *
 * Singleton parce que carte et panneau doivent lire le **même** instant (ils se contrediraient
 * sinon), et parce que poser un écouteur par composant pour une notion unique serait absurde.
 */
const now = ref(new Date());

// État de module : un seul écouteur par démarrage d'application, quel que soit le nombre
// d'appelants.
let listenerBound = false;

/** Remet le singleton à zéro — réservé aux tests. */
export function resetNowForTests(): void {
  now.value = new Date();
  listenerBound = false;
}

export function useNow() {
  /** Réaligne `now` sur l'instant réel. Appelée aussi à l'ouverture du panneau d'agenda. */
  function refresh(): void {
    now.value = new Date();
  }

  // Le retour au premier plan est le moment où l'écart saute aux yeux — c'est le déclencheur que
  // `useVisitPing` utilise déjà pour la même raison. Pas d'intervalle : rafraîchir en continu
  // ferait recalculer des agendas à la seconde pour un affichage qui ne change qu'aux heures.
  if (!listenerBound && typeof document !== 'undefined') {
    listenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }

  return { now, refresh };
}
