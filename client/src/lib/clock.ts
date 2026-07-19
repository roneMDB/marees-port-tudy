/** Formate une date en libellé français « jour · heure », ex. « dim. 19 juil. 2026 · 15:48:54 ». */
export function formatClock(date: Date): string {
  const day = date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const time = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `${day} · ${time}`;
}
