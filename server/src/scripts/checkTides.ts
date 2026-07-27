/**
 * Rapport de cohérence des horaires de marées — **diagnostic seul, ne modifie rien**.
 *
 *   npm -w server run check-tides                 # audite les graines de tous les sites
 *   npm -w server run check-tides -- fichier.json # audite un fichier précis (avant un import)
 *
 * Code de sortie : 0 si tout est sain, 1 si au moins une anomalie est trouvée — utilisable tel
 * quel comme garde en intégration continue.
 */
import fs from 'fs';
import path from 'path';
import { RESOURCES_DIR } from '../config/dataDir';
import { SITES } from '../config/sites';
import { auditTides, type TideAnomaly } from '../lib/tidesAudit';

/** Audite un fichier et affiche son rapport ; renvoie le nombre d'anomalies. */
function report(label: string, file: string): number {
  if (!fs.existsSync(file)) {
    console.error(`✗ ${label} — fichier introuvable : ${file}`);
    return 1;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${label} — JSON illisible : ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const anomalies: TideAnomaly[] = auditTides(parsed);
  console.log(`\n${label}  (${path.basename(file)})`);
  if (!anomalies.length) {
    console.log('   ✓ aucune anomalie');
    return 0;
  }
  for (const a of anomalies) {
    console.log(`   • ${a.date}  [${a.kind}]  ${a.message}`);
  }
  console.log(`   → ${anomalies.length} anomalie(s)`);
  return anomalies.length;
}

const args = process.argv.slice(2);
const targets = args.length
  ? args.map(f => ({ label: f, file: path.resolve(f) }))
  : SITES.map(s => ({ label: s.label, file: path.join(RESOURCES_DIR, s.filename) }));

const total = targets.reduce((sum, t) => sum + report(t.label, t.file), 0);

console.log(
  total === 0
    ? '\n✓ Tous les jeux d’horaires sont cohérents.'
    : `\n✗ ${total} anomalie(s) au total. Rien n’a été modifié : corrigez la graine, ou importez ` +
      'les jours corrigés en mode « Fusionner ».'
);
process.exit(total === 0 ? 0 : 1);
