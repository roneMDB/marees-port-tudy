import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { createTidesRouter } from './routes/tides';
import { createSettingsRouter } from './routes/settings';
import { createWeatherRouter } from './routes/weather';

/**
 * Construit l'application Express (testable via supertest, sans `listen`).
 * Monte l'API sous `/api` et, si un build client existe, le sert en statique
 * avec repli SPA sur `index.html`.
 */
export function createApp(logger: Logger): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', createTidesRouter(logger));
  app.use('/api', createSettingsRouter(logger));
  app.use('/api', createWeatherRouter(logger));

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
