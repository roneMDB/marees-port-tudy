# AGENTS

This repository is a small Node.js/TypeScript project for tide data at Port-Tudy.

## What the agent should know

- Primary source code lives under `src/`.
- Key files:
  - `src/service/Maree.ts` — main tide service (formatting + text/JSON output).
  - `src/lib/readTides.ts` — reads and normalizes the local resource file.
  - `src/index.ts` — CLI entry point.
  - `src/resources/horaires_marees_port-tudy.json` — tide data (single source of truth).
- The compiled output goes to `dist/`; avoid editing generated files directly.

## Build and test commands

- Install dependencies: `npm install`
- Build production code (compiles + copies `resources/` to `dist/`): `npm run build`
- Run the CLI in dev mode: `npm run dev -- -d 3`
- Run the compiled CLI: `npm start -- -d 3`
- Run unit tests: `npm test`
- Install globally as the `marees-port-tudy` command (callable from anywhere):
  `npm install -g .` (or `npm link` for development). Exposed via the `bin` field;
  `src/index.ts` has the `#!/usr/bin/env node` shebang.

## Project conventions

- Uses CommonJS module resolution (`type: commonjs`).
- Uses TypeScript for source and `ts-node` for development.
- Uses `pino` for logging, `yargs` for CLI parsing, `cli-table3` + `chalk` for output.
- Data is read from the JSON resource file — there is no scraping and no remote API.
- The resource file already contains the extremes (high/low tides); the service does not
  detect them from hourly samples.

## When making changes

- Prefer editing `src/*.ts` for new logic.
- Add or update tests in `src/service/Maree.test.ts`.
- Avoid touching `dist/`, `node_modules/`, or generated artifacts.
- To change the tide data, edit `src/resources/horaires_marees_port-tudy.json`.

## Notes for the agent

- If the user asks to improve display or formatting, check `Maree.formatTextOutput()`.
- If the user asks about GitHub or repo setup, do not change the code; provide commands and guidance.
- This repository is small and self-contained; focus on the service logic and text/CLI output.
