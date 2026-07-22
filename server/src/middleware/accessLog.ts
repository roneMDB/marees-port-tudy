import fs from 'fs';
import { NextFunction, Request, Response } from 'express';
import { ACCESS_LOG_FILE } from '../config/dataDir';
import { isPrivateIp, truncateIp } from '../lib/net';
import type { AccessEntry } from '../lib/stats';

// Base géoIP locale (hors-ligne, aucun appel réseau). `require` idiomatique (serveur CommonJS).
const geoip = require('geoip-lite') as { lookup(ip: string): { country?: string } | null };

const MAX_BYTES = 1_000_000; // ~1 Mo → rotation (1 génération conservée en .1)
const ROTATED = `${ACCESS_LOG_FILE}.1`;

/**
 * Enregistre un accès (anonymisé) dans `access-log.jsonl` : horodatage, LAN/externe,
 * IP tronquée, pays (géoIP pour les accès externes) et User-Agent. Écriture best-effort.
 */
export function recordAccess(req: Request): void {
  const ip = req.ip || '';
  const scope: AccessEntry['scope'] = isPrivateIp(ip) ? 'lan' : 'external';
  const entry: AccessEntry = {
    ts: new Date().toISOString(),
    scope,
    ip: truncateIp(ip),
    country: scope === 'external' ? geoip.lookup(ip)?.country ?? null : null,
    ua: String(req.headers['user-agent'] || '').slice(0, 300)
  };
  try {
    if (fs.existsSync(ACCESS_LOG_FILE) && fs.statSync(ACCESS_LOG_FILE).size > MAX_BYTES) {
      fs.renameSync(ACCESS_LOG_FILE, ROTATED);
    }
    fs.appendFileSync(ACCESS_LOG_FILE, JSON.stringify(entry) + '\n');
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

/** Lit toutes les entrées du journal (génération courante + `.1`), dans l'ordre chronologique. */
export function readAccessEntries(): AccessEntry[] {
  const entries: AccessEntry[] = [];
  for (const file of [ROTATED, ACCESS_LOG_FILE]) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as AccessEntry);
      } catch {
        /* ligne corrompue ignorée */
      }
    }
  }
  return entries;
}
