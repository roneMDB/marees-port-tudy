import { test, expect } from '@playwright/test';

/**
 * Smoke tests du dashboard, headless, sans login (auth désactivée par défaut : mots de passe
 * vides → rôle admin ouvert, cf. server/src/middleware/auth.ts). Chaque test part d'un contexte
 * navigateur neuf (localStorage vierge).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('affiche le tableau « Horaires par jour » avec au moins une journée', async ({ page }) => {
  await expect(page.getByText('Horaires par jour')).toBeVisible();
  // Au moins une ligne de jour dans le tableau des marées.
  await expect(page.locator('table.tide-day-table tbody tr').first()).toBeVisible();
});

test('le sélecteur de port bascule vers Étel', async ({ page }) => {
  // Attendre le chargement initial (Port-Tudy).
  await expect(page.locator('table.tide-day-table tbody tr').first()).toBeVisible();

  await page.getByLabel('Port affiché').selectOption({ label: 'Étel' });

  // L'en-tête des colonnes reflète le port sélectionné.
  await expect(page.locator('table.tide-day-table thead')).toContainText('Étel');
});

test('la légende Navihan masque un type au clic (persisté)', async ({ page }) => {
  const pmToggle = page.getByRole('button', { name: /Pleine mer/ });
  await expect(pmToggle).toHaveAttribute('aria-pressed', 'true');

  await pmToggle.click();
  await expect(pmToggle).toHaveAttribute('aria-pressed', 'false');

  // Le choix est persisté en localStorage.
  const stored = await page.evaluate(() => localStorage.getItem('marees-navihan-display'));
  expect(stored).toContain('"pm":false');
});

test('le bouton de thème bascule data-bs-theme', async ({ page }) => {
  const html = page.locator('html');
  const before = await html.getAttribute('data-bs-theme');

  await page.getByRole('button', { name: /thème/i }).click();

  const expected = before === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-bs-theme', expected);
});
