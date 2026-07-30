/** Icône bootstrap-icons correspondant à un code météo WMO. */
export function wmoIcon(code: number): string {
  if (code === 0) return 'bi-sun';
  if (code === 1 || code === 2) return 'bi-cloud-sun';
  if (code === 3) return 'bi-clouds';
  if (code === 45 || code === 48) return 'bi-cloud-fog';
  if (code >= 51 && code <= 57) return 'bi-cloud-drizzle';
  if (code >= 61 && code <= 67) return 'bi-cloud-rain';
  if (code >= 71 && code <= 77) return 'bi-snow';
  if (code >= 80 && code <= 82) return 'bi-cloud-rain-heavy';
  if (code === 85 || code === 86) return 'bi-cloud-snow';
  if (code >= 95) return 'bi-cloud-lightning-rain';
  return 'bi-cloud';
}

/** Direction du vent (degrés) → rose des vents à 8 points en français. */
export function degToCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Échelle de Beaufort : borne **basse** de chaque force en km/h (l'indice est la force), et
 * libellé de mer associé. Open-Meteo renvoie `wind_speed_10m` en km/h, d'où des seuils en km/h
 * plutôt qu'en nœuds.
 */
const BEAUFORT_SCALE: readonly { from: number; label: string }[] = [
  { from: 0, label: 'calme' },
  { from: 2, label: 'très légère brise' },
  { from: 6, label: 'légère brise' },
  { from: 12, label: 'petite brise' },
  { from: 20, label: 'jolie brise' },
  { from: 29, label: 'bonne brise' },
  { from: 39, label: 'vent frais' },
  { from: 50, label: 'grand frais' },
  { from: 62, label: 'coup de vent' },
  { from: 75, label: 'fort coup de vent' },
  { from: 89, label: 'tempête' },
  { from: 103, label: 'violente tempête' },
  { from: 118, label: 'ouragan' }
];

export interface Beaufort {
  force: number;
  label: string;
}

/**
 * Force Beaufort d'une vitesse de vent en km/h (issue #13). Le chiffre seul ne dit rien à qui ne
 * connaît pas l'échelle : le libellé l'accompagne. Une vitesse absente ou négative vaut un calme.
 */
export function beaufort(kmh: number | null | undefined): Beaufort {
  if (kmh == null || !Number.isFinite(kmh) || kmh <= 0) return { force: 0, label: BEAUFORT_SCALE[0].label };
  let force = 0;
  for (let i = BEAUFORT_SCALE.length - 1; i >= 0; i -= 1) {
    if (kmh >= BEAUFORT_SCALE[i].from) {
      force = i;
      break;
    }
  }
  return { force, label: BEAUFORT_SCALE[force].label };
}

/**
 * Remplace les placeholders `{lat}`/`{lon}` d'une URL de lien météo par les coordonnées
 * du lieu (chaîne vide si non fournies). Les URL sans placeholder sont renvoyées telles quelles.
 */
export function resolveLinkUrl(url: string, lat?: number | null, lon?: number | null): string {
  return url
    .replace(/\{lat\}/g, lat != null ? String(lat) : '')
    .replace(/\{lon\}/g, lon != null ? String(lon) : '');
}
