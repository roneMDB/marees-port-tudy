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
        describe: 'Format de sortie (text, json, markdown, print ou html)',
        type: 'string',
        choices: ['text', 'json', 'markdown', 'print', 'html'],
        default: 'text'
    })
    .option('columns', {
        alias: 'c',
        describe: 'Colonnes à afficher, séparées par des virgules (formats tableau). '
            + 'Ex: basse-mer,pleine-mer,a-flot,coef',
        type: 'string'
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

        const columns = argv.columns
            ? argv.columns.split(',').map(s => s.trim()).filter(Boolean)
            : undefined;

        // Affichage selon le format choisi
        if (argv.outputFormat === 'json') {
            console.log(JSON.stringify(tideData, null, 2));
        } else if (argv.outputFormat === 'markdown') {
            console.log(maree.formatMarkdownOutput(tideData, columns));
        } else if (argv.outputFormat === 'html') {
            console.log(maree.formatHtmlOutput(tideData, columns));
        } else if (argv.outputFormat === 'print') {
            console.log(maree.formatPrintOutput(tideData, columns));
        } else {
            console.log(maree.formatTextOutput(tideData, columns));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Erreur : ${message}`);
        process.exit(1);
    }
}

main();
