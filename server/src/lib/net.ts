/**
 * Détermine si une adresse IP est **locale / privée** : loopback, plages RFC 1918
 * (10/8, 172.16/12, 192.168/16), IPv6 unique-local (fc00::/7) ou link-local (fe80::).
 * Utilisé pour n'autoriser l'écriture des réglages que depuis le réseau local (les requêtes
 * venant du reverse proxy portent l'IP publique réelle du client via `trust proxy`).
 */
export function isPrivateIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  let a = ip.trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4 mappée en IPv6

  if (a === '::1' || a === '127.0.0.1' || a.startsWith('127.')) return true;
  if (a.startsWith('10.') || a.startsWith('192.168.')) return true;

  const m = a.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }

  if (/^f[cd]/.test(a)) return true; // fc00::/7 (unique local)
  if (a.startsWith('fe80:')) return true; // link-local

  return false;
}

/**
 * Tronque une IP pour l'anonymiser tout en gardant une granularité utile :
 * IPv4 `a.b.c.d` → `a.b.x.x` ; IPv6 → 3 premiers groupes + `::`. Renvoie `''` si vide.
 */
export function truncateIp(ip: string | undefined | null): string {
  if (!ip) return '';
  let a = ip.trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4 mappée

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) {
    const [p, q] = a.split('.');
    return `${p}.${q}.x.x`;
  }
  if (a.includes(':')) {
    const groups = a.split(':').filter(Boolean).slice(0, 3);
    return `${groups.join(':')}::`;
  }
  return a;
}
