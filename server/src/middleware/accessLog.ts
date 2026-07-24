import { NextFunction, Request, Response } from 'express';
import { getDb, type DB } from '../db';
import { isPrivateIp, truncateIp } from '../lib/net';
import type { AccessEntry } from '../lib/stats';

// Base géoIP locale (hors-ligne, aucun appel réseau). `require` idiomatique (serveur CommonJS).
const geoip = require('geoip-lite') as { lookup(ip: string): { country?: string } | null };

/**
 * Enregistre un accès en base : horodatage, LAN/externe, IP tronquée, pays (géoIP pour les accès
 * externes), User-Agent et, le cas échéant, le **login** de l'utilisateur (`null` pour une ouverture
 * de page anonyme ; renseigné lors d'une connexion). Écriture best-effort (n'échoue jamais la requête).
 */
export function recordAccess(req: Request, db: DB = getDb(), login: string | null = null): void {
  const ip = req.ip || '';
  const scope: AccessEntry['scope'] = isPrivateIp(ip) ? 'lan' : 'external';
  const entry: AccessEntry = {
    ts: new Date().toISOString(),
    scope,
    ip: truncateIp(ip),
    country: scope === 'external' ? geoip.lookup(ip)?.country ?? null : null,
    ua: String(req.headers['user-agent'] || '').slice(0, 300),
    login
  };
  try {
    db.prepare('INSERT INTO access_log (ts, scope, ip, country, ua, login) VALUES (?, ?, ?, ?, ?, ?)').run(
      entry.ts,
      entry.scope,
      entry.ip,
      entry.country,
      entry.ua,
      entry.login ?? null
    );
  } catch {
    /* journalisation best-effort : on n'échoue jamais la requête */
  }
}

/**
 * Middleware : journalise les **ouvertures de l'app** (requêtes de document HTML), pas les
 * ressources statiques ni les appels `/api`. À monter après l'authentification.
 */
export function accessLog() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const accept = String(req.headers.accept || '');
    const dest = String(req.headers['sec-fetch-dest'] || '');
    if (req.method === 'GET' && !req.path.startsWith('/api') && (dest === 'document' || accept.includes('text/html'))) {
      recordAccess(req);
    }
    next();
  };
}

/** Lit toutes les entrées du journal (ordre chronologique). */
export function readAccessEntries(db: DB = getDb()): AccessEntry[] {
  return db
    .prepare('SELECT ts, scope, ip, country, ua, login FROM access_log ORDER BY ts')
    .all() as AccessEntry[];
}
