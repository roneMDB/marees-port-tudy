import { coefBand } from './format';

/** Une entrée du lexique des marées : un terme et sa définition courte. */
export interface LexiconEntry {
  id: string;
  term: string;
  definition: string;
}

/**
 * Lexique des marées (esprit maree.info). Les termes « contextuels »
 * (grande-maree, vive-eau, morte-eau, revif, dechet) ne sortent que lorsque le
 * cas se produit ; les autres alimentent la rotation quotidienne (cf. ROTATION_IDS).
 */
export const LEXIQUE: LexiconEntry[] = [
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
  }
];

/** Termes éligibles à la rotation quotidienne (hors termes purement contextuels). */
const ROTATION_IDS = [
  'coefficient',
  'marnage',
  'estran',
  'flot',
  'jusant',
  'etale',
  'syzygie',
  'quadrature',
  'pleine-mer',
  'basse-mer',
  'maregramme'
];

/** Écart minimal de coefficient (vs la veille) pour parler de revif / déchet. */
const TREND_THRESHOLD = 8;

/** Contexte de marée d’un jour, pour choisir le mot du jour. */
export interface DayContext {
  dateKey: string; // aujourd'hui (YYYY-MM-DD)
  coef: number | null; // plus fort coefficient du jour
  prevCoef: number | null; // plus fort coefficient de la veille (revif / déchet)
}

function byId(id: string): LexiconEntry | undefined {
  return LEXIQUE.find(e => e.id === id);
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

/** Terme de rotation déterministe pour la date donnée. */
function rotating(dateKey: string): LexiconEntry {
  const pool = LEXIQUE.filter(e => ROTATION_IDS.includes(e.id));
  return pool[hashDate(dateKey) % pool.length];
}

/**
 * Choisit le mot du jour :
 *  1) contextuel prioritaire — grande marée / vive-eau / morte-eau (bande de coef),
 *     sinon revif / déchet si la tendance vs la veille est marquée ;
 *  2) à défaut, rotation déterministe par date sur le lexique général.
 * Renvoie toujours une entrée, même sans coefficient (jour hors données).
 */
export function noteOfTheDay(ctx: DayContext): LexiconEntry {
  const { coef, prevCoef, dateKey } = ctx;
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
  return contextual ?? rotating(dateKey);
}
