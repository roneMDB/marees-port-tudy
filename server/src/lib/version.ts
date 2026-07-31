import fs from 'fs';
import path from 'path';

/** Repli si le manifest est illisible : on préfère une valeur neutre à une exception au boot. */
const VERSION_INCONNUE = '0.0.0';

let cache: string | null = null;

/**
 * Version de l'application, lue dans le `package.json` racine.
 *
 * Le chemin est résolu depuis `__dirname`, ce qui donne le même fichier en développement
 * (`server/src/lib/` → `../../../package.json`) et dans l'image (`server/dist/lib/` → idem) : le
 * manifest racine est copié dans l'image runtime (cf. `Dockerfile`), donc aucun `ARG` de build n'est
 * nécessaire.
 *
 * La valeur est mémoïsée : elle ne change pas pendant la vie du processus.
 */
export function appVersion(): string {
  if (cache !== null) return cache;

  try {
    const manifest = path.resolve(__dirname, '../../../package.json');
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const version =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined;
    cache = typeof version === 'string' && version.length > 0 ? version : VERSION_INCONNUE;
  } catch {
    cache = VERSION_INCONNUE;
  }

  return cache;
}

/** Réinitialise la mémoïsation (tests uniquement). */
export function resetVersionCache(): void {
  cache = null;
}
