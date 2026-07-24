import pino from 'pino';
import { createApp } from './app';
import { initStorage } from './db/bootstrap';

const logger = pino({
  level: (process.env.LOG_LEVEL || 'info') as pino.Level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

const port = Number(process.env.PORT) || 3000;

// Initialise le stockage (base SQLite dans DATA_DIR) : amorçage/migration d'un volume vide,
// secret de session et administrateur initial, avant de démarrer le serveur.
initStorage(logger)
  .then(() => {
    const app = createApp(logger);
    app.listen(port, () => {
      logger.info(`API marées Port-Tudy à l'écoute sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Échec de l’initialisation du stockage');
    process.exit(1);
  });
