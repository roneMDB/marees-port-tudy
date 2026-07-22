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

describe('useAuth', () => {
  beforeEach(() => {
    getAuthStatusMock.mockReset();
    postLoginMock.mockReset();
    postLogoutMock.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hydrate authRequired/authenticated/role via checkStatus', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: true, role: 'admin' });
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired, authenticated, role, isAdmin, checking } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(true);
    expect(authenticated.value).toBe(true);
    expect(role.value).toBe('admin');
    expect(isAdmin.value).toBe(true);
    expect(checking.value).toBe(false);
  });

  it('un viewer n’est pas admin', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: true, role: 'viewer' });
    const useAuth = await freshUseAuth();
    const { checkStatus, isAdmin } = useAuth();
    await checkStatus();
    expect(isAdmin.value).toBe(false);
  });

  it('checkStatus en échec réseau → authRequired=false (dégradation gracieuse)', async () => {
    getAuthStatusMock.mockRejectedValue(new Error('offline'));
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(false);
  });

  it('login réussi passe authenticated à true et fixe le rôle renvoyé', async () => {
    postLoginMock.mockResolvedValue('admin');
    const useAuth = await freshUseAuth();
    const { login, authenticated, role, isAdmin } = useAuth();
    await login('admin', 'adm1n', true);
    expect(postLoginMock).toHaveBeenCalledWith('admin', 'adm1n', true);
    expect(authenticated.value).toBe(true);
    expect(role.value).toBe('admin');
    expect(isAdmin.value).toBe(true);
  });

  it('login en échec remonte le message dans error et relance', async () => {
    postLoginMock.mockRejectedValue(new Error('Identifiants invalides.'));
    const useAuth = await freshUseAuth();
    const { login, error, authenticated } = useAuth();
    await expect(login('marees', 'x', false)).rejects.toThrow('Identifiants invalides.');
    expect(error.value).toBe('Identifiants invalides.');
    expect(authenticated.value).toBe(false);
  });

  it('logout repasse authenticated à false et rôle à null', async () => {
    postLoginMock.mockResolvedValue('viewer');
    postLogoutMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, logout, authenticated, role } = useAuth();
    await login('marees', 's3cret', true);
    await logout();
    expect(authenticated.value).toBe(false);
    expect(role.value).toBe(null);
  });

  it('un événement api-unauthorized repasse authenticated à false et rôle à null', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: true, role: 'admin' });
    const useAuth = await freshUseAuth();
    const { checkStatus, authenticated, role } = useAuth();
    await checkStatus();
    expect(authenticated.value).toBe(true);
    window.dispatchEvent(new CustomEvent('api-unauthorized'));
    expect(authenticated.value).toBe(false);
    expect(role.value).toBe(null);
  });
});
