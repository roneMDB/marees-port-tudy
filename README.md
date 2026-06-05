# marees-port-tudy

Un petit projet Node.js/TypeScript pour récupérer et afficher des prévisions de marées pour le port de Port-Tudy.

## Objectif

Le projet calcule les extrêmes de marée (pleine et basse mer) à partir de données horaires, puis génère une sortie en tableau avec deux colonnes : `Port-Tudy` et `Navihan`.

## Arborescence importante

- `src/`
  - `index.ts` : point d’entrée CLI en TypeScript
  - `index.js` : version runtime JavaScript
  - `service/Maree.ts` : logique métier principale de récupération et formatage des marées
  - `service/Maree.js` : version runtime JavaScript
  - `mockData.ts` : données de test locales utilisées en mode mock
- `dist/` : sortie compilée TypeScript (générée par `npm run build`)
- `package.json` : scripts et dépendances
- `tsconfig.json` : configuration TypeScript

## Installation

```bash
npm install
```

## Commandes utiles

- `npm run build` : compile le code TypeScript dans `dist/`
- `npm run dev` : exécute le CLI directement depuis `src/index.ts` avec `ts-node`
- `npm test` : exécute les tests unitaires avec Vitest

## Utilisation

### Avec un vrai service

1. Ajouter une clé API dans un fichier `.env` :

```env
API_MAREE_KEY=ta_cle_api
```

2. Lancer le CLI :

```bash
npm run dev -- -d 3
```

### En mode mock

```bash
MOCK=true npm run dev -- -d 3
```

## Développement

- Les changements de logique métier se font dans `src/service/Maree.ts`.
- Le format de sortie texte se trouve dans `Maree.formatTextOutput()`.
- Si tu modifies la logique TypeScript, veille à mettre à jour `src/service/Maree.js` si le runtime utilise encore cette version.
- Ne modifie pas `dist/` manuellement : c’est un dossier généré.

## Tests

- Les tests sont dans `src/service/Maree.test.ts`.
- Utilise `npm test` pour vérifier rapidement les changements.

## Notes

- Le projet utilise CommonJS (`type: commonjs`) pour la compatibilité runtime.
- Le rendu terminal utilise `cli-table3` pour les tableaux et `chalk` pour la couleur.
- `pino` est utilisé pour le logging, `yargs` pour le parsing CLI.
