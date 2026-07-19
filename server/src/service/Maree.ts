import { Logger } from 'pino';
import { readTides, RawTideEntry } from '../lib/readTides';

const NAVIHAN_BASSE_MER_OFFSET_HOURS = 1 + 15 / 60;
const NAVIHAN_A_FLOT_OFFSET_HOURS = 2 + 40 / 60;

/** Libellés des heures Navihan (clés de `Extreme.navihan`, aussi visibles en sortie JSON). */
const NAVIHAN_LABELS = {
  pleineMer: 'Pleine mer',
  basseMer: 'Basse mer',
  aFlot: 'A flot'
} as const;

/** Un extrême de marée (pleine ou basse mer) enrichi des heures Navihan dérivées. */
export interface Extreme {
  time: string;
  height: number;
  type: 'high' | 'low';
  navihan: Record<string, string>;
  coefficient: number | null;
}

/** Marées d'une période, indexées par jour (`YYYY-MM-DD`). */
export interface TideOutput {
  siteId: string;
  timezone: string;
  from: string;
  to: string;
  days: Record<string, Extreme[]>;
}

/** Métadonnées du jeu de données (bornes disponibles, offsets Navihan). */
export interface TidesMeta {
  siteId: string;
  timezone: string;
  minDate: string | null;
  maxDate: string | null;
  navihanOffsets: {
    basseMer: string;
    aFlot: string;
  };
}

export interface MareeOptions {
  siteId?: string;
  timezone?: string;
  /** Chemin du fichier d'horaires ; par défaut la graine embarquée (`readTides`). */
  dataFile?: string;
}

export default class Maree {
  private logger: Logger;
  private siteId: string;
  private timezone: string;
  private dataFile?: string;

  constructor(logger: Logger, options: MareeOptions = {}) {
    this.logger = logger;
    this.siteId = options.siteId || 'ile-de-groix-port-tudy';
    this.timezone = options.timezone || 'Europe/Paris';
    this.dataFile = options.dataFile;

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

    const rawData = readTides(this.dataFile);
    const output: TideOutput = { siteId: this.siteId, timezone: this.timezone, from, to, days: {} };

    // `to` est exclusif ici (fenêtre glissante depuis aujourd'hui).
    Object.keys(rawData)
      .filter(day => day >= from && day < to)
      .sort()
      .forEach(day => {
        const extremes = this.mapDay(rawData[day]);
        if (extremes.length > 0) {
          output.days[day] = extremes;
        }
      });

    this.logger.info(`Tidal data loaded for ${Object.keys(output.days).length} days`);
    return output;
  }

  /**
   * Récupère les marées sur une plage `[from, to]` **inclusive** (clés `YYYY-MM-DD`).
   * Sans bornes, renvoie toute la plage disponible dans le fichier. Une borne
   * manquante est remplacée par la date min/max disponible.
   */
  async getTidesRange(from?: string, to?: string): Promise<TideOutput> {
    const rawData = readTides(this.dataFile);
    const allDates = Object.keys(rawData).sort();
    const minDate = allDates[0] ?? '';
    const maxDate = allDates[allDates.length - 1] ?? '';

    const effFrom = from ?? minDate;
    const effTo = to ?? maxDate;

    const output: TideOutput = {
      siteId: this.siteId,
      timezone: this.timezone,
      from: effFrom,
      to: effTo,
      days: {}
    };

    allDates
      .filter(day => day >= effFrom && day <= effTo)
      .forEach(day => {
        const extremes = this.mapDay(rawData[day]);
        if (extremes.length > 0) {
          output.days[day] = extremes;
        }
      });

    this.logger.info(
      `Tidal range loaded (${effFrom} → ${effTo}) : ${Object.keys(output.days).length} days`
    );
    return output;
  }

  /**
   * Renvoie les métadonnées du jeu de données : bornes de dates disponibles et
   * libellés des décalages Navihan.
   */
  getMeta(): TidesMeta {
    const rawData = readTides(this.dataFile);
    const dates = Object.keys(rawData).sort();
    return {
      siteId: this.siteId,
      timezone: this.timezone,
      minDate: dates[0] ?? null,
      maxDate: dates[dates.length - 1] ?? null,
      navihanOffsets: {
        basseMer: this.formatOffsetLabel(NAVIHAN_BASSE_MER_OFFSET_HOURS),
        aFlot: this.formatOffsetLabel(NAVIHAN_A_FLOT_OFFSET_HOURS)
      }
    };
  }

  /**
   * Filtre les entrées valides d'un jour, les mappe en extrêmes et les trie par heure.
   */
  private mapDay(entries: RawTideEntry[]): Extreme[] {
    return entries
      .filter(entry => entry.heure)
      .map(entry => this.toExtreme(entry))
      .sort((a, b) => a.time.localeCompare(b.time));
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
}
