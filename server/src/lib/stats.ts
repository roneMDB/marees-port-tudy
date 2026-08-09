/**
 * Nature d'un accès (issue #16) :
 * - `visit` : ouverture réelle de l'app, signalée par le client (`POST /api/visit`). **Le chiffre
 *   de tête** — c'est le seul signal que le service worker de la PWA ne masque pas.
 * - `page` : chargement de la coquille HTML (première visite d'un appareil, sonde externe, bot).
 * - `login` : connexion réussie.
 */
export type AccessKind = 'visit' | 'page' | 'login';

/** Une entrée du journal d'accès (une ligne de la table `access_log`). */
export interface AccessEntry {
  ts: string; // ISO 8601 (instant UTC)
  kind: AccessKind;
  scope: 'lan' | 'external';
  ip: string; // tronquée (anonymisée)
  country: string | null; // code pays (géoIP), null si local/inconnu
  ua: string; // User-Agent brut
  login?: string | null; // utilisateur, résolu depuis la session ; null si anonyme
}

export interface Count {
  name: string;
  count: number;
}

/** Activité d'un utilisateur : nombre de visites et date de la dernière. */
export interface UserActivity extends Count {
  lastTs: string;
}

/** Agrégats d'accès exposés par `GET /api/stats`. */
export interface AccessStats {
  total: number; // toutes natures confondues
  visits: number; // ouvertures réelles de l'app
  pageLoads: number; // chargements de coquille / sondes externes
  logins: number; // connexions réussies
  uniqueVisitors: number;
  lan: number;
  external: number;
  firstTs: string | null;
  lastTs: string | null;
  perDay: { date: string; count: number }[]; // visites, jour local, croissant
  perHour: number[]; // 24 cases, heure locale
  perWeekday: number[]; // 7 cases, lundi = 0
  countries: Count[]; // décroissant
  browsers: Count[];
  devices: Count[];
  users: UserActivity[]; // visites par utilisateur, décroissant
}

/**
 * Fuseau de référence des statistiques. Les horodatages sont stockés en **UTC** ; les lire tels
 * quels placerait une visite de 01 h 30 (heure locale, été) la **veille**, et décalerait tout
 * l'histogramme horaire d'une à deux heures selon la saison.
 */
const TIMEZONE = 'Europe/Paris';

const PARTS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  weekday: 'short'
});

// `en-CA` rend la date en `YYYY-MM-DD` ; `weekday: 'short'` en abréviations anglaises stables,
// indépendantes de la locale de la machine.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Jour, heure et jour de semaine (lundi = 0) d'un horodatage ISO, **en heure locale**. */
export function localParts(ts: string): { date: string; hour: number; weekday: number } {
  const parts = PARTS_FORMAT.formatToParts(new Date(ts));
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find(p => p.type === type)?.value ?? '';
  // `hour12: false` peut rendre « 24 » pour minuit selon l'implémentation → ramené à 0.
  const hour = Number(get('hour')) % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    weekday: Math.max(0, WEEKDAYS.indexOf(get('weekday')))
  };
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
 * Agrège une liste d'entrées d'accès en statistiques. Fonction pure (aucune horloge) : les jours,
 * heures et jours de semaine sont dérivés du champ `ts`, converti en heure locale.
 *
 * Les répartitions (jour, heure, semaine, pays, navigateurs, appareils, utilisateurs) portent sur
 * les seules **visites** : mêler les chargements de coquille et les sondes externes au chiffre
 * d'usage était précisément ce qui rendait les statistiques ininterprétables.
 */
export function aggregateAccess(entries: AccessEntry[]): AccessStats {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const visits = sorted.filter(e => e.kind === 'visit');

  const perDayMap = new Map<string, number>();
  const perHour = new Array<number>(24).fill(0);
  const perWeekday = new Array<number>(7).fill(0);
  const userMap = new Map<string, UserActivity>();
  const visitorKeys = new Set<string>();

  for (const e of visits) {
    const { date, hour, weekday } = localParts(e.ts);
    perDayMap.set(date, (perDayMap.get(date) ?? 0) + 1);
    perHour[hour] += 1;
    perWeekday[weekday] += 1;

    if (e.login) {
      const current = userMap.get(e.login);
      // Les entrées sont triées : la dernière vue est la plus récente.
      userMap.set(e.login, { name: e.login, count: (current?.count ?? 0) + 1, lastTs: e.ts });
      visitorKeys.add(`user:${e.login}`);
    } else {
      // Un visiteur anonyme n'a pas d'identité : IP tronquée + navigateur en tient lieu, ce qui
      // fusionne les appareils d'un même foyer derrière une IP. Approximation assumée.
      visitorKeys.add(`anon:${e.ip}|${classifyUa(e.ua).browser}`);
    }
  }

  return {
    total: sorted.length,
    visits: visits.length,
    pageLoads: sorted.filter(e => e.kind === 'page').length,
    logins: sorted.filter(e => e.kind === 'login').length,
    uniqueVisitors: visitorKeys.size,
    lan: sorted.filter(e => e.scope === 'lan').length,
    external: sorted.filter(e => e.scope === 'external').length,
    firstTs: sorted[0]?.ts ?? null,
    lastTs: sorted[sorted.length - 1]?.ts ?? null,
    perDay: [...perDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    perHour,
    perWeekday,
    countries: topCounts(visits.map(e => e.country).filter((c): c is string => !!c)),
    browsers: topCounts(visits.map(e => classifyUa(e.ua).browser)),
    devices: topCounts(visits.map(e => classifyUa(e.ua).device)),
    users: [...userMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  };
}
