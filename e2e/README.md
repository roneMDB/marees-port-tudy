# Tests e2e (Playwright)

Tests de bout en bout du dashboard, exécutés en **headless** sur **Chromium**.

## Prérequis (une fois)

```bash
npm ci
npx playwright install --with-deps chromium
```

`--with-deps` installe les bibliothèques système nécessaires au navigateur (peut demander les
droits root sur Linux/WSL2). Si tu n'as pas les droits, installe les dépendances système à part
puis lance `npx playwright install chromium`.

## Lancer les tests

```bash
npm run test:e2e            # build + start de l'app puis tests (headless)
npm run test:e2e:report     # ouvre le dernier rapport HTML (voir note WSL2 ci-dessous)
```

`playwright.config.ts` démarre l'app tout seul (`webServer` : `npm run build && npm start` sur
`http://localhost:3000`) ; il réutilise un serveur déjà lancé hors CI. L'auth est désactivée par
défaut (mots de passe vides), donc aucun écran de login.

## WSL2 — « souci d'ouverture du navigateur »

Tout est **headless** : aucune fenêtre de navigateur n'est ouverte, donc **aucun serveur X
(DISPLAY) n'est requis**. C'est le fonctionnement par défaut et le mode à utiliser sous WSL2.

- **Ne pas** utiliser `--headed` ni `--ui` sous WSL2 sans serveur X : ces modes tentent d'ouvrir
  une fenêtre et échouent (`Missing X server or $DISPLAY`).
- Le rapport HTML n'est **jamais** ouvert automatiquement (`open: 'never'`). Pour le consulter,
  ouvre `playwright-report/index.html` depuis le **navigateur Windows** (les fichiers WSL sont
  accessibles via `\\wsl$\...` ou `explorer.exe .`).
- Pour déboguer un échec sans navigateur : les **traces**, **captures d'écran** et **vidéos** sont
  produites automatiquement en cas d'échec (`test-results/`). Visualise une trace avec
  `npx playwright show-trace <chemin-trace.zip>` (nécessite un affichage) ou depuis le rapport HTML
  côté Windows.

## Ajouter un test

Les specs vivent dans `e2e/*.spec.ts`. Privilégier des sélecteurs stables (rôles, libellés,
`data-testid`) plutôt que des classes CSS susceptibles de changer.
