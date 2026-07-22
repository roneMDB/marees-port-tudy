<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const { login, error, submitting } = useAuth();

const user = ref('');
const password = ref('');
const remember = ref(true);
const showPassword = ref(false);

async function onSubmit() {
  try {
    await login(user.value, password.value, remember.value);
  } catch {
    /* l'erreur est déjà exposée par useAuth().error ; on reste sur la mire */
  }
}
</script>

<template>
  <div class="login-screen d-flex align-items-center justify-content-center min-vh-100 px-3">
    <div class="card login-card shadow-lg border-0">
      <div class="card-body p-4 p-sm-5">
        <div class="text-center mb-4">
          <i class="bi bi-water login-logo" aria-hidden="true"></i>
          <h1 class="h4 mt-2 mb-1">Marées Navihan</h1>
          <p class="text-body-secondary small mb-0">Connexion requise</p>
        </div>

        <div v-if="error" class="alert alert-danger py-2 small" role="alert">
          <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
        </div>

        <form @submit.prevent="onSubmit" novalidate>
          <div class="mb-3">
            <label for="login-user" class="form-label">Identifiant</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-person"></i></span>
              <input
                id="login-user"
                v-model="user"
                type="text"
                class="form-control"
                autocomplete="username"
                required
                autofocus
              />
            </div>
          </div>

          <div class="mb-3">
            <label for="login-password" class="form-label">Mot de passe</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-control"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
              </button>
            </div>
          </div>

          <div class="form-check mb-4">
            <input id="login-remember" v-model="remember" class="form-check-input" type="checkbox" />
            <label for="login-remember" class="form-check-label">Se souvenir de moi</label>
          </div>

          <button type="submit" class="btn btn-primary w-100" :disabled="submitting">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ submitting ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fond en dégradé « marée » (teintes cohérentes avec la navbar de l'app). */
.login-screen {
  background: linear-gradient(160deg, #0d6efd 0%, #0aa2c0 60%, #20c997 100%);
}
:root[data-bs-theme='dark'] .login-screen {
  background: linear-gradient(160deg, #0a2540 0%, #0b3a4a 60%, #0c3d33 100%);
}
.login-card {
  width: 100%;
  max-width: 26rem;
  border-radius: 1rem;
}
.login-logo {
  font-size: 2.75rem;
  color: #0d6efd;
}
:root[data-bs-theme='dark'] .login-logo {
  color: #4dabf7;
}
</style>
