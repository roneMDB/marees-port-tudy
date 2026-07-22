# Mire d'authentification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le popup HTTP Basic natif par une mire de connexion Vue personnalisée, avec une session par cookie HMAC HttpOnly longue durée, sans dégrader la sécurité.

**Architecture:** Le serveur signe un jeton de session (HMAC-SHA256, secret dérivé de `APP_PASSWORD`) posé dans un cookie `HttpOnly`/`SameSite=Strict`. Le garde d'auth protège `/api` (cookie **ou** Basic accepté) mais laisse la coquille SPA publique ; des routes publiques `POST /api/login`, `POST /api/logout`, `GET /api/auth/status` pilotent la mire. Le client affiche `LoginScreen.vue` tant qu'il n'est pas authentifié.

**Tech Stack:** Express 4 + TypeScript (CommonJS, `crypto` natif, `res.cookie` intégré à Express — aucune nouvelle dépendance), Vue 3 `<script setup>` + Bootstrap 5.3, Vitest + supertest (serveur) / Vitest + @vue/test-utils + jsdom (client).

## Global Constraints

- **Aucune nouvelle dépendance npm** : `crypto` natif côté serveur, `res.cookie`/`res.clearCookie` (fournis par Express, pas besoin de `cookie-parser` pour écrire), parsing manuel de l'en-tête `Cookie` pour lire.
- **Rétro-compatibilité** : l'auth reste **désactivée** quand `APP_PASSWORD` est vide (dev/tests). Les tests existants qui ne posent pas `APP_PASSWORD` doivent rester verts.
- **En-tête Basic toujours accepté** en alternative au cookie (curl, sondes). **Plus jamais** de `WWW-Authenticate` renvoyé (pas de popup natif).
- **Durée cookie « se souvenir »** : `SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000` (60 jours). Sans « se souvenir » : cookie de session (pas de `Max-Age`).
- **Nom du cookie** : `marees_session`.
- **Endpoints publics (hors garde)** : `/api/health`, `/api/login`, `/api/logout`, `/api/auth/status`. Tout le reste de `/api` est protégé. Les restrictions LAN existantes (`PUT /api/settings`, `/api/stats`) sont inchangées.
- Serveur : CommonJS, `strict`. Client : ESM, `strict`. Ne pas éditer les `dist/`.

---

### Task 1: Serveur — jeton de session signé (`lib/session.ts`)

**Files:**
- Create: `server/src/lib/session.ts`
- Test: `server/src/lib/session.test.ts`

**Interfaces:**
- Consumes: rien (module pur, `crypto` natif).
- Produces :
  - `SESSION_COOKIE: string` (= `'marees_session'`)
  - `sessionSecret(): string` — `SESSION_SECRET` si défini, sinon `sha256(APP_PASSWORD)` en hex.
  - `signSession(ttlMs: number, now: number): string` → `"<expiryMs>.<sigBase64url>"`.
  - `verifySession(token: string | undefined, now: number): boolean`.
  - `parseCookies(header: string | undefined): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

Create `server/src/lib/session.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, parseCookies, signSession, verifySession } from './session';

// Secret déterministe pour des tests reproductibles.
beforeAll(() => { process.env.SESSION_SECRET = 'test-secret'; });
afterAll(() => { delete process.env.SESSION_SECRET; });

