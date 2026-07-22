export interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
}

/** GET /api/auth/status — l'app doit-elle afficher la mire ? déjà authentifié ? */
export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json() as Promise<AuthStatus>;
}

/** POST /api/login — pose le cookie de session côté serveur en cas de succès. */
export async function postLogin(user: string, password: string, remember: boolean): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ user, password, remember })
  });
  if (!res.ok) {
    let message = 'Identifiants invalides.';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* corps non-JSON */ }
    throw new Error(message);
  }
}

/** POST /api/logout — efface le cookie de session. */
export async function postLogout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}
