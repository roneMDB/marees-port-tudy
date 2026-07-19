/** Formate une date `YYYY-MM-DD` en français (midi local pour éviter tout décalage). */
export function formatDate(
  date: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short' }
): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', opts);
}

/** Formate une hauteur en mètres (`—` si non finie). */
export function formatHeight(height: number): string {
  return Number.isFinite(height) ? `${height.toFixed(2)} m` : '—';
}

/** Classe un coefficient de marée en « bande » (morte-eau → grande marée). */
export interface CoefBand {
  label: string;
  badgeClass: string;
  icon: string | null;
}

/**
 * Renvoie le badge/l'étiquette associés à un coefficient de marée.
 * Seuils usuels : < 45 mortes-eaux, 45-70 moyennes, 70-95 vives-eaux,
 * 95-100 grandes vives-eaux, ≥ 100 grandes marées.
 */
export function coefBand(coef: number | null | undefined): CoefBand {
  if (coef == null) return { label: 'Inconnu', badgeClass: 'bg-body-secondary text-secondary-emphasis', icon: null };
  if (coef >= 100) return { label: 'Grande marée', badgeClass: 'text-bg-danger', icon: 'bi-stars' };
  if (coef >= 95) return { label: 'Grande vive-eau', badgeClass: 'text-bg-warning text-dark', icon: 'bi-arrow-up-circle-fill' };
  if (coef >= 70) return { label: 'Vive-eau', badgeClass: 'text-bg-primary', icon: null };
  if (coef >= 45) return { label: 'Marée moyenne', badgeClass: 'text-bg-secondary', icon: null };
  return { label: 'Morte-eau', badgeClass: 'bg-secondary-subtle text-secondary-emphasis', icon: null };
}

/** Renvoie la date du jour en heure locale au format `YYYY-MM-DD`. */
export function todayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Ajoute `days` jours à une date `YYYY-MM-DD` (midi local pour éviter tout décalage). */
export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
