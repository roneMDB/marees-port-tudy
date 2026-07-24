import { fetchJson } from './tides';
import type { Role } from './auth';

/** Utilisateur exposé par l'API (sans le hash de mot de passe). */
export interface User {
  id: number;
  login: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** GET /api/users — liste des comptes (rôle admin requis, 403 sinon). */
export function listUsers(): Promise<User[]> {
  return fetchJson<User[]>('/api/users', { credentials: 'same-origin' });
}

/** POST /api/users — crée un compte (rôle défaut `viewer`). */
export function createUser(login: string, password: string, role: Role = 'viewer'): Promise<User> {
  return fetchJson<User>('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ login, password, role })
  });
}

/** PUT /api/users/:id — met à jour le rôle et/ou le mot de passe. */
export function updateUser(id: number, patch: { role?: Role; password?: string }): Promise<User> {
  return fetchJson<User>(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(patch)
  });
}

/** DELETE /api/users/:id — supprime un compte (204, sans corps). */
export async function deleteUser(id: number): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api-unauthorized'));
    }
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* corps non-JSON */ }
    throw new Error(message);
  }
}

/** PUT /api/users/me/password — change son propre mot de passe. */
export function changeMyPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/api/users/me/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ currentPassword, newPassword })
  });
}
