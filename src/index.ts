#!/usr/bin/env node
import 'dotenv/config';
import pino from 'pino';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import Maree from './service/Maree';

// Initialisation du logger
const logger = pino({
    level: (process.env.LOG_LEVEL || 'info') as any,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
});

function getApiKey(): string | undefined {
    const apiKey = process.env.API_MAREE_KEY;
    if (!apiKey) {
        logger.warn('⚠️ Aucune clé API fournie (API désactivée). Le scraper local sera utilisé.');
    }
    return apiKey;
}

// Parsing des arguments de ligne de commande
const argv = yargs(hideBin(process.argv))
    .option('interval-minutes', {
        alias: 'i',
        describe: 'Intervalle de temps en minutes',
        type: 'number',
        default: 5
    })
    .option('navihan-offset-hours', {
        alias: 'n',
        describe: 'Décalage horaire (en heures) pour Navihan',
        type: 'number',
        default: 2.75
    })
    .option('days', {
        alias: 'd',
        describe: 'Nombre de jours à afficher',
        type: 'number',
        default: 3
    })
    .option('use-mock', {
        alias: 'm',
        describe: 'Utiliser les données de test',
        type: 'boolean',
        default: process.env.MOCK === "true"
    })
    .option('use-scrape', {
        alias: 's',
        describe: 'Récupérer les données par scraping depuis maree.shom.fr',
        type: 'boolean',
        default: process.env.SCRAPE === "true"
    })
    .option('output-format', {
        alias: 'f',
        describe: 'Format de sortie (text ou json)',
        type: 'string',
        choices: ['text', 'json'],
        default: 'text'
    })
    .help()
    .alias('help', 'h')
    .parseSync();

async function main(): Promise<void> {
    try {
        const API_KEY = getApiKey();

        // Instanciation du service avec le logger
        const maree = new Maree(logger, API_KEY || '', {
            siteId: "ile-de-groix-port-tudy",
            timezone: "Europe/Paris",
            intervalMinutes: argv.intervalMinutes,
            navihanOffsetHours: argv.navihanOffsetHours,
            useMock: argv.useMock,
            useScrape: argv.useScrape
        });

        if (argv.useMock) {
            logger.warn('⚠️ MODE MOCK ACTIVÉ : utilisation des données de test');
        }

        const tideData = await maree.getTides(argv.days);

        // Affichage selon le format choisi
        if (argv.outputFormat === 'json') {
            console.log(JSON.stringify(tideData, null, 2));
        } else {
            console.log(maree.formatTextOutput(tideData));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Erreur : ${message}`);
        process.exit(1);
    }
}

main();
