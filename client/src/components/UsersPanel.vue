<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { listUsers, createUser, updateUser, deleteUser, type User } from '../api/users';
import type { Role } from '../api/auth';
import { useAuth } from '../composables/useAuth';

const { user: currentUser } = useAuth();

const users = ref<User[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Formulaire d'ajout.
const newLogin = ref('');
const newPassword = ref('');
const newRole = ref<Role>('viewer');

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    users.value = await listUsers();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  error.value = null;
  try {
    await createUser(newLogin.value.trim(), newPassword.value, newRole.value);
    newLogin.value = '';
    newPassword.value = '';
    newRole.value = 'viewer';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function onChangeRole(u: User, role: Role): Promise<void> {
  error.value = null;
  try {
    await updateUser(u.id, { role });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    await load(); // resynchronise le select en cas de refus (ex. dernier admin)
  }
}

async function onResetPassword(u: User): Promise<void> {
  const password = window.prompt(`Nouveau mot de passe pour « ${u.login} » :`);
  if (!password) return;
  error.value = null;
  try {
    await updateUser(u.id, { password });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function onDelete(u: User): Promise<void> {
  if (!window.confirm(`Supprimer l'utilisateur « ${u.login} » ?`)) return;
  error.value = null;
  try {
    await deleteUser(u.id);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function roleLabel(role: Role): string {
  return role === 'admin' ? 'Administrateur' : 'Lecteur';
}

// Chargement au montage + à chaque ouverture du panneau (données fraîches).
let el: HTMLElement | null = null;
onMounted(() => {
  load();
  el = document.getElementById('usersOffcanvas');
  el?.addEventListener('show.bs.offcanvas', load);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', load));
</script>

<template>
  <div id="usersOffcanvas" class="offcanvas offcanvas-end" tabindex="-1" aria-labelledby="usersOffcanvasLabel">
    <div class="offcanvas-header border-bottom">
      <h5 id="usersOffcanvasLabel" class="offcanvas-title mb-0">
        <i class="bi bi-people me-1"></i> Utilisateurs
      </h5>
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>

    <div class="offcanvas-body">
      <div v-if="error" class="alert alert-warning py-2 small" role="alert">
        <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
      </div>

      <!-- Liste des comptes -->
      <div v-if="loading" class="text-center text-muted small py-3">
        <span class="spinner-border spinner-border-sm me-1"></span> Chargement…
      </div>
      <ul v-else class="list-group list-group-flush mb-4">
        <li v-for="u in users" :key="u.id" class="list-group-item px-0">
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold">{{ u.login }}</span>
            <span v-if="currentUser && currentUser.id === u.id" class="badge text-bg-light">vous</span>
            <div class="ms-auto d-flex align-items-center gap-2">
              <select
                class="form-select form-select-sm w-auto"
                :value="u.role"
                :aria-label="`Rôle de ${u.login}`"
                @change="onChangeRole(u, ($event.target as HTMLSelectElement).value as Role)"
              >
                <option value="viewer">Lecteur</option>
                <option value="admin">Administrateur</option>
              </select>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :title="`Réinitialiser le mot de passe de ${u.login}`"
                :aria-label="`Réinitialiser le mot de passe de ${u.login}`"
                @click="onResetPassword(u)"
              >
                <i class="bi bi-key"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                :title="`Supprimer ${u.login}`"
                :aria-label="`Supprimer ${u.login}`"
                @click="onDelete(u)"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="text-muted small">{{ roleLabel(u.role) }}</div>
        </li>
      </ul>

      <!-- Ajout d'un compte -->
      <h6 class="text-uppercase text-muted small fw-bold">Ajouter un utilisateur</h6>
      <form class="users-add-form" @submit.prevent="onCreate">
        <div class="mb-2">
          <label for="newLogin" class="form-label small fw-semibold">Identifiant</label>
          <input id="newLogin" name="newLogin" v-model="newLogin" type="text" class="form-control form-control-sm" required autocomplete="off" />
        </div>
        <div class="mb-2">
          <label for="newPassword" class="form-label small fw-semibold">Mot de passe</label>
          <input id="newPassword" name="newPassword" v-model="newPassword" type="text" class="form-control form-control-sm" required autocomplete="new-password" />
        </div>
        <div class="mb-3">
          <label for="newRole" class="form-label small fw-semibold">Rôle</label>
          <select id="newRole" name="newRole" v-model="newRole" class="form-select form-select-sm">
            <option value="viewer">Lecteur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="!newLogin.trim() || !newPassword">
          <i class="bi bi-person-plus me-1"></i> Ajouter
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 768px) {
  #usersOffcanvas {
    --bs-offcanvas-width: 460px;
  }
}
</style>
