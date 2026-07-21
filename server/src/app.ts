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

  // En-têtes de sécurité. CSP désactivée pour l'instant (éviterait de casser SPA/Bootstrap/PWA) ;
  // à tailler ultérieurement. `hidePoweredBy` (défaut) retire `X-Powered-By`.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Limitation de débit : globale (protège aussi le brute-force d'auth), plus stricte sur la météo
  // (appels sortants vers Open-Meteo). Placées avant l'auth pour throttler les tentatives.
  app.use(rateLimit({ windowMs: FIVE_MINUTES, max: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/weather', rateLimit({ windowMs: FIVE_MINUTES, max: 60, standardHeaders: true, legacyHeaders: false }));

  // Authentification Basic optionnelle (activée par `APP_PASSWORD`).
  app.use(basicAuth());

  // Journalisation des ouvertures de l'app (accès), après l'auth.
  app.use(accessLog());

  app.use(express.json());

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

  // Gestionnaire d'erreurs centralisé (dernier middleware).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
