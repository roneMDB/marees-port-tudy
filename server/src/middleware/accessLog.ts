import { NextFunction, Request, Response } from 'express';
import { getDb, type DB } from '../db';
import { isPrivateIp, truncateIp } from '../lib/net';
import { authEnabled, requestUser } from './auth';
import type { AccessEntry, AccessKind } from '../lib/stats';

// Base géoIP locale (hors-ligne, aucun appel réseau). `require` idiomatique (serveur CommonJS).
const geoip = require('geoip-lite') as { lookup(ip: string): { country?: string } | null };

/** Options d'enregistrement : nature de l'accès et, le cas échéant, utilisateur explicite. */
export interface RecordOptions {
  kind?: AccessKind;
  /** Login explicite (connexion). Absent → résolu depuis le cookie de session. */
  login?: string | null;
}

/**
 * Login à attribuer à un accès quand l'appelant n'en fournit pas : celui de la **session**.
 * Sans lui, une ouverture de page authentifiée s'enregistrait en anonyme alors que le cookie était
 * là — c'est ce qui rendait la question « qui accède ? » sans réponse (issue #16).
 *
 * Garde volontaire sur `authEnabled()` : hors authentification, `requestUser` renvoie un admin
 * **synthétique** (`dev`) qui n'est l'identité de personne et polluerait les statistiques.
 */
function sessionLogin(req: Request, db: DB): string | null {
  if (!authEnabled()) return null;
  try {
    return requestUser(req, db)?.login ?? null;
  } catch {
    return null; // résolution best-effort, comme l'écriture
  }
}

/**
 * Enregistre un accès en base : horodatage, nature (`kind`), LAN/externe, IP tronquée, pays (géoIP
 * pour les accès externes), User-Agent et **login** — fourni par l'appelant (connexion) ou résolu
 * depuis le cookie de session. Écriture best-effort (n'échoue jamais la requête).
 */
export function recordAccess(req: Request, db: DB = getDb(), opts: RecordOptions = {}): void {
  const ip = req.ip || '';
  const scope: AccessEntry['scope'] = isPrivateIp(ip) ? 'lan' : 'external';
  const entry: AccessEntry = {
    ts: new Date().toISOString(),
    kind: opts.kind ?? 'page',
    scope,
    ip: truncateIp(ip),
    country: scope === 'external' ? geoip.lookup(ip)?.country ?? null : null,
    ua: String(req.headers['user-agent'] || '').slice(0, 300),
    login: opts.login !== undefined ? opts.login : sessionLogin(req, db)
  };
  try {
    db.prepare(
      'INSERT INTO access_log (ts, scope, ip, country, ua, login, kind) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(entry.ts, entry.scope, entry.ip, entry.country, entry.ua, entry.login ?? null, entry.kind);
  } catch {
    /* journalisation best-effort : on n'échoue jamais la requête */
  }
}

/**
 * Middleware : journalise les **chargements de la coquille** (requêtes de document HTML), pas les
 * ressources statiques ni les appels `/api`. À monter après l'authentification.
 *
 * ⚠️ Ce signal ne mesure **pas** l'usage réel : le service worker de la PWA sert les navigations
 * depuis le précache, si bien qu'un appareil déjà venu ne repasse plus par ici. Le comptage des
 * visites repose sur la balise `POST /api/visit` (`kind: 'visit'`) ; ces entrées `page` restent
 * utiles pour voir les premiers chargements et les sondes externes.
 */
export function accessLog() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const accept = String(req.headers.accept || '');
    const dest = String(req.headers['sec-fetch-dest'] || '');
    if (req.method === 'GET' && !req.path.startsWith('/api') && (dest === 'document' || accept.includes('text/html'))) {
      recordAccess(req, getDb(), { kind: 'page' });
    }
    next();
  };
}

/**
 * Lit les entrées du journal (ordre chronologique), éventuellement bornées à partir de `sinceIso`
 * (horodatage ISO inclusif). C'est cette borne — et non une purge — qui garde la lecture rapide
 * quand l'historique grossit ; l'index `idx_access_ts` la sert.
 *
 * Les lignes antérieures à la v6 ont `kind` à `NULL` : elles sont relues comme `page`.
 */
export function readAccessEntries(db: DB = getDb(), sinceIso?: string): AccessEntry[] {
  const rows = sinceIso
    ? db
        .prepare('SELECT ts, scope, ip, country, ua, login, kind FROM access_log WHERE ts >= ? ORDER BY ts')
        .all(sinceIso)
    : db.prepare('SELECT ts, scope, ip, country, ua, login, kind FROM access_log ORDER BY ts').all();
  return (rows as AccessEntry[]).map(r => ({ ...r, kind: r.kind ?? 'page' }));
}
