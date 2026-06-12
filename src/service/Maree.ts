import { Logger } from 'pino';
import Table from 'cli-table3';
import chalk from 'chalk';
import { readTides, RawTideEntry } from '../lib/readTides';

const NAVIHAN_BASSE_MER_OFFSET_HOURS = 1 + 15 / 60;
const NAVIHAN_A_FLOT_OFFSET_HOURS = 2 + 40 / 60;

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
    const height = parseFloat(entry.hauteur);
    const coefficient = entry.coefficient != null ? parseInt(entry.coefficient, 10) : null;

    const navihan: Record<string, string> = type === 'low'
      ? {
          'Basse mer': this.formatNavihanTime(time, NAVIHAN_BASSE_MER_OFFSET_HOURS),
          'A flot': this.formatNavihanTime(time, NAVIHAN_A_FLOT_OFFSET_HOURS)
        }
      : {
          'Pleine mer': this.formatNavihanTime(time, NAVIHAN_BASSE_MER_OFFSET_HOURS)
        };

    return { time, height, type, coefficient, navihan };
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
    const date = new Date(day);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Formate les données pour l'affichage texte (tableau par jour).
   */
  formatTextOutput(tideData: TideOutput): string {
    const title = chalk.greenBright.bold(`✅ Marées ${tideData.siteId} du ${tideData.from} au ${tideData.to}`);
    const basseMerLabel = this.formatOffsetLabel(NAVIHAN_BASSE_MER_OFFSET_HOURS);
    const aFlotLabel = this.formatOffsetLabel(NAVIHAN_A_FLOT_OFFSET_HOURS);
    const subtitle = chalk.dim(`Fuseau horaire : ${tideData.timezone} | Navihan : +${basseMerLabel} | À flot : +${aFlotLabel}`);
    let output = `${title}\n${subtitle}\n\n`;

    Object.keys(tideData.days).sort().forEach(day => {
      const table = new Table({
        head: [
          chalk.cyan.bold('Coef'),
          chalk.cyan.bold('Type'),
          chalk.cyan.bold('Hauteur'),
          chalk.cyan.bold('Port Tudy'),
          chalk.cyan.bold('Navihan'),
          chalk.cyan.bold('A flot')
        ],
        colWidths: [8, 16, 12, 12, 22, 18],
        wordWrap: true,
        style: { head: ['cyan'] }
      });

      tideData.days[day].forEach(ext => {
        const typeLabel = ext.type === 'high'
          ? chalk.blue('Pleine Mer')
          : chalk.yellow('Basse Mer');
        const heightText = chalk.white(`${ext.height.toFixed(2)}m`);
        const portTudyTime = chalk.white.bold(ext.time);
        const navihanPleineOuBasse = ext.navihan?.['Pleine mer'] ?? ext.navihan?.['Basse mer'] ?? '—';
        const navihanAflot = ext.navihan?.['A flot'] ?? '—';
        const coefficientText = chalk.cyan(ext.coefficient?.toString() ?? '—');

        table.push([
          coefficientText,
          typeLabel,
          heightText,
          portTudyTime,
          chalk.green.bold(navihanPleineOuBasse),
          chalk.white(navihanAflot)
        ]);
      });

      output += `${chalk.magenta.bold(`📅 ${this.formatDayLabel(day)}`)}\n`;
      output += `${table.toString()}\n\n`;
    });

    return output;
  }
}
