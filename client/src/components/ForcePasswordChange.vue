<script setup lang="ts">
import { ref } from 'vue';
import { changeMyPassword } from '../api/users';
import { useAuth } from '../composables/useAuth';

const { checkStatus, logout } = useAuth();

const current = ref('');
const next = ref('');
const confirm = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  error.value = null;
  if (next.value !== confirm.value) {
    error.value = 'La confirmation ne correspond pas au nouveau mot de passe.';
    return;
  }
  submitting.value = true;
  try {
    await changeMyPassword(current.value, next.value);
    // Réhydrate le statut : le serveur a effacé l'indicateur de changement forcé.
    await checkStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="force-pwd d-flex align-items-center justify-content-center min-vh-100 px-3">
    <div class="card force-pwd-card shadow-lg border-0">
      <div class="card-body p-4 p-sm-5">
        <div class="text-center mb-4">
          <i class="bi bi-shield-lock force-pwd-logo" aria-hidden="true"></i>
          <h1 class="h4 mt-2 mb-1">Changer votre mot de passe</h1>
          <p class="text-body-secondary small mb-0">
            Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
          </p>
        </div>

        <div v-if="error" class="alert alert-danger py-2 small" role="alert">
          <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
        </div>

        <form @submit.prevent="onSubmit" novalidate>
          <div class="mb-3">
            <label for="fpc-current" class="form-label">Mot de passe actuel</label>
            <input id="fpc-current" name="current" v-model="current" type="password" class="form-control" autocomplete="current-password" required />
          </div>
          <div class="mb-3">
            <label for="fpc-next" class="form-label">Nouveau mot de passe</label>
            <input id="fpc-next" name="next" v-model="next" type="password" class="form-control" autocomplete="new-password" required />
          </div>
          <div class="mb-4">
            <label for="fpc-confirm" class="form-label">Confirmer</label>
            <input id="fpc-confirm" name="confirm" v-model="confirm" type="password" class="form-control" autocomplete="new-password" required />
          </div>
          <button type="submit" class="btn btn-primary w-100 mb-2" :disabled="submitting">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ submitting ? 'Enregistrement…' : 'Valider' }}
          </button>
          <button type="button" class="btn btn-link w-100 text-body-secondary" @click="logout">
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.force-pwd {
  background: linear-gradient(160deg, #0d6efd 0%, #0aa2c0 60%, #20c997 100%);
}
:root[data-bs-theme='dark'] .force-pwd {
  background: linear-gradient(160deg, #0a2540 0%, #0b3a4a 60%, #0c3d33 100%);
}
.force-pwd-card {
  width: 100%;
  max-width: 26rem;
  border-radius: 1rem;
}
.force-pwd-logo {
  font-size: 2.75rem;
  color: #0d6efd;
}
:root[data-bs-theme='dark'] .force-pwd-logo {
  color: #4dabf7;
}
</style>
