import { onBeforeUnmount, readonly, ref } from 'vue';

/**
 * Media query réactive, adossée à `window.matchMedia`.
 *
 * Sert à ne rendre **qu'une** variante d'un composant responsive, au lieu de rendre les deux et de
 * laisser le CSS en masquer une. Ce choix est délibéré : jsdom n'évalue **pas** les media queries
 * CSS, donc un composant piloté par `d-none`/`d-sm-flex` a ses deux variantes dans le DOM du test
 * et l'on ne peut jamais affirmer laquelle l'utilisateur voit. Piloté ici, la branche est
 * observable — au prix du stub ci-dessous.
 *
 * ⚠️ `window.matchMedia` n'existe pas sous jsdom (ni `setupFiles` dans la config vitest) : tout
 * test qui monte un composant responsive sans le simuler obtient le `fallback`, silencieusement.
 */
export function useMediaQuery(query: string, fallback = false) {
  const matches = ref(fallback);

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia(query);
    matches.value = mql.matches;
    const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches; };
    // Garde sur l'existence de la méthode : avant Safari 14 / iOS 14, `MediaQueryList` n'héritait
    // pas d'`EventTarget` et n'exposait que `addListener`/`removeListener`. Sans ce test, l'appel
    // lève dans le `setup` du composant, l'erreur remonte et la page reste **blanche** — une panne
    // totale là où la seule perte acceptable est l'absence de réactivité au redimensionnement.
    // On ne reprend pas l'API dépréciée : la valeur initiale suffit, seul l'effondrement est à
    // éviter.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      onBeforeUnmount(() => mql.removeEventListener('change', onChange));
    }
  }

  return readonly(matches);
}
