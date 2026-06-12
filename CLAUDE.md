# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

CLI Node.js/TypeScript qui affiche les extrêmes de marée (pleine/basse mer) pour Port-Tudy
(île de Groix) en tableau par jour, avec les heures dérivées « Navihan ».

## Commandes

- `npm install` — installe les dépendances.
- `npm run dev -- -d 3` — exécute le CLI via `ts-node` (3 jours). Les arguments après `--` vont à yargs.
- `npm run build` — `tsc` puis copie `src/resources/` vers `dist/resources/` (les données
  sont lues au runtime via `fs`, donc la copie est nécessaire pour `npm start`).
- `npm start -- -d 3` — exécute le build (`node dist/index.js`).
- `npm install -g .` (ou `npm link`) — installe la commande globale `marees-port-tudy`,
  appelable depuis n'importe quel dossier. Exposée via le champ `bin` ; `src/index.ts` a le
  shebang `#!/usr/bin/env node`. Les ressources sont résolues via `__dirname` (donc présentes
  dans `dist/resources/` grâce à la copie du build) → la commande globale fonctionne hors du projet.
- `npm test` — tests Vitest (`vitest run`).
- Un seul test : `npx vitest run -t "should load tide extremes"`. Watch : `npx vitest`.

## Architecture

Flux : `src/index.ts` (yargs + logger pino) → `Maree.getTides(days)` → `formatTextOutput()`
ou `JSON.stringify` selon `-f text|json`.

Source de données unique : `src/resources/horaires_marees_port-tudy.json`, lu par
[src/lib/readTides.ts](src/lib/readTides.ts). **Pas de scraping, pas d'API distante.**

Point clé : le fichier contient déjà les **extrêmes** (chaque entrée est une pleine ou basse
mer avec `heure`, `hauteur`, et `coefficient` sur les pleines mers). Il n'y a donc aucune
détection d'extrêmes ni calcul de coefficient à partir de relevés horaires — le service
mappe directement chaque entrée.

Pipeline de [Maree.getTides()](src/service/Maree.ts) :
1. `readTides()` lit le JSON et le **normalise** (`normalize`) : le fichier mélange deux
   formes — clés date directes (`"2026-06-01": [...]`) et sections groupées par mois
   (`"septembre": { "2026-09-01": [...] }`). Les deux sont aplaties vers `{ date: entries }`.
2. Filtre les dates dans `[aujourd'hui, aujourd'hui + nbDays[` (comparaison de chaînes `YYYY-MM-DD`).
3. `toExtreme()` mappe chaque entrée → `{ time, height, type, coefficient, navihan }`, en
   ajoutant les heures Navihan par décalage fixe : basse mer +1h15
   (`NAVIHAN_BASSE_MER_OFFSET_HOURS`), à flot +2h40 (`NAVIHAN_A_FLOT_OFFSET_HOURS`).
   `formatNavihanTime()` gère le wrap autour de minuit.

Les entrées sans `heure` sont ignorées (le fichier en contient quelques-unes incomplètes).

Le rendu terminal utilise `cli-table3` + `chalk`.

## Fichiers clés

- [src/index.ts](src/index.ts) — entrée CLI, options `-d/--days` et `-f/--output-format`, logger pino.
- [src/service/Maree.ts](src/service/Maree.ts) — service (lecture via readTides, mapping, Navihan, rendu).
- [src/lib/readTides.ts](src/lib/readTides.ts) — lecture + normalisation du fichier de ressources.
- [src/resources/horaires_marees_port-tudy.json](src/resources/horaires_marees_port-tudy.json) — données de marées.
- [src/service/Maree.test.ts](src/service/Maree.test.ts) — tests Vitest (méthodes privées via `(maree as any)`).

## Conventions

- CommonJS (`"type": "commonjs"`, `module: commonjs`), TypeScript `strict`.
- Ne pas éditer `dist/` (généré, gitignoré). Modifier les sources `src/*.ts`.
- Pour changer les marées, éditer le fichier JSON de ressources.
- Les tests figent l'horloge (`vi.useFakeTimers().setSystemTime(...)`) car `getTides()`
  part de `new Date()` ; utiliser une date présente dans le fichier de données.
- `src/resources/tides.json` est un fichier non utilisé (format alternatif) — laissé en place.
