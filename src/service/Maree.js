const axios = require('axios');
const Table = require('cli-table3');
const chalk = require('chalk');
const mockData = require('../mockData');

class Maree {
    constructor(logger, apiKey, options = {}) {
        this.logger = logger;
        this.apiKey = apiKey;
        this.siteId = options.siteId || "ile-de-groix-port-tudy";
        this.timezone = options.timezone || "Europe/Paris";
        this.intervalMinutes = options.intervalMinutes || 5;
        this.navihanOffsetHours = options.navihanOffsetHours || 2.75;
        this.useMock = options.useMock || false;
        
        this.logger.info(`Maree service initialized with siteId: ${this.siteId}`);
    }

    async getTides(nbDays = 3) {
        try {
            this.logger.debug(`Fetching tides for ${nbDays} days`);
            
            // Calcul des dates
            const fromDate = new Date();
            fromDate.setHours(0, 0, 0, 0);
            const toDate = new Date(fromDate);
            toDate.setDate(toDate.getDate() + nbDays);

            const from = fromDate.toISOString().slice(0, 16);
            const to = toDate.toISOString().slice(0, 16);

            let response;
            if (this.useMock) {
                this.logger.warn('Using mock data');
                response = { data: mockData };
            } else {
                response = await axios.get('https://api-maree.fr/water-levels', {
                    params: {
                        key: this.apiKey,
                        site: this.siteId,
                        from: from,
                        to: to,
                        step: this.intervalMinutes.toString(),
                        tz: this.timezone
                    }
                });
            }

            const dataApiMaree = response.data.data;
            this.logger.info(`Retrieved ${dataApiMaree.length} tidal data points`);

            // Groupement par jour
            const days = {};
            dataApiMaree.forEach(entry => {
                const date = entry.time.slice(0, 10);
                if (!days[date]) days[date] = [];
                days[date].push({
                    datetime: entry.time,
                    height: entry.height
                });
            });

            // Détection des pleines et basses mers
            const output = {
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
                const extremes = this.findExtremes(points).map(ext => ({
                    time: ext.time,
                    height: ext.height,
                    type: ext.type,
                    navihanHour: this.formatNavihanTime(ext.time, this.navihanOffsetHours)
                }));
                if (extremes.length > 0) {
                    output.days[day] = extremes;
                }
            });

            this.logger.info(`Tidal data processed for ${Object.keys(output.days).length} days`);
            return output;
        } catch (error) {
            this.logger.error(`Error fetching tides: ${error.response?.data || error.message}`);
            throw error;
        }
    }

    /**
     * Détecte les extrêmes (pleines et basses mers)
     */
    findExtremes(points) {
        const extremes = [];
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1].height;
            const curr = points[i].height;
            const next = points[i + 1].height;

            if (curr >= prev && curr >= next && (curr > prev || curr > next)) {
                extremes.push({
                    time: points[i].datetime.slice(11, 16),
                    height: curr,
                    type: 'high'
                });
                while (i + 1 < points.length && points[i + 1].height === curr) i++;
            } else if (curr <= prev && curr <= next && (curr < prev || curr < next)) {
                extremes.push({
                    time: points[i].datetime.slice(11, 16),
                    height: curr,
                    type: 'low'
                });
                while (i + 1 < points.length && points[i + 1].height === curr) i++;
            }
        }
        return extremes;
    }

    /**
     * Formate l'heure Navihan
     */
    formatNavihanTime(timeStr, offsetHours = 3) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = (hours * 60 + minutes + offsetHours * 60 + 24 * 60) % (24 * 60);
        const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        const m = (totalMinutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    /**
     * Formatte les données pour l'affichage texte
     */
    formatTextOutput(tideData) {
        const title = chalk.greenBright.bold(`✅ Marées ${tideData.siteId} du ${tideData.from} au ${tideData.to}`);
        const subtitle = chalk.dim(`Fuseau horaire : ${tideData.timezone} | Intervalle : ${tideData.intervalMinutes} minutes | Navihan : +${tideData.navihanOffsetHours}h`);
        let output = `${title}\n${subtitle}\n\n`;

        Object.keys(tideData.days).sort().forEach(day => {
            const table = new Table({
                head: [chalk.cyan.bold('Port-Tudy'), chalk.cyan.bold('Navihan')],
                colWidths: [52, 52],
                wordWrap: true,
                style: { head: ['cyan'] }
            });

            tideData.days[day].forEach(ext => {
                const typeLabel = ext.type === 'high'
                    ? chalk.blue.bold('🌊 Pleine Mer')
                    : chalk.yellow.bold('⬇️ Basse Mer');
                const portText = `${chalk.white.bold(ext.time)} ${chalk.white(`${ext.height.toFixed(2)}m`)} ${typeLabel}`;
                const navihanText = `${chalk.green.bold(ext.navihanHour || '—')} ${chalk.white(`${ext.height.toFixed(2)}m`)} ${typeLabel}`;
                table.push([portText, navihanText]);
            });

            output += `${chalk.magenta.bold(`📅 ${day}`)}\n`;
            output += `${table.toString()}\n\n`;
        });

        return output;
    }
}

module.exports = Maree;
