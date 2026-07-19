import pino from 'pino';
import { createApp } from './app';
import { ensureDataDir } from './config/dataDir';
import { ensureSettingsFile } from './service/SettingsStore';

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

// Initialise le répertoire de données (config + horaires) : seed d'un volume vide.
ensureDataDir(logger);
ensureSettingsFile();

const port = Number(process.env.PORT) || 3000;
const app = createApp(logger);

app.listen(port, () => {
  logger.info(`API marées Port-Tudy à l'écoute sur http://localhost:${port}`);
});
