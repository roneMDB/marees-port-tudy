import { Logger } from 'pino';
interface Extreme {
    time: string;
    height: number;
    type: 'high' | 'low';
    navihanHour?: string;
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
}
export default class Maree {
    private logger;
    private apiKey;
    private siteId;
    private timezone;
    private intervalMinutes;
    private navihanOffsetHours;
    private useMock;
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
     * Formate les données pour l'affichage texte
     */
    formatTextOutput(tideData: TideOutput): string;
}
export {};
//# sourceMappingURL=Maree.d.ts.map