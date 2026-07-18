import { Logger } from 'pino';
import Table from 'cli-table3';
import chalk from 'chalk';
import { readTides, RawTideEntry } from '../lib/readTides';

const NAVIHAN_BASSE_MER_OFFSET_HOURS = 1 + 15 / 60;
const NAVIHAN_A_FLOT_OFFSET_HOURS = 2 + 40 / 60;

/** Libellés des heures Navihan (clés de `Extreme.navihan`, aussi visibles en sortie JSON). */
const NAVIHAN_LABELS = {
  pleineMer: 'Pleine mer',
  basseMer: 'Basse mer',
  aFlot: 'A flot'
} as const;

/** Placeholder pour une cellule vide dans les rendus texte/markdown. */
const EMPTY_CELL = '—';

/** Échappe les caractères sensibles pour une insertion sûre dans du HTML. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

interface Extreme {
  time: string;
  height: number;
  type: 'high' | 'low';
  navihan: Record<string, string>;
  coefficient: number | null;
}

interface TideOutput {
  siteId: string;
  timezone: string;
  from: string;
  to: string;
  days: Record<string, Extreme[]>;
}

interface MareeOptions {
  siteId?: string;
  timezone?: string;
}

/** Formats de sortie sous forme de tableau (colonnes sélectionnables). */
type TableFormat = 'text' | 'markdown' | 'print' | 'html';

/**
 * Définition d'une colonne de tableau : libellé, largeur (`cli-table3`), colorisation
 * (rendu texte uniquement) et extraction de la valeur brute depuis un extrême.
 */
interface ColumnDef {
  key: string;
  header: string;
  width: number;
  color: (value: string, ext: Extreme) => string;
  value: (ext: Extreme) => string;
}

/** Registre unique des colonnes disponibles, partagé par les rendus text/markdown/print. */
const COLUMNS: Record<string, ColumnDef> = {
  coef: {
    key: 'coef',
    header: 'Coef',
    width: 8,
    color: v => chalk.cyan(v),
    value: ext => (ext.coefficient != null ? ext.coefficient.toString() : EMPTY_CELL)
  },
  type: {
    key: 'type',
    header: 'Type',
    width: 16,
    color: (v, ext) => (ext.type === 'high' ? chalk.blue(v) : chalk.yellow(v)),
    value: ext => (ext.type === 'high' ? 'Pleine Mer' : 'Basse Mer')
  },
  hauteur: {
    key: 'hauteur',
    header: 'Hauteur',
    width: 12,
    color: v => chalk.white(v),
    value: ext => (Number.isFinite(ext.height) ? `${ext.height.toFixed(2)}m` : EMPTY_CELL)
  },
  'port-tudy': {
    key: 'port-tudy',
    header: 'Port Tudy',
    width: 12,
    color: v => chalk.white.bold(v),
    value: ext => ext.time
  },
  navihan: {
    key: 'navihan',
    header: 'Navihan',
    width: 22,
    color: v => chalk.green.bold(v),
    value: ext => ext.navihan[NAVIHAN_LABELS.pleineMer] ?? ext.navihan[NAVIHAN_LABELS.basseMer] ?? EMPTY_CELL
  },
  'basse-mer': {
    key: 'basse-mer',
    header: 'Basse mer',
    width: 14,
    color: v => chalk.green.bold(v),
    value: ext => ext.navihan[NAVIHAN_LABELS.basseMer] ?? EMPTY_CELL
  },
  'pleine-mer': {
    key: 'pleine-mer',
    header: 'Pleine mer',
    width: 14,
    color: v => chalk.green.bold(v),
    value: ext => ext.navihan[NAVIHAN_LABELS.pleineMer] ?? EMPTY_CELL
  },
  'a-flot': {
    key: 'a-flot',
    header: 'A flot',
    width: 18,
    color: v => chalk.white(v),
    value: ext => ext.navihan[NAVIHAN_LABELS.aFlot] ?? EMPTY_CELL
  }
};

