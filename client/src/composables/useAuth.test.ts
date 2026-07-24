import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthStatusMock = vi.fn();
const postLoginMock = vi.fn();
const postLogoutMock = vi.fn();

vi.mock('../api/auth', () => ({
  getAuthStatus: () => getAuthStatusMock(),
  postLogin: (u: string, p: string, r: boolean) => postLoginMock(u, p, r),
  postLogout: () => postLogoutMock()
}));

async function freshUseAuth() {
  vi.resetModules();
  return (await import('./useAuth')).useAuth;
}

const adminStatus = {
  authRequired: true, authenticated: true, role: 'admin',
  user: { id: 1, login: 'admin', mustChangePassword: false }
};

describe('useAuth', () => {
  beforeEach(() => {
    getAuthStatusMock.mockReset();
    postLoginMock.mockReset();
    postLogoutMock.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hydrate authRequired/authenticated/role/user via checkStatus', async () => {
    getAuthStatusMock.mockResolvedValue(adminStatus);
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired, authenticated, role, isAdmin, user, checking } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(true);
    expect(authenticated.value).toBe(true);
    expect(role.value).toBe('admin');
    expect(isAdmin.value).toBe(true);
    expect(user.value).toMatchObject({ login: 'admin' });
    expect(checking.value).toBe(false);
  });

  it('un lecteur n’est pas admin', async () => {
    getAuthStatusMock.mockResolvedValue({
      authRequired: true, authenticated: true, role: 'viewer',
      user: { id: 2, login: 'bob', mustChangePassword: false }
    });
    const useAuth = await freshUseAuth();
    const { checkStatus, isAdmin } = useAuth();
    await checkStatus();
    expect(isAdmin.value).toBe(false);
  });

  it('expose mustChangePassword depuis le statut', async () => {
    getAuthStatusMock.mockResolvedValue({
      authRequired: true, authenticated: true, role: 'viewer',
      user: { id: 3, login: 'carol', mustChangePassword: true }
    });
    const useAuth = await freshUseAuth();
    const { checkStatus, mustChangePassword } = useAuth();
    await checkStatus();
    expect(mustChangePassword.value).toBe(true);
  });

  it('checkStatus en échec réseau → authRequired=false (dégradation gracieuse)', async () => {
    getAuthStatusMock.mockRejectedValue(new Error('offline'));
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(false);
  });

  it('login réussi hydrate le statut (authenticated, rôle, utilisateur)', async () => {
    postLoginMock.mockResolvedValue({ role: 'admin', mustChangePassword: false });
    getAuthStatusMock.mockResolvedValue(adminStatus);
    const useAuth = await freshUseAuth();
    const { login, authenticated, role, isAdmin, user } = useAuth();
    await login('admin', 'adm1n', true);
    expect(postLoginMock).toHaveBeenCalledWith('admin', 'adm1n', true);
    expect(authenticated.value).toBe(true);
    expect(role.value).toBe('admin');
    expect(isAdmin.value).toBe(true);
    expect(user.value).toMatchObject({ login: 'admin' });
  });

  it('login en échec remonte le message dans error et relance', async () => {
    postLoginMock.mockRejectedValue(new Error('Identifiants invalides.'));
    const useAuth = await freshUseAuth();
    const { login, error, authenticated } = useAuth();
    await expect(login('marees', 'x', false)).rejects.toThrow('Identifiants invalides.');
    expect(error.value).toBe('Identifiants invalides.');
    expect(authenticated.value).toBe(false);
  });

  it('logout repasse authenticated à false et rôle/utilisateur à null', async () => {
    postLoginMock.mockResolvedValue({ role: 'viewer', mustChangePassword: false });
    getAuthStatusMock.mockResolvedValue({
      authRequired: true, authenticated: true, role: 'viewer',
      user: { id: 2, login: 'marees', mustChangePassword: false }
    });
    postLogoutMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, logout, authenticated, role, user } = useAuth();
    await login('marees', 's3cret', true);
    await logout();
    expect(authenticated.value).toBe(false);
    expect(role.value).toBe(null);
    expect(user.value).toBe(null);
  });

  it('un événement api-unauthorized repasse authenticated à false et rôle à null', async () => {
    getAuthStatusMock.mockResolvedValue(adminStatus);
    const useAuth = await freshUseAuth();
    const { checkStatus, authenticated, role } = useAuth();
    await checkStatus();
    expect(authenticated.value).toBe(true);
    window.dispatchEvent(new CustomEvent('api-unauthorized'));
    expect(authenticated.value).toBe(false);
    expect(role.value).toBe(null);
  });
});
