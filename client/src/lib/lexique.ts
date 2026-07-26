import { coefBand } from './format';

/** Catégorie d'un terme : marée/mer ou pêche. */
export type LexiconType = 'maree' | 'peche';

/** Une entrée du lexique : un terme, sa définition courte et sa catégorie. */
export interface LexiconEntry {
  id: string;
  term: string;
  definition: string;
  type: LexiconType;
}

/**
 * Lexique des marées (esprit maree.info) enrichi de termes de mer et de pêche (casier + ligne :
 * bar, dorade et autres poissons du Morbihan). Le `type` est dérivé de `PECHE_IDS` plus bas.
 * Les termes « contextuels » (grande-maree, vive-eau, morte-eau, revif, dechet) ne sortent que
 * lorsque le cas se produit ; les autres alimentent la rotation quotidienne (cf. ROTATION).
 */
const RAW_LEXIQUE: Omit<LexiconEntry, 'type'>[] = [
  {
    id: 'grande-maree',
    term: 'Grande marée',
    definition:
      'Marée à très fort coefficient (≥ 100) : la mer monte très haut puis se retire très bas. Le grand jour de la pêche à pied.'
  },
  {
    id: 'vive-eau',
    term: 'Vive-eau',
    definition:
      'Période de fortes marées, au marnage important, autour de la pleine et de la nouvelle lune (syzygie). Les coefficients sont élevés.'
  },
  {
    id: 'morte-eau',
    term: 'Morte-eau',
    definition:
      'Période de faibles marées, au marnage réduit, autour des quartiers de lune (quadrature). La mer bouge peu : coefficients bas (< 45).'
  },
  {
    id: 'revif',
    term: 'Revif',
    definition:
      'Reprise de la marée : d’un jour à l’autre les coefficients remontent, de la morte-eau vers la vive-eau.'
  },
  {
    id: 'dechet',
    term: 'Déchet',
    definition:
      'Déclin de la marée : d’un jour à l’autre les coefficients diminuent, de la vive-eau vers la morte-eau.'
  },
  {
    id: 'coefficient',
    term: 'Coefficient',
    definition:
      'Mesure de l’amplitude d’une marée, de 20 à 120. 70 correspond à une marée moyenne, 100 à une vive-eau d’équinoxe.'
  },
  {
    id: 'marnage',
    term: 'Marnage',
    definition:
      'Différence de hauteur d’eau entre une pleine mer et la basse mer qui suit. Il grandit en vive-eau, se réduit en morte-eau.'
  },
  {
    id: 'estran',
    term: 'Estran',
    definition:
      'Partie du littoral découverte à marée basse et recouverte à marée haute : le terrain de jeu de la pêche à pied.'
  },
  {
    id: 'flot',
    term: 'Flot',
    definition: 'La marée montante, quand la mer gagne du terrain vers la côte (le flux).'
  },
  {
    id: 'jusant',
    term: 'Jusant',
    definition: 'La marée descendante, quand la mer se retire vers le large (le reflux).'
  },
  {
    id: 'etale',
    term: 'Étale',
    definition:
      'Court instant où le niveau ne varie plus, entre flot et jusant : l’eau est « étale » à la pleine et à la basse mer.'
  },
  {
    id: 'syzygie',
    term: 'Syzygie',
    definition:
      'Alignement de la Terre, de la Lune et du Soleil (pleine ou nouvelle lune). Leurs attractions s’ajoutent : ce sont les vives-eaux.'
  },
  {
    id: 'quadrature',
    term: 'Quadrature',
    definition:
      'Lune au premier ou au dernier quartier, à angle droit avec le Soleil. Les attractions se contrarient : ce sont les mortes-eaux.'
  },
  {
    id: 'pleine-mer',
    term: 'Pleine mer',
    definition: 'Niveau le plus haut atteint par la mer au cours d’une marée, avant qu’elle ne redescende.'
  },
  {
    id: 'basse-mer',
    term: 'Basse mer',
    definition: 'Niveau le plus bas atteint par la mer au cours d’une marée, avant qu’elle ne remonte.'
  },
  {
    id: 'maregramme',
    term: 'Marégramme',
    definition: 'Courbe de la hauteur d’eau en fonction du temps : elle dessine la « respiration » de la marée.'
  },
  {
    id: 'renverse',
    term: 'Renverse',
    definition:
      'Instant où le courant de marée s’inverse pour repartir dans l’autre sens. Elle suit l’étale, souvent avec un peu de retard.'
  },
  {
    id: 'zero-hydrographique',
    term: 'Zéro hydrographique',
    definition:
      'Niveau de référence des cartes marines, calé sur les plus basses mers. Les hauteurs d’eau et les sondes se comptent à partir de lui.'
  },
  {
    id: 'semi-diurne',
    term: 'Marée semi-diurne',
    definition:
      'Régime de deux pleines mers et deux basses mers par jour, propre à la façade atlantique : une marée toutes les 6 h 12 environ.'
  },
  {
    id: 'equinoxe',
    term: 'Marée d’équinoxe',
    definition:
      'Aux équinoxes de printemps et d’automne, Soleil et Lune s’alignent au mieux : la mer donne alors ses plus grandes marées de l’année.'
  },
  {
    id: 'surcote',
    term: 'Surcote',
    definition:
      'Montée de la mer au-dessus de la hauteur prévue, poussée par le vent et la dépression. Quand la mer reste plus basse que prévu, c’est une décote.'
  },
  {
    id: 'ria',
    term: 'Ria (aber)',
    definition:
      'Ancienne vallée envahie par la mer, où la marée remonte loin dans les terres. La ria d’Étel, d’où l’on part de Navihan, en est une.'
  },
  {
    id: 'laisse-de-mer',
    term: 'Laisse de mer',
    definition:
      'Ruban d’algues et de coquillages abandonné par la mer en haut de l’estran, à la limite atteinte par la pleine mer.'
  },
  {
    id: 'regle-des-douziemes',
    term: 'Règle des douzièmes',
    definition:
      'Règle de marin : de la basse à la pleine mer, l’eau monte de 1, 2, 3, 3, 2, 1 douzièmes du marnage par heure. Le flot est le plus vif à mi-marée.'
  },
  {
    id: 'perigee',
    term: 'Périgée lunaire',
    definition:
      'Point où la Lune passe au plus près de la Terre. Son attraction se renforce et gonfle les marées : ce sont les marées de périgée.'
  },
  {
    id: 'slikke',
    term: 'Slikke',
    definition:
      'Vasière molle de l’estran, découverte à basse mer. Plus haut commence le schorre, la prairie salée que la mer n’atteint qu’aux grandes marées.'
  },
  {
    id: 'mascaret',
    term: 'Mascaret',
    definition:
      'Vague qui remonte un estuaire à marée montante, quand le flot s’engouffre plus vite que le courant du fleuve qui descend.'
  },
  {
    id: 'casier',
    term: 'Casier',
    definition:
      'Piège grillagé et appâté, posé sur le fond, pour capturer crabes, tourteaux et crevettes. On le relève à la marée favorable.'
  },
  {
    id: 'esche',
    term: 'Esche',
    definition:
      'Appât naturel fixé à l’hameçon ou glissé dans le casier pour attirer la prise. « Escher », c’est le mettre en place.'
  },
  {
    id: 'vivier',
    term: 'Vivier',
    definition: 'Bac ou seau oxygéné où l’on garde les prises bien vivantes jusqu’au retour au port.'
  },
  {
    id: 'ferrer',
    term: 'Ferrer',
    definition:
      'Donner un coup sec au bon moment pour planter l’hameçon dans la bouche du poisson qui vient de mordre.'
  },
  {
    id: 'bredouille',
    term: 'Bredouille',
    definition:
      'Rentrer bredouille, c’est revenir sans la moindre prise — le sort que tout pêcheur cherche à éviter.'
  },
  {
    id: 'bar',
    term: 'Bar (loup)',
    definition:
      'Poisson argenté et combatif, roi des pêches aux leurres en Morbihan. Il chasse dans les courants et les remous que crée la marée.'
  },
  {
    id: 'dorade',
    term: 'Dorade (daurade)',
    definition:
      'La royale, au front bombé doré, et la grise plus commune : poissons prisés qui fouillent les fonds de sable et de coquilles.'
  },
  {
    id: 'maquereau',
    term: 'Maquereau',
    definition:
      'Poisson de surface rapide et vorace, qui passe l’été en bancs serrés ; on le pêche en mitraillette de petits leurres.'
  },
  {
    id: 'seiche',
    term: 'Seiche',
    definition:
      'Céphalopode côtier pêché à la turlutte au printemps ; pour fuir, elle disparaît dans un nuage d’encre.'
  },
  {
    id: 'lancon',
    term: 'Lançon (équille)',
    definition:
      'Petit poisson effilé qui s’enfouit dans le sable de l’estran. Proie favorite du bar, et appât redoutable.'
  },
  {
    id: 'arenicole',
    term: 'Arénicole',
    definition:
      'Gros ver des vasières, trahi par ses tortillons de sable et récolté à marée basse. Un appât de choix pour la dorade.'
  },
  {
    id: 'leurre',
    term: 'Leurre',
    definition:
      'Appât artificiel — souple, dur ou métallique — qui imite une proie pour déclencher l’attaque du prédateur.'
  },
  {
    id: 'surfcasting',
    term: 'Surfcasting',
    definition:
      'Pêche du bord au lancer lointain, l’appât posé sur le fond au-delà de la barre, souvent de nuit et à marée montante.'
  },
  {
    id: 'traine',
    term: 'Traîne',
    definition:
      'On remorque un leurre derrière le bateau en marche pour couvrir du terrain et provoquer le bar en maraude.'
  },
  {
    id: 'turlutte',
    term: 'Turlutte',
    definition:
      'Leurre fusiforme hérissé de pointes pour la seiche et le calamar, animé par petites tirées sèches.'
  },
  {
    id: 'baine',
    term: 'Baïne',
    definition:
      'Cuvette creusée dans le sable par les courants, qui se vide vite à marée descendante : poste à poissons, mais piège pour le baigneur.'
  }
];

