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