/** Colonnes par défaut de chaque format tableau (utilisées si `--columns` absent). */
const DEFAULT_COLUMNS: Record<TableFormat, string[]> = {
  text: ['coef', 'type', 'hauteur', 'port-tudy', 'navihan', 'a-flot'],
  markdown: ['coef', 'type', 'hauteur', 'port-tudy', 'navihan', 'a-flot'],
  html: ['coef', 'type', 'hauteur', 'port-tudy', 'navihan', 'a-flot'],
  print: ['basse-mer', 'pleine-mer', 'a-flot', 'coef']
};

export default class Maree {
  private logger: Logger;
  private siteId: string;
  private timezone: string;

  constructor(logger: Logger, options: MareeOptions = {}) {
    this.logger = logger;
    this.siteId = options.siteId || 'ile-de-groix-port-tudy';
    this.timezone = options.timezone || 'Europe/Paris';

    this.logger.info(`Maree service initialized with siteId: ${this.siteId}`);
  }

  /**
   * Récupère les marées des `nbDays` prochains jours (à partir d'aujourd'hui)
   * depuis le fichier de ressources local.
   */
  async getTides(nbDays: number = 3): Promise<TideOutput> {
    this.logger.debug(`Fetching tides for ${nbDays} days`);

    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + nbDays);

    const from = this.toDateKey(fromDate);
    const to = this.toDateKey(toDate);

    const rawData = readTides();

    const output: TideOutput = {
      siteId: this.siteId,
      timezone: this.timezone,
      from,
      to,
      days: {}
    };

    Object.keys(rawData)
      .filter(day => day >= from && day < to)
      .sort()
      .forEach(day => {
        const extremes = rawData[day]
          .filter(entry => entry.heure)
          .map(entry => this.toExtreme(entry))
          .sort((a, b) => a.time.localeCompare(b.time));

        if (extremes.length > 0) {
          output.days[day] = extremes;
        }
      });

