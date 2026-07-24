import { afterEach, describe, expect, it, vi } from 'vitest';
import { listUsers, createUser, updateUser, deleteUser, changeMyPassword } from './users';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('api/users', () => {
  it('listUsers → GET /api/users', async () => {
    const f = mockFetch(200, [{ id: 1, login: 'admin', role: 'admin', mustChangePassword: false }]);
    vi.stubGlobal('fetch', f);
    const users = await listUsers();
    expect(f).toHaveBeenCalledWith('/api/users', expect.anything());
    expect(users[0].login).toBe('admin');
  });

  it('createUser → POST /api/users avec le corps', async () => {
    const f = mockFetch(201, { id: 2, login: 'bob', role: 'viewer', mustChangePassword: false });
    vi.stubGlobal('fetch', f);
    const u = await createUser('bob', 'secret123', 'viewer');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/users');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ login: 'bob', password: 'secret123', role: 'viewer' });
    expect(u.id).toBe(2);
  });

  it('updateUser → PUT /api/users/:id', async () => {
    const f = mockFetch(200, { id: 2, login: 'bob', role: 'admin', mustChangePassword: false });
    vi.stubGlobal('fetch', f);
    await updateUser(2, { role: 'admin' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/users/2');
    expect(init.method).toBe('PUT');
  });

  it('deleteUser → DELETE /api/users/:id (tolère 204 sans corps)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('no body'); } } as any);
    vi.stubGlobal('fetch', f);
    await expect(deleteUser(2)).resolves.toBeUndefined();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/users/2');
    expect(init.method).toBe('DELETE');
  });

  it('deleteUser → remonte le message d’erreur serveur', async () => {
    const f = mockFetch(409, { error: 'Impossible de supprimer le dernier administrateur.' });
    vi.stubGlobal('fetch', f);
    await expect(deleteUser(1)).rejects.toThrow(/dernier administrateur/);
  });

  it('changeMyPassword → PUT /api/users/me/password', async () => {
    const f = mockFetch(200, { ok: true });
    vi.stubGlobal('fetch', f);
    await changeMyPassword('old', 'newnewnew');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/users/me/password');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ currentPassword: 'old', newPassword: 'newnewnew' });
  });
});
