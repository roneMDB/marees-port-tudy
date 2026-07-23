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

// Initialise le stockage (base SQLite dans DATA_DIR) : amorçage/migration d'un volume vide.
initStorage(logger);

const port = Number(process.env.PORT) || 3000;
const app = createApp(logger);

app.listen(port, () => {
  logger.info(`API marées Port-Tudy à l'écoute sur http://localhost:${port}`);
});
