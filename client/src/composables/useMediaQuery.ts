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
    mql.addEventListener('change', onChange);
    onBeforeUnmount(() => mql.removeEventListener('change', onChange));
  }

  return readonly(matches);
}
