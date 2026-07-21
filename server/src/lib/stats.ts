/** Une entrée du journal d'accès (une ligne de `access-log.jsonl`). */
export interface AccessEntry {
  ts: string; // ISO 8601
  scope: 'lan' | 'external';
  ip: string; // tronquée (anonymisée)
  country: string | null; // code pays (géoIP), null si local/inconnu
  ua: string; // User-Agent brut
}

export interface Count {
  name: string;
  count: number;
}

/** Agrégats d'accès exposés par `GET /api/stats`. */
export interface AccessStats {
  total: number;
  lan: number;
  external: number;
  firstTs: string | null;
  lastTs: string | null;
  perDay: { date: string; count: number }[]; // trié par date croissante
  countries: Count[]; // décroissant
  browsers: Count[];
  devices: Count[];
}

/** Classe un User-Agent en navigateur + type d'appareil (heuristique légère). */
export function classifyUa(ua: string): { browser: string; device: string } {
  const u = ua || '';
  let browser = 'Autre';
  if (/Edg\//.test(u)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(u)) browser = 'Opera';
  else if (/Firefox\//.test(u)) browser = 'Firefox';
  else if (/Chrome\//.test(u)) browser = 'Chrome';
  else if (/Safari\//.test(u)) browser = 'Safari';

  let device = 'Ordinateur';
  if (/iPad|Tablet/.test(u)) device = 'Tablette';
  else if (/Mobi|iPhone|iPod|Android.*Mobile/.test(u)) device = 'Mobile';

  return { browser, device };
}

function topCounts(values: string[]): Count[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Agrège une liste d'entrées d'accès en statistiques. Fonction pure (aucune horloge) :
 * les jours sont dérivés du champ `ts` (préfixe `YYYY-MM-DD`).
 */
export function aggregateAccess(entries: AccessEntry[]): AccessStats {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const total = sorted.length;
  const lan = sorted.filter(e => e.scope === 'lan').length;

  const perDayMap = new Map<string, number>();
  for (const e of sorted) {
    const day = e.ts.slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
  }

  return {
    total,
    lan,
    external: total - lan,
    firstTs: sorted[0]?.ts ?? null,
    lastTs: sorted[total - 1]?.ts ?? null,
    perDay: [...perDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    countries: topCounts(sorted.map(e => e.country).filter((c): c is string => !!c)),
    browsers: topCounts(sorted.map(e => classifyUa(e.ua).browser)),
    devices: topCounts(sorted.map(e => classifyUa(e.ua).device))
  };
}
