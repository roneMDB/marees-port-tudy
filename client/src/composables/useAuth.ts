import { computed, ref } from 'vue';
import { getAuthStatus, postLogin, postLogout, type AuthUser, type Role } from '../api/auth';

/**
 * État d'authentification (singleton). `authRequired` dit si le serveur exige une connexion ;
 * `authenticated` si la session courante est valide ; `role` (`viewer`/`admin`) détermine les
 * droits ; `user` porte l'identité (login, `mustChangePassword`). La mire (`LoginScreen`) s'affiche
 * tant que `authRequired && !authenticated`. Écoute `api-unauthorized` (émis par `fetchJson` sur 401)
 * pour retomber sur la mire quand une session expire.
 */
const authRequired = ref(false);
const authenticated = ref(false);
const role = ref<Role | null>(null);
const user = ref<AuthUser | null>(null);
const checking = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);

const isAdmin = computed(() => role.value === 'admin');
const mustChangePassword = computed(() => user.value?.mustChangePassword ?? false);

let listenerBound = false;
function bindUnauthorized(): void {
  if (listenerBound || typeof window === 'undefined') return;
  listenerBound = true;
  window.addEventListener('api-unauthorized', () => {
    if (authRequired.value) {
      authenticated.value = false;
      role.value = null;
      user.value = null;
    }
  });
}

/** Hydrate l'état depuis `/api/auth/status` (source de vérité serveur). */
async function hydrate(): Promise<void> {
  const s = await getAuthStatus();
  authRequired.value = s.authRequired;
  authenticated.value = s.authenticated;
  role.value = s.role;
  user.value = s.user;
}

async function checkStatus(): Promise<void> {
  try {
    await hydrate();
  } catch {
    // Statut injoignable : on ne bloque pas l'app (la protection réelle reste serveur).
    authRequired.value = false;
    authenticated.value = true;
    role.value = 'admin';
    user.value = null;
  } finally {
    checking.value = false;
  }
}

async function login(login: string, password: string, remember: boolean): Promise<void> {
  submitting.value = true;
  error.value = null;
  try {
    await postLogin(login, password, remember);
    // Réhydrate depuis le serveur pour récupérer rôle + identité (login, mustChangePassword).
    await hydrate();
    authenticated.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    submitting.value = false;
  }
}

async function logout(): Promise<void> {
  await postLogout();
  authenticated.value = false;
  role.value = null;
  user.value = null;
}

export function useAuth() {
  bindUnauthorized();
  return {
    authRequired, authenticated, role, user, isAdmin, mustChangePassword,
    checking, submitting, error, checkStatus, login, logout
  };
}
