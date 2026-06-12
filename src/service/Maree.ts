import { Logger } from 'pino';
import Table from 'cli-table3';
import chalk from 'chalk';
import mockData from '../mockData';
import { scrapeTides } from '../lib/scrapeTides';

const NAVIHAN_BASSE_MER_OFFSET_HOURS = 1 + 15 / 60;
const NAVIHAN_A_FLOT_OFFSET_HOURS = 2 + 40 / 60;

interface TidalDataPoint {
  datetime: string;
  height: number;
  coefficient?: number | null;
}

interface Extreme {
  time: string;
  height: number;
  type: 'high' | 'low';
  navihan?: Record<string, string>;
  coefficient?: number | null;
}

interface TideOutput {
  siteId: string;
  timezone: string;
  intervalMinutes: number;
  navihanOffsetHours: number;
  from: string;
  to: string;
  days: Record<string, Extreme[]>;
}

interface MareeOptions {
  siteId?: string;
  timezone?: string;
  intervalMinutes?: number;
  navihanOffsetHours?: number;
  useMock?: boolean;
  useScrape?: boolean;
}

export default class Maree {
  private logger: Logger;
  private apiKey: string;
  private siteId: string;
  private timezone: string;
  private intervalMinutes: number;
  private navihanOffsetHours: number;
  private useMock: boolean;
  private useScrape: boolean;

  constructor(logger: Logger, apiKey: string, options: MareeOptions = {}) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.siteId = options.siteId || "ile-de-groix-port-tudy";
    this.timezone = options.timezone || "Europe/Paris";
    this.intervalMinutes = options.intervalMinutes || 5;
    this.navihanOffsetHours = options.navihanOffsetHours || 2.75;
    this.useMock = options.useMock || false;
    this.useScrape = options.useScrape || false;
    
    this.logger.info(`Maree service initialized with siteId: ${this.siteId}`);
  }

  async getTides(nbDays: number = 3): Promise<TideOutput> {
    try {
      this.logger.debug(`Fetching tides for ${nbDays} days`);
      
      // Calcul des dates
      const fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + nbDays);

      const from = fromDate.toISOString().slice(0, 16);
      const to = toDate.toISOString().slice(0, 16);

      let dataPoints: TidalDataPoint[];

      if (this.useMock) {
        this.logger.warn('Using mock data');
        dataPoints = mockData.data.map(entry => ({
          datetime: entry.time,
          height: entry.height,
          coefficient: null
        }));
      } else {
        // By default use the local scraper instead of the remote API
        this.logger.info('Using local scraper for tide data (no remote API calls)');
        const scrapedData = await scrapeTides(nbDays);
        dataPoints = scrapedData.map(entry => ({
          datetime: `${entry.date}T${entry.time}:00+02:00`,
          height: entry.height,
          coefficient: entry.coefficient ?? null
        }));
      }

      this.logger.info(`Retrieved ${dataPoints.length} tidal data points`);

      // Groupement par jour
      const days: Record<string, TidalDataPoint[]> = {};
      dataPoints.forEach(entry => {
        const date = entry.datetime.slice(0, 10);
        if (!days[date]) days[date] = [];
        days[date].push({
          datetime: entry.datetime,
          height: entry.height,
          coefficient: entry.coefficient ?? null
        });
      });

      // Détection des pleines et basses mers
      const output: TideOutput = {
        siteId: this.siteId,
        timezone: this.timezone,
        intervalMinutes: this.intervalMinutes,
        navihanOffsetHours: this.navihanOffsetHours,
        from,
        to,
        days: {}
      };

      Object.keys(days).sort().forEach(day => {
        const points = days[day];
        const heights = points.map(p => p.height);
        const minHeight = Math.min(...heights);
        const maxHeight = Math.max(...heights);
        const amplitude = maxHeight - minHeight;
        const coefficient = Math.round((amplitude / 7) * 100);
        
        const extremes = this.findExtremes(points).map(ext => {
          if (ext.type === 'low') {
            return {
              time: ext.time,
              height: ext.height,
              type: ext.type,
              coefficient: ext.coefficient ?? coefficient,
              navihan: {
                'Basse mer': this.formatNavihanTime(ext.time, NAVIHAN_BASSE_MER_OFFSET_HOURS),
                'A flot': this.formatNavihanTime(ext.time, NAVIHAN_A_FLOT_OFFSET_HOURS)
              }
            } as Extreme;
          }
          // high
          return {
            time: ext.time,
            height: ext.height,
            type: ext.type,
            coefficient: ext.coefficient ?? coefficient,
            navihan: {
              'Pleine mer': this.formatNavihanTime(ext.time, NAVIHAN_BASSE_MER_OFFSET_HOURS)
            }
          } as Extreme;
        });
        if (extremes.length > 0) {
          output.days[day] = extremes;
        }
      });

      this.logger.info(`Tidal data processed for ${Object.keys(output.days).length} days`);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching tides: ${message}`);
      throw error;
    }
  }

  /**
   * Détecte les extrêmes (pleines et basses mers)
   */
  private findExtremes(points: TidalDataPoint[]): Omit<Extreme, 'navihan'>[] {
    const extremes: Omit<Extreme, 'navihan'>[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1].height;
      const curr = points[i].height;
      const next = points[i + 1].height;

      if (curr >= prev && curr >= next && (curr > prev || curr > next)) {
        extremes.push({
          time: points[i].datetime.slice(11, 16),
          height: curr,
          type: 'high',
          coefficient: points[i].coefficient ?? null
        });
        while (i + 1 < points.length && points[i + 1].height === curr) i++;
      } else if (curr <= prev && curr <= next && (curr < prev || curr < next)) {
        extremes.push({
          time: points[i].datetime.slice(11, 16),
          height: curr,
          type: 'low',
          coefficient: points[i].coefficient ?? null
        });
        while (i + 1 < points.length && points[i + 1].height === curr) i++;
      }
    }
    return extremes;
  }

  /**
   * Formate l'heure Navihan
   */
  private formatNavihanTime(timeStr: string, offsetHours: number = 3): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = (hours * 60 + minutes + offsetHours * 60 + 24 * 60) % (24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Formate l'étiquette de jour avec jour de la semaine et nom du mois
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
   * Formate les données pour l'affichage texte
   */
  formatTextOutput(tideData: TideOutput): string {
    const title = chalk.greenBright.bold(`✅ Marées ${tideData.siteId} du ${tideData.from} au ${tideData.to}`);
    const subtitle = chalk.dim(`Fuseau horaire : ${tideData.timezone} | Intervalle : ${tideData.intervalMinutes} minutes | Navihan : +${tideData.navihanOffsetHours}h`);
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
