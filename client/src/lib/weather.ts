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
