/**
 * Référentiels par défaut du carnet de pêche (issue #3) : engins et espèces amorcés en base au
 * premier démarrage (table `fishing_refs`). Ensuite éditables via l'API / le panneau admin ; ce
 * fichier reste la source du « Rétablir les défauts ».
 */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
}

export const FISHING_REFS_SEED: FishingRef[] = [
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' },

  { id: 'tourteau', kind: 'species', label: 'Tourteau' },
  { id: 'etrille', kind: 'species', label: 'Étrille' },
  { id: 'araignee', kind: 'species', label: 'Araignée' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet' },
  { id: 'crevette-grise', kind: 'species', label: 'Crevette grise' },
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'dorade-grise', kind: 'species', label: 'Dorade grise' },
  { id: 'dorade-royale', kind: 'species', label: 'Dorade royale' },
  { id: 'vieille', kind: 'species', label: 'Vieille' },
  { id: 'lieu-jaune', kind: 'species', label: 'Lieu jaune' },
  { id: 'maquereau', kind: 'species', label: 'Maquereau' },
  { id: 'congre', kind: 'species', label: 'Congre' },
  { id: 'seiche', kind: 'species', label: 'Seiche' },
  { id: 'mulet', kind: 'species', label: 'Mulet' }
];
