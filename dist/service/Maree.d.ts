import { Logger } from 'pino';
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
    private logger;
    private apiKey;
    private siteId;
    private timezone;
    private intervalMinutes;
    private navihanOffsetHours;
    private useMock;
    private useScrape;
    constructor(logger: Logger, apiKey: string, options?: MareeOptions);
    getTides(nbDays?: number): Promise<TideOutput>;
    /**
     * Détecte les extrêmes (pleines et basses mers)
     */
    private findExtremes;
    /**
     * Formate l'heure Navihan
     */
    private formatNavihanTime;
    /**
     * Formate l'étiquette de jour avec jour de la semaine et nom du mois
     */
    private formatDayLabel;
    /**
     * Formate les données pour l'affichage texte
     */
    formatTextOutput(tideData: TideOutput): string;
}
export {};
//# sourceMappingURL=Maree.d.ts.map