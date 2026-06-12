#!/usr/bin/env node
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

// Parsing des arguments de ligne de commande
const argv = yargs(hideBin(process.argv))
    .option('days', {
        alias: 'd',
        describe: 'Nombre de jours à afficher',
        type: 'number',
        default: 3
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
        const maree = new Maree(logger, {
            siteId: 'ile-de-groix-port-tudy',
            timezone: 'Europe/Paris'
        });

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