describe('lib/session', () => {
  const now = 1_700_000_000_000;

  it('expose le nom du cookie', () => {
    expect(SESSION_COOKIE).toBe('marees_session');
  });

  it('accepte un jeton valide non expiré', () => {
    const token = signSession(60_000, now);
    expect(verifySession(token, now + 30_000)).toBe(true);
  });

  it('refuse un jeton expiré', () => {
    const token = signSession(60_000, now);
    expect(verifySession(token, now + 60_001)).toBe(false);
  });

  it('refuse un jeton à la signature altérée', () => {
    const token = signSession(60_000, now);
    const [payload] = token.split('.');
    expect(verifySession(`${payload}.deadbeef`, now)).toBe(false);
  });

  it('refuse un jeton dont la charge utile a été modifiée', () => {
    const token = signSession(60_000, now);
    const [, sig] = token.split('.');
    const forgedExpiry = String(now + 10 ** 12);
    expect(verifySession(`${forgedExpiry}.${sig}`, now)).toBe(false);
  });

  it('refuse un jeton malformé ou absent', () => {
    expect(verifySession(undefined, now)).toBe(false);
    expect(verifySession('', now)).toBe(false);
    expect(verifySession('pas-un-jeton', now)).toBe(false);
  });

  it('parse les cookies en paires clé/valeur', () => {
    expect(parseCookies('a=1; marees_session=xyz; b=2')).toMatchObject({
      a: '1', marees_session: 'xyz', b: '2'
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Write minimal implementation**

Create `server/src/lib/session.ts`:

```typescript
import { createHash, createHmac, timingSafeEqual } from 'crypto';

/** Nom du cookie de session posé après connexion. */
export const SESSION_COOKIE = 'marees_session';

/**
 * Secret de signature du jeton. Priorité à `SESSION_SECRET` (override explicite) ; sinon dérivé
 * de `APP_PASSWORD` — stable entre redémarrages **et** changer le mot de passe révoque toutes
 * les sessions. Lu à chaque appel (pas de capture à l'import) pour rester testable.
 */
export function sessionSecret(): string {
  const override = process.env.SESSION_SECRET;
  if (override && override.length > 0) return override;
  return createHash('sha256').update(process.env.APP_PASSWORD || '').digest('hex');
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

/** Fabrique un jeton `"<expiryMs>.<signature>"` valable `ttlMs` à partir de `now`. */
export function signSession(ttlMs: number, now: number): string {
  const payload = String(now + ttlMs);
  return `${payload}.${sign(payload)}`;
}

/** Vérifie la signature (temps constant) et la non-expiration. Robuste aux entrées malformées. */
export function verifySession(token: string | undefined, now: number): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > now;
}

/** Parse l'en-tête `Cookie` en dictionnaire (valeurs non décodées, suffisant pour nos jetons). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/session.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/session.ts server/src/lib/session.test.ts
git commit -m "feat(auth): jeton de session signé HMAC (lib/session)"
```

---

### Task 2: Serveur — garde cookie-ou-Basic sans popup (`middleware/auth.ts`)

**Files:**
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/security.test.ts` (retire l'attente de `WWW-Authenticate`, ajoute le cas cookie)

**Interfaces:**
- Consumes: `verifySession`, `parseCookies`, `SESSION_COOKIE` (Task 1).
- Produces :
  - `basicAuth()` — inchangé de signature (middleware Express), mais : ne garde que `/api` (hors publics), accepte cookie **ou** Basic, **ne pose plus** `WWW-Authenticate`.
  - `verifyCredentials(user: string, password: string): boolean` (exporté, réutilisé par la route login).
  - `authEnabled(): boolean` (exporté).

- [ ] **Step 1: Mettre à jour le test de sécurité (rouge)**

Dans `server/src/security.test.ts`, remplacer le test `'renvoie 401 (+ WWW-Authenticate) sans identifiants'` par :

```typescript
  it('renvoie 401 SANS WWW-Authenticate (pas de popup natif) sans identifiants', async () => {
    const res = await request(app).get('/api/tides/meta');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
```

Et ajouter, dans le même `describe('sécurité — authentification Basic', …)` (le jeton est importé dynamiquement dans le test, pas d'import en tête à ajouter) :

```typescript
  it('autorise avec un cookie de session valide', async () => {
    const { signSession, SESSION_COOKIE } = await import('./lib/session');
    const token = signSession(60_000, Date.now());
    const res = await request(app)
      .get('/api/tides/meta')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `cd server && npx vitest run src/security.test.ts`
Expected: FAIL — l'ancien code renvoie encore `WWW-Authenticate`, et le cookie n'est pas encore reconnu.

- [ ] **Step 3: Réécrire `middleware/auth.ts`**

Remplacer intégralement `server/src/middleware/auth.ts` :

```typescript
import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';

/** Chemins `/api` accessibles sans authentification (santé + endpoints de la mire). */
const PUBLIC_API = new Set(['/api/health', '/api/login', '/api/logout', '/api/auth/status']);

/** Comparaison à temps constant (le test de longueur ne fuit qu'une info négligeable). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** L'authentification est active dès que `APP_PASSWORD` est renseigné. */
export function authEnabled(): boolean {
  return (process.env.APP_PASSWORD || '').length > 0;
}

/** Vérifie un couple identifiant/mot de passe contre `APP_USER`/`APP_PASSWORD`. */
export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.APP_USER || 'marees';
  const expectedPassword = process.env.APP_PASSWORD || '';
  return safeEqual(user, expectedUser) && safeEqual(password, expectedPassword);
}

/** Extrait et valide un en-tête `Authorization: Basic ...`. */
function basicHeaderMatches(header: string | undefined): boolean {
  const [scheme, encoded] = (header || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  return verifyCredentials(decoded.slice(0, sep), decoded.slice(sep + 1));
}

/**
 * Garde d'authentification **optionnel** (actif si `APP_PASSWORD`). Protège uniquement `/api`
 * (hors `PUBLIC_API`) : la coquille SPA reste publique pour afficher la mire. Accepte un
 * **cookie de session valide** ou un **en-tête Basic** (rétro-compat curl/sonde). Ne renvoie
 * **plus** `WWW-Authenticate` afin d'éviter le popup natif du navigateur.
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authEnabled()) return next();
    if (!req.path.startsWith('/api')) return next(); // coquille SPA publique
    if (PUBLIC_API.has(req.path)) return next();

    const cookies = parseCookies(req.headers.cookie);
    if (verifySession(cookies[SESSION_COOKIE], Date.now())) return next();
    if (basicHeaderMatches(req.headers.authorization)) return next();

    res.status(401).json({ error: 'Authentification requise.' });
  };
}
```

Note : `authEnabled()` est désormais évalué **par requête** (plus de capture à la construction). C'est sans effet pour les tests existants (l'env est posé avant `createApp`).

- [ ] **Step 4: Lancer les tests de sécurité**

Run: `cd server && npx vitest run src/security.test.ts`
Expected: PASS (tous, y compris le nouveau cas cookie et l'absence de `WWW-Authenticate`).

- [ ] **Step 5: Vérifier la non-régression globale serveur**

Run: `cd server && npx vitest run`
Expected: PASS (aucune régression — les suites sans `APP_PASSWORD` restent en auth désactivée).

- [ ] **Step 6: Commit**

```bash
git add server/src/middleware/auth.ts server/src/security.test.ts
git commit -m "feat(auth): garde /api cookie-ou-Basic, coquille SPA publique, sans WWW-Authenticate"
```

---

### Task 3: Serveur — routes login/logout/status + câblage `app.ts`

**Files:**
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `signSession`, `SESSION_COOKIE` (Task 1) ; `authEnabled`, `verifyCredentials` (Task 2).
- Produces :
  - `createAuthRouter(): Router` monté sous `/api` : `POST /login`, `POST /logout`, `GET /auth/status`.
  - Câblage dans `createApp` : rate-limiter login + routeur auth (public) avant les routeurs protégés.

- [ ] **Step 1: Write the failing test**

Create `server/src/routes/auth.test.ts` :

```typescript
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-auth-test-${process.pid}`);
process.env.DATA_DIR = dataDir;
process.env.APP_USER = 'marees';
process.env.APP_PASSWORD = 's3cret';

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
let app: Application;

beforeAll(async () => {
  const { ensureDataDir } = await import('../config/dataDir');
  const { createApp } = await import('../app');
  ensureDataDir();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.APP_USER;
  delete process.env.APP_PASSWORD;
});

describe('routes auth', () => {
  it('GET /api/auth/status reflète authRequired sans cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authRequired: true, authenticated: false });
  });

  it('POST /api/login refuse de mauvais identifiants (401, pas de cookie)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /api/login pose un cookie de session sur bons identifiants', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret', remember: false });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/marees_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i); // pas de « se souvenir » → cookie de session
  });

  it('POST /api/login avec remember pose un cookie persistant (Max-Age)', async () => {
    const res = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret', remember: true });
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });

  it('le cookie posé ouvre les routes protégées', async () => {
    const login = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
    const cookie = (login.headers['set-cookie'] || [])[0];
    const res = await request(app).get('/api/tides/meta').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/auth/status voit authenticated=true avec le cookie', async () => {
    const login = await request(app).post('/api/login').send({ user: 'marees', password: 's3cret' });
    const cookie = (login.headers['set-cookie'] || [])[0];
    const res = await request(app).get('/api/auth/status').set('Cookie', cookie);
    expect(res.body).toEqual({ authRequired: true, authenticated: true });
  });

  it('POST /api/logout efface le cookie', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || [])[0] || '';
    expect(cookie).toMatch(/marees_session=;?/);
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'` (routeur inexistant) puis 404 sur les routes.

- [ ] **Step 3: Créer `server/src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import { SESSION_COOKIE, parseCookies, signSession, verifySession } from '../lib/session';
import { authEnabled, verifyCredentials } from '../middleware/auth';

/** Durée du cookie « se souvenir de moi » : 60 jours. */
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Routeur d'authentification (monté sous `/api`, **routes publiques**) :
 * - `POST /login`  → vérifie les identifiants, pose le cookie de session signé.
 * - `POST /logout` → efface le cookie.
 * - `GET  /auth/status` → `{ authRequired, authenticated }` (résout le poule-œuf côté client).
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.get('/auth/status', (req, res) => {
    const authRequired = authEnabled();
    const cookies = parseCookies(req.headers.cookie);
    const authenticated = !authRequired || verifySession(cookies[SESSION_COOKIE], Date.now());
    res.json({ authRequired, authenticated });
  });

  router.post('/login', (req, res) => {
    if (!authEnabled()) return res.json({ ok: true }); // auth désactivée : no-op
    const { user, password, remember } = req.body ?? {};
    if (typeof user !== 'string' || typeof password !== 'string' || !verifyCredentials(user, password)) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const token = signSession(SESSION_TTL_MS, Date.now());
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure, // HTTPS via reverse proxy (trust proxy + X-Forwarded-Proto)
      path: '/',
      ...(remember ? { maxAge: SESSION_TTL_MS } : {}) // sinon cookie de session
    });
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Câbler dans `server/src/app.ts`**

Ajouter l'import en tête (près des autres routeurs) :

```typescript
import { createAuthRouter } from './routes/auth';
```

Ajouter un rate-limiter strict dédié au login, juste après le rate-limiter météo (ligne ~37) :

```typescript
  // Anti-brute-force sur la connexion (endpoint public) : 10 tentatives / 5 min par IP.
  app.use('/api/login', rateLimit({ windowMs: FIVE_MINUTES, max: 10, standardHeaders: true, legacyHeaders: false }));
```

Réordonner le bloc auth : `express.json()` doit précéder le routeur auth (lecture du corps), et le routeur auth (public) doit être monté **avant** le garde. Remplacer :

```typescript
  // Authentification Basic optionnelle (activée par `APP_PASSWORD`).
  app.use(basicAuth());

  // Journalisation des ouvertures de l'app (accès), après l'auth.
  app.use(accessLog());

  app.use(express.json());
```

par :

```typescript
  app.use(express.json());

  // Routes publiques de la mire (login/logout/status) — AVANT le garde.
  app.use('/api', createAuthRouter());

  // Garde d'authentification optionnel (activé par `APP_PASSWORD`) : protège `/api` hors publics,
  // laisse la coquille SPA publique.
  app.use(basicAuth());

  // Journalisation des ouvertures de l'app (accès), après l'auth.
  app.use(accessLog());
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/routes/auth.test.ts src/security.test.ts`
Expected: PASS (routes auth + sécurité).

- [ ] **Step 6: Non-régression serveur complète**

Run: `cd server && npx vitest run`
Expected: PASS (toutes suites).

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/auth.ts server/src/routes/auth.test.ts server/src/app.ts
git commit -m "feat(auth): routes login/logout/status + rate-limit login + câblage app"
```

---

### Task 4: Client — API + composable d'authentification, dispatch 401

**Files:**
- Create: `client/src/api/auth.ts`
- Create: `client/src/composables/useAuth.ts`
- Modify: `client/src/api/tides.ts` (émettre `api-unauthorized` sur 401)
- Test: `client/src/composables/useAuth.test.ts`

**Interfaces:**
- Consumes: `fetch` (jsdom), endpoints Task 3.
- Produces :
  - `api/auth.ts` : `getAuthStatus(): Promise<{ authRequired: boolean; authenticated: boolean }>`, `postLogin(user: string, password: string, remember: boolean): Promise<void>`, `postLogout(): Promise<void>`.
  - `useAuth()` → `{ authRequired: Ref<boolean>, authenticated: Ref<boolean>, checking: Ref<boolean>, submitting: Ref<boolean>, error: Ref<string|null>, checkStatus(): Promise<void>, login(user, password, remember): Promise<void>, logout(): Promise<void> }` (singleton).

- [ ] **Step 1: Write the failing test**

Create `client/src/composables/useAuth.test.ts` :

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthStatusMock = vi.fn();
const postLoginMock = vi.fn();
const postLogoutMock = vi.fn();

vi.mock('../api/auth', () => ({
  getAuthStatus: () => getAuthStatusMock(),
  postLogin: (u: string, p: string, r: boolean) => postLoginMock(u, p, r),
  postLogout: () => postLogoutMock()
}));

async function freshUseAuth() {
  vi.resetModules();
  return (await import('./useAuth')).useAuth;
}

describe('useAuth', () => {
  beforeEach(() => {
    getAuthStatusMock.mockReset();
    postLoginMock.mockReset();
    postLogoutMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('hydrate authRequired/authenticated via checkStatus', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: false });
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired, authenticated, checking } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(true);
    expect(authenticated.value).toBe(false);
    expect(checking.value).toBe(false);
  });

  it('checkStatus en échec réseau → authRequired=false (dégradation gracieuse)', async () => {
    getAuthStatusMock.mockRejectedValue(new Error('offline'));
    const useAuth = await freshUseAuth();
    const { checkStatus, authRequired } = useAuth();
    await checkStatus();
    expect(authRequired.value).toBe(false);
  });

  it('login réussi passe authenticated à true', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: false });
    postLoginMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, authenticated } = useAuth();
    await login('marees', 's3cret', true);
    expect(postLoginMock).toHaveBeenCalledWith('marees', 's3cret', true);
    expect(authenticated.value).toBe(true);
  });

  it('login en échec remonte le message dans error et relance', async () => {
    postLoginMock.mockRejectedValue(new Error('Identifiants invalides.'));
    const useAuth = await freshUseAuth();
    const { login, error, authenticated } = useAuth();
    await expect(login('marees', 'x', false)).rejects.toThrow('Identifiants invalides.');
    expect(error.value).toBe('Identifiants invalides.');
    expect(authenticated.value).toBe(false);
  });

  it('logout repasse authenticated à false', async () => {
    postLoginMock.mockResolvedValue(undefined);
    postLogoutMock.mockResolvedValue(undefined);
    const useAuth = await freshUseAuth();
    const { login, logout, authenticated } = useAuth();
    await login('marees', 's3cret', true);
    await logout();
    expect(authenticated.value).toBe(false);
  });

  it('un événement api-unauthorized repasse authenticated à false', async () => {
    getAuthStatusMock.mockResolvedValue({ authRequired: true, authenticated: true });
    const useAuth = await freshUseAuth();
    const { checkStatus, authenticated } = useAuth();
    await checkStatus();
    expect(authenticated.value).toBe(true);
    window.dispatchEvent(new CustomEvent('api-unauthorized'));
    expect(authenticated.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/composables/useAuth.test.ts`
Expected: FAIL — `Cannot find module './useAuth'`.

- [ ] **Step 3: Créer `client/src/api/auth.ts`**

```typescript
export interface AuthStatus {
  authRequired: boolean;
  authenticated: boolean;
}

/** GET /api/auth/status — l'app doit-elle afficher la mire ? déjà authentifié ? */
export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json() as Promise<AuthStatus>;
}

/** POST /api/login — pose le cookie de session côté serveur en cas de succès. */
export async function postLogin(user: string, password: string, remember: boolean): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ user, password, remember })
  });
  if (!res.ok) {
    let message = 'Identifiants invalides.';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* corps non-JSON */ }
    throw new Error(message);
  }
}

/** POST /api/logout — efface le cookie de session. */
export async function postLogout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}
```

- [ ] **Step 4: Créer `client/src/composables/useAuth.ts`**

```typescript
import { ref } from 'vue';
import { getAuthStatus, postLogin, postLogout } from '../api/auth';

