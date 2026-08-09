import { pingVisit } from '../api/stats';

/**
 * Au-delà de ce délai d'arrière-plan, un retour à l'app compte pour une nouvelle visite.
 * L'app reste volontiers ouverte des heures dans un onglet ou en PWA : sans ce seuil, une
 * consultation du lendemain serait fondue dans celle de la veille.
 */
const RESUME_AFTER_MS = 30 * 60 * 1000;

// État de module : une seule balise par démarrage d'application, quel que soit le nombre de
// composants qui appellent le composable. `null` = aucune balise encore émise (sentinelle
// explicite plutôt qu'un 0 dont on supposerait qu'il est « très ancien »).
let lastPingAt: number | null = null;
let listenerBound = false;

/** Remet le compteur à zéro (tests). */
export function resetVisitPingForTests(): void {
  lastPingAt = null;
  listenerBound = false;
}

/**
 * Balise d'ouverture de l'application (issue #16). Le service worker de la PWA sert les
 * navigations depuis son précache : sans ce signal, seul le tout premier chargement d'un appareil
 * atteint le serveur et le compteur de visites cesse ensuite de bouger.
 *
 * Émission best-effort et silencieuse : hors-ligne ou non autorisée, la visite est simplement
 * perdue. Elle ne doit jamais interrompre l'usage.
 */
export function useVisitPing() {
  function ping(now = Date.now()): void {
    if (lastPingAt !== null && now - lastPingAt < RESUME_AFTER_MS) return;
    lastPingAt = now;
    // `pingVisit` avale déjà ses erreurs ; ce `catch` garantit qu'aucune évolution de l'API ne
    // puisse transformer une balise perdue en rejet non géré au milieu de l'application.
    pingVisit().catch(() => {});
  }

  /** Démarre le suivi : une balise maintenant, puis une à chaque reprise après une longue pause. */
  function start(): void {
    ping();
    if (listenerBound || typeof document === 'undefined') return;
    listenerBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ping();
    });
  }

  return { start, ping };
}
