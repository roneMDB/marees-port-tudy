/**
 * Rapport de cohérence des horaires de marées — **diagnostic seul, ne modifie rien**.
 *
 *   npm -w server run check-tides                       # graines de tous les ports, en texte
 *   npm -w server run check-tides -- --site etel        # un seul port
 *   npm -w server run check-tides -- --db               # la base de production, pas les graines
 *   npm -w server run check-tides -- --db --site etel
 *   npm -w server run check-tides -- fichier.json       # un fichier précis (avant un import)
 *   npm --silent -w server run check-tides -- --markdown > rapport-marees.md
 *     (`--silent` : sinon npm préfixe sa propre ligne « > ts-node … » dans le fichier)
 *
 * Code de sortie : 0 si tout est sain, 1 si une anomalie ou une source illisible est rencontrée —
 * utilisable tel quel comme garde en intégration continue.
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR, RESOURCES_DIR } from '../config/dataDir';
import { SITES } from '../config/sites';
import { auditTides, formatAuditMarkdown, type SiteAudit } from '../lib/tidesAudit';
import { parseCheckArgs } from '../lib/checkTidesArgs';

const opts = parseCheckArgs(process.argv.slice(2), SITES.map(s => s.id));
if (opts.errors.length) {
  opts.errors.forEach(e => console.error(`✗ ${e}`));
  process.exit(2);
}

/** Sites retenus : ceux demandés par `--site`, sinon tous. */
const sites = opts.sites.length ? SITES.filter(s => opts.sites.includes(s.id)) : SITES;

/** Audite un fichier JSON. `null` si la source est inutilisable (signalé sur stderr). */
function auditFile(label: string, file: string): SiteAudit | null {
  if (!fs.existsSync(file)) {
    console.error(`✗ ${label} — fichier introuvable : ${file}`);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { label, file: path.basename(file), anomalies: auditTides(parsed) };
  } catch (e) {
    console.error(`✗ ${label} — JSON illisible : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Audite les horaires **réellement servis**, lus en base. C'est ce qui compte en production : la
 * base peut avoir divergé des graines par un import runtime.
 */
function auditDb(): (SiteAudit | null)[] {
  const dbFile = path.join(DATA_DIR, 'marees.db');
  if (!fs.existsSync(dbFile)) {
    console.error(`✗ base introuvable : ${dbFile} (DATA_DIR=${DATA_DIR})`);
    return [null];
  }
  // Import tardif : n'ouvre la base que si `--db` est demandé.
  const { openDb } = require('../db/index') as typeof import('../db/index');
  const { getSiteData } = require('../db/tidesRepository') as typeof import('../db/tidesRepository');
  const db = openDb(dbFile);
  try {
    return sites.map(s => ({
      label: `${s.label} (base)`,
      file: path.basename(dbFile),
      anomalies: auditTides(getSiteData(db, s.id))
    }));
  } finally {
    db.close();
  }
}

const results: (SiteAudit | null)[] = opts.files.length
  ? opts.files.map(f => auditFile(f, path.resolve(f)))
  : opts.fromDb
    ? auditDb()
    : sites.map(s => auditFile(s.label, path.join(RESOURCES_DIR, s.filename)));

const unreadable = results.filter(r => r === null).length;
const audits = results.filter((r): r is SiteAudit => r !== null);
const total = audits.reduce((n, a) => n + a.anomalies.length, 0);

if (opts.markdown) {
  console.log(formatAuditMarkdown(audits, new Date().toISOString().slice(0, 10)));
} else {
  for (const a of audits) {
    console.log(`\n${a.label}  (${a.file})`);
    if (!a.anomalies.length) {
      console.log('   ✓ aucune anomalie');
      continue;
    }
    a.anomalies.forEach(an => console.log(`   • ${an.date}  [${an.kind}]  ${an.message}`));
    console.log(`   → ${a.anomalies.length} anomalie(s)`);
  }
  // Une source illisible n'est pas « 0 anomalie » : le dire, plutôt que de conclure à tort.
  const parts: string[] = [];
  if (total > 0) {
    parts.push(
      `${total} anomalie(s). Rien n’a été modifié : corrigez la graine, ou importez les jours ` +
        'corrigés en mode « Fusionner ».'
    );
  }
  if (unreadable > 0) parts.push(`${unreadable} source(s) illisible(s) — non auditée(s).`);
  console.log(parts.length ? `\n✗ ${parts.join(' ')}` : '\n✓ Tous les jeux d’horaires sont cohérents.');
}

process.exit(total === 0 && unreadable === 0 ? 0 : 1);