/**
 * État d'authentification (singleton). `authRequired` dit si le serveur exige une connexion ;
 * `authenticated` si la session courante est valide. La mire (`LoginScreen`) s'affiche tant que
 * `authRequired && !authenticated`. Écoute `api-unauthorized` (émis par `fetchJson` sur 401) pour
 * retomber sur la mire quand une session expire.
 */
const authRequired = ref(false);
const authenticated = ref(false);
const checking = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);

let listenerBound = false;
function bindUnauthorized(): void {
  if (listenerBound || typeof window === 'undefined') return;
  listenerBound = true;
  window.addEventListener('api-unauthorized', () => {
    if (authRequired.value) authenticated.value = false;
  });
}

async function checkStatus(): Promise<void> {
  try {
    const s = await getAuthStatus();
    authRequired.value = s.authRequired;
    authenticated.value = s.authenticated;
  } catch {
    // Statut injoignable : on ne bloque pas l'app (la protection réelle reste serveur).
    authRequired.value = false;
  } finally {
    checking.value = false;
  }
}

async function login(user: string, password: string, remember: boolean): Promise<void> {
  submitting.value = true;
  error.value = null;
  try {
    await postLogin(user, password, remember);
    authenticated.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    submitting.value = false;
  }
}

async function logout(): Promise<void> {
  await postLogout();
  authenticated.value = false;
}

