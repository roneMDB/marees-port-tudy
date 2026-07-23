import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright — tests e2e du dashboard (Chromium, **headless**).
 *
 * WSL2 : tout tourne en headless (défaut Playwright), donc **aucune fenêtre de navigateur** n'est
 * ouverte et aucun serveur X n'est requis. Le rapport HTML est généré mais jamais ouvert
 * automatiquement (`open: 'never'`) — on le consulte au besoin depuis le navigateur Windows.
 * Ne PAS utiliser `--headed` / `--ui` sous WSL2 sans serveur X. Cf. `e2e/README.md`.
 *
 * `webServer` build et démarre l'app seule (`npm run build && npm start`) sur un **port dédié**
 * (3100 par défaut, surchargable via `E2E_PORT`) pour ne pas entrer en conflit avec un serveur de
 * dev déjà lancé sur :3000. L'auth est **explicitement désactivée** (mots de passe vides passés au
 * serveur), donc pas d'écran de login à franchir — de façon déterministe, quel que soit l'env local.
 */
const CI = !!process.env.CI;
const PORT = process.env.E2E_PORT || '3100';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm start',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: { PORT, APP_PASSWORD: '', ADMIN_PASSWORD: '' }
  }
});
