/**
 * Rapport de cohérence des horaires de marées — **diagnostic seul, ne modifie rien**.
 *
 *   npm -w server run check-tides                    # graines de tous les sites, sortie texte
 *   npm -w server run check-tides -- fichier.json    # un fichier précis (avant un import)
 *   npm -w server run check-tides -- --markdown      # rapport markdown sur la sortie standard
 *   npm --silent -w server run check-tides -- --markdown > rapport-marees.md
 *     (`--silent` : sinon npm préfixe sa propre ligne « > ts-node … » dans le fichier)
 *
 * Code de sortie : 0 si tout est sain, 1 si au moins une anomalie est trouvée — utilisable tel
 * quel comme garde en intégration continue.
 */
import fs from 'fs';
import path from 'path';
import { RESOURCES_DIR } from '../config/dataDir';
import { SITES } from '../config/sites';
import { auditTides, formatAuditMarkdown, type SiteAudit } from '../lib/tidesAudit';

/** Lit et audite un fichier. `null` si la source est inutilisable (signalé sur stderr). */
function audit(label: string, file: string): SiteAudit | null {
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

const args = process.argv.slice(2);
const markdown = args.includes('--markdown') || args.includes('--md');
const files = args.filter(a => !a.startsWith('-'));

const targets = files.length
  ? files.map(f => ({ label: f, file: path.resolve(f) }))
  : SITES.map(s => ({ label: s.label, file: path.join(RESOURCES_DIR, s.filename) }));

const audits = targets.map(t => audit(t.label, t.file));
const unreadable = audits.filter(a => a === null).length;
const ok = audits.filter((a): a is SiteAudit => a !== null);
const total = ok.reduce((n, a) => n + a.anomalies.length, 0);

if (markdown) {
  const today = new Date().toISOString().slice(0, 10);
  console.log(formatAuditMarkdown(ok, today));
} else {
  for (const a of ok) {
    console.log(`\n${a.label}  (${a.file})`);
    if (!a.anomalies.length) {
      console.log('   ✓ aucune anomalie');
      continue;
    }
    a.anomalies.forEach(an => console.log(`   • ${an.date}  [${an.kind}]  ${an.message}`));
    console.log(`   → ${a.anomalies.length} anomalie(s)`);
  }
  console.log(
    total === 0 && !unreadable
      ? '\n✓ Tous les jeux d’horaires sont cohérents.'
      : `\n✗ ${total} anomalie(s) au total. Rien n’a été modifié : corrigez la graine, ou importez ` +
        'les jours corrigés en mode « Fusionner ».'
  );
}

process.exit(total === 0 && unreadable === 0 ? 0 : 1);