export function useAuth() {
  bindUnauthorized();
  return { authRequired, authenticated, checking, submitting, error, checkStatus, login, logout };
}
```

- [ ] **Step 5: Émettre `api-unauthorized` sur 401 dans `client/src/api/tides.ts`**

Dans `fetchJson`, juste après `if (!res.ok) {` et avant la construction du message :

```typescript
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api-unauthorized'));
    }
    let message = `Erreur ${res.status}`;
```

(le reste de `fetchJson` est inchangé.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx vitest run src/composables/useAuth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/api/auth.ts client/src/composables/useAuth.ts client/src/composables/useAuth.test.ts client/src/api/tides.ts
git commit -m "feat(auth): API + composable useAuth côté client, dispatch 401"
```

---

### Task 5: Client — composant `LoginScreen.vue`

**Files:**
- Create: `client/src/components/LoginScreen.vue`
- Test: `client/src/components/LoginScreen.test.ts`

**Interfaces:**
- Consumes: `useAuth()` (Task 4).
- Produces : composant sans prop ; appelle `useAuth().login(...)` à la soumission. Aucun émit requis (App réagit à `authenticated`).

- [ ] **Step 1: Write the failing test**

Create `client/src/components/LoginScreen.test.ts` :

```typescript
import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

const loginMock = vi.fn();
// De vrais refs : le template Vue ne déballe (unwrap) que les refs réels.
const errorRef = ref<string | null>(null);
const submittingRef = ref(false);

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    login: (u: string, p: string, r: boolean) => loginMock(u, p, r),
    error: errorRef,
    submitting: submittingRef
  })
}));

import LoginScreen from './LoginScreen.vue';

describe('LoginScreen', () => {
  it('affiche les champs identifiant et mot de passe', () => {
    const wrapper = mount(LoginScreen);
    expect(wrapper.find('input#login-user').exists()).toBe(true);
    expect(wrapper.find('input#login-password').exists()).toBe(true);
    expect(wrapper.text()).toContain('Marées Navihan');
  });

  it('soumet les identifiants saisis via useAuth.login', async () => {
    loginMock.mockResolvedValue(undefined);
    const wrapper = mount(LoginScreen);
    await wrapper.find('input#login-user').setValue('marees');
    await wrapper.find('input#login-password').setValue('s3cret');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(loginMock).toHaveBeenCalledWith('marees', 's3cret', true); // « se souvenir » coché par défaut
  });

  it('affiche le message d\'erreur du composable', () => {
    errorRef.value = 'Identifiants invalides.';
    const wrapper = mount(LoginScreen);
    expect(wrapper.find('.alert-danger').text()).toContain('Identifiants invalides.');
    errorRef.value = null;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/LoginScreen.test.ts`
