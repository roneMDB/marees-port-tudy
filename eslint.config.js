import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import configPrettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Configuration ESLint « flat » couvrant les deux workspaces (server CommonJS/Node,
 * client ESM/Vue+navigateur). Prettier gère le style (désactivé côté ESLint via
 * `eslint-config-prettier`). Objectif : détecter les vrais problèmes, pas imposer un style.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'client/public/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    // Analyse TypeScript à l'intérieur des `<script>` des fichiers .vue.
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser }
    }
  },
  {
    // Client : navigateur (ESM).
    files: ['client/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    // Serveur : Node (CommonJS) → `require` idiomatique.
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    // Tests (Vitest) : globals de test + tolérance sur `any` (mocks, ex. fakeLogger).
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // Tests e2e Playwright + config : Node (process) + navigateur (callbacks `page.evaluate`).
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    // Assouplissements pragmatiques adaptés au projet (0 erreur sur le code existant).
    rules: {
      'vue/multi-word-component-names': 'off',
      // Ordre des attributs = purement stylistique (Prettier ne le gère pas) → bruit.
      'vue/attributes-order': 'off',
      // `filters` est un objet réactif passé délibérément et muté en place (design existant :
      // Dashboard → SettingsPanel) ; refactor emit hors périmètre.
      'vue/no-mutating-props': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  configPrettier
);
