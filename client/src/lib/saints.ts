/**
 * Saint du jour (issue #13), calendrier civil français usuel — celui des almanachs et du
 * calendrier des postes, fêtes civiles et solennités comprises (Jour de l'an, Fête du Travail,
 * Assomption, Toussaint, Noël…).
 *
 * Donnée **embarquée et figée** : elle ne bouge pas d'une année sur l'autre et n'a pas de raison
 * d'être modifiée depuis l'application, contrairement au lexique du mot du jour (table `lexicon`).
 * Elle reste donc disponible hors-ligne, comme le reste de l'éphéméride.
 *
 * Chaque entrée porte son **libellé complet**, « Saint » / « Sainte » compris. Déduire le genre du
 * prénom serait illusoire : une trentaine de prénoms masculins du calendrier se terminent par
 * « e » (Blaise, Achille, Alexandre, Christophe, Étienne, Jérôme…), et toute heuristique produirait
 * des « Sainte Blaise ». Rangé par mois plutôt qu'en 366 clés plates : les longueurs se vérifient
 * d'un coup d'œil et l'index d'un jour dans son mois est direct.
 */

/** Un tableau par mois (janvier → décembre), le 29 février inclus. */
export const SAINTS_BY_MONTH: readonly (readonly string[])[] = [
  // Janvier
  [
    "Jour de l'an", 'Saint Basile', 'Sainte Geneviève', 'Saint Odilon', 'Saint Édouard',
    'Saint Mélaine', 'Saint Raymond', 'Saint Lucien', 'Sainte Alix', 'Saint Guillaume',
    'Saint Paulin', 'Sainte Tatiana', 'Sainte Yvette', 'Sainte Nina', 'Saint Rémi',
    'Saint Marcel', 'Sainte Roseline', 'Sainte Prisca', 'Saint Marius', 'Saint Sébastien',
    'Sainte Agnès', 'Saint Vincent', 'Saint Barnard', 'Saint François de Sales',
    'Conversion de saint Paul', 'Sainte Paule', 'Sainte Angèle', "Saint Thomas d'Aquin",
    'Saint Gildas', 'Sainte Martine', 'Sainte Marcelle'
  ],
  // Février
  [
    'Sainte Ella', 'Présentation du Seigneur', 'Saint Blaise', 'Sainte Véronique', 'Sainte Agathe',
    'Saint Gaston', 'Sainte Eugénie', 'Sainte Jacqueline', 'Sainte Apolline', 'Saint Arnaud',
    'Notre-Dame de Lourdes', 'Saint Félix', 'Sainte Béatrice', 'Saint Valentin', 'Saint Claude',
    'Sainte Julienne', 'Saint Alexis', 'Sainte Bernadette', 'Saint Gabin', 'Sainte Aimée',
    'Saint Pierre Damien', 'Sainte Isabelle', 'Saint Lazare', 'Saint Modeste', 'Saint Roméo',
    'Saint Nestor', 'Sainte Honorine', 'Saint Romain', 'Saint Auguste'
  ],
  // Mars
  [
    'Saint Aubin', 'Saint Charles le Bon', 'Saint Guénolé', 'Saint Casimir', 'Sainte Olive',
    'Sainte Colette', 'Sainte Félicité', 'Saint Jean de Dieu', 'Sainte Françoise', 'Saint Vivien',
    'Sainte Rosine', 'Sainte Justine', 'Saint Rodrigue', 'Sainte Mathilde', 'Sainte Louise',
    'Sainte Bénédicte', 'Saint Patrice', 'Saint Cyrille', 'Saint Joseph', 'Saint Herbert',
    'Sainte Clémence', 'Sainte Léa', 'Saint Victorien', 'Sainte Catherine de Suède',
    'Annonciation', 'Sainte Larissa', 'Saint Habib', 'Saint Gontran', 'Sainte Gwladys',
    'Saint Amédée', 'Saint Benjamin'
  ],
  // Avril
  [
    'Saint Hugues', 'Sainte Sandrine', 'Saint Richard', 'Saint Isidore', 'Sainte Irène',
    'Saint Marcellin', 'Saint Jean-Baptiste de la Salle', 'Sainte Julie', 'Saint Gautier',
    'Saint Fulbert', 'Saint Stanislas', 'Saint Jules', 'Sainte Ida', 'Saint Maxime',
    'Saint Paterne', 'Saint Benoît-Joseph', 'Saint Anicet', 'Saint Parfait', 'Sainte Emma',
    'Sainte Odette', 'Saint Anselme', 'Saint Alexandre', 'Saint Georges', 'Saint Fidèle',
    'Saint Marc', 'Sainte Alida', 'Sainte Zita', 'Sainte Valérie',
    'Sainte Catherine de Sienne', 'Saint Robert'
  ],
  // Mai
  [
    'Fête du Travail', 'Saint Boris', 'Saints Philippe et Jacques', 'Saint Sylvain',
    'Sainte Judith', 'Sainte Prudence', 'Sainte Gisèle', 'Victoire 1945', 'Saint Pacôme',
    'Sainte Solange', 'Sainte Estelle', 'Saint Achille', 'Sainte Rolande', 'Saint Matthias',
    'Sainte Denise', 'Saint Honoré', 'Saint Pascal', 'Saint Éric', 'Saint Yves',
    'Saint Bernardin', 'Saint Constantin', 'Saint Émile', 'Saint Didier', 'Saint Donatien',
    'Sainte Sophie', 'Saint Bérenger', 'Saint Augustin de Cantorbéry', 'Saint Germain',
    'Saint Aymar', 'Saint Ferdinand', 'Visitation'
  ],
  // Juin
  [
    'Saint Justin', 'Sainte Blandine', 'Saint Kévin', 'Sainte Clotilde', 'Saint Igor',
    'Saint Norbert', 'Saint Gilbert', 'Saint Médard', 'Sainte Diane', 'Saint Landry',
    'Saint Barnabé', 'Saint Guy', 'Saint Antoine de Padoue', 'Saint Élisée', 'Sainte Germaine',
    'Saint Jean-François Régis', 'Saint Hervé', 'Saint Léonce', 'Saint Romuald', 'Saint Silvère',
    'Saint Rodolphe', 'Saint Alban', 'Sainte Audrey', 'Saint Jean-Baptiste', 'Saint Prosper',
    'Saint Anthelme', 'Saint Fernand', 'Saint Irénée', 'Saints Pierre et Paul', 'Saint Martial'
  ],
  // Juillet
  [
    'Saint Thierry', 'Saint Martinien', 'Saint Thomas', 'Saint Florent', 'Saint Antoine-Marie',
    'Sainte Mariette', 'Saint Raoul', 'Saint Thibaut', 'Sainte Amandine', 'Saint Ulrich',
    'Saint Benoît', 'Saint Olivier', 'Saints Henri et Joël', 'Fête nationale', 'Saint Donald',
    'Notre-Dame du Mont-Carmel', 'Sainte Charlotte', 'Saint Frédéric', 'Saint Arsène',
    'Sainte Marina', 'Saint Victor', 'Sainte Marie-Madeleine', 'Sainte Brigitte',
    'Sainte Christine', 'Saint Jacques', 'Sainte Anne et saint Joachim', 'Sainte Nathalie',
    'Saint Samson', 'Sainte Marthe', 'Sainte Juliette', 'Saint Ignace de Loyola'
  ],
  // Août
  [
    'Saint Alphonse', 'Saint Julien Eymard', 'Sainte Lydie', 'Saint Jean-Marie Vianney',
    'Saint Abel', 'Transfiguration', 'Saint Gaétan', 'Saint Dominique', 'Saint Amour',
    'Saint Laurent', 'Sainte Claire', 'Sainte Clarisse', 'Saint Hippolyte', 'Saint Évrard',
    'Assomption', 'Saint Armel', 'Saint Hyacinthe', 'Sainte Hélène', 'Saint Jean-Eudes',
    'Saint Bernard', 'Saint Christophe', 'Saint Fabrice', 'Sainte Rose de Lima',
    'Saint Barthélémy', 'Saint Louis', 'Sainte Natacha', 'Sainte Monique', 'Saint Augustin',
    'Sainte Sabine', 'Saint Fiacre', 'Saint Aristide'
  ],
  // Septembre
  [
    'Saint Gilles', 'Sainte Ingrid', 'Saint Grégoire', 'Sainte Rosalie', 'Sainte Raïssa',
    'Saint Bertrand', 'Sainte Reine', 'Nativité de Marie', 'Saint Alain', 'Sainte Inès',
    'Saint Adelphe', 'Saint Apollinaire', 'Saint Aimé', 'La Sainte Croix', 'Saint Roland',
    'Sainte Édith', 'Saint Renaud', 'Sainte Nadège', 'Sainte Émilie', 'Saint Davy',
    'Saint Matthieu', 'Saint Maurice', 'Saint Constant', 'Sainte Thècle', 'Saint Hermann',
    'Saints Côme et Damien', 'Saint Vincent de Paul', 'Saint Venceslas',
    'Saints Michel, Gabriel et Raphaël', 'Saint Jérôme'
  ],
  // Octobre
  [
    "Sainte Thérèse de l'Enfant-Jésus", 'Saint Léger', 'Saint Gérard', "Saint François d'Assise",
    'Sainte Fleur', 'Saint Bruno', 'Saint Serge', 'Sainte Pélagie', 'Saint Denis',
    'Saint Ghislain', 'Saint Firmin', 'Saint Wilfried', 'Saint Géraud', 'Saint Juste',
    "Sainte Thérèse d'Avila", 'Sainte Edwige', 'Saint Baudouin', 'Saint Luc', 'Saint René',
    'Sainte Adeline', 'Sainte Céline', 'Sainte Élodie', 'Saint Jean de Capistran', 'Saint Florentin',
    'Saint Crépin', 'Saint Dimitri', 'Sainte Émeline', 'Saints Simon et Jude', 'Saint Narcisse',
    'Sainte Bienvenue', 'Saint Quentin'
  ],
  // Novembre
  [
    'Toussaint', 'Jour des Défunts', 'Saint Hubert', 'Saint Charles Borromée', 'Sainte Sylvie',
    'Sainte Bertille', 'Sainte Carine', 'Saint Geoffroy', 'Saint Théodore', 'Saint Léon',
    'Armistice 1918', 'Saint Christian', 'Saint Brice', 'Saint Sidoine', 'Saint Albert',
    'Sainte Marguerite', 'Sainte Élisabeth', 'Sainte Aude', 'Saint Tanguy', 'Saint Edmond',
    'Présentation de Marie', 'Sainte Cécile', 'Saint Clément', 'Sainte Flora',
    'Sainte Catherine', 'Sainte Delphine', 'Saint Séverin', 'Saint Jacques de la Marche',
    'Saint Saturnin', 'Saint André'
  ],
  // Décembre
  [
    'Sainte Florence', 'Sainte Viviane', 'Saint François-Xavier', 'Sainte Barbara',
    'Saint Gérald', 'Saint Nicolas', 'Saint Ambroise', 'Immaculée Conception',
    'Saint Pierre Fourier', 'Saint Romaric', 'Saint Daniel',
    'Sainte Jeanne-Françoise de Chantal', 'Sainte Lucie', 'Sainte Odile', 'Sainte Ninon',
    'Sainte Alice', 'Saint Gaël', 'Saint Gatien', 'Saint Urbain', 'Saint Abraham',
    'Saint Pierre Canisius', 'Sainte Françoise-Xavière', 'Saint Armand', 'Sainte Adèle', 'Noël',
    'Saint Étienne', "Saint Jean l'Évangéliste", 'Saints Innocents', 'Saint David',
    'Saint Roger', 'Saint Sylvestre'
  ]
];

/** Nombre de jours attendu pour chaque mois (février compte son 29). */
export const DAYS_PER_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Saint (ou fête) d'une date `YYYY-MM-DD`, libellé prêt à afficher. Une date hors calendrier
 * renvoie `null` plutôt qu'une valeur inventée.
 */
export function saintOfDay(dateKey: string): string | null {
  const [, month, day] = dateKey.split('-').map(Number);
  return SAINTS_BY_MONTH[month - 1]?.[day - 1] ?? null;
}