Expected: FAIL — `Failed to resolve import "./LoginScreen.vue"`.

- [ ] **Step 3: Créer `client/src/components/LoginScreen.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '../composables/useAuth';

const { login, error, submitting } = useAuth();

const user = ref('');
const password = ref('');
const remember = ref(true);
const showPassword = ref(false);

async function onSubmit() {
  try {
    await login(user.value, password.value, remember.value);
  } catch {
    /* l'erreur est déjà exposée par useAuth().error ; on reste sur la mire */
  }
}
</script>

<template>
  <div class="login-screen d-flex align-items-center justify-content-center min-vh-100 px-3">
    <div class="card login-card shadow-lg border-0">
      <div class="card-body p-4 p-sm-5">
        <div class="text-center mb-4">
          <i class="bi bi-water login-logo" aria-hidden="true"></i>
          <h1 class="h4 mt-2 mb-1">Marées Navihan</h1>
          <p class="text-body-secondary small mb-0">Connexion requise</p>
        </div>

        <div v-if="error" class="alert alert-danger py-2 small" role="alert">
          <i class="bi bi-exclamation-triangle me-1"></i>{{ error }}
        </div>

        <form @submit.prevent="onSubmit" novalidate>
          <div class="mb-3">
            <label for="login-user" class="form-label">Identifiant</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-person"></i></span>
              <input
                id="login-user"
                v-model="user"
                type="text"
                class="form-control"
                autocomplete="username"
                required
                autofocus
              />
            </div>
          </div>

          <div class="mb-3">
            <label for="login-password" class="form-label">Mot de passe</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-control"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
              </button>
            </div>
          </div>

          <div class="form-check mb-4">
            <input id="login-remember" v-model="remember" class="form-check-input" type="checkbox" />
            <label for="login-remember" class="form-check-label">Se souvenir de moi</label>
          </div>

          <button type="submit" class="btn btn-primary w-100" :disabled="submitting">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ submitting ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fond en dégradé « marée » (teintes cohérentes avec la navbar de l'app). */
.login-screen {
  background: linear-gradient(160deg, #0d6efd 0%, #0aa2c0 60%, #20c997 100%);
}
:root[data-bs-theme='dark'] .login-screen {
  background: linear-gradient(160deg, #0a2540 0%, #0b3a4a 60%, #0c3d33 100%);
}
.login-card {
  width: 100%;
  max-width: 26rem;
  border-radius: 1rem;
}
.login-logo {
  font-size: 2.75rem;
  color: #0d6efd;
}
:root[data-bs-theme='dark'] .login-logo {
  color: #4dabf7;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/LoginScreen.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/LoginScreen.vue client/src/components/LoginScreen.test.ts
git commit -m "feat(auth): jolie mire de connexion (LoginScreen.vue)"
```

