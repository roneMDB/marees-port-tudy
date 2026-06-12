# marees-port-tudy

Un petit projet Node.js/TypeScript pour afficher les prévisions de marées (pleines et basses mers) du port de Port-Tudy (île de Groix).

## Objectif

Le projet lit les horaires de marées depuis un fichier de ressources local, puis génère une sortie en tableau par jour : coefficient, type (pleine/basse mer), hauteur, heure à Port-Tudy et heures dérivées « Navihan » (basse mer +1h15, à flot +2h40).

## Arborescence importante

- `src/`
  - `index.ts` : point d'entrée CLI en TypeScript
  - `service/Maree.ts` : logique métier (mise en forme, sortie texte/JSON)
  - `lib/readTides.ts` : lecture et normalisation du fichier de ressources
  - `resources/horaires_marees_port-tudy.json` : données de marées (source unique)
- `dist/` : sortie compilée TypeScript (générée par `npm run build`)
- `package.json` : scripts et dépendances
- `tsconfig.json` : configuration TypeScript

## Installation

```bash
npm install
```

## Commandes utiles

- `npm run dev -- -d 3` : exécute le CLI depuis `src/index.ts` avec `ts-node` (3 jours)
- `npm run build` : compile dans `dist/` et y copie les ressources
- `npm start -- -d 3` : exécute le code compilé
- `npm test` : exécute les tests unitaires avec Vitest

## Installation globale (commande disponible partout)

Le projet expose une commande `marees-port-tudy` (champ `bin` du `package.json`). Pour
l'appeler depuis n'importe quel dossier :

```bash
# Option 1 : installer globalement depuis le dossier du projet
npm install -g .

# Option 2 : lien de développement (suit les rebuilds)
npm link
```

Le script `prepare` lance `npm run build` automatiquement à l'installation (compilation +
copie des ressources dans `dist/`). Ensuite :

```bash
marees-port-tudy -d 3
marees-port-tudy -d 7 -f json
```

Pour désinstaller : `npm uninstall -g marees-port-tudy` (ou `npm unlink -g marees-port-tudy`).

## Options CLI

- `-d, --days` : nombre de jours à afficher (défaut : 3)
- `-f, --output-format` : `text` (défaut) ou `json`

## Source des données

Les horaires sont lus depuis `src/resources/horaires_marees_port-tudy.json`, qui contient
directement les extrêmes (pleines/basses mers). Deux formes sont acceptées et aplaties à la lecture :

- clés date directes : `"2026-06-01": [ { "maree": "haute", "heure": "05:59", "hauteur": "4.59", "coefficient": "71" }, ... ]`
- sections groupées par mois : `"septembre": { "2026-09-01": [ ... ] }`

Pour mettre à jour les marées, il suffit de remplacer le contenu de ce fichier.

## Notes

- CommonJS (`type: commonjs`).
- Rendu terminal : `cli-table3` (tableaux) + `chalk` (couleurs).
- `pino` pour le logging, `yargs` pour le parsing CLI.
- Les tests sont dans `src/service/Maree.test.ts` (`npm test`).