/** Termes de pêche (les autres entrées sont des termes de marée / mer). */
const PECHE_IDS = new Set<string>([
  'casier', 'esche', 'vivier', 'ferrer', 'bredouille',
  'bar', 'dorade', 'maquereau', 'seiche', 'lancon', 'arenicole',
  'leurre', 'surfcasting', 'traine', 'turlutte', 'baine'
]);

/** Lexique final : chaque entrée reçoit sa catégorie (`peche` si listée, sinon `maree`). */
export const LEXIQUE: LexiconEntry[] = RAW_LEXIQUE.map(e => ({
  ...e,
  type: PECHE_IDS.has(e.id) ? 'peche' : 'maree'
}));

/** Termes de marée « contextuels » : ne sortent que lorsque la marée du jour le justifie. */
const CONTEXTUAL_IDS = new Set(['grande-maree', 'vive-eau', 'morte-eau', 'revif', 'dechet']);


/** Écart minimal de coefficient (vs la veille) pour parler de revif / déchet. */
const TREND_THRESHOLD = 8;

/** Contexte de marée d’un jour, pour choisir le mot du jour. */
export interface DayContext {
  dateKey: string; // aujourd'hui (YYYY-MM-DD)
  coef: number | null; // plus fort coefficient du jour
  prevCoef: number | null; // plus fort coefficient de la veille (revif / déchet)
}