---

### Task 6: Client — intégration dans `App.vue` (gating + déconnexion)

**Files:**
- Modify: `client/src/App.vue`

**Interfaces:**
- Consumes: `useAuth()` (Task 4), `LoginScreen.vue` (Task 5), composables existants (`useSite`, `useContext`).
- Produces : rendu conditionnel — mire tant que `authRequired && !authenticated` ; app + bouton Déconnexion sinon.

- [ ] **Step 1: Modifier le `<script setup>` de `App.vue`**

Remplacer le bloc script (lignes 1-21 actuelles) par :

```typescript
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import Dashboard from './views/Dashboard.vue';
import StatsPanel from './components/StatsPanel.vue';
import LoginScreen from './components/LoginScreen.vue';
import { useTheme } from './composables/useTheme';
import { useClock } from './composables/useClock';
import { useSite } from './composables/useSite';
import { useContext } from './composables/useContext';
import { useAuth } from './composables/useAuth';

const { isDark, toggle } = useTheme();
const { clock } = useClock();
const { sites, siteId, load: loadSites } = useSite();

// Panneaux réservés : Stats en réseau local, Réglages seulement si éditables (verrou serveur réel).
const { local: isLocal, canEditSettings, load: loadContext } = useContext();

// Authentification : la mire s'affiche tant qu'une connexion est requise et non satisfaite.
const { authRequired, authenticated, checking, checkStatus, logout } = useAuth();
const showApp = computed(() => !authRequired.value || authenticated.value);

let appDataLoaded = false;
function ensureAppData() {
  if (appDataLoaded) return;
  appDataLoaded = true;
  loadSites();
  loadContext();
}

onMounted(async () => {
  await checkStatus();
  if (showApp.value) ensureAppData();
});

// Après une connexion réussie, charger les données de l'app.
watch(showApp, (ok) => { if (ok) ensureAppData(); });
</script>
```

