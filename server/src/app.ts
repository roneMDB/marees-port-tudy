import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { createTidesRouter } from './routes/tides';
import { createSettingsRouter } from './routes/settings';
import { createWeatherRouter } from './routes/weather';
import { createStatsRouter } from './routes/stats';
import { createAuthRouter } from './routes/auth';
import { basicAuth } from './middleware/auth';
import { accessLog } from './middleware/accessLog';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Construit l'application Express (testable via supertest, sans `listen`).
 * Monte l'API sous `/api` et, si un build client existe, le sert en statique
 * avec repli SPA sur `index.html`.
 *
 * Durcissement (exposition externe) : en-têtes de sécurité (helmet), limitation de débit,
 * et authentification Basic optionnelle (`APP_PASSWORD`). Servi en **même origine** que le
 * client → pas de CORS. Derrière le reverse proxy DSM → `trust proxy` pour la vraie IP.
 */
export function createApp(logger: Logger): Application {
  const app = express();

  app.set('trust proxy', 1); // 1er saut de confiance = reverse proxy NAS (X-Forwarded-For)

  // En-têtes de sécurité (helmet). CSP taillée pour la SPA buildée : scripts/styles/fonts servis en
  // même origine (bundle Vite), API en même origine → `connect-src 'self'` (la météo passe par le
  // serveur, pas par le navigateur). `style-src 'unsafe-inline'` : styles inline de Bootstrap /
  // Chart.js / bindings `:style` de Vue. Pas d'`upgrade-insecure-requests` (le reverse proxy gère
  // HTTPS ; éviterait de casser le test local en http). `hidePoweredBy` (défaut) retire `X-Powered-By`.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );

  // Limitation de débit : globale (protège aussi le brute-force d'auth), plus stricte sur la météo
  // (appels sortants vers Open-Meteo). Placées avant l'auth pour throttler les tentatives.
  app.use(rateLimit({ windowMs: FIVE_MINUTES, max: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/weather', rateLimit({ windowMs: FIVE_MINUTES, max: 60, standardHeaders: true, legacyHeaders: false }));
  // Anti-brute-force sur la connexion (endpoint public) : 10 tentatives / 5 min par IP.
  app.use('/api/login', rateLimit({ windowMs: FIVE_MINUTES, max: 10, standardHeaders: true, legacyHeaders: false }));

  // Limite relevée à 2 Mo pour autoriser l'import d'horaires (une année ≈ 150 ko).
  app.use(express.json({ limit: '2mb' }));

  // Routes publiques de la mire (login/logout/status) — AVANT le garde.
  app.use('/api', createAuthRouter());

  // Garde d'authentification optionnel (activé par `APP_PASSWORD`) : monté sur `/api` pour couvrir
  // exactement les mêmes requêtes que les routeurs (casse/slash inclus), coquille SPA publique.
  app.use('/api', basicAuth());

  // Journalisation des ouvertures de l'app (accès), après l'auth.
  app.use(accessLog());

  app.use('/api', createTidesRouter(logger));
  app.use('/api', createSettingsRouter(logger));
  app.use('/api', createWeatherRouter(logger));
  app.use('/api', createStatsRouter(logger));

  // En production, sert le client Vue buildé (client/dist) sur la même origine.
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Gestionnaire d'erreurs centralisé (dernier middleware). La signature à 4 arguments est
  // requise par Express pour être reconnu comme error handler (`_req`/`_next` volontairement inutilisés).
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number; statusCode?: number }).status
      ?? (err as { statusCode?: number }).statusCode
      ?? 500;
    // Erreurs client (ex. JSON invalide via express.json) → 400.
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: err.message || 'Requête invalide.' });
    }
    logger.error({ err }, 'Erreur non gérée');
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return app;
}
