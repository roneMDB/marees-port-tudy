/**
 * Registre des sites (ports) dont on expose les horaires de marées.
 *
 * Source unique de vérité côté serveur : chaque site pointe vers son propre fichier
 * d'horaires (même format JSON), servi via `/api/tides?site=<id>`. Les heures « Navihan »
 * restent dérivées de **Port-Tudy** côté client, indépendamment du site consulté.
 */
export interface SiteConfig {
  id: string;
  label: string;
  /** Nom du fichier d'horaires dans `DATA_DIR` (et de sa graine dans `resources/`). */
  filename: string;
  timezone: string;
}

export const SITES: SiteConfig[] = [
  {
    id: 'port-tudy',
    label: 'Port-Tudy',
    filename: 'horaires_marees_port-tudy.json',
    timezone: 'Europe/Paris'
  },
  {
    id: 'etel',
    label: 'Étel',
    filename: 'horaires_marees_etel.json',
    timezone: 'Europe/Paris'
  }
];

/** Site par défaut (référence Navihan). */
export const DEFAULT_SITE_ID = 'port-tudy';

/** Résout un site par son identifiant (ou `undefined` si inconnu). */
export function getSite(id?: string): SiteConfig | undefined {
  return SITES.find(site => site.id === id);
}