- [ ] **Step 2: Adapter le `<template>` de `App.vue`**

Envelopper le contenu et ajouter les états. Remplacer tout le `<template>` (lignes 23-89 actuelles) par :

```html
<template>
  <!-- Vérification du statut d'auth au démarrage -->
  <div v-if="checking" class="d-flex align-items-center justify-content-center min-vh-100">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Chargement…</span>
    </div>
  </div>

  <!-- Mire de connexion -->
  <LoginScreen v-else-if="!showApp" />

  <!-- Application -->
  <template v-else>
    <nav class="navbar navbar-dark app-navbar shadow-sm">
      <div class="container-xxl">
        <span class="navbar-brand mb-0 h1">
          <i class="bi bi-water me-2"></i>Marées Navihan
          <small class="fw-normal opacity-75">· Belz</small>
        </span>
        <div class="d-flex align-items-center gap-3">
          <span class="navbar-text app-clock text-capitalize d-none d-sm-inline">
            <i class="bi bi-clock me-1"></i>{{ clock }}
          </span>
          <div class="d-flex align-items-center">
            <label for="siteSelect" class="visually-hidden">Port</label>
            <i class="bi bi-geo-alt-fill text-white-50 me-1" aria-hidden="true"></i>
            <select
              id="siteSelect"
              class="form-select form-select-sm app-site-select"
              v-model="siteId"
              title="Port affiché"
              aria-label="Port affiché"
            >
              <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <button
            v-if="isLocal"
            type="button"
            class="btn btn-outline-light btn-sm"
            data-bs-toggle="offcanvas"
            data-bs-target="#statsOffcanvas"
            aria-controls="statsOffcanvas"
            title="Statistiques d'accès"
            aria-label="Statistiques d'accès"
          >
            <i class="bi bi-bar-chart-line"></i>
          </button>
          <button
            v-if="canEditSettings"
            type="button"
            class="btn btn-outline-light btn-sm"
            data-bs-toggle="offcanvas"
            data-bs-target="#settingsOffcanvas"
            aria-controls="settingsOffcanvas"
            title="Réglages & filtres"
            aria-label="Réglages & filtres"
          >
            <i class="bi bi-sliders"></i>
          </button>
          <button
            type="button"
            class="btn btn-outline-light btn-sm"
            :title="isDark ? 'Passer en thème clair' : 'Passer en thème sombre'"
            :aria-label="isDark ? 'Passer en thème clair' : 'Passer en thème sombre'"
            @click="toggle"
          >
            <i :class="isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill'"></i>
          </button>
          <button
            v-if="authRequired"
            type="button"
            class="btn btn-outline-light btn-sm"
            title="Se déconnecter"
            aria-label="Se déconnecter"
            @click="logout"
          >
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </div>
    </nav>

    <main class="bg-body-tertiary min-vh-100 overflow-x-hidden">
      <Dashboard />
    </main>

    <StatsPanel v-if="isLocal" />
  </template>
</template>
```