    this.logger.info(`Tidal data loaded for ${Object.keys(output.days).length} days`);
    return output;
  }

  /**
   * Convertit une entrée brute du fichier en extrême (pleine/basse mer) enrichi
   * des heures Navihan.
   */
  private toExtreme(entry: RawTideEntry): Extreme {
    const type: 'high' | 'low' = entry.maree === 'haute' ? 'high' : 'low';
    const time = entry.heure!.trim();

    const parsedHeight = parseFloat(entry.hauteur);
    const height = Number.isFinite(parsedHeight) ? parsedHeight : NaN;

    const parsedCoefficient = entry.coefficient != null ? parseInt(entry.coefficient, 10) : NaN;
    const coefficient = Number.isFinite(parsedCoefficient) ? parsedCoefficient : null;

    const navihan: Record<string, string> = type === 'low'
      ? {
          [NAVIHAN_LABELS.basseMer]: this.formatNavihanTime(time, NAVIHAN_BASSE_MER_OFFSET_HOURS),
          [NAVIHAN_LABELS.aFlot]: this.formatNavihanTime(time, NAVIHAN_A_FLOT_OFFSET_HOURS)
        }
      : {
          [NAVIHAN_LABELS.pleineMer]: this.formatNavihanTime(time, NAVIHAN_BASSE_MER_OFFSET_HOURS)
        };

    return { time, height, type, coefficient, navihan };
  }

  /**
   * Résout une liste de clés de colonnes en définitions du registre. Sans clés,
   * renvoie les colonnes par défaut du format. Lève une erreur claire sur clé inconnue.
   */
  private resolveColumns(keys: string[] | undefined, format: TableFormat): ColumnDef[] {
    const selected = keys && keys.length > 0 ? keys : DEFAULT_COLUMNS[format];
    return selected.map(key => {
      const col = COLUMNS[key];
      if (!col) {
        throw new Error(
          `Colonne inconnue "${key}". Colonnes valides : ${Object.keys(COLUMNS).join(', ')}`
        );
      }
      return col;
    });
  }

  /**
   * Renvoie la clé date `YYYY-MM-DD` en heure locale (cohérent avec le fichier).
   */
  private toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formate l'heure Navihan en appliquant un décalage (wrap autour de minuit).
   */
  private formatNavihanTime(timeStr: string, offsetHours: number = 3): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours * 60 + minutes + offsetHours * 60 + 24 * 60) % (24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Formate un décalage horaire décimal en libellé `XhYY` (ex: 1.25 -> "1h15").
   */
  private formatOffsetLabel(offsetHours: number): string {
    const h = Math.floor(offsetHours);
    const m = Math.round((offsetHours - h) * 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  }

  /**
   * Formate l'étiquette de jour avec jour de la semaine et nom du mois.
   */
  private formatDayLabel(day: string): string {
    // Midi local plutôt que minuit UTC : évite le décalage d'un jour sur les
    // systèmes en fuseau négatif (`new Date('2026-06-10')` = minuit UTC).
    const date = new Date(`${day}T12:00:00`);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Formate les données pour l'affichage Markdown. `columns` remplace les colonnes
   * par défaut si fourni.
   */
  formatMarkdownOutput(tideData: TideOutput, columns?: string[]): string {
    const cols = this.resolveColumns(columns, 'markdown');
    const title = `# Marées ${tideData.siteId}`;
    const subtitle = `**Période** : ${tideData.from} - ${tideData.to}`;
    const timezone = `**Fuseau horaire** : ${tideData.timezone}`;
    const navihan = `**Navihan** : +${this.formatOffsetLabel(NAVIHAN_BASSE_MER_OFFSET_HOURS)} | **À flot** : +${this.formatOffsetLabel(NAVIHAN_A_FLOT_OFFSET_HOURS)}`;
    const output: string[] = [title, '', subtitle, timezone, navihan, ''];

    Object.keys(tideData.days).sort().forEach(day => {
      output.push(`## ${this.formatDayLabel(day)}`);
      output.push('');
      output.push(`| ${cols.map(c => c.header).join(' | ')} |`);
      output.push(`| ${cols.map(() => '---').join(' | ')} |`);

      tideData.days[day].forEach(ext => {
        output.push(`| ${cols.map(c => c.value(ext)).join(' | ')} |`);
      });

      output.push('');
    });

    return output.join('\n');
  }

  /**
   * Formate les données en page HTML autonome, imprimable (CSS inline, aucune
   * ressource externe). `columns` remplace les colonnes par défaut si fourni.
   */
  formatHtmlOutput(tideData: TideOutput, columns?: string[]): string {
    const cols = this.resolveColumns(columns, 'html');
    const basseMerLabel = this.formatOffsetLabel(NAVIHAN_BASSE_MER_OFFSET_HOURS);
    const aFlotLabel = this.formatOffsetLabel(NAVIHAN_A_FLOT_OFFSET_HOURS);
    const pageTitle = `Marées ${tideData.siteId}`;

    const headCells = cols.map(c => `<th class="col-${c.key}">${escapeHtml(c.header)}</th>`).join('');

    const sections = Object.keys(tideData.days).sort().map(day => {
      const rows = tideData.days[day].map(ext => {
        const cells = cols
          .map(c => `<td class="col-${c.key}">${escapeHtml(c.value(ext))}</td>`)
          .join('');
        return `        <tr class="tide-${ext.type}">${cells}</tr>`;
      }).join('\n');

      return `    <section class="day">
      <h2>${escapeHtml(this.formatDayLabel(day))}</h2>
      <table>
        <thead><tr>${headCells}</tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </section>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<style>
  :root { --sea: #0b5c8a; --sea-dark: #073d5c; --ink: #1a2733; --muted: #5b6b78; --line: #d6e0e8; --stripe: #f2f7fa; --high: #0b5c8a; --low: #b26a00; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 2rem 1.25rem; max-width: 60rem; margin-inline: auto; line-height: 1.4; }
  header { border-bottom: 3px solid var(--sea); padding-bottom: .75rem; margin-bottom: 1.5rem; }
  h1 { color: var(--sea-dark); font-size: 1.6rem; margin: 0 0 .25rem; }
  .period { font-weight: 600; margin: 0 0 .15rem; }
  .legend { color: var(--muted); font-size: .85rem; margin: 0; }
  .day { margin-bottom: 1.75rem; break-inside: avoid; page-break-inside: avoid; }
  h2 { color: var(--sea-dark); font-size: 1.05rem; text-transform: capitalize; margin: 0 0 .4rem; border-left: 4px solid var(--sea); padding-left: .5rem; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  thead th { background: var(--sea); color: #fff; text-align: left; font-weight: 600; padding: .45rem .6rem; font-size: .82rem; letter-spacing: .02em; }
  tbody td { padding: .4rem .6rem; border-bottom: 1px solid var(--line); font-size: .92rem; }
  tbody tr:nth-child(even) td { background: var(--stripe); }
  .col-coef { text-align: center; font-weight: 700; }
  .col-type { font-weight: 600; }
  tr.tide-high .col-type { color: var(--high); }
  tr.tide-low  .col-type { color: var(--low); }
  tr.tide-high .col-coef { color: var(--high); }
  footer { color: var(--muted); font-size: .75rem; margin-top: 2rem; border-top: 1px solid var(--line); padding-top: .5rem; }
  @page { margin: 1.5cm; }
  @media print {
    body { padding: 0; max-width: none; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <header>
    <h1>🌊 ${escapeHtml(pageTitle)}</h1>
    <p class="period">Du ${escapeHtml(tideData.from)} au ${escapeHtml(tideData.to)}</p>
    <p class="legend">Fuseau horaire : ${escapeHtml(tideData.timezone)} · Navihan +${escapeHtml(basseMerLabel)} · À flot +${escapeHtml(aFlotLabel)}</p>
  </header>
${sections}
  <footer>Généré par marees-port-tudy · heures Navihan dérivées des marées de Port-Tudy.</footer>
</body>
</html>
`;
  }

  /**
   * Formate les données pour l'affichage texte (tableau coloré par jour). `columns`
   * remplace les colonnes par défaut si fourni.
   */
  formatTextOutput(tideData: TideOutput, columns?: string[]): string {
    return this.renderCliTable(tideData, this.resolveColumns(columns, 'text'), true);
  }

  /**
   * Formate les données pour l'affichage imprimable : même tableau que `text` mais
   * sans aucune séquence de couleur ANSI. `columns` remplace les colonnes par défaut.
   */
  formatPrintOutput(tideData: TideOutput, columns?: string[]): string {
    return this.renderCliTable(tideData, this.resolveColumns(columns, 'print'), false);
  }

  /**
   * Rendu tableau `cli-table3` partagé par les formats `text` (colorisé) et `print`
   * (texte brut, sans ANSI sur les cellules ni sur les bordures).
   */
  private renderCliTable(tideData: TideOutput, columns: ColumnDef[], colorize: boolean): string {
    const basseMerLabel = this.formatOffsetLabel(NAVIHAN_BASSE_MER_OFFSET_HOURS);
    const aFlotLabel = this.formatOffsetLabel(NAVIHAN_A_FLOT_OFFSET_HOURS);
    const titleText = `✅ Marées ${tideData.siteId} du ${tideData.from} au ${tideData.to}`;
    const subtitleText = `Fuseau horaire : ${tideData.timezone} | Navihan : +${basseMerLabel} | À flot : +${aFlotLabel}`;

    const title = colorize ? chalk.greenBright.bold(titleText) : titleText;
    const subtitle = colorize ? chalk.dim(subtitleText) : subtitleText;
    let output = `${title}\n${subtitle}\n\n`;

    Object.keys(tideData.days).sort().forEach(day => {
      const table = new Table({
        head: columns.map(col => (colorize ? chalk.cyan.bold(col.header) : col.header)),
        colWidths: columns.map(col => col.width),
        wordWrap: true,
        style: colorize ? { head: ['cyan'] } : { head: [], border: [] }
      });

      tideData.days[day].forEach(ext => {
        table.push(columns.map(col => {
          const value = col.value(ext);
          return colorize ? col.color(value, ext) : value;
        }));
      });

      const dayLabel = `📅 ${this.formatDayLabel(day)}`;
      output += `${colorize ? chalk.magenta.bold(dayLabel) : dayLabel}\n`;
      output += `${table.toString()}\n\n`;
    });

    return output;
  }
}
