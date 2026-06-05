require('dotenv').config();
const pino = require('pino');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const Maree = require('./service/Maree');

// Initialisation du logger
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
});

const API_KEY = process.env.API_MAREE_KEY;

if (!API_KEY) {
    logger.error("❌ Erreur : Ajoute ta clé API dans un fichier .env");
    process.exit(1);
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

async function main() {
    try {
        // Instanciation du service avec le logger
        const maree = new Maree(logger, API_KEY, {
            siteId: "ile-de-groix-port-tudy",
            timezone: "Europe/Paris",
            intervalMinutes: argv.intervalMinutes,
            navihanOffsetHours: argv.navihanOffsetHours,
            useMock: argv.useMock
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
        logger.error(`❌ Erreur : ${error.message}`);
        process.exit(1);
    }
}

main();