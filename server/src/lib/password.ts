import { hash, verify } from '@node-rs/argon2';

/**
 * Hache un mot de passe en clair avec **argon2id** (paramètres par défaut de `@node-rs/argon2`,
 * conformes aux recommandations OWASP). Le sel est intégré au hash renvoyé (`$argon2id$...`).
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/**
 * Vérifie un mot de passe en clair contre un hash argon2id. Renvoie `false` (jamais d'exception)
 * si le hash est invalide/illisible, pour ne pas fuiter d'information ni planter la route de login.
 */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
