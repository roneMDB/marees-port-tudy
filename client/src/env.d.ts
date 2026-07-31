/// <reference types="vite/client" />

/**
 * Version de l'application, injectée au build par Vite (`define` dans `vite.config.ts`) depuis
 * `client/package.json` — donc lisible hors-ligne, sans passer par `/api/health` (issue #12).
 */
declare const __APP_VERSION__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
