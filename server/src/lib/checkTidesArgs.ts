/** Options de la commande `check-tides`, une fois la ligne de commande interprétée. */
export interface CheckTidesOptions {
  markdown: boolean; // rendre le rapport en markdown plutôt qu'en texte
  fromDb: boolean; // auditer la base de production au lieu des graines embarquées
  sites: string[]; // ids de sites à auditer ; vide = tous
  files: string[]; // fichiers explicites à auditer ; prioritaire sur `sites`/`fromDb`
  errors: string[]; // options invalides, à signaler sans rien exécuter
}

/**
 * Interprète les arguments de `check-tides`. Fonction pure : le script se contente de lire le
 * résultat, ce qui rend la logique d'options testable sans lancer de processus.
 *
 * `--site <id>` peut être répété. Un id inconnu est une **erreur** plutôt qu'un filtre vide, sinon
 * une faute de frappe passerait pour un jeu de données sain.
 */
export function parseCheckArgs(argv: string[], knownSites: string[]): CheckTidesOptions {
  const opts: CheckTidesOptions = { markdown: false, fromDb: false, sites: [], files: [], errors: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--markdown' || arg === '--md') {
      opts.markdown = true;
    } else if (arg === '--db') {
      opts.fromDb = true;
    } else if (arg === '--site') {
      const id = argv[++i];
      if (!id || id.startsWith('-')) opts.errors.push('--site attend un identifiant de port');
      else if (!knownSites.includes(id)) {
        opts.errors.push(`port inconnu « ${id} » (connus : ${knownSites.join(', ')})`);
      } else opts.sites.push(id);
    } else if (arg.startsWith('--site=')) {
      const id = arg.slice('--site='.length);
      if (!knownSites.includes(id)) {
        opts.errors.push(`port inconnu « ${id} » (connus : ${knownSites.join(', ')})`);
      } else opts.sites.push(id);
    } else if (arg.startsWith('-')) {
      opts.errors.push(`option inconnue « ${arg} »`);
    } else {
      opts.files.push(arg);
    }
  }

  if (opts.files.length && opts.fromDb) {
    opts.errors.push('--db et un fichier explicite sont exclusifs');
  }
  return opts;
}