(Le bloc `<style scoped>` existant reste inchangé.)

- [ ] **Step 3: Vérifier le type-check et les tests client**

Run: `cd client && npm run type-check && npx vitest run`
Expected: PASS (aucune erreur de types, toutes les suites vertes).

- [ ] **Step 4: Commit**

```bash
git add client/src/App.vue
git commit -m "feat(auth): afficher la mire tant que non connecté + bouton déconnexion"
```

---

### Task 7: Vérification manuelle bout-en-bout (prod-like)

**Files:** aucun (validation). Les scripts `dev:auth` / `start:auth` existent déjà dans `package.json`.

- [ ] **Step 1: Build + démarrage avec authentification**

Run:
```bash
npm run build
npm run start:auth   # identifiants par défaut : marees / marees-dev
```

- [ ] **Step 2: Vérifier la coquille publique et l'API protégée**

Run (dans un second terminal) :
```bash
curl -i -s http://localhost:3000/ | head -n 1                 # attendu : HTTP/1.1 200
curl -i -s http://localhost:3000/api/tides/meta | head -n 1   # attendu : HTTP/1.1 401
```

- [ ] **Step 3: Vérifier login → cookie → accès**

Run:
```bash
curl -i -s -c /tmp/marees-cookies.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"user":"marees","password":"marees-dev","remember":true}' | grep -i 'set-cookie'
# attendu : Set-Cookie: marees_session=...; Path=/; ...; HttpOnly; SameSite=Strict; Max-Age=...

curl -s -b /tmp/marees-cookies.txt http://localhost:3000/api/tides/meta | head -c 60
# attendu : du JSON (200), pas d'erreur 401
```

- [ ] **Step 4: Vérifier le rate-limit login (429) et le mauvais mot de passe**

Run:
```bash
for i in $(seq 1 11); do \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/login \
    -H 'Content-Type: application/json' -d '{"user":"marees","password":"x"}'; \
done
# attendu : 401 x10 puis 429 (rate-limit atteint)
```

- [ ] **Step 5: Vérifier la mire dans le navigateur**

Ouvrir `http://localhost:3000` → la mire s'affiche → se connecter avec `marees` / `marees-dev` → le dashboard apparaît → le bouton « Se déconnecter » (icône `bi-box-arrow-right`) ramène à la mire. Basculer le thème pour vérifier le dégradé clair/sombre de la mire.

- [ ] **Step 6: (optionnel) Vérifier le dev hot-reload**

Run: `npm run dev:auth` → ouvrir `http://localhost:5173` → même parcours de connexion (le proxy Vite relaie le cookie).

- [ ] **Step 7: Nettoyage**

Run: `rm -f /tmp/marees-cookies.txt` et arrêter le serveur.

---

## Notes de mise à jour documentaire (hors périmètre code, à faire en fin de branche)

- `CLAUDE.md` : mentionner la mire (`LoginScreen.vue`, `useAuth`, routes `login/logout/auth-status`, cookie de session) dans les sections Client / Durcissement.
- `deploy/INSTALLATION-NAS.md` §8 : noter que l'auth se fait désormais par la mire (cookie), l'en-tête Basic restant accepté.
