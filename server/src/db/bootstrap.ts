import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { DATA_DIR, RESOURCES_DIR } from '../config/dataDir';
import { SITES } from '../config/sites';
import { readTides } from '../lib/readTides';
import { getDb, type DB } from './index';
import { countTides, replaceSiteData } from './tidesRepository';
import { getOrCreateSessionSecret } from './usersRepository';
import { seedLexiconIfEmpty } from './lexiconRepository';
import { LEXICON_SEED } from '../service/lexiconSeed';
import { backfillSeedPlurals, seedFishingRefsIfEmpty } from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';
import { writeSettings, ensureSettings } from '../service/SettingsStore';
import { ensureAdminUser } from '../service/UsersStore';
import { authEnabled } from '../middleware/auth';

/**
 * Prépare le stockage au démarrage : crée `DATA_DIR`, ouvre la base et l'amorce si vide.
 *
 * - **Horaires** : pour chaque site sans données en base, importe depuis le fichier legacy
 *   `DATA_DIR/<site>.json` s'il existe (déploiements antérieurs), sinon depuis la graine embarquée.
 * - **Réglages** : si la ligne de config est absente, importe `settings.json` legacy s'il existe,
 *   sinon écrit les défauts.
 * - **Utilisateurs** : si l'authentification est active, génère le secret de session persisté et
 *   amorce le premier administrateur (`ensureAdminUser`) si la table `users` est vide.
 * - **Pêche** : amorce les référentiels espèces/engins si la table `fishing_refs` est vide.
 *
 * Idempotent : ne réimporte rien si la base contient déjà les données.
 */
export async function initStorage(logger?: Logger, db: DB = getDb()): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const site of SITES) {
    if (countTides(db, site.id) > 0) continue;
    const legacy = path.join(DATA_DIR, site.filename);
    const source = fs.existsSync(legacy) ? legacy : path.join(RESOURCES_DIR, site.filename);
    replaceSiteData(db, site.id, readTides(source));
    logger?.info(`Horaires « ${site.label} » importés en base depuis ${source}`);
  }

  const hasSettings = db.prepare('SELECT 1 FROM settings WHERE id = 1').get();
  if (!hasSettings) {
    const legacySettings = path.join(DATA_DIR, 'settings.json');
    let imported = false;
    if (fs.existsSync(legacySettings)) {
      try {
        writeSettings(JSON.parse(fs.readFileSync(legacySettings, 'utf-8')), db);
        logger?.info('Réglages importés depuis settings.json (legacy)');
        imported = true;
      } catch {
        /* fichier illisible → défauts */
      }
    }
    if (!imported) ensureSettings(db);
  }

  // Lexique du « mot du jour » : amorce la table depuis la graine si elle est vide.
  seedLexiconIfEmpty(db, LEXICON_SEED);

  // Référentiels du carnet de pêche (issue #3) : mêmes règles que le lexique — amorçage si vide.
  seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
  // Base amorcée avant la v8 : ses pluriels sont NULL, donc relus au singulier. On les complète
  // ici plutôt que dans la migration, la graine étant une donnée de service et non de schéma.
  backfillSeedPlurals(db, FISHING_REFS_SEED);

  if (authEnabled()) {
    getOrCreateSessionSecret(db); // secret stable, indépendant des mots de passe utilisateurs
    await ensureAdminUser(db, new Date().toISOString());
    logger?.info('Administrateur initial vérifié/amorcé');
  }
}
