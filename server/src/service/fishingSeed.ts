/**
 * Référentiels par défaut du carnet de pêche (issue #3) : engins et espèces amorcés en base au
 * premier démarrage (table `fishing_refs`). Ensuite éditables via l'API / le panneau admin ; ce
 * fichier reste la source du « Rétablir les défauts ».
 *
 * Le pluriel (`labelPlural`) est une **donnée saisie**, pas une règle calculée : sur ces vingt et
 * une entrées, l'orthographe correcte demande des choses contradictoires — « lieu jaune » (le
 * poisson) fait « lieus jaunes » là où « lieu » (l'endroit) ferait « lieux », et « crevette
 * bouquet » garde son apposition invariable (« crevettes bouquet », pas « crevettes bouquets »).
 *
 * L'engin par défaut (`defaultGearId`) est lui aussi une **donnée** : c'est l'engin que le
 * formulaire pré-sélectionne quand on choisit l'espèce. `null` = aucun ; toujours `null` pour un
 * engin.
 */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
  labelPlural: string;
  defaultGearId: string | null;
}

export const FISHING_REFS_SEED: FishingRef[] = [
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes', defaultGearId: null },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes', labelPlural: 'Casiers à crevettes', defaultGearId: null },
  { id: 'casier-morgates', kind: 'gear', label: 'Casier à morgates', labelPlural: 'Casiers à morgates', defaultGearId: null },
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes', defaultGearId: null },

  { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier-crabes' },
  { id: 'etrille', kind: 'species', label: 'Étrille', labelPlural: 'Étrilles', defaultGearId: 'casier-crabes' },
  { id: 'araignee', kind: 'species', label: 'Araignée', labelPlural: 'Araignées', defaultGearId: 'casier-crabes' },
  { id: 'moussette', kind: 'species', label: 'Moussette', labelPlural: 'Moussettes', defaultGearId: 'casier-crabes' },
  { id: 'homard', kind: 'species', label: 'Homard', labelPlural: 'Homards', defaultGearId: 'casier-crabes' },
  { id: 'morgate', kind: 'species', label: 'Morgate', labelPlural: 'Morgates', defaultGearId: 'casier-morgates' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet', labelPlural: 'Crevettes bouquet', defaultGearId: 'casier-crevettes' },
  { id: 'crevette-grise', kind: 'species', label: 'Crevette grise', labelPlural: 'Crevettes grises', defaultGearId: 'casier-crevettes' },
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars', defaultGearId: null },
  { id: 'dorade-grise', kind: 'species', label: 'Dorade grise', labelPlural: 'Dorades grises', defaultGearId: null },
  { id: 'dorade-royale', kind: 'species', label: 'Dorade royale', labelPlural: 'Dorades royales', defaultGearId: null },
  { id: 'vieille', kind: 'species', label: 'Vieille', labelPlural: 'Vieilles', defaultGearId: null },
  { id: 'lieu-jaune', kind: 'species', label: 'Lieu jaune', labelPlural: 'Lieus jaunes', defaultGearId: null },
  { id: 'maquereau', kind: 'species', label: 'Maquereau', labelPlural: 'Maquereaux', defaultGearId: null },
  { id: 'congre', kind: 'species', label: 'Congre', labelPlural: 'Congres', defaultGearId: null },
  { id: 'seiche', kind: 'species', label: 'Seiche', labelPlural: 'Seiches', defaultGearId: null },
  { id: 'mulet', kind: 'species', label: 'Mulet', labelPlural: 'Mulets', defaultGearId: null }
];