/** Mappe un coefficient vers l’id de terme de sa bande, via `coefBand` (source unique). */
function bandId(coef: number): string | null {
  switch (coefBand(coef).label) {
    case 'Grande marée':
      return 'grande-maree';
    case 'Grande vive-eau':
    case 'Vive-eau':
      return 'vive-eau';
    case 'Morte-eau':
      return 'morte-eau';
    default:
      return null; // marée moyenne / inconnu → on regarde la tendance
  }
}

/** Hash déterministe d’une date `YYYY-MM-DD` (stable dans la journée, tourne chaque jour). */
function hashDate(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Choisit le mot du jour :
 *  1) contextuel prioritaire — grande marée / vive-eau / morte-eau (bande de coef),
 *     sinon revif / déchet si la tendance vs la veille est marquée : **on privilégie alors un
 *     terme de marée**, car la marée du jour est le fait marquant ;
 *  2) à défaut (marée peu marquante), rotation déterministe par date **surtout sur les termes de
 *     pêche**, avec 1 jour sur 3 un terme de marée « pédagogique » pour la variété.
 * Renvoie toujours une entrée, même sans coefficient (jour hors données).
 *
 * `offset` = nombre de « nouveau mot » demandés par l'utilisateur (bouton de la carte) : `0` donne
 * le mot du jour, chaque cran avance d'une entrée dans le lexique et un tour complet ramène au mot
 * du jour. Déterministe (aucun aléa) : même contexte + même offset → même mot.
 */
export function noteOfTheDay(
  ctx: DayContext,
  lexicon: LexiconEntry[] = LEXIQUE,
  offset = 0
): LexiconEntry {
  const base = dayNote(ctx, lexicon);
  if (!offset || lexicon.length < 2) return base;
  const from = Math.max(0, lexicon.findIndex(e => e.id === base?.id));
  const n = lexicon.length;
  return lexicon[(((from + offset) % n) + n) % n];
}

/** Mot du jour « canonique » (offset 0) : contextuel si la marée est marquante, sinon rotation. */
function dayNote(ctx: DayContext, lexicon: LexiconEntry[]): LexiconEntry {
  const { coef, prevCoef, dateKey } = ctx;
  const byId = (wanted: string) => lexicon.find(e => e.id === wanted);
  let id: string | null = null;

  if (coef != null) {
    id = bandId(coef);
    // Marée moyenne : la tendance (revif / déchet) devient le fait marquant du jour.
    if (id == null && prevCoef != null) {
      const delta = coef - prevCoef;
      if (delta >= TREND_THRESHOLD) id = 'revif';
      else if (delta <= -TREND_THRESHOLD) id = 'dechet';
    }
  }

  const contextual = id != null ? byId(id) : undefined;
  if (contextual) return contextual; // marée marquante → terme de marée

  // Marée peu marquante : rotation, surtout pêche, avec 1 jour sur 3 un terme de marée.
  const rotation = lexicon.filter(e => !CONTEXTUAL_IDS.has(e.id));
  const wantMaree = hashDate(dateKey) % 3 === 0;
  const pool = rotation.filter(e => e.type === (wantMaree ? 'maree' : 'peche'));
  const list = pool.length ? pool : rotation;
  return list.length ? list[hashDate(dateKey) % list.length] : lexicon[0];
}
