import { normalizeTides } from './readTides';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Écart minimal plausible entre deux extrêmes consécutifs. Une pleine mer et la basse mer
 * suivante sont espacées d'environ 6 h ; en deçà de 3 h, c'est un doublon ou une erreur de saisie.
 */
const MIN_GAP_MINUTES = 180;

export type TideAnomalyKind =
  | 'type-invalide'
  | 'heure-invalide'
  | 'hauteur-invalide'
  | 'alternance'
  | 'rapprochees';

/** Une anomalie repérée dans un jeu d'horaires. */
export interface TideAnomaly {
  date: string; // jour concerné, `YYYY-MM-DD`
  kind: TideAnomalyKind;
  message: string; // description lisible, avec les heures en cause
}

/** Résultat de l'audit d'un jeu d'horaires (un site, ou un fichier passé en argument). */
export interface SiteAudit {
  label: string;
  file: string; // nom de fichier, pour situer la source
  anomalies: TideAnomaly[];
}

/** Échappe ce qui casserait une cellule de tableau markdown. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * Rend le résultat de l'audit en markdown : un tableau de synthèse par site, puis le détail des
 * anomalies. `generatedAt` est **injecté** (et omis par défaut) pour que la sortie reste
 * déterministe — utile en test comme pour un rapport versionné qu'on veut voir diffé proprement.
 * Fonction pure.
 */
export function formatAuditMarkdown(audits: SiteAudit[], generatedAt?: string): string {
  const total = audits.reduce((n, a) => n + a.anomalies.length, 0);
  const out: string[] = ['# Rapport de cohérence des horaires de marées', ''];

  if (generatedAt) out.push(`Généré le ${generatedAt}.`, '');
  out.push(
    'Contrôles appliqués : validité de chaque entrée (type, heure `HH:MM`, hauteur numérique),',
    'alternance pleine mer / basse mer, et écart minimal de 3 h entre deux extrêmes.',
    '',
    '| Site | Fichier | Anomalies |',
    '| --- | --- | ---: |'
  );
  for (const a of audits) {
    out.push(`| ${cell(a.label)} | \`${cell(a.file)}\` | ${a.anomalies.length} |`);
  }
  out.push('');

  for (const a of audits) {
    out.push(`## ${a.label}`, '');
    if (!a.anomalies.length) {
      out.push('Aucune anomalie.', '');
      continue;
    }
    out.push('| Date | Type | Détail |', '| --- | --- | --- |');
    for (const an of a.anomalies) {
      out.push(`| ${an.date} | \`${an.kind}\` | ${cell(an.message)} |`);
    }
    out.push('');
  }

  out.push(
    total === 0
      ? '**Aucune anomalie détectée.**'
      : `**${total} anomalie${total > 1 ? 's' : ''} au total.** Aucune donnée n’a été modifiée : ` +
        'ce rapport est un diagnostic. Corrigez la graine, ou importez les jours corrigés en mode ' +
        '« Fusionner ».',
    ''
  );
  return out.join('\n');
}

interface Extreme {
  date: string;
  time: string;
  type: 'haute' | 'basse';
  minutes: number; // instant absolu en minutes, pour comparer par-dessus minuit
}

/** Minutes absolues d'une date + heure (base arbitraire : seules les différences comptent). */
function absoluteMinutes(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00Z`) / 60000;
}

/**
 * Audite un jeu d'horaires (format graine, les deux formes acceptées) et renvoie la liste des
 * anomalies, **sans jamais rien écarter** : c'est un rapport, pas un filtre.
 *
 * Trois familles de contrôles :
 * - **par entrée** : type `haute`/`basse`, heure `HH:MM`, hauteur numérique ;
 * - **alternance** : deux extrêmes de même type qui se suivent trahissent soit un doublon, soit un
 *   extrême manquant (entre deux pleines mers il y a exactement une basse mer) ;
 * - **espacement** : deux extrêmes à moins de 3 h l'un de l'autre sont physiquement impossibles.
 *
 * Les contrôles d'alternance et d'espacement portent sur la suite chronologique **globale**, donc
 * les ruptures au passage de minuit sont vues. Fonction pure.
 */
export function auditTides(parsed: unknown): TideAnomaly[] {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const anomalies: TideAnomaly[] = [];
  const extremes: Extreme[] = [];

  for (const [date, entries] of Object.entries(normalizeTides(parsed as Record<string, unknown>))) {
    if (!Array.isArray(entries)) continue;

    for (const raw of entries) {
      const e = (raw ?? {}) as unknown as Record<string, unknown>;
      const where = typeof e.heure === 'string' ? e.heure : '(sans heure)';

      if (e.maree !== 'haute' && e.maree !== 'basse') {
        anomalies.push({ date, kind: 'type-invalide', message: `type de marée inconnu « ${String(e.maree)} » à ${where}` });
        continue;
      }
      if (typeof e.heure !== 'string' || !TIME_RE.test(e.heure)) {
        anomalies.push({ date, kind: 'heure-invalide', message: `marée ${e.maree} sans heure exploitable (${where})` });
        continue;
      }
      const hauteur = parseFloat(String(e.hauteur));
      if (!Number.isFinite(hauteur)) {
        anomalies.push({ date, kind: 'hauteur-invalide', message: `hauteur non numérique à ${e.heure} (« ${String(e.hauteur)} »)` });
        continue;
      }
      extremes.push({ date, time: e.heure, type: e.maree, minutes: absoluteMinutes(date, e.heure) });
    }
  }

  extremes.sort((a, b) => a.minutes - b.minutes);

  for (let i = 1; i < extremes.length; i++) {
    const prev = extremes[i - 1];
    const cur = extremes[i];

    if (prev.type === cur.type) {
      anomalies.push({
        date: cur.date,
        kind: 'alternance',
        message:
          `deux marées ${cur.type}s de suite : ${prev.date} ${prev.time} puis ${cur.date} ${cur.time} ` +
          '(doublon, ou extrême manquant entre les deux)'
      });
    }

    const gap = cur.minutes - prev.minutes;
    if (gap < MIN_GAP_MINUTES) {
      anomalies.push({
        date: cur.date,
        kind: 'rapprochees',
        message: `${prev.date} ${prev.time} et ${cur.date} ${cur.time} ne sont séparées que de ${gap} min`
      });
    }
  }

  return anomalies.sort((a, b) => a.date.localeCompare(b.date));
}
