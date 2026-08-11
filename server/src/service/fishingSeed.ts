/**
 * Référentiels par défaut du carnet de pêche (issue #3) : engins et espèces amorcés en base au
 * premier démarrage (table `fishing_refs`). Ensuite éditables via l'API / le panneau admin ; ce
 * fichier reste la source du « Rétablir les défauts ».
 *
 * Le pluriel (`labelPlural`) est une **donnée saisie**, pas une règle calculée : sur ces dix-sept
 * entrées, l'orthographe correcte demande des choses contradictoires — « lieu jaune » (le poisson)
 * fait « lieus jaunes » là où « lieu » (l'endroit) ferait « lieux », et « crevette bouquet » garde
 * son apposition invariable (« crevettes bouquet », pas « crevettes bouquets »).
 */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
  labelPlural: string;
}

export const FISHING_REFS_SEED: FishingRef[] = [
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes' },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes', labelPlural: 'Casiers à crevettes' },
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' },

  { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux' },
  { id: 'etrille', kind: 'species', label: 'Étrille', labelPlural: 'Étrilles' },
  { id: 'araignee', kind: 'species', label: 'Araignée', labelPlural: 'Araignées' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet', labelPlural: 'Crevettes bouquet' },
  { id: 'crevette-grise', kind: 'species', label: 'Crevette grise', labelPlural: 'Crevettes grises' },
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
  { id: 'dorade-grise', kind: 'species', label: 'Dorade grise', labelPlural: 'Dorades grises' },
  { id: 'dorade-royale', kind: 'species', label: 'Dorade royale', labelPlural: 'Dorades royales' },
  { id: 'vieille', kind: 'species', label: 'Vieille', labelPlural: 'Vieilles' },
  { id: 'lieu-jaune', kind: 'species', label: 'Lieu jaune', labelPlural: 'Lieus jaunes' },
  { id: 'maquereau', kind: 'species', label: 'Maquereau', labelPlural: 'Maquereaux' },
  { id: 'congre', kind: 'species', label: 'Congre', labelPlural: 'Congres' },
  { id: 'seiche', kind: 'species', label: 'Seiche', labelPlural: 'Seiches' },
  { id: 'mulet', kind: 'species', label: 'Mulet', labelPlural: 'Mulets' }
];
