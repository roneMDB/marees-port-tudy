/**
 * Lexique par défaut du « mot du jour » (issue #4, suite) : socle amorcé en base au premier
 * démarrage (table `lexicon`). Les termes sont ensuite éditables via l'API / le panneau admin ;
 * ce fichier sert de graine et de source du « rétablir les défauts ».
 */
export type LexiconType = 'maree' | 'peche';

export interface LexiconSeedEntry {
  id: string;
  term: string;
  definition: string;
  type: LexiconType;
}

export const LEXICON_SEED: LexiconSeedEntry[] = [
  { id: "grande-maree", term: "Grande marée", type: "maree", definition: "Marée à très fort coefficient (≥ 100) : la mer monte très haut puis se retire très bas. Le grand jour de la pêche à pied." },
  { id: "vive-eau", term: "Vive-eau", type: "maree", definition: "Période de fortes marées, au marnage important, autour de la pleine et de la nouvelle lune (syzygie). Les coefficients sont élevés." },
  { id: "morte-eau", term: "Morte-eau", type: "maree", definition: "Période de faibles marées, au marnage réduit, autour des quartiers de lune (quadrature). La mer bouge peu : coefficients bas (< 45)." },
  { id: "revif", term: "Revif", type: "maree", definition: "Reprise de la marée : d’un jour à l’autre les coefficients remontent, de la morte-eau vers la vive-eau." },
  { id: "dechet", term: "Déchet", type: "maree", definition: "Déclin de la marée : d’un jour à l’autre les coefficients diminuent, de la vive-eau vers la morte-eau." },
  { id: "coefficient", term: "Coefficient", type: "maree", definition: "Mesure de l’amplitude d’une marée, de 20 à 120. 70 correspond à une marée moyenne, 100 à une vive-eau d’équinoxe." },
  { id: "marnage", term: "Marnage", type: "maree", definition: "Différence de hauteur d’eau entre une pleine mer et la basse mer qui suit. Il grandit en vive-eau, se réduit en morte-eau." },
  { id: "estran", term: "Estran", type: "maree", definition: "Partie du littoral découverte à marée basse et recouverte à marée haute : le terrain de jeu de la pêche à pied." },
  { id: "flot", term: "Flot", type: "maree", definition: "La marée montante, quand la mer gagne du terrain vers la côte (le flux)." },
  { id: "jusant", term: "Jusant", type: "maree", definition: "La marée descendante, quand la mer se retire vers le large (le reflux)." },
  { id: "etale", term: "Étale", type: "maree", definition: "Court instant où le niveau ne varie plus, entre flot et jusant : l’eau est « étale » à la pleine et à la basse mer." },
  { id: "syzygie", term: "Syzygie", type: "maree", definition: "Alignement de la Terre, de la Lune et du Soleil (pleine ou nouvelle lune). Leurs attractions s’ajoutent : ce sont les vives-eaux." },
  { id: "quadrature", term: "Quadrature", type: "maree", definition: "Lune au premier ou au dernier quartier, à angle droit avec le Soleil. Les attractions se contrarient : ce sont les mortes-eaux." },
  { id: "pleine-mer", term: "Pleine mer", type: "maree", definition: "Niveau le plus haut atteint par la mer au cours d’une marée, avant qu’elle ne redescende." },
  { id: "basse-mer", term: "Basse mer", type: "maree", definition: "Niveau le plus bas atteint par la mer au cours d’une marée, avant qu’elle ne remonte." },
  { id: "maregramme", term: "Marégramme", type: "maree", definition: "Courbe de la hauteur d’eau en fonction du temps : elle dessine la « respiration » de la marée." },
  { id: "renverse", term: "Renverse", type: "maree", definition: "Instant où le courant de marée s’inverse pour repartir dans l’autre sens. Elle suit l’étale, souvent avec un peu de retard." },
  { id: "zero-hydrographique", term: "Zéro hydrographique", type: "maree", definition: "Niveau de référence des cartes marines, calé sur les plus basses mers. Les hauteurs d’eau et les sondes se comptent à partir de lui." },
  { id: "semi-diurne", term: "Marée semi-diurne", type: "maree", definition: "Régime de deux pleines mers et deux basses mers par jour, propre à la façade atlantique : une marée toutes les 6 h 12 environ." },
  { id: "equinoxe", term: "Marée d’équinoxe", type: "maree", definition: "Aux équinoxes de printemps et d’automne, Soleil et Lune s’alignent au mieux : la mer donne alors ses plus grandes marées de l’année." },
  { id: "surcote", term: "Surcote", type: "maree", definition: "Montée de la mer au-dessus de la hauteur prévue, poussée par le vent et la dépression. Quand la mer reste plus basse que prévu, c’est une décote." },
  { id: "ria", term: "Ria (aber)", type: "maree", definition: "Ancienne vallée envahie par la mer, où la marée remonte loin dans les terres. La ria d’Étel, d’où l’on part de Navihan, en est une." },
  { id: "laisse-de-mer", term: "Laisse de mer", type: "maree", definition: "Ruban d’algues et de coquillages abandonné par la mer en haut de l’estran, à la limite atteinte par la pleine mer." },
  { id: "regle-des-douziemes", term: "Règle des douzièmes", type: "maree", definition: "Règle de marin : de la basse à la pleine mer, l’eau monte de 1, 2, 3, 3, 2, 1 douzièmes du marnage par heure. Le flot est le plus vif à mi-marée." },
  { id: "perigee", term: "Périgée lunaire", type: "maree", definition: "Point où la Lune passe au plus près de la Terre. Son attraction se renforce et gonfle les marées : ce sont les marées de périgée." },
  { id: "slikke", term: "Slikke", type: "maree", definition: "Vasière molle de l’estran, découverte à basse mer. Plus haut commence le schorre, la prairie salée que la mer n’atteint qu’aux grandes marées." },
  { id: "mascaret", term: "Mascaret", type: "maree", definition: "Vague qui remonte un estuaire à marée montante, quand le flot s’engouffre plus vite que le courant du fleuve qui descend." },
  { id: "casier", term: "Casier", type: "peche", definition: "Piège grillagé et appâté, posé sur le fond, pour capturer crabes, tourteaux et crevettes. On le relève à la marée favorable." },
  { id: "esche", term: "Esche", type: "peche", definition: "Appât naturel fixé à l’hameçon ou glissé dans le casier pour attirer la prise. « Escher », c’est le mettre en place." },
  { id: "vivier", term: "Vivier", type: "peche", definition: "Bac ou seau oxygéné où l’on garde les prises bien vivantes jusqu’au retour au port." },
  { id: "ferrer", term: "Ferrer", type: "peche", definition: "Donner un coup sec au bon moment pour planter l’hameçon dans la bouche du poisson qui vient de mordre." },
  { id: "bredouille", term: "Bredouille", type: "peche", definition: "Rentrer bredouille, c’est revenir sans la moindre prise — le sort que tout pêcheur cherche à éviter." },
  { id: "bar", term: "Bar (loup)", type: "peche", definition: "Poisson argenté et combatif, roi des pêches aux leurres en Morbihan. Il chasse dans les courants et les remous que crée la marée." },
  { id: "dorade", term: "Dorade (daurade)", type: "peche", definition: "La royale, au front bombé doré, et la grise plus commune : poissons prisés qui fouillent les fonds de sable et de coquilles." },
  { id: "maquereau", term: "Maquereau", type: "peche", definition: "Poisson de surface rapide et vorace, qui passe l’été en bancs serrés ; on le pêche en mitraillette de petits leurres." },
  { id: "seiche", term: "Seiche", type: "peche", definition: "Céphalopode côtier pêché à la turlutte au printemps ; pour fuir, elle disparaît dans un nuage d’encre." },
  { id: "lancon", term: "Lançon (équille)", type: "peche", definition: "Petit poisson effilé qui s’enfouit dans le sable de l’estran. Proie favorite du bar, et appât redoutable." },
  { id: "arenicole", term: "Arénicole", type: "peche", definition: "Gros ver des vasières, trahi par ses tortillons de sable et récolté à marée basse. Un appât de choix pour la dorade." },
  { id: "leurre", term: "Leurre", type: "peche", definition: "Appât artificiel — souple, dur ou métallique — qui imite une proie pour déclencher l’attaque du prédateur." },
  { id: "surfcasting", term: "Surfcasting", type: "peche", definition: "Pêche du bord au lancer lointain, l’appât posé sur le fond au-delà de la barre, souvent de nuit et à marée montante." },
  { id: "traine", term: "Traîne", type: "peche", definition: "On remorque un leurre derrière le bateau en marche pour couvrir du terrain et provoquer le bar en maraude." },
  { id: "turlutte", term: "Turlutte", type: "peche", definition: "Leurre fusiforme hérissé de pointes pour la seiche et le calamar, animé par petites tirées sèches." },
  { id: "baine", term: "Baïne", type: "peche", definition: "Cuvette creusée dans le sable par les courants, qui se vide vite à marée descendante : poste à poissons, mais piège pour le baigneur." }
];
