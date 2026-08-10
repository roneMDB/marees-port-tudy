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

test('la barre de filtres masque un type Navihan au clic (persisté)', async ({ page }) => {
  // Les bascules ont quitté la légende du tableau pour la barre de filtres (issue #10) ; la légende
  // subsiste mais n'est plus cliquable — elle se contente de barrer le type masqué.
  await page.getByRole('button', { name: 'Filtres' }).click();
  const pmToggle = page.locator('.tide-filters .navihan-toggle').filter({ hasText: 'Pleine mer' });
  await expect(pmToggle).toHaveAttribute('aria-pressed', 'true');

  await pmToggle.click();
  await expect(pmToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.locator('.navihan-legend .navihan-toggle').filter({ hasText: 'Pleine mer' })
  ).toHaveClass(/navihan-toggle--off/);

  // Le choix est persisté en localStorage, sous sa clé historique.
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

test('la barre de filtres réduit le tableau et persiste (issue #10)', async ({ page }) => {
  const rows = page.locator('table.tide-day-table tbody tr:not(.hidden-days-row)');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();

  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.getByLabel('Coefficient minimum').fill('95');
  await page.getByLabel('Coefficient minimum').blur();

  // Des jours sont masqués, et le tableau le dit plutôt que de se tronquer en silence.
  await expect(page.locator('.hidden-days-row')).toContainText('masqué');
  expect(await rows.count()).toBeLessThan(before);
  // Les basses mers restent : le filtre porte sur le jour, pas sur chaque marée.
  await expect(rows.first().locator('td[data-label="Basses mers"]')).not.toHaveText('—');

  // Préférence personnelle par navigateur, comme le thème ou la légende Navihan.
  const stored = await page.evaluate(() => localStorage.getItem('marees-tide-filters'));
  expect(stored).toContain('"minCoef":95');
});
