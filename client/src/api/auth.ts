/** Rôles applicatifs (miroir du contrat REST serveur). */
export type Role = 'viewer' | 'admin';

/** Identité minimale de l'utilisateur connecté (exposée par `/api/auth/status`). */
export interface AuthUser {
  id: number;
  login: string;
  mustChangePassword: boolean;
}

export interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
  role: Role | null;
  user: AuthUser | null;
}

export interface LoginResult {
  role: Role | null;
  mustChangePassword: boolean;
}

/** GET /api/auth/status — l'app doit-elle afficher la mire ? déjà authentifié ? quel rôle/utilisateur ? */
export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const body = (await res.json()) as Partial<AuthStatus>;
  return {
    authRequired: !!body.authRequired,
    authenticated: !!body.authenticated,
    role: body.role ?? null,
    user: body.user ?? null
  };
}

/** POST /api/login — pose le cookie de session ; renvoie le rôle obtenu et le changement forcé. */
export async function postLogin(user: string, password: string, remember: boolean): Promise<LoginResult> {
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
  const body = await res.json().catch(() => ({}));
  return { role: (body?.role as Role) ?? null, mustChangePassword: !!body?.mustChangePassword };
}

/** POST /api/logout — efface le cookie de session. */
export async function postLogout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}
