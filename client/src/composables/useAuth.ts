import { computed, ref } from 'vue';
import { getAuthStatus, postLogin, postLogout, type Role } from '../api/auth';

/**
 * État d'authentification (singleton). `authRequired` dit si le serveur exige une connexion ;
 * `authenticated` si la session courante est valide ; `role` (`viewer`/`admin`) détermine les
 * droits (l'édition des réglages et les statistiques sont réservées à `admin`). La mire
 * (`LoginScreen`) s'affiche tant que `authRequired && !authenticated`. Écoute `api-unauthorized`
 * (émis par `fetchJson` sur 401) pour retomber sur la mire quand une session expire.
 */
const authRequired = ref(false);
const authenticated = ref(false);
const role = ref<Role | null>(null);
const checking = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);

const isAdmin = computed(() => role.value === 'admin');

let listenerBound = false;
function bindUnauthorized(): void {
  if (listenerBound || typeof window === 'undefined') return;
  listenerBound = true;
  window.addEventListener('api-unauthorized', () => {
    if (authRequired.value) {
      authenticated.value = false;
      role.value = null;
    }
  });
}

async function checkStatus(): Promise<void> {
  try {
    const s = await getAuthStatus();
    authRequired.value = s.authRequired;
    authenticated.value = s.authenticated;
    role.value = s.role;
  } catch {
    // Statut injoignable : on ne bloque pas l'app (la protection réelle reste serveur).
    authRequired.value = false;
    authenticated.value = true;
    role.value = 'admin';
  } finally {
    checking.value = false;
  }
}

async function login(user: string, password: string, remember: boolean): Promise<void> {
  submitting.value = true;
  error.value = null;
  try {
    role.value = await postLogin(user, password, remember);
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
}

export function useAuth() {
  bindUnauthorized();
  return { authRequired, authenticated, role, isAdmin, checking, submitting, error, checkStatus, login, logout };
}
