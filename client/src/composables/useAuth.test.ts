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
  afterEach(() => vi.restoreAllMocks());

  it('hydrate authRequired/authenticated via checkStatus', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: false });
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired, authenticated, checking } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(true);
    expect(authenticated.value).toBe(false);
    expect(checking.value).toBe(false);
  });

  it('checkStatus en échec réseau → authRequired=false (dégradation gracieuse)', async () => {
    getAuthStatusMock.mockRejectedValue(new Error('offline'));
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(false);
  });

  it('login réussi passe authenticated à true', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: false });
    postLoginMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, authenticated } = useAuth();
    await login('marees', 's3cret', true);
    expect(postLoginMock).toHaveBeenCalledWith('marees', 's3cret', true);
    expect(authenticated.value).toBe(true);
  });

  it('login en échec remonte le message dans error et relance', async () => {
    postLoginMock.mockRejectedValue(new Error('Identifiants invalides.'));
    const useAuth = await freshUseAuth();
    const { login, error, authenticated } = useAuth();
    await expect(login('marees', 'x', false)).rejects.toThrow('Identifiants invalides.');
    expect(error.value).toBe('Identifiants invalides.');
    expect(authenticated.value).toBe(false);
  });

  it('logout repasse authenticated à false', async () => {
    postLoginMock.mockResolvedValue(undefined);
    postLogoutMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, logout, authenticated } = useAuth();
    await login('marees', 's3cret', true);
    await logout();
    expect(authenticated.value).toBe(false);
  });

  it('un événement api-unauthorized repasse authenticated à false', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: true });
    const useAuth = await freshUseAuth();
    const { checkStatus, authenticated } = useAuth();
    await checkStatus();
    expect(authenticated.value).toBe(true);
    window.dispatchEvent(new CustomEvent('api-unauthorized'));
    expect(authenticated.value).toBe(false);
  });
});
