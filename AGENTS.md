# AGENTS

This repository is a small Node.js/TypeScript project for tide data at Port-Tudy.

## What the agent should know

- Primary source code lives under `src/`.
- Key files:
  - `src/service/Maree.ts` — main tide processing service.
  - `src/index.ts` — CLI entry point.
  - `src/mockData.ts` — local API mock payload.
- There are also companion JavaScript runtime files in `src/service/Maree.js` and `src/index.js`.
- The compiled output goes to `dist/`; avoid editing generated files directly.

## Build and test commands

- Install dependencies: `npm install`
- Build production code: `npm run build`
- Run the CLI in dev mode: `npm run dev`
- Run unit tests: `npm test`

## Project conventions

- Uses CommonJS module resolution (`type: commonjs`).
- Uses TypeScript for source and `ts-node` for development.
- Uses `pino` for logging, `yargs` for CLI parsing, and `axios` for HTTP.
- The output formatting is done in `Maree.formatTextOutput()`.

## When making changes

- Prefer editing `src/*.ts` for new logic.
- Keep `src/*.js` in sync if the runtime uses those JS files directly.
- Add or update tests in `src/service/Maree.test.ts`.
- Avoid touching `dist/`, `node_modules/`, or generated artifacts.

## Notes for the agent

- If the user asks to improve display or formatting, check `src/service/Maree.ts` and the CLI entrypoint.
- If the user asks about GitHub or repo setup, do not change the code; instead provide commands and guidance.
- This repository is small and self-contained; focus on the service logic and text/CLI output.
